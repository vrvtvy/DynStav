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
  'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,day,,,40,qfq'

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

// ─── 交易日列表缓存（同一自然日内不重复请求） ───

let cachedTradingDays: string[] | null = null
let cacheDate: string | null = null

/**
 * 从腾讯上证指数日 K 接口获取最近若干个真实交易日日期。
 * 返回升序排列的日期字符串数组（如 ["2026-06-10", "2026-06-11", ...]）。
 * 接口天然只含交易日，跳过所有周末与节假日。
 * 同一自然日内缓存复用，网络失败时回退到周末跳过逻辑。
 */
export async function getRecentTradingDays(count: number): Promise<string[]> {
  const today = toDateStr(new Date())

  // 缓存命中且数据量足够
  if (cachedTradingDays && cacheDate === today && cachedTradingDays.length >= count) {
    return cachedTradingDays.slice(-count)
  }

  // 请求腾讯 API
  try {
    const res = await net.fetch(TENCENT_KLINE_URL)
    if (res.ok) {
      const json = (await res.json()) as any
      const days: string[][] = json?.data?.sh000001?.day || []
      if (days.length > 0) {
        // days 每项 [0] 为日期字符串，API 已按时间升序返回
        const allDays = days.map(d => d[0])
        log.debug('[TradingCalendar] API 返回', allDays.length, '个交易日，最后', count, '个:', allDays.slice(-count))
        cachedTradingDays = allDays
        cacheDate = today
        return allDays.slice(-count)
      }
    }
    log.warn('[TradingCalendar] 腾讯接口返回数据为空，回退到周末判断')
  } catch (e) {
    log.warn('[TradingCalendar] 腾讯接口请求失败，回退到周末判断:', e)
  }

  // 兜底：生成仅跳过周末的近似交易日列表
  return getTradingDaysByWeekend(count)
}

/**
 * 兜底：按周末跳过逻辑生成最近 N 个「工作日」日期列表（升序）。
 */
function getTradingDaysByWeekend(count: number): string[] {
  const result: string[] = []
  const d = new Date()
  // 先回退到最近工作日
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1)
  }
  result.unshift(toDateStr(d))
  while (result.length < count) {
    d.setDate(d.getDate() - 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      result.unshift(toDateStr(d))
    }
  }
  return result
}

/**
 * 获取最近 count 个交易日的起止日期范围。
 */
export async function getTradingDateRange(count: number): Promise<{ startDate: string; endDate: string }> {
  const days = await getRecentTradingDays(count)
  return { startDate: days[0], endDate: days[days.length - 1] }
}

export async function getLastTradingDay(): Promise<string> {
  // 优先复用已缓存的交易日列表
  const today = toDateStr(new Date())
  if (cachedTradingDays && cacheDate === today && cachedTradingDays.length > 0) {
    return cachedTradingDays[cachedTradingDays.length - 1]
  }

  // 主路径：上证指数日 K 最后一条即最近交易日
  try {
    const res = await net.fetch(TENCENT_KLINE_URL)
    if (res.ok) {
      const json = (await res.json()) as any
      const days: string[][] = json?.data?.sh000001?.day || []
      if (days.length > 0) {
        // 顺便缓存完整列表
        cachedTradingDays = days.map(d => d[0])
        cacheDate = today
        return cachedTradingDays[cachedTradingDays.length - 1]
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
