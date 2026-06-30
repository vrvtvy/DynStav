/**
 * 模型能力注册表 + 动态上下文窗口学习机制。
 *
 * contextWindow 是模型固定属性，无法从 API 获取，必须由本系统维护。
 * 采用"动态学习 + 错误驱动"策略，彻底摆脱易过时的静态注册表：
 *   1. 成功请求且 inputTokens 接近当前估计 → 保守上调（×1.5，上限 1M）
 *   2. context exceeded 错误 → 下调（×0.7）并触发加强压缩重试
 *   3. 学习值持久化到 ai-config.json，下次复用
 *
 * 静态注册表仅作为冷启动优化（首次使用某模型时的初始猜测），
 * 学习机制会覆盖注册表值（学习值优先级更高）。
 */

/** 兜底上下文窗口（128k，当前主流模型下限） */
export const FALLBACK_CONTEXT_WINDOW = 131072

/** 学习上限（1M token） */
export const MAX_LEARNED_CONTEXT_WINDOW = 1_048_576

interface ModelCapabilities {
  /** 上下文窗口（token），仅用于内部预算计算和冷启动，不传给 API */
  contextWindow: number
}

/**
 * 静态模型能力注册表。仅含 contextWindow，仅冷启动用。
 * 只放最稳定的主流模型，学习机制会覆盖这些值。
 * 按模型名前缀模糊匹配（模型名包含 key 即匹配）。
 */
const MODEL_REGISTRY: Record<string, ModelCapabilities> = {
  // DeepSeek
  'deepseek-chat': { contextWindow: 65536 },
  'deepseek-reasoner': { contextWindow: 65536 },
  // OpenAI
  'gpt-4o': { contextWindow: 131072 },
  'gpt-4o-mini': { contextWindow: 131072 },
  'gpt-4.1': { contextWindow: 1048576 },
  'o1': { contextWindow: 200000 },
  'o3': { contextWindow: 200000 },
  // Anthropic
  'claude-3-5-sonnet': { contextWindow: 200000 },
  'claude-3-5-haiku': { contextWindow: 200000 },
  'claude-3-opus': { contextWindow: 200000 },
  'claude-sonnet-4': { contextWindow: 200000 },
  'claude-opus-4': { contextWindow: 200000 },
  // Google
  'gemini-2.0-flash': { contextWindow: 1048576 },
  'gemini-1.5-pro': { contextWindow: 2097152 },
  'gemini-1.5-flash': { contextWindow: 1048576 },
  // 通义千问
  'qwen-max': { contextWindow: 32768 },
  'qwen-plus': { contextWindow: 131072 },
  'qwen-turbo': { contextWindow: 131072 },
  // 智谱
  'glm-4': { contextWindow: 131072 },
  'glm-4-plus': { contextWindow: 131072 },
  'glm-4-flash': { contextWindow: 131072 },
}

/**
 * 模糊匹配模型名，返回能力信息或 null。
 * 匹配规则：模型名（小写）包含 key 即匹配，优先匹配更长的 key（更精确）。
 */
export function lookupModelCapabilities(modelName: string): ModelCapabilities | null {
  if (!modelName) return null
  const lower = modelName.toLowerCase()
  // 按 key 长度降序匹配，优先更精确的前缀
  const keys = Object.keys(MODEL_REGISTRY).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) {
      return MODEL_REGISTRY[key]
    }
  }
  return null
}

/**
 * 四层优先级解析 contextWindow：
 *   1. 用户显式配置
 *   2. 已学习缓存（持久化在 ai-config.json）
 *   3. 静态注册表
 *   4. 兜底 131072（128k）
 */
export function resolveContextWindow(
  modelName: string,
  userConfig?: number,
  learnedWindows?: Record<string, number>
): number {
  if (userConfig && userConfig > 0) return userConfig
  if (learnedWindows && learnedWindows[modelName] && learnedWindows[modelName] > 0) {
    return learnedWindows[modelName]
  }
  const registry = lookupModelCapabilities(modelName)
  if (registry) return registry.contextWindow
  return FALLBACK_CONTEXT_WINDOW
}

/**
 * maxOutputTokens 策略：用户配置 > 默认 65536。
 * 始终传一个明确值，避免部分模型（如阿里云百炼 deepseek-v4-pro）在缺少
 * max_tokens 时产零输出。65536 覆盖面广，适配长上下文模型。
 */
export function resolveMaxOutputTokens(userConfig?: number): number {
  if (userConfig && userConfig > 0) return userConfig
  return 65536
}

/**
 * 成功请求后更新学习值（保守上调）。
 * 若实际输入 token 接近当前估计值且成功，说明窗口可能更大，保守上调。
 *
 * @returns 新的学习值（如有更新），否则返回 undefined
 */
export function updateLearnedContextWindow(
  modelName: string,
  actualInputTokens: number,
  learnedWindows: Record<string, number>
): number | undefined {
  if (!modelName) return undefined
  const current = learnedWindows[modelName] ?? resolveContextWindow(modelName)
  // 实际输入接近当前估计值且成功 → 保守上调（可能窗口更大）
  if (actualInputTokens > current * 0.8) {
    const newEstimated = Math.min(Math.ceil(current * 1.5), MAX_LEARNED_CONTEXT_WINDOW)
    if (newEstimated > current) {
      learnedWindows[modelName] = newEstimated
      return newEstimated
    }
  }
  return undefined
}

/**
 * context exceeded 错误时下调学习值。
 *
 * @returns 下调后的新学习值
 */
export function shrinkLearnedContextWindow(
  modelName: string,
  failedInputTokens: number,
  learnedWindows: Record<string, number>
): number {
  if (!modelName) return FALLBACK_CONTEXT_WINDOW
  const shrunk = Math.max(Math.floor(failedInputTokens * 0.7), 4096)
  learnedWindows[modelName] = shrunk
  return shrunk
}
