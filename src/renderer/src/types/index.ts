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

/** IPC 事件通道 */
export const IPC_CHANNELS = {
  GET_BLOCKS: 'get-blocks',
  QUERY_STATS: 'query-stats',
  SYNC_DATA: 'sync-data',
  SYNC_PROGRESS: 'sync-progress',
  SYNC_DONE: 'sync-done',
  GET_LATEST_DATE: 'get-latest-date',
  UPDATE_BLOCK_SORT: 'update-block-sort',
  SYNC_BLOCK_META: 'sync-block-meta'
} as const
