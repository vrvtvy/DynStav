import { BlockInfo, BlockDailyStats, QueryParams, AppConfig, ThsUserDirEntry } from './types'

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
      getConfig: () => Promise<AppConfig>
      saveConfig: (config: AppConfig) => Promise<void>
      isFirstRun: () => Promise<boolean>
      searchThsDirs: () => Promise<ThsUserDirEntry[]>
      setThsUserDir: (userDir: string) => Promise<AppConfig>
      completeSetup: (data: { theme: string; thsUserDir: string }) => Promise<AppConfig>
      openFolderDialog: () => Promise<string | null>
      getWindowMaximized: () => Promise<boolean>
      onMaximizeChanged: (callback: (maximized: boolean) => void) => () => void
      onConfigLoaded: (callback: (theme: string) => void) => () => void
      listBackups: () => Promise<{ name: string; path: string }[]>
      restoreBackup: (path: string) => Promise<void>
      triggerBackup: () => Promise<void>
      onBackupRestored: (callback: () => void) => () => void
    }
  }
}
