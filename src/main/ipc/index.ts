import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import log from 'electron-log/main'
import { parseConfig } from '../config-parser'
import { getLastTradingDay, isMarketCurrentlyOpen } from '../trading-calendar'
import { fetchStockQuotes } from '../data-fetcher'
import { analyzeBlocks } from '../analyzer'
import { getRepository } from '../db'
import { loadConfig, saveConfig } from '../config'
import { searchThsUserDirs, resolveThsDir } from '../ths-search'
import { IPC_CHANNELS } from '../../renderer/src/types'
import { getDataPath } from '../paths'
import { hasIniChanged, archiveIni } from '../ths-config-archive'
import {
  streamChat,
  cancelChat,
  testProvider,
  loadProviders,
  saveProviders,
  genId
} from '../ai/service'

type IpcInvokeHandler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any

/**
 * 包裹 ipcMain.handle：捕获 handler 内抛出的异常，记录日志后重新抛出，
 * 保证异常被记录（不静默丢失），同时让 renderer 端能感知错误。
 * 即使 handler 本身未 try/catch，也不会导致 unhandledRejection。
 */
function safeHandle(channel: string, handler: IpcInvokeHandler): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (e) {
      log.error(`[IPC] ${channel} 处理异常:`, e)
      throw e
    }
  })
}

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
  safeHandle(IPC_CHANNELS.GET_BLOCKS, () => {
    return getRepository().getBlocks()
  })

  safeHandle(IPC_CHANNELS.QUERY_STATS, (_event, params) => {
    const startDate = params.startDate || getDefaultStartDate()
    const endDate = params.endDate || getRepository().getLatestDate() || getTodayStr()
    const blockCode = params.blockCode
    log.debug('QUERY_STATS → queryStats params:', { startDate, endDate, blockCode })
    return getRepository().queryStats({ startDate, endDate, blockCode })
  })

  safeHandle(IPC_CHANNELS.SYNC_DATA, async () => {
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

  safeHandle(IPC_CHANNELS.CHECK_MARKET_OPEN, () => {
    return isMarketCurrentlyOpen()
  })

  safeHandle(IPC_CHANNELS.GET_APP_DIRS, () => {
    const home = app.getPath('home')
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
    return [
      { label: '配置', path: join(home, '.dynstav') },
      { label: '数据', path: join(localAppData, 'DynStav') },
      { label: '缓存', path: join(appData, 'dynstav') },
      { label: '更新', path: join(localAppData, 'dynstav-updater') },
    ]
  })

  safeHandle(IPC_CHANNELS.GET_LATEST_DATE, () => {
    return getRepository().getLatestDate()
  })

  safeHandle(IPC_CHANNELS.UPDATE_BLOCK_SORT, (_event, codes: string[]) => {
    getRepository().updateBlockSort(codes)
  })

  // 备份：列出备份文件
  safeHandle(IPC_CHANNELS.LIST_BACKUPS, () => {
    return getRepository().listBackups()
  })

  // 手动触发备份
  safeHandle(IPC_CHANNELS.TRIGGER_BACKUP, () => {
    try {
      getRepository().backup()
    } catch (e) {
      log.error('[IPC] trigger backup failed:', e)
      throw e
    }
  })

  // 恢复备份
  safeHandle(IPC_CHANNELS.RESTORE_BACKUP, (_event, backupPath: string) => {
    try {
      getRepository().restoreFrom(backupPath)
      const win = BrowserWindow.getFocusedWindow()
      win?.webContents.send(IPC_CHANNELS.BACKUP_RESTORED)
      return true
    } catch (e) {
      log.error('[IPC] restore backup failed:', e)
      throw e
    }
  })

  // 配置
  safeHandle(IPC_CHANNELS.GET_CONFIG, () => {
    return loadConfig()
  })

  safeHandle(IPC_CHANNELS.SAVE_CONFIG, (_event, config) => {
    saveConfig(config)
  })

  safeHandle(IPC_CHANNELS.IS_FIRST_RUN, () => {
    const config = loadConfig()
    return !config.thsUserDir
  })

  safeHandle(IPC_CHANNELS.SEARCH_THS_DIRS, () => {
    return searchThsUserDirs()
  })

  safeHandle(IPC_CHANNELS.RESOLVE_THS_DIR, (_event, dir: string) => {
    return resolveThsDir(dir)
  })

  safeHandle(IPC_CHANNELS.SET_THS_USER_DIR, async (_event, userDir: string) => {
    const config = loadConfig()
    const iniPath = userDir ? `${userDir}\\stockblock.ini` : null
    config.thsUserDir = userDir
    config.stockblockIniPath = iniPath
    saveConfig(config)
    return config
  })

  safeHandle(IPC_CHANNELS.COMPLETE_SETUP, async (_event, data: { theme: string; thsUserDir: string }) => {
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

    // 首次配置完成立即同步一次数据，保证进入主界面即有数据
    if (config.stockblockIniPath) {
      try {
        await syncAllData(config.stockblockIniPath, true)
      } catch (e) {
        log.error('[IPC] 首次配置后同步数据失败:', e)
      }
    }

    return config
  })

  // 浏览文件夹
  safeHandle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择同花顺安装目录或用户目录'
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // ─── AI 对话分析 ───
  // 流式聊天：在主进程内逐 chunk 经 IPC 事件回推给渲染层，
  // 渲染层不接触密钥与网络细节，符合需求 §4.3 安全要求。
  safeHandle(IPC_CHANNELS.AI_CHAT, async (event, request) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const requestId = randomUUID()

    // 立即将 requestId 推给渲染层，使其能在 chunk 到达前设置 pendingRequestId，
    // 避免 chunk 因 pendingRequestId===null 被过滤丢弃（IPC invoke 的 resolve
    // 要等 streamChat 全部完成才返回，远晚于首个 chunk）。
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.AI_CHAT_STARTED, requestId)
    }

    await streamChat(request, requestId, (chunk) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AI_CHAT_CHUNK, { requestId, chunk })
      }
    })
    return { requestId }
  })

  ipcMain.on(IPC_CHANNELS.AI_CANCEL, (_event, requestId: string) => {
    cancelChat(requestId)
  })

  safeHandle(IPC_CHANNELS.AI_LIST_PROVIDERS, () => {
    return loadProviders()
  })

  safeHandle(IPC_CHANNELS.AI_SAVE_PROVIDERS, (_event, data: { providers: any[]; activeId: string | null }) => {
    // 为无 id 的新增项补 id
    const providers = (data.providers || []).map((p) => ({ ...p, id: p.id || genId() }))
    saveProviders(providers, data.activeId ?? null)
    return loadProviders()
  })

  safeHandle(IPC_CHANNELS.AI_TEST_PROVIDER, async (_event, provider) => {
    return testProvider(provider)
  })
}

