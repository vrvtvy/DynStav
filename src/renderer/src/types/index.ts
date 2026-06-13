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

/** 应用配置 */
export interface AppConfig {
  theme: ThemeType
  thsUserDir: string | null
  stockblockIniPath: string | null
  /** 窗口位置和大小（最大化时保存的是还原后的尺寸） */
  windowBounds?: { x: number; y: number; width: number; height: number }
  /** 上次关闭时是否最大化 */
  maximized?: boolean
}

/** 同花顺用户目录搜索结果 */
export interface ThsUserDirEntry {
  path: string
  label: string
}

/** IPC 事件通道 */
export const IPC_CHANNELS = {
  GET_BLOCKS: 'get-blocks',
  QUERY_STATS: 'query-stats',
  SYNC_DATA: 'sync-data',
  SYNC_PROGRESS: 'sync-progress',
  SYNC_DONE: 'sync-done',
  GET_LATEST_DATE: 'get-latest-date',
  UPDATE_BLOCK_SORT: 'update-block-sort',
  SYNC_BLOCK_META: 'sync-block-meta',
  GET_CONFIG: 'get-config',
  SAVE_CONFIG: 'save-config',
  SEARCH_THS_DIRS: 'search-ths-dirs',
  SET_THS_USER_DIR: 'set-ths-user-dir',
  IS_FIRST_RUN: 'is-first-run',
  COMPLETE_SETUP: 'complete-setup'
} as const
