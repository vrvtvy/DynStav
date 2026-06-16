import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { ThsUserDirEntry } from '../renderer/src/types'

/** 常见同花顺安装目录候选 */
const COMMON_THS_DIRS = [
  'C:\\同花顺软件\\同花顺',
  'D:\\同花顺软件\\同花顺',
  'D:\\software\\同花顺软件\\同花顺',
  'E:\\同花顺软件\\同花顺',
  'E:\\software\\同花顺软件\\同花顺',
  'F:\\同花顺软件\\同花顺',
  'F:\\software\\同花顺软件\\同花顺',
  join(process.env.USERPROFILE || '', 'AppData\\Local\\同花顺'),
  join(process.env.USERPROFILE || '', 'Documents\\同花顺')
]

/** 尝试从注册表读取同花顺安装路径 */
function getThsPathsFromRegistry(): string[] {
  const paths: string[] = []
  const regPaths = [
    'HKCU\\Software\\hexin',
    'HKLM\\SOFTWARE\\hexin',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\同花顺',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\同花顺'
  ]
  for (const regPath of regPaths) {
    try {
      const output = execSync(`reg query "${regPath}" /v "InstallPath" 2>nul`, {
        encoding: 'utf-8',
        timeout: 3000
      })
      const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/)
      if (match) {
        paths.push(match[1].trim())
      }
    } catch { }
  }
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

/** 搜索所有同花顺用户目录 */
export function searchThsUserDirs(): ThsUserDirEntry[] {
  const results: ThsUserDirEntry[] = []
  const seen = new Set<string>()

  // 1. 注册表路径
  const regPaths = getThsPathsFromRegistry()

  // 2. 所有候选目录
  const candidates = [...new Set([...regPaths, ...COMMON_THS_DIRS])]

  for (const dir of candidates) {
    const dirs = scanMxUserDirs(dir)
    for (const d of dirs) {
      if (!seen.has(d.path)) {
        seen.add(d.path)
        results.push(d)
      }
    }
  }

  return results
}
