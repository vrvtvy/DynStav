/**
 * 交易日历：获取最近一个 A 股交易日。
 *
 * 主路径：从东方财富「上证指数日 K」接口取最后一条 K 线日期。
 *   上证指数 K 线天然只含交易日（休市日无 K 线），最后一条即最近
 *   已收盘的交易日，完全无需自行判断节假日/调休，不可能算错。
 * 兜底：网络不可用时，按「A 股周六日永不开市（即便调休补班也不开市）」
 *   的规则回退到纯周末判断。
 */

const EASTMONEY_KLINE_URL =
  'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
  '?secid=1.000001&klt=101&fqt=1&fields1=f1&fields2=f51&beg=20260101&end=99991231'

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 兜底逻辑：A 股周六日永不开市（调休补班也不开市），从今天起向前
 * 回退到最近一个工作日。仅在网络不可用时使用，不含节日判断。
 */
function getLastTradingDayByWeekend(): string {
  const d = new Date()
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1)
  }
  return toDateStr(d)
}

export async function getLastTradingDay(): Promise<string> {
  // 主路径：上证指数日 K 最后一条即最近交易日
  try {
    const res = await fetch(EASTMONEY_KLINE_URL)
    if (res.ok) {
      const json = (await res.json()) as any
      const klines: string[] = json?.data?.klines || []
      if (klines.length > 0) {
        const last = klines[klines.length - 1].split(',')[0]
        return last // 形如 "2026-06-12"
      }
    }
    console.warn('[TradingCalendar] 东方财富接口返回数据为空，回退到周末判断')
  } catch (e) {
    console.warn('[TradingCalendar] 东方财富接口请求失败，回退到周末判断:', e)
  }

  return getLastTradingDayByWeekend()
}
