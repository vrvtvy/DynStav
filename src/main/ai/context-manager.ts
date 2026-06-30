/**
 * 上下文管理器：token 估算 + 滑动窗口 + 按需摘要压缩。
 *
 * 采用业界推荐的"滑动窗口 + 按需摘要"混合策略：
 *   1. token 预算计算：available = contextWindow - systemTokens - maxOutputTokens - reserve
 *   2. 正常情况：所有消息 fit 预算 → 全量发送
 *   3. 超预算：保留最近 N 条消息，旧消息用 generateText 生成 ≤200 字摘要，作为 system 前置
 */

import { generateText, type LanguageModel } from 'ai'
import log from 'electron-log/main'
import { ChatMessage, BlockContext } from '../../renderer/src/types'
import { buildSystemPrompt } from './types'

/** token 估算：每条消息额外开销（角色标记等） */
const MESSAGE_OVERHEAD_TOKENS = 4

/** 预留 token 缓冲，避免估算误差导致超限 */
const RESERVE_TOKENS = 512

/** 摘要最大输出 token */
const SUMMARY_MAX_OUTPUT_TOKENS = 300

/** 摘要 prompt */
const SUMMARY_PROMPT = `请将以下对话总结为关键信息，保留用户核心问题、已得出的分析结论、提到的关键数据点。200字以内简体中文。`

/**
 * 轻量字符级 token 估算器（无外部依赖）。
 * CJK 字符 ~1.5 字/token，ASCII ~4 字/token，其他 ~2 字/token。
 * 精度足够用于上下文管理决策（±15% 误差可接受，有 reserve 兜底）。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let cjk = 0, ascii = 0, other = 0
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= 0x4e00 && code <= 0x9fff) cjk++
    else if (code < 128) ascii++
    else other++
  }
  return Math.ceil(cjk / 1.5 + ascii / 4 + other / 2)
}

/** 批量估算消息列表的 token 数 */
export function estimateMessagesTokens(messages: { role: string; content: string }[]): number {
  let total = 0
  for (const m of messages) {
    total += estimateTokens(m.content) + MESSAGE_OVERHEAD_TOKENS
  }
  return total
}

export interface ManageContextParams {
  /** 全部历史消息（含本轮用户消息） */
  messages: ChatMessage[]
  /** 板块上下文 */
  context?: BlockContext
  /** 模型上下文窗口（token），用于计算预算 */
  contextWindow: number
  /** 预留输出空间（token），用于计算预算 */
  maxOutputTokens: number
  /** 最大保留消息条数（安全上限，默认 50） */
  maxHistoryMessages?: number
  /** 是否启用摘要压缩（默认 true） */
  enableSummary?: boolean
  /** 用于摘要生成的 SDK 模型实例 */
  model: LanguageModel
  /** 超时（毫秒） */
  timeoutMs?: number
  /** 取消信号 */
  abortSignal?: AbortSignal
  /** 加强压缩模式（context exceeded 重试时使用，保留更少历史） */
  aggressive?: boolean
}

export interface ManagedContext {
  /** 构造好的 system prompt（含静态人设 + 动态数据 + 历史摘要） */
  system: string
  /** 处理后的消息（可能被截断） */
  messages: ChatMessage[]
  /** 是否触发了压缩 */
  compressed: boolean
  /** 估算的输入 token 数（system + messages） */
  estimatedInputTokens: number
  /** 生成的摘要内容（如有） */
  summary?: string
}

/**
 * 核心方法：接收全部消息+上下文+配置，返回管理后的 system + messages。
 *
 * 流程：
 *   1. 构造 system prompt（静态人设 + 截断后的动态数据）
 *   2. 估算 system + messages 总 token
 *   3. 若超预算：滑动窗口保留最近 N 条 + generateText 摘要旧消息
 *   4. 返回 { system, messages, compressed }
 */
export async function manageContext(params: ManageContextParams): Promise<ManagedContext> {
  const {
    messages,
    context,
    contextWindow,
    maxOutputTokens,
    maxHistoryMessages = 50,
    enableSummary = true,
    model,
    timeoutMs,
    abortSignal,
    aggressive = false,
  } = params

  // 构造 system prompt
  const system = buildSystemPrompt(context)

  // 计算可用预算
  const systemTokens = estimateTokens(system)
  const availableForMessages = contextWindow - systemTokens - maxOutputTokens - RESERVE_TOKENS

  // 先做安全上限截断（防止极端情况）
  let workingMessages = messages.slice(-maxHistoryMessages)

  // 估算消息 token
  let messagesTokens = estimateMessagesTokens(workingMessages)
  let compressed = false
  let summary: string | undefined

  // 超预算 → 压缩
  if (messagesTokens > availableForMessages && workingMessages.length > 2) {
    // 加强压缩模式：保留更少历史
    const keepRecent = aggressive ? Math.min(4, workingMessages.length - 1) : Math.min(10, workingMessages.length - 1)
    const recentMessages = workingMessages.slice(-keepRecent)
    const oldMessages = workingMessages.slice(0, -keepRecent)

    if (oldMessages.length > 0) {
      // 生成摘要
      if (enableSummary) {
        try {
          summary = await generateSummary(model, oldMessages, timeoutMs, abortSignal)
          compressed = true
          log.debug('[ContextManager] 已生成历史摘要: 旧消息=%d条 摘要长度=%d字', oldMessages.length, summary.length)
        } catch (e) {
          log.warn('[ContextManager] 摘要生成失败，降级为简单截断: %s', e instanceof Error ? e.message : String(e))
          // 摘要失败 → 降级为简单截断（只保留最近消息）
          workingMessages = recentMessages
          compressed = true
        }
      } else {
        compressed = true
      }
      workingMessages = recentMessages
      messagesTokens = estimateMessagesTokens(workingMessages)

      // 如果仍然超预算，继续截断
      while (messagesTokens > availableForMessages && workingMessages.length > 2) {
        workingMessages = workingMessages.slice(-Math.ceil(workingMessages.length * 0.7))
        messagesTokens = estimateMessagesTokens(workingMessages)
      }
    }
  }

  // 拼接最终 system（含摘要）
  let finalSystem = system
  if (summary) {
    finalSystem = `${system}\n\n--- 历史对话摘要 ---\n${summary}`
  }

  const estimatedInputTokens = estimateTokens(finalSystem) + estimateMessagesTokens(workingMessages)

  log.debug('[ContextManager] 上下文管理完成: contextWindow=%d systemTokens=%d messagesTokens=%d available=%d compressed=%s msgCount=%d→%d estimatedInput=%d',
    contextWindow, systemTokens, messagesTokens, availableForMessages, compressed, messages.length, workingMessages.length, estimatedInputTokens)

  return {
    system: finalSystem,
    messages: workingMessages,
    compressed,
    estimatedInputTokens,
    summary,
  }
}

/** 使用 generateText 生成历史消息摘要 */
async function generateSummary(
  model: LanguageModel,
  oldMessages: ChatMessage[],
  timeoutMs?: number,
  abortSignal?: AbortSignal
): Promise<string> {
  const conversationText = oldMessages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n')

  const result = await generateText({
    model,
    system: SUMMARY_PROMPT,
    messages: [{ role: 'user', content: conversationText }],
    maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
    temperature: 0.1,
    timeout: timeoutMs,
    abortSignal,
  })

  return result.text?.trim() || ''
}
