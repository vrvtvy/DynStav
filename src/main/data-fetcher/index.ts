/** 腾讯行情接口 - 实时行情获取 */
import { net } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import log from 'electron-log/main'
import { getDataPath } from '../paths'

/** A股股票实时行情 */
interface StockQuote {
  code: string
  /** 当前价格 */
  price: number
  /** 涨跌幅 % */
  changePercent: number
  /** 成交额 */
  amount: number
  /** 换手率 % */
  turnoverRate: number
}

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
}

const CACHE_FILE = 'quotes-cache.json'

function getCachePath(): string {
  return getDataPath(CACHE_FILE)
}

function saveCache(quotes: StockQuote[]): void {
  try {
    writeFileSync(getCachePath(), JSON.stringify(quotes), 'utf-8')
    log.info(`[DataFetcher] 行情缓存已保存，${quotes.length} 只`)
  } catch (e) {
    log.warn('[DataFetcher] 行情缓存保存失败:', e)
  }
}

function loadCache(): StockQuote[] {
  try {
    const raw = readFileSync(getCachePath(), 'utf-8')
    const data = JSON.parse(raw) as StockQuote[]
    if (Array.isArray(data) && data.length > 0) {
      log.info(`[DataFetcher] 读取行情缓存，${data.length} 只`)
      return data
    }
  } catch {
    // 缓存不存在或损坏，忽略
  }
  return []
}

/**
 * 批量获取A股实时行情
 * 腾讯行情接口：http://qt.gtimg.cn/q=sh600519,sz000001,...
 * 支持一次查询多只股票，用逗号分隔
 *
 * 腾讯字段说明（~分隔，0-indexed）：
 *   [2]=代码, [3]=最新价, [32]=涨跌幅%, [37]=成交额(万元), [38]=换手率%
 *
 * 当 API 请求全部失败时（如 IP 被封），自动回退到本地缓存数据。
 */
export async function fetchStockQuotes(codes: string[]): Promise<StockQuote[]> {
  log.info(`[DataFetcher] 开始获取行情，共 ${codes.length} 只股票`)
  const results: StockQuote[] = []
  const batchSize = 300
  let consecutiveFailures = 0

  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize)
    const batchResult = await fetchBatch(batch)

    if (batchResult.length === 0) {
      consecutiveFailures++
      // 首批即失败或连续 2 批失败，说明接口不可用，停止请求
      if (consecutiveFailures >= 2 || (i === 0 && batchResult.length === 0)) {
        log.warn('[DataFetcher] 接口请求持续失败，停止剩余批次请求')
        break
      }
    } else {
      consecutiveFailures = 0
    }

    results.push(...batchResult)
    log.info(`[DataFetcher] 批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(codes.length / batchSize)}，${batch.length} 只`)

    if (i + batchSize < codes.length) {
      await delay(500)
    }
  }

  // API 全部失败时回退到本地缓存
  if (results.length === 0) {
    log.warn('[DataFetcher] API 未获取到任何数据，尝试使用本地缓存')
    const cached = loadCache()
    if (cached.length > 0) {
      log.info(`[DataFetcher] 使用缓存数据，${cached.length} 只股票`)
      return cached
    }
    log.error('[DataFetcher] 无可用缓存，返回空数据')
    return []
  }

  // 成功获取到数据，更新缓存
  saveCache(results)
  log.info(`[DataFetcher] 全部获取完成，共 ${results.length} 只股票`)
  return results
}

async function fetchBatch(codes: string[]): Promise<StockQuote[]> {
  // 腾讯接口：上海前缀 sh，深圳前缀 sz，北交所前缀 bj
  const symbols = codes.map(code => {
    let prefix: string
    if (code.startsWith('6')) prefix = 'sh'
    else if (code.startsWith('9')) prefix = 'bj'
    else prefix = 'sz'
    return prefix + code
  }).join(',')

  const url = `http://qt.gtimg.cn/q=${symbols}`

  try {
    const response = await net.fetch(url, { headers: FETCH_HEADERS })
    const text = await response.text()

    const results: StockQuote[] = []
    const lines = text.split('\n')

    for (const line of lines) {
      // 每行格式: v_sh600519="field0~field1~...";
      const quoteStart = line.indexOf('"')
      if (quoteStart === -1) continue
      const quoteEnd = line.indexOf('"', quoteStart + 1)
      if (quoteEnd === -1) continue

      const content = line.substring(quoteStart + 1, quoteEnd)
      if (!content) continue

      const fields = content.split('~')
      // [2]=代码, [3]=最新价, [32]=涨跌幅%, [37]=成交额(万元), [38]=换手率%
      const code = fields[2]
      if (!code) continue

      results.push({
        code,
        price: parseFloat(fields[3]) || 0,
        changePercent: parseFloat(fields[32]) || 0,
        amount: (parseFloat(fields[37]) || 0) / 10000, // 万元 → 亿元
        turnoverRate: parseFloat(fields[38]) || 0
      })
    }

    log.info(`[DataFetcher] 批次获取 ${results.length} 只股票成功`)
    return results
  } catch (error) {
    log.error(`[DataFetcher] 获取股票数据失败:`, error)
    return []
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
