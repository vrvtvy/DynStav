/** 交易日历：获取最近交易日，含法定节假日判断 */

const HOLIDAY_API = 'https://timor.tech/api/holiday/year/'
const holidayCache: Map<number, Record<string, any>> = new Map()

async function ensureHolidays(year: number): Promise<void> {
  if (holidayCache.has(year)) return
  try {
    const res = await fetch(`${HOLIDAY_API}${year}`)
    const data = await res.json()
    holidayCache.set(year, data?.holiday || {})
  } catch {
    holidayCache.set(year, {})
  }
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isTradingDay(d: Date): boolean {
  const day = d.getDay()
  if (day === 0 || day === 6) return false
  const y = d.getFullYear()
  const yearData = holidayCache.get(y)
  if (yearData) {
    const entry = yearData[toDateStr(d)]
    if (entry && entry.holiday === true) return false
  }
  return true
}

export async function getLastTradingDay(): Promise<string> {
  const d = new Date()
  const year = d.getFullYear()
  await ensureHolidays(year)
  while (!isTradingDay(d)) {
    d.setDate(d.getDate() - 1)
    const y = d.getFullYear()
    if (y !== year) await ensureHolidays(y)
  }
  return toDateStr(d)
}
