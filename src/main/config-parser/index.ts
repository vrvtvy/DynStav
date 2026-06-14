import { readFileSync, existsSync } from 'fs'
import iconv from 'iconv-lite'
import { ParsedConfig, BlockNameMap, BlockStockMap } from './types'

const A_STOCK_PREFIXES = ['17:', '33:']

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
          const aStocks = filterAStocks(stocks)
          blockStocks[key] = aStocks
          aStocks.forEach(s => allStockSet.add(s))
        }
      }
    }
  }

  console.log(`[ConfigParser] 解析完成: ${Object.keys(blockNames).length} 个板块, ${allStockSet.size} 只A股`)
  return {
    blockNames,
    blockStocks,
    allAStockCodes: Array.from(allStockSet)
  }
}

function parseStockCodes(value: string): string[] {
  return value.split(',').filter(s => s.includes(':')).map(s => s.trim())
}

function filterAStocks(stocks: string[]): string[] {
  return stocks
    .filter(s => A_STOCK_PREFIXES.some(p => s.startsWith(p)))
    .map(s => {
      const colonIdx = s.indexOf(':')
      return s.slice(colonIdx + 1)
    })
}
