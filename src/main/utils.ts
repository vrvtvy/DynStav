export function cjkWidth(str: string): number {
  let w = 0
  for (const ch of str) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

export function cjkPadEnd(str: string, len: number): string {
  const current = cjkWidth(str)
  const needed = len - current
  if (needed <= 0) return str
  return str + ' '.repeat(needed)
}
