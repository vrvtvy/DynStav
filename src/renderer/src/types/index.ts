/** 板块信息 */
export interface BlockInfo {
  /** 板块代码（配置文件的变量名） */
  code: string
  /** 板块名称 */
  name: string
  /** 排序权重（越大越靠前） */
  sortOrder?: number
  /** 股票数量（最近一次统计） */
  stockCount?: number
  /** 平均涨跌幅（最近一次统计） */
  avgChangePercent?: number
}

/** 板块每日统计数据 */
export interface BlockDailyStats {
  /** 板块代码 */
  blockCode: string
  /** 板块名称 */
  blockName: string
  /** 日期 YYYY-MM-DD */
  date: string
  /** 股票数量 */
  stockCount: number
  /** 平均涨跌幅 */
  avgChangePercent: number
  /** 平均股价 */
  avgPrice: number
  /** 平均成交额 */
  avgAmount: number
  /** 总成交额 */
  totalAmount: number
  /** 平均换手率 */
  avgTurnoverRate: number
}

/** 条件查询参数 */
export interface QueryParams {
  /** 起始日期 YYYY-MM-DD */
  startDate?: string
  /** 结束日期 YYYY-MM-DD */
  endDate?: string
  /** 板块代码 */
  blockCode?: string
}

/** 图表数据项配置 */
export interface ChartMetric {
  key: keyof BlockDailyStats
  label: string
  unit: string
  color: string
  type: 'bar' | 'line'
}

/** 主题类型 */
export type ThemeType = 'light' | 'dark'

/** 字体大小档位 */
export type FontSizeLevel = 'small' | 'medium' | 'large'

/** 应用配置 */
export interface AppConfig {
  theme: ThemeType
  thsUserDir: string | null
  stockblockIniPath: string | null
  /** 窗口位置和大小（最大化时保存的是还原后的尺寸） */
  windowBounds?: { x: number; y: number; width: number; height: number }
  /** 上次关闭时是否最大化 */
  maximized?: boolean
  /** 全局字体大小档位 */
  fontSize?: FontSizeLevel
  /** 右侧 AI 面板宽度（0 表示收起） */
  rightPanelWidth?: number
  /** AI 服务供应商配置列表（密钥已加密） */
  aiProviders?: AiProviderConfig[]
  /** 最近使用的 AI 供应商 id */
  activeAiProviderId?: string | null
  /** 最近使用的 AI 模型 id */
  activeAiModelId?: string | null
}

/**
 * 单个模型配置。一个供应商可挂多个模型，每个模型可独立设置温度等参数。
 */
export interface AiModelConfig {
  /** 唯一 id（同一供应商内唯一） */
  id: string
  /** API 请求中的 model 字段值，如 gpt-4o-mini */
  model: string
  /** 显示名称，留空则使用 model 值 */
  name?: string
  /** 推理温度，留空则使用供应商默认值 */
  temperature?: number
  /** 自定义请求参数（键值对），会合并到 API 请求体中，用于开启模型方特定功能 */
  customParams?: Record<string, string>
}

/**
 * AI 供应商配置。模板（template）决定请求体如何构造与响应如何解析，
 * 通过模板可兼容 OpenAI / Azure OpenAI / Anthropic / 通用私有模型。
 */
export interface AiProviderConfig {
  /** 唯一 id */
  id: string
  /** 显示名称 */
  name: string
  /** 适配模板：completion | responses | anthropic | custom */
  template: AiProviderTemplate
  /** API 基础地址，如 https://api.openai.com/v1 */ 
  baseUrl: string
  /** 模型名称（向后兼容，仅当 models 为空时使用） */
  model: string
  /** API 密钥（主进程侧加密后落盘，渲染层拿到的为明文） */
  apiKey: string
  /** 请求超时（毫秒），默认 15000 */
  timeoutMs: number
  /** 自定义请求路径（相对 baseUrl），如 /chat/completions，留空使用模板默认 */
  path?: string
  /** 自定义请求头（键值对，可选） */
  headers?: Record<string, string>
  /** 推理温度，默认 0.3（供应商级默认值，模型级可覆盖） */
  temperature?: number
  /** 该供应商下的模型列表 */
  models?: AiModelConfig[]
  /** 自定义请求参数（由模型级 customParams 合并而来，运行时注入） */
  customParams?: Record<string, string>
  /** 预设标记：true 表示系统预设提供商 */
  isPreset?: boolean
  /** 预设唯一标识，如 "deepseek"、"openai"，用于匹配预设定义（仅预设供应商有值） */
  presetId?: string
  /** 预设 Logo 缩写（1-2 字母），如 "DS"、"MK" */
  presetLogo?: string
  /** 预设图标 key，如 "deepseek"、"zhipu" */
  presetIconKey?: string
}

