import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import iconv from 'iconv-lite'
import { ParsedConfig, BlockNameMap, BlockStockMap } from './types'

/** 同花顺配置文件路径 */
const CONFIG_PATH = 'D:\\software\\同花顺软件\\同花顺\\同花顺\\mx_140877294\\stockblock.ini'

/** 工作目录下的配置文件副本路径 */
const LOCAL_CONFIG_PATH = join(__dirname, '../../../data/stockblock.ini')

/** 仅保留A股代码的前缀列表 */
const A_STOCK_PREFIXES = ['17:', '33:']

/** 解析配置文件 */
export function parseConfig(): ParsedConfig {
  // 确保 data 目录存在
  mkdirSync(dirname(LOCAL_CONFIG_PATH), { recursive: true })

  // 若本地没有副本则复制一份
  if (!existsSync(LOCAL_CONFIG_PATH)) {
    copyFileSync(CONFIG_PATH, LOCAL_CONFIG_PATH)
  }

  const raw = readFileSync(LOCAL_CONFIG_PATH)
  const content = iconv.decode(raw, 'gb18030')
  const lines = content.split(/\r?\n/)

  const blockNames: BlockNameMap = {}
  const blockStocks: BlockStockMap = {}
  const allStockSet = new Set<string>()

  let currentSection = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // 识别区块
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1)
      continue
    }

    if (currentSection === 'BLOCK_NAME_MAP_TABLE') {
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim()
        const value = line.slice(eqIdx + 1).trim()
        blockNames[key] = value
      }
    }

    if (currentSection === 'BLOCK_STOCK_CONTEXT') {
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim()
        const value = line.slice(eqIdx + 1).trim()
        // 只解析在 BLOCK_NAME_MAP_TABLE 中定义的板块
        if (blockNames[key]) {
          const stocks = parseStockCodes(value)
          const aStocks = filterAStocks(stocks)
          blockStocks[key] = aStocks
          aStocks.forEach(s => allStockSet.add(s))
        }
      }
    }
  }

  return {
    blockNames,
    blockStocks,
    allAStockCodes: Array.from(allStockSet)
  }
}

/** 解析股票代码列表 */
function parseStockCodes(value: string): string[] {
  return value.split(',').filter(s => s.includes(':')).map(s => s.trim())
}

/** 过滤出A股股票代码，去掉前缀只保留纯代码 */
function filterAStocks(stocks: string[]): string[] {
  return stocks
    .filter(s => A_STOCK_PREFIXES.some(p => s.startsWith(p)))
    .map(s => {
      const colonIdx = s.indexOf(':')
      return s.slice(colonIdx + 1)
    })
}
