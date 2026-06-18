import { BlockContext, BlockDailyStats } from '../../types'

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

/**
 * 极简 Markdown 渲染。只支持渲染：代码块、行内代码、
 * **粗体**、列表（- / *）、标题（#）与换行。
 * 采用白名单转义避免 XSS；足够覆盖模型结构化回答。
 */
export function renderMarkdown(md: string): string {
  if (!md) return ''
  // 先转义 HTML 实体
  let s = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const blocks: string[] = []
  const segments = s.split(/(```[\s\S]*?```)/)
  for (const seg of segments) {
    if (seg.startsWith('```')) {
      const inner = seg.replace(/^```\w*\n?/, '').replace(/```$/, '')
      blocks.push(`<pre class="md-pre"><code>${inner}</code></pre>`)
    } else {
      // 行处理：列表、标题、粗体、行内代码、换行
      const lines = seg.split('\n')
      let html = ''
      let inList = false
      for (const line of lines) {
        const trimmed = line.trimEnd()
        if (/^#{1,6}\s/.test(trimmed)) {
          if (inList) { html += '</ul>'; inList = false }
          const level = trimmed.match(/^#+/)![0].length
          const text = inline(trimmed.replace(/^#+\s/, ''))
          html += `<h${level} class="md-h md-h${level}">${text}</h${level}>`
        } else if (/^\s*[-*]\s+/.test(trimmed)) {
          if (!inList) { html += '<ul class="md-ul">'; inList = true }
          html += `<li>${inline(trimmed.replace(/^\s*[-*]\s+/, ''))}</li>`
        } else if (/^\s*\d+\.\s+/.test(trimmed)) {
          if (!inList) { html += '<ul class="md-ul">'; inList = true }
          html += `<li>${inline(trimmed.replace(/^\s*\d+\.\s+/, ''))}</li>`
        } else if (trimmed === '') {
          if (inList) { html += '</ul>'; inList = false }
        } else {
          if (inList) { html += '</ul>'; inList = false }
          html += `<p class="md-p">${inline(trimmed)}</p>`
        }
      }
      if (inList) html += '</ul>'
      blocks.push(html)
    }
  }
  return blocks.join('')
}

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

function formatPct(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}
