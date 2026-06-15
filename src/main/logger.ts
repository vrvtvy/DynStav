import { app } from 'electron'
import { join } from 'path'
import { existsSync, promises as fs } from 'fs'
import log from 'electron-log/main'

/** 日志保留天数 */
const MAX_LOG_DAYS = 30

/** 生成当天日志文件名：dynStav-YYYY-MM-DD.log */
function getDailyLogFileName(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `dynStav-${y}-${m}-${d}.log`
}

/** 日志目录：%LOCALAPPDATA%\DynStav\logs */
function getLogDir(): string {
  const localAppData = process.env.LOCALAPPDATA || join(app.getPath('home'), 'AppData', 'Local')
  return join(localAppData, 'DynStav', 'logs')
}

/**
 * 配置 electron-log：按天分文件 + 控制台格式。
 * 关键：resolvePathFn 每条日志都会被重新调用且不缓存返回值，
 * 因此跨日时第一次写入会自动落到新文件，无需定时器。
 */
export function setupLogger(): void {
  log.transports.console.level = 'info'
  log.transports.console.format = '[{level}] {h}:{i}:{s}.{ms} > {text}'
  log.transports.file.resolvePathFn = () => join(getLogDir(), getDailyLogFileName())
}

/**
 * 注册全局异常捕获，保证程序不崩溃。
 * - uncaughtException：同步抛出但未被捕获的异常，记录后吞掉，不退出进程。
 * - unhandledRejection：未被 catch 的 Promise reject，记录后吞掉，不退出进程。
 * 注意：这两个监听器必须在模块加载时尽早注册，确保启动早期
 * (app.whenReady 之前/内部) 的异常也能被记录落盘。
 */
export function installGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err) => {
    log.error('[Global] uncaughtException:', err)
  })
  process.on('unhandledRejection', (reason) => {
    log.error('[Global] unhandledRejection:', reason)
  })
}

/**
 * 启动时异步清理超过 MAX_LOG_DAYS 天的日志文件。
 * 设计为 fire-and-forget：调用方不应 await，绝不阻塞/中断启动。
 * 匹配规则：仅处理 dynStav-YYYY-MM-DD.log，按文件名里的日期判断是否过期
 * (比 mtime 更可靠，避免复制/解压等操作改动 mtime)。
 */
export async function cleanupOldLogs(): Promise<void> {
  const dir = getLogDir()
  if (!existsSync(dir)) return

  const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch (e) {
    log.warn('[Logger] 读取日志目录失败，跳过清理:', e)
    return
  }

  await Promise.all(
    entries.map(async (name) => {
      const m = name.match(/^dynStav-(\d{4})-(\d{2})-(\d{2})\.log$/)
      if (!m) return // 非本程序日志文件，跳过（不误删 main.log 等）
      const fileDate = new Date(`${m[1]}-${m[2]}-${m[3]}`).getTime()
      if (Number.isNaN(fileDate) || fileDate >= cutoff) return
      try {
        await fs.unlink(join(dir, name))
        log.info(`[Logger] 清理过期日志: ${name}`)
      } catch (e) {
        log.warn(`[Logger] 删除日志失败 ${name}:`, e)
      }
    })
  )
}
