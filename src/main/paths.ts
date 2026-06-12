import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

/** 获取项目 data 目录的绝对路径 */
export function getDataPath(...segments: string[]): string {
  const dataDir = join(app.getAppPath(), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return join(dataDir, ...segments)
}
