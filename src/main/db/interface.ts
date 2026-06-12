import { BlockDailyStats, BlockInfo, QueryParams } from '../../renderer/src/types'

/** 数据持久层抽象接口 */
export interface DataRepository {
  /** 初始化（建表等） */
  init(): void

  /** 获取所有板块列表 */
  getBlocks(): BlockInfo[]

  /** 批量保存板块统计数据 */
  saveStats(stats: BlockDailyStats[]): void

  /** 条件查询统计数据 */
  queryStats(params: QueryParams): BlockDailyStats[]

  /** 获取最新数据日期 */
  getLatestDate(): string | null
}
