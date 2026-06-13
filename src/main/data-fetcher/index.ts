/** 东方财富HTTP接口 - 实时行情获取 */

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

/**
 * 批量获取A股实时行情
 * 东方财富接口：https://push2.eastmoney.com/api/qt/ulist.np/get
 * 支持一次查询多只股票，用逗号分隔
 */
export async function fetchStockQuotes(codes: string[]): Promise<StockQuote[]> {
  console.log(`[DataFetcher] 开始获取行情，共 ${codes.length} 只股票`)
  const results: StockQuote[] = []
  const batchSize = 300

  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize)
    const batchResult = await fetchBatch(batch)
    results.push(...batchResult)

      console.log(`[DataFetcher] 批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(codes.length / batchSize)}，${batch.length} 只`)
    if (i + batchSize < codes.length) {
      await delay(200)
    }
  }

  console.log(`[DataFetcher] 全部获取完成，共 ${results.length} 只股票`)
  return results
}

async function fetchBatch(codes: string[]): Promise<StockQuote[]> {
  // 东方财富接口：上海前缀1.，深圳前缀0.
  const secids = codes.map(code => {
    // 6开头的上海，其余为深圳
    const prefix = code.startsWith('6') ? '1.' : '0.'
    return prefix + code
  }).join(',')

  // 东方财富字段说明：f2=最新价, f3=涨跌幅%, f6=成交额(元), f8=换手率%, f12=代码, f14=名称
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f6,f8,f12,f14&secids=${secids}`

  try {
    const response = await fetch(url)
    const data = await response.json() as any

    if (!data?.data?.diff) return []

    const batchResult = data.data.diff.map((item: any) => ({
      code: String(item.f12),
      price: item.f2 ?? 0,
      changePercent: item.f3 ?? 0,
      amount: (item.f6 ?? 0) / 100000000,
      turnoverRate: item.f8 ?? 0
    }))
    console.log(`[DataFetcher] 批次获取 ${batchResult.length} 只股票成功`)
    return batchResult
  } catch (error) {
    console.error(`[DataFetcher] 获取股票数据失败:`, error)
    return []
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
