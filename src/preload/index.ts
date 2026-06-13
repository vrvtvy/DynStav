import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, BlockInfo, BlockDailyStats, QueryParams, AppConfig, ThsUserDirEntry } from '../renderer/src/types'

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

  onConfigLoaded: (callback: (theme: string) => void) => {
    ipcRenderer.on('config-loaded', (_event, theme) => callback(theme))
    return () => ipcRenderer.removeAllListeners('config-loaded')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
