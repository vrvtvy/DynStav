/**
 * 交易日历：获取最近一个 A 股交易日。
 *
 * 主路径：从腾讯「上证指数日 K」接口取最后一条 K 线日期。
 *   上证指数 K 线天然只含交易日（休市日无 K 线），最后一条即最近
 *   已收盘的交易日，完全无需自行判断节假日/调休，不可能算错。
 * 兜底：网络不可用时，按「A 股周六日永不开市（即便调休补班也不开市）」
 *   的规则回退到纯周末判断。
 */

import { net } from 'electron'
import log from 'electron-log/main'

const TENCENT_KLINE_URL =
  'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,day,,,10,qfq'

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
    const res = await net.fetch(TENCENT_KLINE_URL)
    if (res.ok) {
      const json = (await res.json()) as any
      const days: string[][] = json?.data?.sh000001?.day || []
      if (days.length > 0) {
        const last = days[days.length - 1][0]
        return last // 形如 "2026-06-16"
      }
    }
    log.warn('[TradingCalendar] 腾讯接口返回数据为空，回退到周末判断')
  } catch (e) {
    log.warn('[TradingCalendar] 腾讯接口请求失败，回退到周末判断:', e)
  }

  return getLastTradingDayByWeekend()
}

/**
 * 判断当前是否处于 A 股盘中交易时段（9:15 ~ 15:00）。
 * 仅按时间和周末判断，不含节假日；节假日当天误报不影响功能
 * （用户看到提示后可选择取消同步）。
 */
export function isMarketCurrentlyOpen(): boolean {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 || day === 6) return false

  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 555 && minutes < 900 // 9:15 ~ 15:00
}
