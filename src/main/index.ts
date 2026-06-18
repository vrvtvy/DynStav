import { app, BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpcHandlers, syncAllData } from './ipc'
import { getRepository } from './db'
import { initDatabase } from './db'
import { loadConfig, saveConfig } from './config'
import { setupLogger, installGlobalErrorHandlers, cleanupOldLogs } from './logger'

let mainWindow: BrowserWindow | null = null
let boundsTimer: NodeJS.Timeout | null = null

// 日志与全局异常捕获必须在模块加载时尽早完成，确保后续启动过程中
// (initDatabase 等) 的任何异常都能被记录且不会导致进程崩溃。
setupLogger()
log.initialize()
Object.assign(console, log.functions)
installGlobalErrorHandlers()

function saveBoundsImmediate(): void {
  if (!mainWindow || mainWindow.isMaximized()) return
  const bounds = mainWindow.getBounds()
  const config = loadConfig()
  config.windowBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  saveConfig(config)
}

function getDefaultRestoreBounds(): { x: number; y: number; width: number; height: number } {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.round(sw * 0.7)
  const h = Math.round(sh * 0.7)
  return { x: Math.round((sw - w) / 2), y: Math.round((sh - h) / 2), width: w, height: h }
}

function createWelcomeWindow(theme?: string, isSetup = true): void {
  const bgColor = theme === 'light' ? '#ffffff' : '#1e1e1e'
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.round(sw * 0.7),
    height: isSetup ? Math.round(sh * 0.9) : Math.round(sh * 0.7),
    minWidth: 600,
    minHeight: 440,
    show: true,
    backgroundColor: bgColor,
    frame: false,
    titleBarStyle: 'hidden',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 移动/缩放时保存窗口尺寸位置（非最大化状态）
  function debounceSaveBounds(): void {
    if (!mainWindow || mainWindow.isMaximized()) return
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(saveBoundsImmediate, 500)
  }
  mainWindow.on('resize', debounceSaveBounds)
  mainWindow.on('move', debounceSaveBounds)

  // 最大化/还原状态跟踪
  mainWindow.on('maximize', () => {
    const config = loadConfig()
    config.maximized = true
    saveConfig(config)
    mainWindow?.webContents.send('maximize-changed', true)
  })
  mainWindow.on('unmaximize', () => {
    const config = loadConfig()
    config.maximized = false
    const bounds = mainWindow!.getBounds()
    config.windowBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    saveConfig(config)
    mainWindow?.webContents.send('maximize-changed', false)
  })

  mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.dynstav')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await initDatabase()
  console.log('[App] 数据库初始化完成')

  // 启动时异步清理过期日志，不 await、不阻塞启动
  cleanupOldLogs().catch((e) => log.error('[Logger] 清理旧日志失败:', e))

  registerIpcHandlers()
  ipcMain.handle('get-window-maximized', () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    return win?.isMaximized() ?? false
  })
  const config = loadConfig()
  const isSetup = !config.thsUserDir
  createWelcomeWindow(config.theme, isSetup)

  console.log('[App] 配置加载完成, theme:', config.theme, 'thsUserDir:', config.thsUserDir)

  // 在应用真正退出前尝试备份当前内存数据库（同步执行）
  app.on('before-quit', () => {
    try {
      const repo = getRepository()
      if (repo && typeof repo.backup === 'function') {
        repo.backup()
        console.log('[App] 退出前已备份数据库')
      }
    } catch (e) {
      console.error('[App] backup before quit failed:', e)
    }
  })

  // 恢复上次窗口状态
  if (config.maximized && mainWindow) {
    const restore = config.windowBounds || getDefaultRestoreBounds()
    mainWindow.setBounds(restore)
    mainWindow.maximize()
  } else if (config.windowBounds && mainWindow) {
    mainWindow.setBounds(config.windowBounds)
  }

  // 配置完整: 等待渲染器就绪后再同步数据。
  // 直接 await syncAllData + send('sync-done') 存在竞态：
  // 同步可能（尤其 ini 未变化时）在渲染器注册 onSyncDone 监听器之前就完成，
  // 导致 fire-and-forget 的 sync-done 事件被丢弃，页面数据不刷新。
  // 改为监听 renderer-ready 信号，确保渲染器 React 已挂载并注册了监听器后再同步。
  if (config.stockblockIniPath) {
    ipcMain.once('renderer-ready', async () => {
      try {
        await syncAllData(config.stockblockIniPath)
      } catch (e) {
        log.error('启动时数据同步失败，可稍后手动同步:', e)
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-done')
      }
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWelcomeWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
