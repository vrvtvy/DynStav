import { BlockInfo, BlockDailyStats, QueryParams } from './types'

declare global {
  interface Window {
    electronAPI: {
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      getBlocks: () => Promise<BlockInfo[]>
      queryStats: (params: QueryParams) => Promise<BlockDailyStats[]>
      syncData: () => Promise<void>
      getLatestDate: () => Promise<string>
      onSyncDone: (callback: () => void) => () => void
      updateBlockSort: (codes: string[]) => Promise<void>
    }
  }
}
