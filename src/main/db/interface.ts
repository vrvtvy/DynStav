import { BlockDailyStats, BlockInfo, QueryParams } from '../../renderer/src/types'

/** 数据持久层抽象接口 */
export interface DataRepository {
  /** 初始化（建表等） */
  init(): void

  /** 获取所有板块列表 */
  getBlocks(): BlockInfo[]

  /** 批量保存板块统计数据 */
  saveStats(stats: BlockDailyStats[]): void

  /** 删除指定日期的所有统计数据（用于重新同步前清除可能残留的旧板块数据） */
  deleteStatsByDate(date: string): void

  /** 条件查询统计数据 */
  queryStats(params: QueryParams): BlockDailyStats[]

  /** 获取最新数据日期 */
  getLatestDate(): string | null

  /** 保存/同步板块元数据（名称+排序） */
  saveBlockMeta(blocks: { code: string; name: string }[]): void

  /** 更新板块排序 */
  updateBlockSort(codes: string[]): void

  /** 备份当前数据库 */
  backup(): void

  /** 列出可恢复的备份文件 */
  listBackups(): { name: string; path: string }[]

  /** 从指定备份恢复数据库 */
  restoreFrom(backupPath: string): void
}
