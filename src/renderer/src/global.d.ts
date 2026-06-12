import { BlockInfo, BlockDailyStats, QueryParams } from './types'

declare global {
  interface Window {
    electronAPI: {
      getBlocks: () => Promise<BlockInfo[]>
      queryStats: (params: QueryParams) => Promise<BlockDailyStats[]>
      syncData: () => Promise<void>
      getLatestDate: () => Promise<string>
      onSyncDone: (callback: () => void) => () => void
    }
  }
}
