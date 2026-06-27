export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @deprecated 仅跳过周末，不跳过节假日，已改用主进程 IPC getTradingDateRange()
 * 保留作为离线兜底，请勿再作为主要路径使用。
 */
export function getTradingDateRange(tradingDays: number, latestDate?: string): { startDate: string; endDate: string } {
  const end = latestDate ? new Date(latestDate) : new Date()
  while (end.getDay() === 0 || end.getDay() === 6) {
    end.setDate(end.getDate() - 1)
  }
  const endDate = toDateStr(end)

  const start = new Date(end)
  let remaining = tradingDays - 1
  while (remaining > 0) {
    start.setDate(start.getDate() - 1)
    if (start.getDay() !== 0 && start.getDay() !== 6) {
      remaining--
    }
  }
  const startDate = toDateStr(start)
  return { startDate, endDate }
}
