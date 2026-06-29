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
import { injectContext } from './types'
import { createSdkModel } from './sdk-providers'
import { mergePresets } from './presets'
import { getConfigPath } from '../paths'
import { safeStorage } from 'electron'
import { streamText, generateText, APICallError, NoSuchModelError } from 'ai'

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
    customParams: model.customParams
  }
}

/**
 * 使用 Vercel AI SDK 发起流式聊天请求，逐 chunk 回调。
 * 底层自动处理 SSE 解析、认证头、流式取消等。
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

  // 注入板块上下文，分离 system prompt 和对话消息
  const injectedMessages = injectContext(request.messages, request.context)
  const system = injectedMessages.find(m => m.role === 'system')?.content
  const messages = injectedMessages.filter(m => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>

  log.debug('[AI] 请求准备: requestId=%s template=%s model=%s timeout=%dms',
    requestId, provider.template, provider.model, provider.timeoutMs || DEFAULT_TIMEOUT_MS)
  log.debug('[AI] 最终发送的消息数: system=%s messages=%d', system ? '有' : '无', messages.length)

  const controller = new AbortController()
  activeRequests.set(requestId, controller)
  const timeoutMs = provider.timeoutMs && provider.timeoutMs > 0 ? provider.timeoutMs : DEFAULT_TIMEOUT_MS

  return new Promise<void>((resolve) => {
    let resolved = false

    const finish = (error?: string) => {
      if (resolved) return
      resolved = true
      activeRequests.delete(requestId)
      log.debug('[AI] streamChat 结束: requestId=%s error=%s', requestId, error || '无')
      onChunk({ delta: '', done: true, error })
      resolve()
    }

      // 用 Vercel AI SDK 的 streamText 发起流式请求。
      // SDK 内置 maxRetries=2 可自动重试临时性错误（429/5xx），
      // 不再使用自定义 setTimeout 做超时——SDK 的 timeout 参数
      // 作用于每次尝试，不会与内部重试机制冲突。
      ; (async () => {
        try {
          const result = streamText({
            model: sdkModel,
            system,
            messages,
            temperature: provider.temperature ?? 0.3,
            maxOutputTokens: 4096,
            abortSignal: controller.signal,
            maxRetries: 2,
            timeout: timeoutMs,
            onError: ({ error }) => {
              log.warn('[AI] streamText 自动重试: requestId=%s err=%s',
                requestId, error instanceof Error ? error.message : String(error))
            },
            onChunk: ({ chunk }) => {
              if (resolved || controller.signal.aborted) return
              if (chunk.type === 'text-delta') {
                onChunk({ delta: chunk.text, done: false })
              } else if (chunk.type === 'reasoning-delta') {
                onChunk({ delta: '', thinking: chunk.text, done: false })
              }
            },
          })

          await result.text
          finish()
        } catch (e: any) {
          if (resolved) return  // 取消场景下不覆盖 finish 已发出的错误

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

/** 取消指定请求。 */
export function cancelChat(requestId: string): void {
  const ctrl = activeRequests.get(requestId)
  if (ctrl) {
    try { ctrl.abort() } catch { /* noop */ }
  }
}

/** 使用 Vercel AI SDK 非流式测试连接性（发一句话），返回首段文本或错误。 */
export async function testProvider(provider: AiProviderConfig): Promise<{ ok: boolean; message: string }> {
  log.debug('[AI] testProvider 开始: name=%s template=%s model=%s', provider.name, provider.template, provider.model)
  try {
    const sdkModel = createSdkModel(provider)
    // resolveActiveModel 确保 model 字段正确
    const resolved = resolveActiveModel(provider)
    const model = createSdkModel(resolved)

    const result = await generateText({
      model,
      messages: [{ role: 'user', content: '你好，请回复"连接正常"。' }],
      maxOutputTokens: 100,
      abortSignal: AbortSignal.timeout(provider.timeoutMs || 30000),
    })

    const reply = result.text?.trim() || '连接成功（无内容返回）。'
    log.debug('[AI] testProvider 成功: name=%s reply=%s', provider.name, truncate(reply, 100))
    return { ok: true, message: reply }
  } catch (e: any) {
    log.warn('[AI] testProvider 失败: name=%s err=%s', provider.name, e?.message || e)
    if (e instanceof APICallError) {
      return { ok: false, message: `API 错误（HTTP ${e.statusCode || '?'}）：${e.message}` }
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
    }, provider.timeoutMs || 15000)

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
