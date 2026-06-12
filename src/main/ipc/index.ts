import { ipcMain, BrowserWindow } from 'electron'
import { parseConfig } from '../config-parser'
import { fetchStockQuotes } from '../data-fetcher'
import { analyzeBlocks } from '../analyzer'
import { getRepository } from '../db'
import { IPC_CHANNELS } from '../../renderer/src/types'

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

  // 获取板块列表
  ipcMain.handle(IPC_CHANNELS.GET_BLOCKS, () => {
    return getRepository().getBlocks()
  })

  // 条件查询
  ipcMain.handle(IPC_CHANNELS.QUERY_STATS, (_event, params) => {
    const { startDate, endDate, blockCode } = params
    return getRepository().queryStats({
      startDate: startDate || getDefaultStartDate(),
      endDate: endDate || getTodayStr(),
      blockCode
    })
  })

  // 同步数据
  ipcMain.handle(IPC_CHANNELS.SYNC_DATA, async () => {
    await syncAllData(true)
    const win = BrowserWindow.getFocusedWindow()
    win?.webContents.send(IPC_CHANNELS.SYNC_DONE)
  })

  // 获取最新数据日期
  ipcMain.handle(IPC_CHANNELS.GET_LATEST_DATE, () => {
    return getRepository().getLatestDate()
  })
}

/** 同步所有数据
 *  @param force - 强制同步（忽略今日是否已有数据）
 */
export async function syncAllData(force = false): Promise<void> {
  const config = parseConfig()
  const today = getTodayStr()

  if (!force) {
    const repo = getRepository()
    const existing = repo.queryStats({ startDate: today, endDate: today, blockCode: '' })
    if (existing.length > 0) return
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
  repo.saveStats(results.map(r => r.stats))
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultStartDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}