/** AI 适配模板类型 */
export type AiProviderTemplate = 'completion' | 'responses' | 'anthropic' | 'custom'

/** AI 对话角色 */
export type ChatRole = 'system' | 'user' | 'assistant'

/** AI 对话消息 */
export interface ChatMessage {
  role: ChatRole
  content: string
}

/** 当前板块上下文摘要（用于注入 AI 请求） */
export interface BlockContext {
  code: string
  name: string
  dateRange?: string
  /** 指标快照：键为指标中文名，值为字符串（含单位） */
  metrics?: { label: string; value: string }[]
  /** 最近 N 日趋势序列文本，如 "1.2%, -0.3%, 0.8%..." */
  trendSeries?: string
  /** 每日完整数据，供 AI 全面分析 */
  dailyData?: {
    date: string
    stockCount: number
    avgChangePercent: number
    avgPrice: number
    avgAmount: number
    totalAmount: number
    avgTurnoverRate: number
  }[]
}

/** AI 聊天请求 */
export interface AiChatRequest {
  providerId: string
  /** 当前选中的模型 id（对应 AiModelConfig.id），不传则使用供应商首个模型 */
  activeModelId?: string
  messages: ChatMessage[]
  /** 板块上下文，会以 system 消息注入 */
  context?: BlockContext
}

/** AI 聊天流式响应片段 */
export interface AiChatChunk {
  /** 本次片段增量文本 */
  delta: string
  /** 本次片段思考/推理过程增量 */
  thinking?: string
  /** 是否结束 */
  done: boolean
  /** 错误信息（done=true 时可能出现） */
  error?: string
}

/** 同花顺用户目录搜索结果 */
export interface ThsUserDirEntry {
  path: string
  label: string
}

/** AI 对话会话（持久化） */
export interface ChatSession {
  id: string
  blockCode: string
  blockName: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount?: number
}

/** AI 对话消息（持久化） */
export interface ChatSessionMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  /** 模型思考/推理过程内容 */
  thinkingContent?: string
  createdAt: string
  error?: boolean
}

/** IPC 事件通道 */
export const IPC_CHANNELS = {
  GET_BLOCKS: 'get-blocks',
  QUERY_STATS: 'query-stats',
  SYNC_DATA: 'sync-data',
  SYNC_PROGRESS: 'sync-progress',
  SYNC_DONE: 'sync-done',
  GET_LATEST_DATE: 'get-latest-date',
  GET_TRADING_DATE_RANGE: 'get-trading-date-range',
  UPDATE_BLOCK_SORT: 'update-block-sort',
  SYNC_BLOCK_META: 'sync-block-meta',
  GET_CONFIG: 'get-config',
  SAVE_CONFIG: 'save-config',
  SEARCH_THS_DIRS: 'search-ths-dirs',
  RESOLVE_THS_DIR: 'resolve-ths-dir',
  SET_THS_USER_DIR: 'set-ths-user-dir',
  IS_FIRST_RUN: 'is-first-run',
  COMPLETE_SETUP: 'complete-setup',
  LIST_BACKUPS: 'list-backups',
  RESTORE_BACKUP: 'restore-backup',
  TRIGGER_BACKUP: 'trigger-backup',
  BACKUP_RESTORED: 'backup-restored',
  CHECK_MARKET_OPEN: 'check-market-open',
  GET_APP_DIRS: 'get-app-dirs',
  AI_CHAT: 'ai-chat',
  AI_CHAT_STARTED: 'ai-chat-started',
  AI_CHAT_CHUNK: 'ai-chat-chunk',
  AI_CANCEL: 'ai-cancel',
  AI_LIST_PROVIDERS: 'ai-list-providers',
  AI_SAVE_PROVIDERS: 'ai-save-providers',
  AI_TEST_PROVIDER: 'ai-test-provider',
  AI_FETCH_MODELS: 'ai-fetch-models',
  AI_LIST_SESSIONS: 'ai-list-sessions',
  AI_GET_SESSION: 'ai-get-session',
  AI_SAVE_SESSION: 'ai-save-session',
  AI_DELETE_SESSION: 'ai-delete-session'
} as const
