import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, syncAllData } from './ipc'
import { initDatabase } from './db'

const _log = console.log
const _error = console.error
const _warn = console.warn
console.log = (...args: any[]) => { try { _log.apply(console, args) } catch {} }
console.error = (...args: any[]) => { try { _error.apply(console, args) } catch {} }
console.warn = (...args: any[]) => { try { _warn.apply(console, args) } catch {} }

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
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

  createWindow()

  try {
    await syncAllData()
    const win = BrowserWindow.getFocusedWindow()
    win?.webContents.send('sync-done')
  } catch (e: any) {
    console.error('启动时数据同步失败', e?.message ?? e)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
