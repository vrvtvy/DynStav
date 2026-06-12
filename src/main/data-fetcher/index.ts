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
  const results: StockQuote[] = []
  // 东方财富接口建议每次不超过500只
  const batchSize = 300

  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize)
    const batchResult = await fetchBatch(batch)
    results.push(...batchResult)

    // 避免请求过快，延迟200ms
    if (i + batchSize < codes.length) {
      await delay(200)
    }
  }

  return results
}

async function fetchBatch(codes: string[]): Promise<StockQuote[]> {
  // 东方财富接口：上海前缀1.，深圳前缀0.
  const secids = codes.map(code => {
    // 6开头的上海，其余为深圳
    const prefix = code.startsWith('6') ? '1.' : '0.'
    return prefix + code
  }).join(',')

  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f5,f12,f14&secids=${secids}`

  try {
    const response = await fetch(url)
    const data = await response.json() as any

    if (!data?.data?.diff) return []

    return data.data.diff.map((item: any) => ({
      code: String(item.f12),
      price: item.f2 ?? 0,
      changePercent: item.f3 ?? 0,
      amount: item.f4 ?? 0,
      turnoverRate: item.f5 ?? 0
    }))
  } catch (error) {
    console.error('获取股票数据失败:', error)
    return []
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
