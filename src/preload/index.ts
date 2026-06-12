import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, BlockInfo, BlockDailyStats, QueryParams } from '../renderer/src/types'

const electronAPI = {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // 数据
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
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
