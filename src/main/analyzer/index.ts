import { BlockDailyStats } from '../../renderer/src/types'

/** 板块分析结果 */
export interface AnalysisResult {
  blockCode: string
  blockName: string
  stats: BlockDailyStats
}

/** 分析计算各板块统计数据 */
export function analyzeBlocks(
  blockStocks: Record<string, string[]>,
  blockNames: Record<string, string>,
  quotes: Record<string, { price: number; changePercent: number; amount: number; turnoverRate: number }>,
  date: string
): AnalysisResult[] {
  const results: AnalysisResult[] = []

  for (const [blockCode, stockCodes] of Object.entries(blockStocks)) {
    const blockName = blockNames[blockCode]
    const validStocks = stockCodes.filter(code => quotes[code])
    const count = validStocks.length

    if (count === 0) continue

    let totalChange = 0
    let totalPrice = 0
    let totalAmount = 0
    let totalTurnover = 0

    for (const code of validStocks) {
      const q = quotes[code]
      totalChange += q.changePercent
      totalPrice += q.price
      totalAmount += q.amount
      totalTurnover += q.turnoverRate
    }

    results.push({
      blockCode,
      blockName,
      stats: {
        blockCode,
        blockName,
        date,
        stockCount: count,
        avgChangePercent: round(totalChange / count, 2),
        avgPrice: round(totalPrice / count, 2),
        avgAmount: round(totalAmount / count, 2),
        totalAmount: round(totalAmount, 2),
        avgTurnoverRate: round(totalTurnover / count, 2)
      }
    })
  }

  return results
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}
