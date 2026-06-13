import { ipcMain, BrowserWindow, dialog } from 'electron'
import { parseConfig } from '../config-parser'
import { fetchStockQuotes } from '../data-fetcher'
import { analyzeBlocks } from '../analyzer'
import { getRepository } from '../db'
import { loadConfig, saveConfig } from '../config'
import { searchThsUserDirs } from '../ths-search'
import { IPC_CHANNELS } from '../../renderer/src/types'
import { getDataPath } from '../paths'

export function registerIpcHandlers(): void {
  // 窗口控制
  ipcMain.on('window-minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  // 板块
  ipcMain.handle(IPC_CHANNELS.GET_BLOCKS, () => {
    return getRepository().getBlocks()
  })

  ipcMain.handle(IPC_CHANNELS.QUERY_STATS, (_event, params) => {
    return getRepository().queryStats({
      startDate: params.startDate || getDefaultStartDate(),
      endDate: params.endDate || getTodayStr(),
      blockCode: params.blockCode
    })
  })

  ipcMain.handle(IPC_CHANNELS.SYNC_DATA, async () => {
    const config = loadConfig()
    const iniPath = config.stockblockIniPath
    if (!iniPath) {
      console.error('[IPC] stockblock.ini 路径未配置')
      const win = BrowserWindow.getFocusedWindow()
      win?.webContents.send(IPC_CHANNELS.SYNC_DONE)
      return
    }
    await syncAllData(iniPath, true)
    const win = BrowserWindow.getFocusedWindow()
    win?.webContents.send(IPC_CHANNELS.SYNC_DONE)
  })

  ipcMain.handle(IPC_CHANNELS.GET_LATEST_DATE, () => {
    return getRepository().getLatestDate()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_BLOCK_SORT, (_event, codes: string[]) => {
    getRepository().updateBlockSort(codes)
  })

  // 配置
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => {
    return loadConfig()
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_CONFIG, (_event, config) => {
    saveConfig(config)
  })

  ipcMain.handle(IPC_CHANNELS.IS_FIRST_RUN, () => {
    const config = loadConfig()
    return !config.thsUserDir
  })

  ipcMain.handle(IPC_CHANNELS.SEARCH_THS_DIRS, () => {
    return searchThsUserDirs()
  })

  ipcMain.handle(IPC_CHANNELS.SET_THS_USER_DIR, async (_event, userDir: string) => {
    const config = loadConfig()
    const iniPath = userDir ? `${userDir}\\stockblock.ini` : null
    config.thsUserDir = userDir
    config.stockblockIniPath = iniPath
    saveConfig(config)
    return config
  })

  ipcMain.handle(IPC_CHANNELS.COMPLETE_SETUP, async (_event, data: { theme: string; thsUserDir: string }) => {
    const config = loadConfig()
    config.theme = data.theme as any
    config.thsUserDir = data.thsUserDir
    config.stockblockIniPath = data.thsUserDir ? `${data.thsUserDir}\\stockblock.ini` : null

    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      const bounds = win.getBounds()
      config.windowBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      config.maximized = true
    }

    saveConfig(config)
    win?.maximize()
    return config
  })

  // 浏览文件夹
  ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择同花顺用户目录（mx_*）'
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })
}

export async function syncAllData(iniPath?: string, force = false): Promise<void> {
  console.log('[IPC] 开始同步数据')
  const config = parseConfig(iniPath)
  const today = getTodayStr()

  const metaBlocks = Object.entries(config.blockNames).map(([code, name]) => ({ code, name }))
  getRepository().saveBlockMeta(metaBlocks)
  console.log(`[IPC] 板块元数据同步完成: ${metaBlocks.length} 个`)

  if (!force) {
    const repo = getRepository()
    const existing = repo.queryStats({ startDate: today, endDate: today, blockCode: '' })
    if (existing.length > 0) {
      console.log('[IPC] 今日数据已存在，跳过同步')
      return
    }
  }

  if (config.allAStockCodes.length === 0) {
    console.warn('[IPC] 无A股数据，跳过同步')
    return
  }

  const quotes = await fetchStockQuotes(config.allAStockCodes)

  const quoteMap: Record<string, { price: number; changePercent: number; amount: number; turnoverRate: number }> = {}
  for (const q of quotes) {
    quoteMap[q.code] = {
      price: q.price,
      changePercent: q.changePercent,
      amount: q.amount,
      turnoverRate: q.turnoverRate
    }
  }

  const results = analyzeBlocks(config.blockStocks, config.blockNames, quoteMap, today)
  const stats = results.map(r => r.stats)
  getRepository().saveStats(stats)
  console.log(`[IPC] 数据同步完成: ${stats.length} 个板块`)
}

export function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDefaultStartDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
