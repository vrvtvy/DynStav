import { ChatMessage, BlockContext } from '../../renderer/src/types'

/**
 * AI 上下文构建工具。将板块数据渲染为 system 提示词。
 *
 * system 提示词拆分为"静态人设"（不变，利于 prompt cache）和"动态数据"（每次变），
 * dailyData 超过 maxDays 时只保留最近 N 天明细 + 旧数据统计摘要，降低 token 消耗。
 */

/** dailyData 明细最大保留天数（超过则旧数据用统计摘要替代） */
const DEFAULT_MAX_DAYS = 20

/**
 * 构建静态人设部分（不变，利于 provider 端 prompt cache 命中）。
 */
export function buildStaticPersona(): string {
  return [
    '你是一名专业的 A 股分析师。当前用户正关注自定义动态板块（每日根据用户自定义的选股条件选出股票，得到每日的成分股后，对成分股的行情数据进行计算分析）。请优先基于提供的真实数据进行分析。',
    '分析要求：',
    '1) 结合走势、资金（成交额/换手率）给出趋势判断；',
    '2) 指出风险点与潜在机会；',
    '3) 结论简洁，必要时给出可操作建议，并说明不确定性；',
    '4) 使用简体中文，避免编造未给出的数据。'
  ].join('\n')
}

/**
 * 构建动态数据部分（每次变化）。
 * dailyData 超过 maxDays 时，只保留最近 maxDays 天明细，旧数据用统计摘要替代。
 */
export function buildDynamicContext(context: BlockContext, maxDays: number = DEFAULT_MAX_DAYS): string {
  const lines: string[] = [
    `板块名称：${context.name}`
  ]
  if (context.dateRange) lines.push(`统计区间：${context.dateRange}`)

  // 每日完整数据表格（智能截断）
  if (context.dailyData && context.dailyData.length > 0) {
    const allData = context.dailyData
    const recent = allData.slice(-maxDays)
    const oldData = allData.slice(0, -maxDays)

    lines.push('', '每日行情数据明细：')
    lines.push('日期 | 成分股数 | 平均涨跌幅 | 平均股价(元) | 平均成交额(亿) | 总成交额(亿) | 平均换手率')
    for (const d of recent) {
      lines.push(
        `${d.date} | ${d.stockCount} | ${d.avgChangePercent.toFixed(2)}% | ${d.avgPrice.toFixed(2)} | ${d.avgAmount.toFixed(2)} | ${d.totalAmount.toFixed(2)} | ${d.avgTurnoverRate.toFixed(2)}%`
      )
    }

    // 旧数据统计摘要
    if (oldData.length > 0) {
      const avgChange = oldData.reduce((s, d) => s + d.avgChangePercent, 0) / oldData.length
      const avgAmount = oldData.reduce((s, d) => s + d.avgAmount, 0) / oldData.length
      const priceStart = oldData[0].avgPrice
      const priceEnd = oldData[oldData.length - 1].avgPrice
      const priceChange = ((priceEnd / priceStart - 1) * 100).toFixed(2)
      lines.push(
        `（更早 ${oldData.length} 天统计摘要：平均涨跌幅 ${avgChange.toFixed(2)}%，平均成交额 ${avgAmount.toFixed(2)} 亿，区间股价变化 ${priceChange}%）`
      )
    }
  }

  if (context.metrics && context.metrics.length > 0) {
    lines.push('', '关键指标摘要：')
    for (const m of context.metrics) lines.push(`  - ${m.label}：${m.value}`)
  }
  if (context.trendSeries) {
    lines.push(`近期涨跌幅趋势（按日期先后）：${context.trendSeries}`)
  }

  return lines.join('\n')
}

/**
 * 构建完整 system prompt（静态人设 + 动态数据）。
 * 由 ContextManager 调用，分离静态/动态便于 prompt cache。
 */
export function buildSystemPrompt(context?: BlockContext): string {
  const persona = buildStaticPersona()
  if (!context) return persona
  const dynamic = buildDynamicContext(context)
  return `${persona}\n\n${dynamic}`
}

/**
 * 把上下文提示注入消息列表头部（向后兼容接口）。
 * 重构后推荐使用 ContextManager + buildSystemPrompt。
 */
export function injectContext(messages: ChatMessage[], context?: BlockContext): ChatMessage[] {
  const system = buildSystemPrompt(context)
  // 若首条已是 system，合并；否则前置
  if (messages.length > 0 && messages[0].role === 'system') {
    return [{ role: 'system', content: `${system}\n\n${messages[0].content}` }, ...messages.slice(1)]
  }
  return [{ role: 'system', content: system }, ...messages]
}
