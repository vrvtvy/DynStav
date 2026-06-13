import { app, BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpcHandlers, syncAllData } from './ipc'
import { initDatabase } from './db'
import { loadConfig, saveConfig } from './config'

const _log = console.log
const _error = console.error
const _warn = console.warn
console.log = (...args: any[]) => { try { _log.apply(console, args) } catch {} }
console.error = (...args: any[]) => { try { _error.apply(console, args) } catch {} }
console.warn = (...args: any[]) => { try { _warn.apply(console, args) } catch {} }

let mainWindow: BrowserWindow | null = null
let boundsTimer: NodeJS.Timeout | null = null

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

function createWelcomeWindow(): void {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.round(sw * 0.7),
    height: Math.round(sh * 0.7),
    minWidth: 600,
    minHeight: 440,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
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

  registerIpcHandlers()
  ipcMain.handle('get-window-maximized', () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    return win?.isMaximized() ?? false
  })
  createWelcomeWindow()

  const config = loadConfig()
  console.log('[App] 配置加载完成, theme:', config.theme, 'thsUserDir:', config.thsUserDir)

  // 恢复上次窗口状态
  if (config.maximized && mainWindow) {
    const restore = config.windowBounds || getDefaultRestoreBounds()
    mainWindow.setBounds(restore)
    mainWindow.maximize()
  } else if (config.windowBounds && mainWindow) {
    mainWindow.setBounds(config.windowBounds)
  }

  // 配置完整: 自动同步数据
  if (config.stockblockIniPath) {
    try {
      await syncAllData(config.stockblockIniPath)
    } catch {
      console.error('启动时数据同步失败，可稍后手动同步')
    }
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
