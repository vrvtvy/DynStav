import {
  BlockInfo,
  BlockDailyStats,
  QueryParams,
  AppConfig,
  ThsUserDirEntry,
  AiChatRequest,
  AiChatChunk,
  AiProviderConfig,
  ChatSession,
  ChatSessionMessage
} from './types'

declare module '*.png' {
  const src: string
  export default src
}

declare global {
  interface Window {
    electronAPI: {
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      notifyRendererReady: () => void
      getBlocks: () => Promise<BlockInfo[]>
      queryStats: (params: QueryParams) => Promise<BlockDailyStats[]>
      syncData: () => Promise<void>
      checkMarketOpen: () => Promise<boolean>
      getAppDirs: () => Promise<{ label: string; path: string }[]>
      getLatestDate: () => Promise<string>
      onSyncDone: (callback: () => void) => () => void
      updateBlockSort: (codes: string[]) => Promise<void>
      getConfig: () => Promise<AppConfig>
      saveConfig: (config: AppConfig) => Promise<void>
      isFirstRun: () => Promise<boolean>
      searchThsDirs: () => Promise<ThsUserDirEntry[]>
      resolveThsDir: (dir: string) => Promise<{ type: 'userDir' | 'installRoot' | 'unknown'; path?: string; dirs?: ThsUserDirEntry[] }>
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
      // AI 对话分析
      aiChat: (request: AiChatRequest) => Promise<{ requestId: string }>
      aiCancel: (requestId: string) => void
      onAiChatStarted: (callback: (requestId: string) => void) => () => void
      onAiChatChunk: (callback: (data: { requestId: string; chunk: AiChatChunk }) => void) => () => void
      aiListProviders: () => Promise<{ providers: AiProviderConfig[]; activeId: string | null }>
      aiSaveProviders: (data: { providers: AiProviderConfig[]; activeId: string | null }) => Promise<{ providers: AiProviderConfig[]; activeId: string | null }>
      aiTestProvider: (provider: AiProviderConfig) => Promise<{ ok: boolean; message: string }>
      aiFetchModels: (provider: AiProviderConfig) => Promise<string[]>
      // AI 对话历史
      aiListSessions: (blockCode: string) => Promise<ChatSession[]>
      aiGetSession: (sessionId: string) => Promise<ChatSessionMessage[]>
      aiSaveSession: (data: { session: ChatSession; messages: ChatSessionMessage[] }) => Promise<void>
      aiDeleteSession: (sessionId: string) => Promise<void>
    }
  }
}
