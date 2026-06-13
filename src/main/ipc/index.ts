import { ipcMain, BrowserWindow } from 'electron'
import { parseConfig } from '../config-parser'
import { fetchStockQuotes } from '../data-fetcher'
import { analyzeBlocks } from '../analyzer'
import { getRepository } from '../db'
import { IPC_CHANNELS } from '../../renderer/src/types'

export function registerIpcHandlers(): void {
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
    await syncAllData(true)
    const win = BrowserWindow.getFocusedWindow()
    win?.webContents.send(IPC_CHANNELS.SYNC_DONE)
  })

  ipcMain.handle(IPC_CHANNELS.GET_LATEST_DATE, () => {
    return getRepository().getLatestDate()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_BLOCK_SORT, (_event, codes: string[]) => {
    getRepository().updateBlockSort(codes)
  })
}

export async function syncAllData(force = false): Promise<void> {
  console.log('[IPC] 开始同步数据')
  const config = parseConfig()
  const today = getTodayStr()

  getRepository().saveBlockMeta(
    Object.entries(config.blockNames).map(([code, name]) => ({ code, name }))
  )
  console.log(`[IPC] 板块元数据同步完成: ${Object.keys(config.blockNames).length} 个`)

  if (!force) {
    const repo = getRepository()
    const existing = repo.queryStats({ startDate: today, endDate: today, blockCode: '' })
    if (existing.length > 0) {
      console.log('[IPC] 今日数据已存在，跳过同步')
      return
    }
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

function getTodayStr(): string {
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
