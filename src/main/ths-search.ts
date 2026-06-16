import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import log from 'electron-log/main'
import { ThsUserDirEntry } from '../renderer/src/types'

/** 常见同花顺安装目录候选 */
const COMMON_THS_DIRS = [
  'C:\\同花顺软件\\同花顺',
  'D:\\同花顺软件\\同花顺',
  'E:\\同花顺软件\\同花顺'
]

/** 尝试从注册表读取同花顺安装路径（通过文件关联的 open command 提取 hexin.exe 所在目录） */
function getThsPathsFromRegistry(): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  // 同花顺安装后会注册 .hxf 和 hexin 文件关联，默认值形如：
  //   C:\同花顺软件\同花顺\hexin.exe /i "%1"
  //   "C:\同花顺软件\同花顺\hexin.exe" %1
  const regKeys = [
    'HKLM:\\SOFTWARE\\Classes\\.hxf\\shell\\open\\command',
    'HKLM:\\SOFTWARE\\Classes\\hexin\\shell\\open\\command'
  ]

  for (const key of regKeys) {
    try {
      // PowerShell 显式 UTF-8 输出，避免 reg query 的 GBK 乱码导致路径不可用
      const cmd = `powershell -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8;(Get-ItemProperty -Path '${key}' -ErrorAction SilentlyContinue).'(default)'"`
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 3000 })
      let val = output.trim()
      if (!val) continue

      // 去掉可能的引号
      val = val.replace(/^"([^"]+)".*/, '$1')
      // 取第一个空格前的部分（去掉参数）
      val = val.replace(/\s.*$/, '')
      // 如果以 .exe 结尾，取所在目录
      if (val.toLowerCase().endsWith('.exe')) {
        val = val.replace(/\\[^\\]+$/, '')
      }
      const dir = val.trim()
      if (dir.length > 3 && !seen.has(dir.toLowerCase())) {
        seen.add(dir.toLowerCase())
        paths.push(dir)
      }
    } catch { }
  }

  log.info('[THS] 注册表搜索找到', paths.length, '个路径:', paths)
  return paths
}

/** 从候选目录中扫描 mx_* 用户目录 */
function scanMxUserDirs(parentDir: string): ThsUserDirEntry[] {
  const results: ThsUserDirEntry[] = []
  if (!existsSync(parentDir)) return results

  try {
    const entries = readdirSync(parentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('mx_')) {
        const iniPath = join(parentDir, entry.name, 'stockblock.ini')
        if (existsSync(iniPath)) {
          results.push({
            path: join(parentDir, entry.name),
            label: `${entry.name}（${parentDir}）`
          })
        }
      }
    }
  } catch { }

  return results
}

/** 解析用户手动选择的目录：
 *  - 如果目录下直接有 stockblock.ini → 是 mx_* 用户目录，直接返回
 *  - 如果目录下有 mx_* 子目录 → 是安装根目录，返回找到的 mx_* 列表
 */
export function resolveThsDir(selectedDir: string): { type: 'userDir' | 'installRoot' | 'unknown'; path?: string; dirs?: ThsUserDirEntry[] } {
  // 检查是否直接选到了 mx_* 用户目录（目录下有 stockblock.ini）
  if (existsSync(join(selectedDir, 'stockblock.ini'))) {
    return { type: 'userDir', path: selectedDir }
  }

  // 检查是否是安装根目录（下有 mx_* 子目录）
  const mxDirs = scanMxUserDirs(selectedDir)
  if (mxDirs.length > 0) {
    return { type: 'installRoot', dirs: mxDirs }
  }

  // 无法识别，原样返回
  return { type: 'unknown', path: selectedDir }
}

/** 搜索所有同花顺用户目录 */
export function searchThsUserDirs(): ThsUserDirEntry[] {
  const results: ThsUserDirEntry[] = []
  const seen = new Set<string>()

  // 1. 注册表路径
  const regPaths = getThsPathsFromRegistry()

  // 2. 所有候选目录
  const candidates = [...new Set([...regPaths, ...COMMON_THS_DIRS])]
  log.info('[THS] 候选目录共', candidates.length, '个')

  for (const dir of candidates) {
    const dirs = scanMxUserDirs(dir)
    for (const d of dirs) {
      if (!seen.has(d.path)) {
        seen.add(d.path)
        results.push(d)
      }
    }
  }

  log.info('[THS] 最终搜索到', results.length, '个用户目录')
  return results
}
