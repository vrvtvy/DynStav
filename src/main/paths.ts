import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

/** 配置目录 %USERPROFILE%\.dynstav */
export function getConfigDir(): string {
  return join(app.getPath('home'), '.dynstav')
}

/** 数据目录 %LOCALAPPDATA%\DynStav */
export function getAppDataDir(): string {
  const localAppData = process.env.LOCALAPPDATA || join(app.getPath('home'), 'AppData', 'Local')
  return join(localAppData, 'DynStav')
}

/** 获取数据目录下的文件路径（自动创建目录） */
export function getDataPath(...segments: string[]): string {
  const dir = getAppDataDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, ...segments)
}

/** 获取配置目录下的文件路径（自动创建目录） */
export function getConfigPath(...segments: string[]): string {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, ...segments)
}
