import { net } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import log from 'electron-log/main'
import {
  AiProviderConfig,
  AiProviderTemplate,
  AiModelConfig,
  AiChatRequest,
  AiChatChunk
} from '../../renderer/src/types'
import { createSdkModel } from './sdk-providers'
import { mergePresets } from './presets'
import { getConfigPath } from '../paths'
import { safeStorage } from 'electron'
import { streamText, generateText, APICallError, NoSuchModelError } from 'ai'
import { manageContext } from './context-manager'
import {
  resolveContextWindow,
  resolveMaxOutputTokens,
  updateLearnedContextWindow,
  shrinkLearnedContextWindow
} from './model-registry'

/**
 * AI 服务层。使用 Vercel AI SDK 处理所有 AI 请求，
 * 渲染层只通过 IPC 调用，密钥不暴露到渲染进程的持久存储。
 */

/** 默认超时 5 分钟（长思考模型如 DeepSeek R1 / Claude Opus 需要更长时间）。 */
const DEFAULT_TIMEOUT_MS = 300000

/** 进行中的请求 AbortController，用于取消。 */
const activeRequests = new Map<string, AbortController>()

/** 生成简易唯一 id。 */
export function genId(): string {
  return `prov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 从供应商配置中解析当前活跃模型，返回融合了模型级参数的有效 provider。
 * 优先级：activeModelId 匹配 models 中的项 > models[0] > provider.model（向后兼容）。
 * 合并策略：模型级 customParams/maxOutputTokens/contextWindow/reasoning 覆盖供应商级。
 */
function resolveActiveModel(provider: AiProviderConfig, activeModelId?: string): AiProviderConfig {
  const models = provider.models && provider.models.length > 0 ? provider.models : null
  if (!models) return provider // 向后兼容：无 models 数组时用旧字段

  let model: AiModelConfig | undefined
  if (activeModelId) {
    model = models.find(m => m.id === activeModelId)
  }
  if (!model) model = models[0] // 找不到指定 id 时回退到第一个

  return {
    ...provider,
    model: model.model,
    temperature: model.temperature ?? provider.temperature,
    customParams: { ...provider.customParams, ...model.customParams },
    maxOutputTokens: model.maxOutputTokens ?? provider.maxOutputTokens,
    contextWindow: model.contextWindow ?? provider.contextWindow,
    reasoning: model.reasoning,
  }
}

/**
 * 将 customParams（键值对字符串）解析为类型化值，并映射到 SDK 7 的 providerOptions。
 * 值解析顺序：JSON → boolean → number → string。
 * 根据 template 类型自动包装到对应 provider 命名空间。
 */
function toProviderOptions(template: AiProviderTemplate, params?: Record<string, string>): Record<string, unknown> | undefined {
  if (!params) return undefined
  const parsed: Record<string, unknown> = {}
  let hasValid = false
  for (const [k, v] of Object.entries(params)) {
    if (!k) continue
    parsed[k] = parseParamValue(v)
    hasValid = true
  }
  if (!hasValid) return undefined
  const ns = template === 'anthropic' ? 'anthropic' : 'openai'
  return { [ns]: parsed }
}

/** 解析参数值：JSON → number → boolean → string */
function parseParamValue(v: string): unknown {
  if (!v) return v
  // 尝试 JSON 解析（支持对象/数组/null）
  try { return JSON.parse(v) } catch { /* 不是 JSON */ }
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

/**
 * 使用 Vercel AI SDK 发起流式聊天请求，逐 chunk 回调。
 * 底层自动处理 SSE 解析、认证头、流式取消等。
 *
 * 重构后集成 ContextManager 进行 token 感知的上下文管理，
 * 支持 context exceeded 错误自动恢复（下调学习窗口 + 加强压缩重试）。
 */
export async function streamChat(
  request: AiChatRequest,
  requestId: string,
  onChunk: (chunk: AiChatChunk) => void
): Promise<void> {
  log.debug('[AI] streamChat 开始, requestId=%s, providerId=%s, modelId=%s, 入参消息数=%d',
    requestId, request.providerId, request.activeModelId || '(默认)', request.messages?.length ?? 0)
  const rawProvider = await findProvider(request.providerId)
  if (!rawProvider) {
    log.warn('[AI] 找不到 provider: %s', request.providerId)
    onChunk({ delta: '', done: true, error: '未找到该 AI 配置，请先在设置中添加。' })
    return
  }

  const provider = resolveActiveModel(rawProvider, request.activeModelId)
  const sdkModel = createSdkModel(provider)

  // 解析参数
  const learnedWindows = loadLearnedContextWindows()
  const contextWindow = resolveContextWindow(provider.model, provider.contextWindow, learnedWindows)
  const maxOutputTokens = resolveMaxOutputTokens(provider.maxOutputTokens)
  const providerOptions = toProviderOptions(provider.template, provider.customParams)
  const reasoning = provider.reasoning && provider.reasoning !== 'provider-default' ? provider.reasoning : undefined

  log.debug('[AI] 请求准备: requestId=%s template=%s model=%s timeout=%dms contextWindow=%d maxOutputTokens=%s reasoning=%s providerOptions=%s',
    requestId, provider.template, provider.model, provider.timeoutMs || DEFAULT_TIMEOUT_MS,
    contextWindow, maxOutputTokens,
    reasoning || '(无)', providerOptions ? '有' : '无')

  const controller = new AbortController()
  activeRequests.set(requestId, controller)
  // DEFAULT_TIMEOUT_MS 作为最小超时下限，用户配置的 timeoutMs 只能上调不能下调
  const timeoutMs = Math.max(provider.timeoutMs || 0, DEFAULT_TIMEOUT_MS)

  return new Promise<void>((resolve) => {
    let resolved = false

    const finish = (error?: string, usage?: AiChatChunk['usage'], compressed?: boolean) => {
      if (resolved) return
      resolved = true
      activeRequests.delete(requestId)
      log.debug('[AI] streamChat 结束: requestId=%s error=%s usage=%s', requestId, error || '无', usage ? JSON.stringify(usage) : '无')
      onChunk({ delta: '', done: true, error, usage, compressed })
      resolve()
    }

      // 用 Vercel AI SDK 的 streamText 发起流式请求。
      // 累积回复文本，用于完成后打印调试日志
      let accumulatedResponse = ''
      let accumulatedThinking = ''
      let contextCompressed = false
      // onFinish 回调在 await result.text 之前触发，用闭包变量暂存 usage
      let pendingUsage: AiChatChunk['usage'] | undefined
      // onError 回调中提取的原始 API 错误消息（API 返回 JSON 错误时 SDK 会包装成大量 Zod 噪音）
      let lastApiRawError: string | undefined

      ; (async () => {
        try {
          // ─── 上下文管理（token 感知 + 滑动窗口 + 按需摘要）───
          const managed = await manageContext({
            messages: request.messages,
            context: request.context,
            contextWindow,
            maxOutputTokens,
            model: sdkModel,
            timeoutMs,
            abortSignal: controller.signal,
          })
          contextCompressed = managed.compressed

          log.debug('[AI] 最终发送的消息数: system=%s messages=%d compressed=%s estimatedInputTokens=%d',
            managed.system ? '有' : '无', managed.messages.length, managed.compressed, managed.estimatedInputTokens)
          log.debug('[AI] 发送 system 提示(截取前200字): requestId=%s\n%s', requestId, truncate(managed.system, 200))
          const msgPreview = managed.messages.map(m => `  ${m.role}: ${truncate(m.content, 120)}`).join('\n')
          log.debug('[AI] 发送对话消息: requestId=%s\n%s', requestId, msgPreview)

          // ─── 构造 streamText 参数 ───
          const streamParams: Record<string, unknown> = {
            model: sdkModel,
            system: managed.system,
            messages: managed.messages,
            temperature: provider.temperature ?? 0.3,
            abortSignal: controller.signal,
            maxRetries: 2,
            timeout: timeoutMs,
            onError: ({ error }: { error: unknown }) => {
              const errMsg = error instanceof Error ? error.message : String(error)
              log.warn('[AI] streamText 自动重试: requestId=%s err=%s', requestId, errMsg)
              // 从 APICallError 中提取原始 API 响应（非 SSE 的 JSON 错误会被 SDK Zod 验证淹没）
              if (error instanceof APICallError) {
                const raw = extractApiErrorMessage(error, requestId)
                if (raw) lastApiRawError = raw
              }
            },
              onChunk: ({ chunk }: { chunk: any }) => {
                if (resolved || controller.signal.aborted) return
                if (chunk.type === 'text-delta') {
                  accumulatedResponse += chunk.text
                  onChunk({ delta: chunk.text, done: false })
                } else if (chunk.type === 'reasoning-delta') {
                  accumulatedThinking += chunk.text
                  onChunk({ delta: '', thinking: chunk.text, done: false })
                }
              },
            onFinish: ({ usage }: { usage: any }) => {
              // 捕获真实 token 用量，更新学习窗口
              // @ai-sdk/openai-compatible v3: usage 是 { inputTokens: { total, ... }, outputTokens: { total, ... } }
              const input = typeof usage?.inputTokens === 'object' ? usage.inputTokens.total : usage?.inputTokens
              const output = typeof usage?.outputTokens === 'object' ? usage.outputTokens.total : usage?.outputTokens
              const reasoning = typeof usage?.outputTokens === 'object' ? usage.outputTokens.reasoning : usage?.reasoningTokens
              pendingUsage = {
                inputTokens: input ?? 0,
                outputTokens: output ?? 0,
                reasoningTokens: reasoning ?? 0,
                totalTokens: (input ?? 0) + (output ?? 0),
              }
              log.debug('[AI] token 用量: requestId=%s input=%d output=%d reasoning=%d total=%d',
                requestId, pendingUsage.inputTokens, pendingUsage.outputTokens,
                pendingUsage.reasoningTokens, pendingUsage.totalTokens)

              // 成功请求 → 保守上调学习窗口
              if (pendingUsage.inputTokens && pendingUsage.inputTokens > 0) {
                const newLearned = updateLearnedContextWindow(provider.model, pendingUsage.inputTokens, learnedWindows)
                if (newLearned) {
                  log.debug('[AI] 学习窗口上调: model=%s %d→%d', provider.model, contextWindow, newLearned)
                  saveLearnedContextWindows(learnedWindows)
                }
              }
            },
          }

          streamParams.maxOutputTokens = maxOutputTokens
          // providerOptions: customParams 映射
          if (providerOptions) {
            streamParams.providerOptions = providerOptions
          }
          // reasoning: 推理强度（仅非 provider-default 时传）
          if (reasoning) {
            streamParams.reasoning = reasoning
          }

          const result = streamText(streamParams as Parameters<typeof streamText>[0])

          await result.text
          log.debug('[AI] streamChat 回复完成: requestId=%s 回复长度=%d 思考长度=%d',
            requestId, accumulatedResponse.length, accumulatedThinking.length)
          if (accumulatedResponse) {
            log.debug('[AI] streamChat 回复内容(截取前500字): requestId=%s\n%s',
              requestId, truncate(accumulatedResponse, 500))
          } else {
            log.warn('[AI] streamChat 流完成但回复为空: requestId=%s thinkingLen=%d lastApiRawError=%s',
              requestId, accumulatedThinking.length, lastApiRawError || '(无)')
          }
          if (accumulatedThinking) {
            log.debug('[AI] streamChat 思考过程(截取前300字): requestId=%s\n%s',
              requestId, truncate(accumulatedThinking, 300))
          }

          // 空回复诊断：流完成但无任何输出文本 → 根据 onError 捕获的原始 API 错误给出精准提示
          if (!accumulatedResponse && !accumulatedThinking) {
            const pendingUsageFinal = pendingUsage
            if (lastApiRawError) {
              finish(`AI 未返回内容。API 错误：${lastApiRawError}`, pendingUsageFinal, true)
            } else {
              finish('AI 未返回任何内容。请检查：1) 模型名称是否正确；2) 该供应商是否仍支持此模型；3) 可通过"获取模型列表"拉取可用模型。', pendingUsageFinal, true)
            }
            return
          }

          const pendingUsageFinal = pendingUsage
          finish(undefined, pendingUsageFinal, contextCompressed)
        } catch (e: any) {
          if (resolved) return  // 取消场景下不覆盖 finish 已发出的错误

          // 出错时也打印已累积的内容（如有），便于诊断
          if (accumulatedResponse || accumulatedThinking) {
            log.debug('[AI] streamChat 异常时已累积: requestId=%s 回复=%d字 思考=%d字',
              requestId, accumulatedResponse.length, accumulatedThinking.length)
          }

          // ─── context exceeded 错误自动恢复 ───
          if (isContextLengthExceeded(e)) {
            log.warn('[AI] 上下文超限, 尝试加强压缩重试: requestId=%s err=%s', requestId, truncate(e.message, 200))
            const estimatedInputTokens = estimateFailedInputTokens(e)
            const shrunkWindow = shrinkLearnedContextWindow(provider.model, estimatedInputTokens, learnedWindows)
            saveLearnedContextWindows(learnedWindows)
            log.debug('[AI] 学习窗口下调: model=%s %d→%d', provider.model, contextWindow, shrunkWindow)

            // 加强压缩重试一次
            try {
              const retryManaged = await manageContext({
                messages: request.messages,
                context: request.context,
                contextWindow: shrunkWindow,
                maxOutputTokens,
                model: sdkModel,
                timeoutMs,
                abortSignal: controller.signal,
                aggressive: true,
              })
              contextCompressed = true
              log.debug('[AI] 加强压缩重试: messages=%d compressed=%s estimatedInput=%d',
                retryManaged.messages.length, retryManaged.compressed, retryManaged.estimatedInputTokens)

              const retryParams: Record<string, unknown> = {
                model: sdkModel,
                system: retryManaged.system,
                messages: retryManaged.messages,
                temperature: provider.temperature ?? 0.3,
                abortSignal: controller.signal,
                maxRetries: 1,
                timeout: timeoutMs,
              onChunk: ({ chunk }: { chunk: any }) => {
                if (resolved || controller.signal.aborted) return
                if (chunk.type === 'text-delta') {
                  accumulatedResponse += chunk.text
                  onChunk({ delta: chunk.text, done: false })
                } else if (chunk.type === 'reasoning-delta') {
                  accumulatedThinking += chunk.text
                  onChunk({ delta: '', thinking: chunk.text, done: false })
                }
              },
              onError: ({ error }: { error: unknown }) => {
                const errMsg = error instanceof Error ? error.message : String(error)
                log.warn('[AI] 加强压缩重试 streamText 错误: requestId=%s err=%s', requestId, errMsg)
                if (error instanceof APICallError) {
                  const raw = extractApiErrorMessage(error, requestId)
                  if (raw) lastApiRawError = raw
                }
              },
                onFinish: ({ usage }: { usage: any }) => {
                  const input = typeof usage?.inputTokens === 'object' ? usage.inputTokens.total : usage?.inputTokens
                  const output = typeof usage?.outputTokens === 'object' ? usage.outputTokens.total : usage?.outputTokens
                  const reasoning = typeof usage?.outputTokens === 'object' ? usage.outputTokens.reasoning : usage?.reasoningTokens
                  pendingUsage = {
                    inputTokens: input ?? 0,
                    outputTokens: output ?? 0,
                    reasoningTokens: reasoning ?? 0,
                    totalTokens: (input ?? 0) + (output ?? 0),
                  }
                },
              }
              retryParams.maxOutputTokens = maxOutputTokens
              if (providerOptions) retryParams.providerOptions = providerOptions
              if (reasoning) retryParams.reasoning = reasoning

              const retryResult = streamText(retryParams as Parameters<typeof streamText>[0])
              await retryResult.text
              log.debug('[AI] 加强压缩重试成功: requestId=%s 回复长度=%d', requestId, accumulatedResponse.length)

              finish(undefined, pendingUsage, true)
              return
            } catch (retryErr: any) {
              log.warn('[AI] 加强压缩重试仍失败: requestId=%s err=%s', requestId, truncate(retryErr?.message || '', 200))
              finish(`上下文超限，已尝试自动压缩但仍失败。请缩短对话或清除历史后重试。`)
              return
            }
          }

          if (e instanceof APICallError) {
            const statusInfo = e.statusCode ? `（HTTP ${e.statusCode}）` : ''
            log.warn('[AI] API 调用错误: requestId=%s status=%s err=%s', requestId, e.statusCode, e.message)
            finish(`AI 接口错误${statusInfo}：${truncate(e.message, 300)}`)
          } else if (e instanceof NoSuchModelError) {
            finish(`模型不可用：${e.message}`)
          } else if (e?.name === 'AbortError') {
            finish('请求已取消。')
          } else if (e?.name === 'TimeoutError') {
            finish('请求超时，请检查网络或调整超时设置。')
          } else {
            log.warn('[AI] 流式请求异常: requestId=%s err=%s', requestId, e?.message || e)
            finish(`请求失败：${truncate(e?.message || String(e), 500)}`)
          }
        }
      })()
  })
}

/** 检测是否为上下文超限错误 */
function isContextLengthExceeded(e: any): boolean {
  if (!e) return false
  const msg = (e.message || '').toLowerCase()
  return msg.includes('context length') ||
    msg.includes('context_length_exceeded') ||
    msg.includes('maximum context') ||
    msg.includes('too many tokens') ||
    msg.includes('context window')
}

/** 从错误中估算失败的输入 token 数（用于下调学习窗口） */
function estimateFailedInputTokens(e: any): number {
  // 尝试从错误信息中提取 token 数
  const msg = e?.message || ''
  const match = msg.match(/(\d+)\s*tokens/)
  if (match) return parseInt(match[1], 10)
  // 无法提取时用保守值
  return 32768
}

/** 取消指定请求。 */
export function cancelChat(requestId: string): void {
  const ctrl = activeRequests.get(requestId)
  if (ctrl) {
    try { ctrl.abort() } catch { /* noop */ }
  }
}

/** 使用 Vercel AI SDK 非流式测试连接性（发一句话），返回首段文本或错误。 */
export async function testProvider(provider: AiProviderConfig): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveActiveModel(provider)
  log.debug('[AI] testProvider 开始: name=%s template=%s model=%s baseUrl=%s',
    resolved.name, resolved.template, resolved.model, resolved.baseUrl)
  try {
    const model = createSdkModel(resolved)

    const result = await generateText({
      model,
      messages: [{ role: 'user', content: '你好，请回复"连接正常"。' }],
      maxOutputTokens: 100,
      abortSignal: AbortSignal.timeout(resolved.timeoutMs || 30000),
    })

    const reply = result.text?.trim() || '连接成功（无内容返回）。'
    log.debug('[AI] testProvider 成功: name=%s reply=%s', resolved.name, truncate(reply, 100))
    return { ok: true, message: reply }
  } catch (e: any) {
    // 提取原始 API 错误（不被 SDK 的 Zod 噪音淹没）
    let apiDetail = ''
    if (e instanceof APICallError) {
      const raw = extractApiErrorMessage(e, 'test')
      if (raw) apiDetail = `：${truncate(raw, 200)}`
      log.warn('[AI] testProvider 失败: name=%s model=%s status=%d err=%s apiRaw=%s',
        resolved.name, resolved.model, e.statusCode, e.message, raw || '(无)')
    } else {
      log.warn('[AI] testProvider 失败: name=%s model=%s err=%s',
        resolved.name, resolved.model, e?.message || e)
    }

    if (e instanceof APICallError) {
      return { ok: false, message: `API 错误（HTTP ${e.statusCode || '?'}）${apiDetail}` }
    }
    if (e instanceof NoSuchModelError) {
      return { ok: false, message: `模型不可用：${e.message}` }
    }
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      return { ok: false, message: '请求超时。' }
    }
    return { ok: false, message: `连接失败：${truncate(e?.message || String(e), 300)}` }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '...' : s
}

/**
 * 从 APICallError 的 responseBody 中提取原始 API 错误消息。
 * 
 * API 返回非 SSE 的 JSON 错误时（如 `{"code":"InvalidParameter","message":"Unsupported model"}`），
 * Vercel AI SDK 会对整个 body 做 Zod 验证，产生大量 "invalid_union/invalid_value" 噪音，
 * 淹没真正的错误信息。此函数从 responseBody 中还原原始消息。
 */
function extractApiErrorMessage(error: APICallError, requestId: string): string | undefined {
  try {
    const body = (error as any).responseBody
    if (!body) return undefined
    // responseBody 可能是字符串或对象
    const obj = typeof body === 'string' ? JSON.parse(body) : body
    // 常见格式：{ code, message } 或 { error: { message } }
    const apiMsg = obj?.message || obj?.error?.message || obj?.error || ''
    if (apiMsg) {
      log.debug('[AI] 提取 API 原始错误: requestId=%s msg=%s', requestId, apiMsg)
    }
    return apiMsg || undefined
  } catch {
    return undefined
  }
}

/* ───────────────────────── 配置持久化（含简易加密） ─────────────────────────
 * Electron 内置 safeStorage 在 Windows 走 DPAPI，用户级加密，符合需求 §4.3
 * "敏感信息加密存储"。存储目录 .dynstav，与主配置同处。
 */

const AI_FILE = 'ai-config.json'

interface StoredProvider extends Omit<AiProviderConfig, 'apiKey'> {
  /** 已加密（base64）的密钥 */
  apiKeyEnc?: string
}

function encrypt(plain: string): string {
  if (!plain) return ''
  if (!safeStorage.isEncryptionAvailable()) return plain // 退化为明文（极端环境）
  return safeStorage.encryptString(plain).toString('base64')
}

function decrypt(enc: string): string {
  if (!enc) return ''
  if (!safeStorage.isEncryptionAvailable()) return enc
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return ''
  }
}

export function loadProviders(): { providers: AiProviderConfig[]; activeId: string | null } {
  const path = getConfigPath(AI_FILE)
  if (!existsSync(path)) return { providers: mergePresets([]), activeId: null }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const list: StoredProvider[] = raw.providers || []
    const providers: AiProviderConfig[] = list.map(p => {
      // 迁移旧模板名（openai→completion, azure→responses）
      const rawTpl = p.template as string
      let template: AiProviderTemplate = p.template
      if (rawTpl === 'openai') template = 'completion'
      else if (rawTpl === 'azure') template = 'responses'
      return {
        ...p,
        template,
        apiKey: p.apiKeyEnc ? decrypt(p.apiKeyEnc) : ''
      }
    })
    return { providers: mergePresets(providers), activeId: raw.activeId ?? null }
  } catch {
    return { providers: mergePresets([]), activeId: null }
  }
}

export function saveProviders(providers: AiProviderConfig[], activeId: string | null): void {
  // 防御性合并：确保预设提供商不会被意外删除
  const merged = mergePresets(providers)
  const list: StoredProvider[] = merged.map(({ apiKey, ...rest }) => ({
    ...rest,
    apiKeyEnc: encrypt(apiKey)
  }))
  const path = getConfigPath(AI_FILE)
  writeFileSync(path, JSON.stringify({ providers: list, activeId }, null, 2), 'utf-8')
}

export async function findProvider(id: string): Promise<AiProviderConfig | null> {
  const { providers } = loadProviders()
  return providers.find(p => p.id === id) || null
}

/* ───────────────────────── 学习上下文窗口持久化 ─────────────────────────
 * 通过实际请求 usage 反馈和错误恢复，自动学习每个模型的可用上下文窗口，
 * 持久化到 ai-config.json，避免静态注册表过时问题。
 */

/** 读取已学习的 contextWindow 缓存 */
export function loadLearnedContextWindows(): Record<string, number> {
  const path = getConfigPath(AI_FILE)
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return raw.learnedContextWindows || {}
  } catch {
    return {}
  }
}

/** 写入已学习的 contextWindow 缓存（合并写入，不影响其他配置） */
export function saveLearnedContextWindows(windows: Record<string, number>): void {
  const path = getConfigPath(AI_FILE)
  try {
    let raw: any = {}
    if (existsSync(path)) {
      raw = JSON.parse(readFileSync(path, 'utf-8'))
    }
    raw.learnedContextWindows = windows
    // 注意：这里只写 learnedContextWindows，providers/activeId 由 saveProviders 负责
    // 需要保留原有的加密 providers 数据
    writeFileSync(path, JSON.stringify(raw, null, 2), 'utf-8')
  } catch (e) {
    log.warn('[AI] 保存学习窗口失败: %s', e instanceof Error ? e.message : String(e))
  }
}

/**
 * 从供应商 API 获取可用模型列表（OpenAI 兼容的 /models 端点）。
 * 返回模型 id 数组，失败时抛出异常。
 */
export async function fetchModels(provider: AiProviderConfig): Promise<string[]> {
  if (provider.template === 'anthropic') {
    throw new Error('Anthropic 不支持 /models 端点，请手动添加模型')
  }
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  const url = `${baseUrl}/models`

  return new Promise<string[]>((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url,
      redirect: 'follow',
    })

    // 设置超时
    const timeout = setTimeout(() => {
      req.abort()
      reject(new Error('请求超时'))
    }, provider.timeoutMs || 300000)

    // 认证头
    req.setHeader('Authorization', `Bearer ${provider.apiKey}`)
    req.setHeader('Accept', 'application/json')

    let body = ''
    req.on('response', (response) => {
      if (response.statusCode !== 200) {
        clearTimeout(timeout)
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => {
        clearTimeout(timeout)
        try {
          const json = JSON.parse(body)
          const data = json.data || json.models || []
          const models = data
            .map((m: any) => m.id || m.name || '')
            .filter((id: string) => id)
            .sort()
          resolve(models)
        } catch {
          reject(new Error('响应解析失败'))
        }
      })
    })

    req.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    req.end()
  })
}