export async function syncAllData(iniPath?: string, force = false): Promise<void> {
  console.log('[IPC] 开始同步数据')

  // 无源 ini 路径时无法做变更检测与归档，直接返回
  if (!iniPath || !existsSync(iniPath)) {
    console.warn('[IPC] 未提供 stockblock.ini 路径，跳过同步')
    return
  }

  const tradeDate = await getLastTradingDay()

  // MD5 变更检测：源 ini 相对当日归档是否变化。
  // force=true（用户手动同步）时跳过检测强制重算。
  const changed = force || hasIniChanged(iniPath, tradeDate)
  if (!changed) {
    console.log(`[IPC] stockblock.ini 未变化，跳过同步 (交易日: ${tradeDate})`)
    // ini 未变但板块元数据（名称/排序）可能因其它原因变化，仍刷新一次
    const config = parseConfig(iniPath)
    const metaBlocks = Object.entries(config.blockNames).map(([code, name]) => ({ code, name }))
    getRepository().saveBlockMeta(metaBlocks)
    return
  }

  console.log(`[IPC] stockblock.ini 已变化，重新同步 (交易日: ${tradeDate})`)

  // 先归档原始 ini（覆盖当日归档，仅保留最新一份），再解析最新内容
  archiveIni(iniPath, tradeDate)
  const config = parseConfig(iniPath)

  const metaBlocks = Object.entries(config.blockNames).map(([code, name]) => ({ code, name }))
  getRepository().saveBlockMeta(metaBlocks)
  console.log(`[IPC] 板块元数据同步完成: ${metaBlocks.length} 个`)

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

  // 重算前清除当日旧数据，避免被删除板块的旧 stats 残留污染
  getRepository().deleteStatsByDate(tradeDate)

  const results = analyzeBlocks(config.blockStocks, config.blockNames, quoteMap, tradeDate)
  const stats = results.map(r => r.stats)
  getRepository().saveStats(stats)
  console.log(`[IPC] 数据同步完成: ${stats.length} 个板块，日期: ${tradeDate}`)
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
