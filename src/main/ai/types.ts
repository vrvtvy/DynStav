import { AiProviderConfig, ChatMessage, BlockContext } from '../../renderer/src/types'

/**
 * AI 适配层内部请求模型：模板适配器把 AiProviderConfig + messages
 * 转换为统一的 HTTP 请求描述，由上层 fetch 发出。
 */
export interface AdapterRequest {
  url: string
  method: 'POST'
  headers: Record<string, string>
  /** 已序列化为字符串的请求体（含模型、温度、流式标记等） */
  body: string
}

/** 模板适配器接口：新增供应商只需实现 buildRequest / parseDelta。 */
export interface ProviderAdapter {
  /** 构造 HTTP 请求（含流式标记） */
  buildRequest(config: AiProviderConfig, messages: ChatMessage[]): AdapterRequest
  /**
   * 解析 SSE data 行，返回内容增量数组（一条 SSE 可能拆为多段文本）。
   * 返回 null 表示该行代表结束信号。
   */
  parseDelta(line: string): { delta: string } | null
}

/**
 * 把板块上下文渲染为 system 提示词。固定置于消息列表最前，
 * 引导模型基于真实数据而非通用知识作答。
 */
export function buildContextPrompt(context?: BlockContext): string | null {
  if (!context) return null
  const lines: string[] = [
    '你是一名专业的 A 股分析师。当前用户正关注如下自定义动态板块（此处自定义动态板块是：每日根据用户自定义的选股条件选出股票，得到每日的成分股后，对成分股的一些行情数据进行计算分析得出一些数据），请优先基于这些真实数据进行分析。',
    `板块名称：${context.name}`
  ]
  if (context.dateRange) lines.push(`统计区间：${context.dateRange}`)

  // 每日完整数据表格
  if (context.dailyData && context.dailyData.length > 0) {
    lines.push('', '每日行情数据明细：')
    lines.push('日期 | 成分股数 | 平均涨跌幅 | 平均股价(元) | 平均成交额(亿) | 总成交额(亿) | 平均换手率')
    for (const d of context.dailyData) {
      lines.push(
        `${d.date} | ${d.stockCount} | ${d.avgChangePercent.toFixed(2)}% | ${d.avgPrice.toFixed(2)} | ${d.avgAmount.toFixed(2)} | ${d.totalAmount.toFixed(2)} | ${d.avgTurnoverRate.toFixed(2)}%`
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
  lines.push(
    '分析要求：',
    '1) 结合走势、资金（成交额/换手率）给出趋势判断；',
    '2) 指出风险点与潜在机会；',
    '3) 结论简洁，必要时给出可操作建议，并说明不确定性；',
    '4) 使用简体中文，避免编造未给出的数据。'
  )
  return lines.join('\n')
}

/** 把上下文提示注入消息列表头部。 */
export function injectContext(messages: ChatMessage[], context?: BlockContext): ChatMessage[] {
  const prompt = buildContextPrompt(context)
  if (!prompt) return messages
  // 若首条已是 system，合并；否则前置
  if (messages.length > 0 && messages[0].role === 'system') {
    return [{ role: 'system', content: `${prompt}\n\n${messages[0].content}` }, ...messages.slice(1)]
  }
  return [{ role: 'system', content: prompt }, ...messages]
}
