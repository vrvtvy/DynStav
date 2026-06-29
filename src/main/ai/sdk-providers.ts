import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { LanguageModel } from 'ai'
import { AiProviderConfig } from '../../renderer/src/types'

/**
 * 根据供应商配置创建对应的 Vercel AI SDK 模型实例。
 * 将自定义的 AiProviderConfig（template/baseUrl/apiKey 等）
 * 映射到 SDK 的 provider(modelId) 调用。
 *
 * 支持以下模板：
 *   - completion → @ai-sdk/openai（兼容 OpenAI 协议）
 *   - anthropic  → @ai-sdk/anthropic（Anthropic Messages API）
 *   - responses  → @ai-sdk/openai（Azure OpenAI）
 *   - custom     → @ai-sdk/openai（通用 OpenAI 兼容）
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

    // OpenAI 兼容模板（包括 completion / responses / custom）：
    // 使用 @ai-sdk/openicreateOpenAI，自动处理 Authorization: Bearer 认证
    const openaiOptions: Record<string, unknown> = {
        baseURL: config.baseUrl || 'https://api.openai.com/v1',
        apiKey: config.apiKey,
    }

    // Azure / responses 模板：额外传递 api-key 头
    if (template === 'responses') {
        openaiOptions.headers = {
            'api-key': config.apiKey,
            ...(config.headers || {}),
        }
    } else if (config.headers && Object.keys(config.headers).length > 0) {
        openaiOptions.headers = config.headers
    }

    const provider = createOpenAI(openaiOptions as Parameters<typeof createOpenAI>[0])
    return provider(modelKey)
}
