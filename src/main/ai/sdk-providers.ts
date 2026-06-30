import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { LanguageModel } from 'ai'
import { AiProviderConfig } from '../../renderer/src/types'

/**
 * 根据供应商配置创建对应的 Vercel AI SDK 模型实例。
 *
 * 支持以下模板：
 *   - completion → @ai-sdk/openai-compatible（第三方兼容，含 reasoning_content 解析）
 *   - responses  → @ai-sdk/openai（OpenAI Responses API）
 *   - anthropic  → @ai-sdk/anthropic（Anthropic Messages API）
 *   - custom     → @ai-sdk/openai-compatible（通用 OpenAI 兼容）
 */
export function createSdkModel(config: AiProviderConfig): LanguageModel {
    const template = config.template ?? 'completion'
    const modelKey = config.model || ''

    // Anthropic 模板：使用 @ai-sdk/anthropic
    if (template === 'anthropic') {
        const provider = createAnthropic({
            baseURL: config.baseUrl || 'https://api.anthropic.com',
            apiKey: config.apiKey,
            headers: config.headers,
        })
        return provider(modelKey)
    }

    // responses 模板：使用 @ai-sdk/openai（OpenAI Responses API）
    if (template === 'responses') {
        const provider = createOpenAI({
            baseURL: config.baseUrl || 'https://api.openai.com/v1',
            apiKey: config.apiKey,
            headers: {
                'api-key': config.apiKey,
                ...(config.headers || {}),
            },
        })
        return provider(modelKey)
    }

    // completion / custom 模板：使用 @ai-sdk/openai-compatible
    // 该包专门为第三方 OpenAI 兼容 API 设计，会正确解析 SSE 流中的
    // delta.reasoning_content（@ai-sdk/openai 的 Chat 模型不会处理）
    const provider = createOpenAICompatible({
        name: config.name || 'openai-compatible',
        baseURL: config.baseUrl || 'https://api.openai.com/v1',
        apiKey: config.apiKey,
        ...(config.headers && Object.keys(config.headers).length > 0
            ? { headers: config.headers }
            : {}),
    })
    return provider.chatModel(modelKey)
}
