/** Common cooking divisions, matched loosely so 0.33 still reads as 1/3. */
const FRACTION_PARTS: { value: number; label: string }[] = [
  { value: 1 / 8, label: '1/8' },
  { value: 1 / 4, label: '1/4' },
  { value: 1 / 3, label: '1/3' },
  { value: 3 / 8, label: '3/8' },
  { value: 1 / 2, label: '1/2' },
  { value: 5 / 8, label: '5/8' },
  { value: 2 / 3, label: '2/3' },
  { value: 3 / 4, label: '3/4' },
  { value: 7 / 8, label: '7/8' },
]

const UNICODE_FRACTIONS: Record<string, string> = {
  '⅛': '1/8',
  '¼': '1/4',
  '⅓': '1/3',
  '⅜': '3/8',
  '½': '1/2',
  '⅝': '5/8',
  '⅔': '2/3',
  '¾': '3/4',
  '⅞': '7/8',
}

export function roundAmount(n: number, places: number): number {
  const factor = 10 ** places
  return Math.round(n * factor) / factor
}

function trimNumber(n: number, places: number): string {
  const rounded = roundAmount(n, places)
  if (places <= 0) return String(Math.round(rounded))
  return rounded.toFixed(places).replace(/\.?0+$/, '')
}

/** Show 0.5 as 1/2 and 1.25 as 1 1/4 when it is close to a cooking fraction. */
export function formatAmount(n: number, fractions: boolean, decimals: number): string {
  if (!Number.isFinite(n)) return ''
  const places = fractions ? Math.max(decimals, 2) : decimals
  const rounded = roundAmount(n, places)
  if (!fractions) return trimNumber(rounded, places)

  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  const whole = Math.floor(abs + 1e-9)
  const frac = abs - whole
  if (frac < 0.004) return sign + String(whole)

  let best = FRACTION_PARTS[0]!
  for (const part of FRACTION_PARTS) {
    if (Math.abs(frac - part.value) < Math.abs(frac - best.value)) best = part
  }
  if (Math.abs(frac - best.value) < 0.008) {
    return whole > 0 ? `${sign}${whole} ${best.label}` : `${sign}${best.label}`
  }
  return sign + trimNumber(abs, places)
}

/**
 * Parse a typed amount. Returns null while the text is unfinished ("1/", "0.").
 * Accepts 0.25, 1/2, 1 1/2, and single unicode fractions.
 */
export function parseAmountInput(raw: string): number | null {
  let text = raw.trim().replace(/,/g, '.')
  text = text.replace(/(\d)\s*([⅛¼⅓⅜½⅝⅔¾⅞])/g, (_, digit: string, mark: string) => {
    return `${digit} ${UNICODE_FRACTIONS[mark]}`
  })
  text = text.replace(/[⅛¼⅓⅜½⅝⅔¾⅞]/g, (mark) => UNICODE_FRACTIONS[mark] ?? mark)
  text = text.replace(/\s+/g, ' ')
  if (text === '' || text === '.') return null

  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    const den = Number(mixed[3])
    if (den === 0) return null
    return Number(mixed[1]) + Number(mixed[2]) / den
  }
  const fraction = text.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    const den = Number(fraction[2])
    if (den === 0) return null
    return Number(fraction[1]) / den
  }
  if (!/^\d*\.?\d+$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/** True while the user is still typing a decimal or a fraction. */
export function isPartialAmount(raw: string): boolean {
  const text = raw.trim().replace(/,/g, '.')
  if (text === '' || text === '.') return true
  if (/^\d+\.$/.test(text)) return true
  if (/^\d+\/$/.test(text)) return true
  if (/^\d+\s+\d*$/.test(text)) return true
  if (/^\d+\s+\d+\/$/.test(text)) return true
  return false
}
