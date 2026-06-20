import { contextBridge, ipcRenderer } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  IPC_CHANNELS,
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
} from '../renderer/src/types'

// 读取配置中的主题与 setup 状态，写入 localStorage 供 index.html 的 <head>
// 内联脚本（主题）和 App.tsx（setup 状态）同步读取。
// preload 执行时 document.documentElement 为 null（<html> 尚未解析），
// 无法直接设 DOM，故经 localStorage 传递；<head> 内联脚本在 <html> 解析后、
// 合成器画布渲染前同步设 color-scheme/data-theme，消灭 FOUC。
// setup 状态让 App 第一帧就渲染 Layout（而非 null），所有区域一帧内同时出现，
// 避免"逐个冒出"的色块观感。
const cfgPath = join(homedir(), '.dynstav', 'config.json')
try {
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
    localStorage.setItem('appTheme', cfg.theme === 'light' ? 'light' : 'dark')
    localStorage.setItem('appSetupComplete', cfg.thsUserDir ? '1' : '0')
    if (cfg.fontSize) localStorage.setItem('appFontSize', cfg.fontSize)
    if (cfg.rightPanelWidth !== undefined) localStorage.setItem('rightPanelWidth', String(cfg.rightPanelWidth))
  }
} catch { }

const electronAPI = {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  notifyRendererReady: () => ipcRenderer.send('renderer-ready'),

  getBlocks: (): Promise<BlockInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BLOCKS),

  queryStats: (params: QueryParams): Promise<BlockDailyStats[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.QUERY_STATS, params),

  syncData: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_DATA),

  checkMarketOpen: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.CHECK_MARKET_OPEN),

  getAppDirs: (): Promise<{ label: string; path: string }[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_APP_DIRS),

  getLatestDate: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_LATEST_DATE),

  onSyncDone: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.SYNC_DONE, callback)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_DONE, callback)
  },

  listBackups: (): Promise<{ name: string; path: string }[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_BACKUPS),

  restoreBackup: (path: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.RESTORE_BACKUP, path),

  triggerBackup: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_BACKUP),

  onBackupRestored: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.BACKUP_RESTORED, callback)
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.BACKUP_RESTORED)
  },

  updateBlockSort: (codes: string[]): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_BLOCK_SORT, codes),

  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG),

  saveConfig: (config: AppConfig): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_CONFIG, config),

  isFirstRun: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.IS_FIRST_RUN),

  searchThsDirs: (): Promise<ThsUserDirEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_THS_DIRS),

  resolveThsDir: (dir: string): Promise<{ type: 'userDir' | 'installRoot' | 'unknown'; path?: string; dirs?: ThsUserDirEntry[] }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RESOLVE_THS_DIR, dir),

  setThsUserDir: (userDir: string): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_THS_USER_DIR, userDir),

  completeSetup: (data: { theme: string; thsUserDir: string }): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMPLETE_SETUP, data),

  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('open-folder-dialog'),

  getWindowMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('get-window-maximized'),

  onMaximizeChanged: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('maximize-changed', (_event, maximized) => callback(maximized))
    return () => ipcRenderer.removeAllListeners('maximize-changed')
  },

  onConfigLoaded: (callback: (theme: string) => void) => {
    ipcRenderer.on('config-loaded', (_event, theme) => callback(theme))
    return () => ipcRenderer.removeAllListeners('config-loaded')
  },

  // ─── AI 对话分析 ───
  aiChat: (request: AiChatRequest): Promise<{ requestId: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, request),

  aiCancel: (requestId: string): void => {
    ipcRenderer.send(IPC_CHANNELS.AI_CANCEL, requestId)
  },

  onAiChatStarted: (callback: (requestId: string) => void) => {
    const handler = (_event: unknown, requestId: string) => callback(requestId)
    ipcRenderer.on(IPC_CHANNELS.AI_CHAT_STARTED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CHAT_STARTED, handler as any)
  },

  onAiChatChunk: (callback: (data: { requestId: string; chunk: AiChatChunk }) => void) => {
    const handler = (_event: unknown, data: { requestId: string; chunk: AiChatChunk }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.AI_CHAT_CHUNK, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_CHAT_CHUNK, handler as any)
  },

  aiListProviders: (): Promise<{ providers: AiProviderConfig[]; activeId: string | null }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_PROVIDERS),

  aiSaveProviders: (data: { providers: AiProviderConfig[]; activeId: string | null }): Promise<{ providers: AiProviderConfig[]; activeId: string | null }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE_PROVIDERS, data),

  aiTestProvider: (provider: AiProviderConfig): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_PROVIDER, provider),

  aiFetchModels: (provider: AiProviderConfig): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_FETCH_MODELS, provider),

  // ─── AI 对话历史 ───
  aiListSessions: (blockCode: string): Promise<ChatSession[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_SESSIONS, blockCode),

  aiGetSession: (sessionId: string): Promise<ChatSessionMessage[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GET_SESSION, sessionId),

  aiSaveSession: (data: { session: ChatSession; messages: ChatSessionMessage[] }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE_SESSION, data),

  aiDeleteSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_DELETE_SESSION, sessionId)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
