import { contextBridge, ipcRenderer } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { IPC_CHANNELS, BlockInfo, BlockDailyStats, QueryParams, AppConfig, ThsUserDirEntry } from '../renderer/src/types'

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
  }
} catch {}

const electronAPI = {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  getBlocks: (): Promise<BlockInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BLOCKS),

  queryStats: (params: QueryParams): Promise<BlockDailyStats[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.QUERY_STATS, params),

  syncData: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_DATA),

  getLatestDate: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_LATEST_DATE),

  onSyncDone: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.SYNC_DONE, callback)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_DONE, callback)
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
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
