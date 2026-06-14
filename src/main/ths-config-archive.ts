import { createHash } from 'crypto'
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { getDataPath } from './paths'

/** 计算文件 MD5（hex）。文件不存在返回 null。 */
export function getFileMd5(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  const buf = readFileSync(filePath)
  return createHash('md5').update(buf).digest('hex')
}

/**
 * 当日归档路径：%LOCALAPPDATA%\DynStav\ThsConfigs\stockblock-<tradeDate>.ini
 * getDataPath 会自动 mkdir -p，目录随首次归档创建。
 */
export function getArchivePath(tradeDate: string): string {
  return getDataPath('ThsConfigs', `stockblock-${tradeDate}.ini`)
}

/**
 * 判断源 ini 是否相对于当日归档有变化。
 * 返回 true 表示需要重新归档 + 重算；false 表示无变化可跳过。
 * 以归档文件本身作为 MD5 基准：归档既是恢复源也是去重依据。
 */
export function hasIniChanged(sourceIniPath: string, tradeDate: string): boolean {
  const archivePath = getArchivePath(tradeDate)
  if (!existsSync(archivePath)) return true // 当日尚未归档 → 视为变化
  return getFileMd5(sourceIniPath) !== getFileMd5(archivePath)
}

/**
 * 用源 ini 覆盖当日归档（同日多次变化只保留最新一份）。
 * 写入前确保归档目录存在（新装机器上 ThsConfigs 目录尚未创建）。
 */
export function archiveIni(sourceIniPath: string, tradeDate: string): void {
  const archivePath = getArchivePath(tradeDate)
  mkdirSync(dirname(archivePath), { recursive: true })
  copyFileSync(sourceIniPath, archivePath)
}
