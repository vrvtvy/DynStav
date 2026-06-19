import { AiProviderConfig, ChatMessage } from '../../renderer/src/types'
import { ProviderAdapter, ParsedDelta } from './types'
/** 规范化 baseUrl，去掉末尾斜杠。 */
function trimBase(url: string): string {
  return (url || '').replace(/\/+$/, '')
}

/**
 * OpenAI ChatCompletions 模板（同时兼容任何遵循 OpenAI 协议的第三方网关，
 * 如 deepseek、moonshot、本地 vLLM / Ollama 的 OpenAI 兼容端点）。
 */
export const openaiAdapter: ProviderAdapter = {
  buildRequest(config, messages) {
    const path = config.path || '/chat/completions'
    const url = trimBase(config.baseUrl) + path
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    }
    if (config.headers) Object.assign(headers, config.headers)
    const body = JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.3,
      stream: true
    })
    return { url, method: 'POST', headers, body }
  },
  parseDelta(line): ParsedDelta | null {
    // OpenAI SSE 以 "data: " 前缀；[DONE] 表示结束
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return null
      try {
        const json = JSON.parse(payload)
        const choice = json?.choices?.[0]
        const delta = choice?.delta?.content ?? ''
        // DeepSeek R1: reasoning_content；部分供应商: reasoning
        const thinking = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning ?? ''
        return { delta, thinking: thinking || undefined }
      } catch {
        return { delta: '' }
      }
    }
    return { delta: '' }
  }
}

/**
 * Azure OpenAI 模板。使用 api-key 头，URL 形如
 * {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=2024-02-15-preview
 * 其中 model 字段填 deployment 名，baseUrl 填 endpoint。
 */
export const azureAdapter: ProviderAdapter = {
  buildRequest(config, messages) {
    const path =
      config.path ||
      `/openai/deployments/${encodeURIComponent(config.model)}/chat/completions?api-version=2024-02-15-preview`
    const url = trimBase(config.baseUrl) + path
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'api-key': config.apiKey
    }
    if (config.headers) Object.assign(headers, config.headers)
    const body = JSON.stringify({
      // Azure 的 model 与 deployment 一致，但部分新版本仍需传 model
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.3,
      stream: true
    })
    return { url, method: 'POST', headers, body }
  },
  parseDelta: openaiAdapter.parseDelta
}

/**
 * Anthropic Claude（Messages API）模板。
 * 流式响应事件为 content_block_delta，data 中含 delta.text。
 */
export const anthropicAdapter: ProviderAdapter = {
  buildRequest(config, messages) {
    const path = config.path || '/v1/messages'
    const url = trimBase(config.baseUrl) + path
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    }
    if (config.headers) Object.assign(headers, config.headers)
    // Claude 把 system 独立成顶层字段
    const sys = messages.find(m => m.role === 'system')?.content
    const conv = messages.filter(m => m.role !== 'system')
    const bodyObj: Record<string, any> = {
      model: config.model,
      ...(sys ? { system: sys } : {}),
      messages: conv,
      temperature: config.temperature ?? 0.3,
      max_tokens: 4096,
      stream: true
    }
    const body = JSON.stringify(bodyObj)
    return { url, method: 'POST', headers, body }
  },
  parseDelta(line): ParsedDelta | null {
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim()
      if (!payload) return { delta: '' }
      try {
        const json = JSON.parse(payload)
        // 事件结束或内容块结束返回空
        if (json?.type === 'message_stop') return null
        if (json?.type === 'content_block_delta') {
          const d = json?.delta
          // thinking delta: { type: 'thinking_delta', thinking: '...' }
          if (d?.type === 'thinking_delta') {
            return { delta: '', thinking: d.thinking ?? '' }
          }
          // text delta: { type: 'text_delta', text: '...' }
          return { delta: d?.text ?? '' }
        }
        return { delta: '' }
      } catch {
        return { delta: '' }
      }
    }
    return { delta: '' }
  }
}

/**
 * 通用自定义模板。沿用 OpenAI 协议作为默认，
 * 用户可通过 baseUrl/path/headers 覆盖适配自家服务。
 */
export const customAdapter: ProviderAdapter = {
  buildRequest: openaiAdapter.buildRequest,
  parseDelta: openaiAdapter.parseDelta
}

const ADAPTERS: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  azure: azureAdapter,
  anthropic: anthropicAdapter,
  custom: customAdapter
}

export function getAdapter(config: AiProviderConfig): ProviderAdapter {
  return ADAPTERS[config.template] || customAdapter
}
