import { readFileSync, existsSync } from 'fs'
import iconv from 'iconv-lite'
import { ParsedConfig, BlockNameMap, BlockStockMap } from './types'

/**
 * 解析同花顺配置文件
 * @param sourceIniPath 源文件路径（来自用户配置的同花顺目录）
 */
export function parseConfig(sourceIniPath: string): ParsedConfig {
  console.log('[ConfigParser] 开始解析同花顺配置文件')

  if (!existsSync(sourceIniPath)) {
    console.error('[ConfigParser] 配置文件不存在:', sourceIniPath)
    return { blockNames: {}, blockStocks: {}, allAStockCodes: [] }
  }

  const raw = readFileSync(sourceIniPath)
  const content = iconv.decode(raw, 'gb18030')
  const lines = content.split(/\r?\n/)

  const blockNames: BlockNameMap = {}
  const blockStocks: BlockStockMap = {}
  const allStockSet = new Set<string>()

  let currentSection = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

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
        if (blockNames[key]) {
          const stocks = parseStockCodes(value)
          const codes = extractStockCodes(stocks)
          blockStocks[key] = codes
          codes.forEach(s => allStockSet.add(s))
        }
      }
    }
  }

  console.log(`[ConfigParser] 解析完成: ${Object.keys(blockNames).length} 个板块, ${allStockSet.size} 只股票`)
  return {
    blockNames,
    blockStocks,
    allAStockCodes: Array.from(allStockSet)
  }
}

function parseStockCodes(value: string): string[] {
  return value.split(',').filter(s => s.includes(':')).map(s => s.trim())
}

/** 从 "市场:代码" 格式中剥离市场前缀，保留纯股票代码。
 *  不做市场过滤，与同花顺动态板块完全一致（含沪深北交所等全部股票）。 */
function extractStockCodes(stocks: string[]): string[] {
  return stocks.map(s => {
    const colonIdx = s.indexOf(':')
    return s.slice(colonIdx + 1)
  })
}
