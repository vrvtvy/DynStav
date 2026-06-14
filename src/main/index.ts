import { app, BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpcHandlers, syncAllData } from './ipc'
import { initDatabase } from './db'
import { loadConfig, saveConfig } from './config'
import { getAppDataDir } from './paths'

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

function createWelcomeWindow(theme?: string): void {
  const bgColor = theme === 'light' ? '#ffffff' : '#1e1e1e'
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: Math.round(sw * 0.7),
    height: Math.round(sh * 0.7),
    minWidth: 600,
    minHeight: 440,
    show: true,
    backgroundColor: bgColor,
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

  log.initialize()
  log.transports.console.level = 'debug'
  log.transports.console.format = '[{level}] {h}:{i}:{s}.{ms} > {text}'
  log.transports.file.resolvePathFn = () => join(getAppDataDir(), 'logs', 'main.log')
  Object.assign(console, log.functions)

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
  const config = loadConfig()
  createWelcomeWindow(config.theme)

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
