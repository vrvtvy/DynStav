import { net } from 'electron'
import log from 'electron-log/main'
import {
  AiProviderConfig,
  AiModelConfig,
  AiChatRequest,
  AiChatChunk,
  ChatMessage
} from '../../renderer/src/types'
import { getAdapter } from './adapters'
import { injectContext, ProviderAdapter } from './types'
import { mergePresets } from './presets'

/**
 * AI 服务层。所有对外的（HTTP、配置持久化）都在主进程完成，
 * 渲染层只通过 IPC 调用，密钥不暴露到渲染进程的持久存储。
 */

/** 默认超时 15s（需求 §3.3）。 */
const DEFAULT_TIMEOUT_MS = 15000

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
 * 用 Electron 的 net 模块发起流式请求，逐 chunk 回调。
 * 选择 net 而非 Node fetch：net 走 Chromium 网络栈，
 * 自动遵循系统代理、证书校验，且支持可靠的中途取消。
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
  const adapter: ProviderAdapter = getAdapter(provider)
  const messages: ChatMessage[] = injectContext(request.messages, request.context)
  const spec = adapter.buildRequest(provider, messages)

  // 关键调试信息：实际发往大模型的 URL / 模板 / 模型 / 消息（含注入后的 system 提示词）。
  // 密钥只在头部存在，输出前做掩码；消息体完整打印，方便核对最终 prompt。
  log.debug('[AI] 请求准备: requestId=%s template=%s model=%s url=%s timeout=%dms',
    requestId, provider.template, provider.model, spec.url, provider.timeoutMs || DEFAULT_TIMEOUT_MS)
  log.debug('[AI] 请求头(掩码后): %s', JSON.stringify(maskAuthHeaders(spec.headers)))
  log.debug('[AI] 最终发送的消息体(prompt):\n%s', JSON.stringify(messages, null, 2))

  const controller = new AbortController()
  activeRequests.set(requestId, controller)
  const timeoutMs = provider.timeoutMs && provider.timeoutMs > 0 ? provider.timeoutMs : DEFAULT_TIMEOUT_MS

  return new Promise<void>((resolve) => {
    let resolved = false
    let buffer = ''
    let receivedBytes = 0
    let deltaCount = 0

    const finish = (error?: string) => {
      if (resolved) return
      resolved = true
      activeRequests.delete(requestId)
      log.debug('[AI] streamChat 结束: requestId=%s 收到字节数=%d 解析出 delta 段数=%d error=%s',
        requestId, receivedBytes, deltaCount, error || '无')
      onChunk({ delta: '', done: true, error })
      resolve()
    }

    const timer = setTimeout(() => {
      try { controller.abort() } catch { /* noop */ }
      log.warn('[AI] 请求超时: requestId=%s timeout=%dms 已收字节=%d', requestId, timeoutMs, receivedBytes)
      finish('请求超时，请检查网络或调整超时设置。')
    }, timeoutMs)

    const req = net.request({
      method: 'POST',
      url: spec.url
    })
    for (const [k, v] of Object.entries(spec.headers)) {
      req.setHeader(k, String(v))
    }

    req.on('response', (response) => {
      const status = response.statusCode
      log.debug('[AI] 收到响应头: requestId=%s HTTP %d', requestId, status)
      clearTimeout(timer)
      if (status >= 400) {
        // 收集错误体以便提示
        let errBody = ''
        response.on('data', (d) => { errBody += d.toString('utf8') })
        response.on('end', () => {
          const msg = `AI 接口返回错误（HTTP ${status}）：${truncate(errBody, 500)}`
          log.warn('[AI] HTTP error: requestId=%s status=%d body=%s', requestId, status, errBody)
          finish(msg)
        })
        return
      }

      response.on('data', (chunk) => {
        receivedBytes += chunk.length
        buffer += chunk.toString('utf8')
        // SSE 以空行分隔事件，行内以 \n 结尾
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const raw of lines) {
          const line = raw.replace(/\r$/, '')
          if (!line) continue
          try {
            const parsed = adapter.parseDelta(line)
            if (parsed === null) {
              log.debug('[AI] 收到结束信号: requestId=%s', requestId)
              // 结束信号
              return finish()
            }
            if (parsed.delta || parsed.thinking) {
              deltaCount++
              onChunk({ delta: parsed.delta, thinking: parsed.thinking, done: false })
            }
          } catch (e) {
            log.warn('[AI] parse delta failed: requestId=%s err=%s line=%s', requestId, e, line)
          }
        }
      })
      response.on('end', () => {
        log.debug('[AI] response end: requestId=%s 剩余未解析 buffer 长度=%d', requestId, buffer.length)
        finish()
      })
      response.on('error', (e) => {
        log.warn('[AI] response error: requestId=%s err=%s', requestId, e.message)
        finish(`网络错误：${e.message}`)
      })
    })

    req.on('error', (e) => {
      clearTimeout(timer)
      log.warn('[AI] request error: requestId=%s err=%s', requestId, e.message)
      finish(`请求失败：${e.message}`)
    })

    // 取消
    controller.signal.addEventListener('abort', () => {
      try { req.abort() } catch { /* noop */ }
      log.debug('[AI] 请求被取消: requestId=%s', requestId)
      finish('请求已取消。')
    })

    try {
      req.write(spec.body)
      req.end()
      log.debug('[AI] 请求已发出: requestId=%s body 长度=%d', requestId, spec.body.length)
    } catch (e: any) {
      clearTimeout(timer)
      log.error('[AI] 请求发送异常: requestId=%s err=%s', requestId, e?.message || e)
      finish(`请求发送失败：${e?.message || e}`)
    }
  })
}

