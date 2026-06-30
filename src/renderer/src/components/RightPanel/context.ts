import { BlockContext, BlockDailyStats } from '../../types'
import { marked } from 'marked'

// 配置 marked
marked.setOptions({
  breaks: true,   // 单个换行转 <br>
  gfm: true,      // GitHub Flavored Markdown（表格、任务列表等）
})

/**
 * 由当前板块的统计数据构建上下文摘要，注入 AI 请求。
 * 取首末两日做趋势区间，并把指标按中文标签整理为快照。
 */
export function buildBlockContext(
  blockName: string,
  blockCode: string,
  stats: BlockDailyStats[]
): BlockContext | undefined {
  if (!stats.length) return undefined
  const sorted = [...stats].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const dateRange = sorted.length > 1 ? `${first.date} ~ ${last.date}` : last.date

  const metrics = [
    { label: '统计交易日数', value: String(sorted.length) },
    {
      label: '最新平均涨跌幅',
      value: `${last.avgChangePercent.toFixed(2)}%`
    },
    {
      label: '区间股价变化',
      value: formatPct((last.avgPrice / first.avgPrice - 1) * 100)
    },
    { label: '最新平均股价', value: `${last.avgPrice.toFixed(2)} 元` },
    { label: '最新平均成交额', value: `${last.avgAmount.toFixed(2)} 亿` },
    { label: '最新总成交额', value: `${last.totalAmount.toFixed(2)} 亿` },
    { label: '最新平均换手率', value: `${last.avgTurnoverRate.toFixed(2)}%` },
    { label: '成分股数量', value: `${last.stockCount} 只` }
  ]

  const trendSeries = sorted
    .map(s => `${s.date.slice(5)}:${s.avgChangePercent.toFixed(2)}%`)
    .join(', ')

  const dailyData = sorted.map(s => ({
    date: s.date,
    stockCount: s.stockCount,
    avgChangePercent: s.avgChangePercent,
    avgPrice: s.avgPrice,
    avgAmount: s.avgAmount,
    totalAmount: s.totalAmount,
    avgTurnoverRate: s.avgTurnoverRate
  }))

  return {
    code: blockCode,
    name: blockName,
    dateRange,
    metrics,
    trendSeries,
    dailyData
  }
}

/** 使用 marked 渲染 Markdown 为 HTML。 */
export function renderMarkdown(md: string): string {
  if (!md) return ''
  return marked.parse(md, { async: false }) as string
}

function formatPct(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}