/** 取消指定请求。 */
export function cancelChat(requestId: string): void {
  const ctrl = activeRequests.get(requestId)
  if (ctrl) {
    try { ctrl.abort() } catch { /* noop */ }
  }
}

/** 非流式测试一次连通性（发一句话），返回首段文本或错误。 */
export async function testProvider(provider: AiProviderConfig): Promise<{ ok: boolean; message: string }> {
  log.debug('[AI] testProvider 开始: name=%s template=%s model=%s url=%s',
    provider.name, provider.template, provider.model, provider.baseUrl)
  return new Promise((resolve) => {
    const adapter: ProviderAdapter = getAdapter(provider)
    const spec = adapter.buildRequest(provider, [{ role: 'user', content: '你好，请回复"连接正常"。' }])
    log.debug('[AI] testProvider 请求: url=%s headers(掩码)=%s body=%s',
      spec.url, JSON.stringify(maskAuthHeaders(spec.headers)), spec.body)
    const controller = new AbortController()
    const timeoutMs = provider.timeoutMs && provider.timeoutMs > 0 ? provider.timeoutMs : DEFAULT_TIMEOUT_MS

    let collected = ''
    let buffer = ''
    let done = false

    const timer = setTimeout(() => {
      try { controller.abort() } catch { /* noop */ }
      if (!done) {
        log.warn('[AI] testProvider 超时: name=%s timeout=%dms', provider.name, timeoutMs)
        done = true; resolve({ ok: false, message: '请求超时。' })
      }
    }, timeoutMs)

    const finish = (ok: boolean, msg: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      log.debug('[AI] testProvider 完成: name=%s ok=%s msg=%s', provider.name, ok, truncate(msg, 200))
      resolve({ ok, message: msg })
    }

    const req = net.request({ method: 'POST', url: spec.url })
    for (const [k, v] of Object.entries(spec.headers)) {
      req.setHeader(k, String(v))
    }

    req.on('response', (response) => {
      const status = response.statusCode
      log.debug('[AI] testProvider 收到响应头: HTTP %d', status)
      if (status >= 400) {
        let body = ''
        response.on('data', (d) => { body += d.toString('utf8') })
        response.on('end', () => {
          log.warn('[AI] testProvider HTTP error: status=%d body=%s', status, body)
          finish(false, `HTTP ${status}：${truncate(body, 300)}`)
        })
        return
      }
      response.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const raw of lines) {
          const line = raw.replace(/\r$/, '')
          if (!line) continue
          try {
            const parsed = adapter.parseDelta(line)
            if (parsed === null) { finish(true, collected || '连接成功。'); return }
            if (parsed?.delta) collected += parsed.delta
          } catch (e) {
            log.warn('[AI] testProvider parse delta failed: %s line=%s', e, line)
          }
        }
      })
      response.on('end', () => finish(true, collected || '连接成功（无内容返回）。'))
      response.on('error', (e) => {
        log.warn('[AI] testProvider response error: %s', e.message)
        finish(false, `网络错误：${e.message}`)
      })
    })
    req.on('error', (e) => {
      log.warn('[AI] testProvider request error: %s', e.message)
      finish(false, `请求失败：${e.message}`)
    })
    controller.signal.addEventListener('abort', () => finish(false, '已取消'))

    try { req.write(spec.body); req.end() }
    catch (e: any) {
      log.error('[AI] testProvider 发送异常: %s', e?.message || e)
      finish(false, `请求发送失败：${e?.message || e}`)
    }
  })
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '...' : s
}

/**
 * 对请求头做掩码：保留 key 名，仅对疑似承载凭据的字段做脱敏，
 * 用于日志输出。不修改原对象。
 */
function maskAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {}
  const sensitiveKeys = ['authorization', 'api-key', 'x-api-key', 'cookie', 'token']
  for (const [k, v] of Object.entries(headers)) {
    if (sensitiveKeys.includes(k.toLowerCase())) {
      // 保留前缀(如 "Bearer ")便于看到鉴权方式，密钥部分只露前后各 4 字符
      const head = v.length > 12 ? v.slice(0, 4) : ''
      const tail = v.length > 12 ? v.slice(-4) : ''
      masked[k] = v.length > 12 ? `${head}***${tail}(${v.length}字符)` : `***(${v.length}字符)`
    } else {
      masked[k] = v
    }
  }
  return masked
}

/* ───────────────────────── 配置持久化（含简易加密） ─────────────────────────
 * Electron 内置 safeStorage 在 Windows 走 DPAPI，用户级加密，符合需求 §4.3
 * "敏感信息加密存储"。存储目录 .dynstav，与主配置同处。
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getConfigPath } from '../paths'
import { safeStorage } from 'electron'

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
    const providers: AiProviderConfig[] = list.map(p => ({
      ...p,
      apiKey: p.apiKeyEnc ? decrypt(p.apiKeyEnc) : ''
    }))
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
