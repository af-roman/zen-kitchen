import type { MeasureUnit, Unit } from '@/domain/types'

export type ParsedIngredientLine = {
  raw: string
  parsed: boolean
  /** Amount in `measureUnit` (what the recipe text said — e.g. 1 for "1 tbsp"). */
  amount?: number
  measureUnit?: MeasureUnit
  /** Preferred stock unit when creating a stub ingredient. */
  stockUnit?: Unit
  name: string
}

export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase()
}

const UNIT_ALIASES: Record<string, MeasureUnit> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'ml',
  liter: 'ml',
  liters: 'ml',
  litre: 'ml',
  litres: 'ml',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  pcs: 'pcs',
  pc: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  clove: 'pcs',
  cloves: 'pcs',
  大さじ: 'tbsp',
  小さじ: 'tsp',
  個: 'pcs',
  本: 'pcs',
  枚: 'pcs',
  グラム: 'g',
}

function stockUnitFor(measure: MeasureUnit): Unit {
  if (measure === 'tsp' || measure === 'tbsp') return 'ml'
  return measure
}

function resolveUnit(token: string): MeasureUnit | undefined {
  return UNIT_ALIASES[token.toLowerCase()] ?? UNIT_ALIASES[token]
}

function ok(
  raw: string,
  amount: number,
  measureUnit: MeasureUnit,
  name: string,
): ParsedIngredientLine {
  return {
    raw,
    parsed: true,
    amount,
    measureUnit,
    stockUnit: stockUnitFor(measureUnit),
    name,
  }
}

/** Best-effort parse of a free-text recipe ingredient line. */
export function parseIngredientLine(raw: string): ParsedIngredientLine {
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  if (!cleaned) return { raw, parsed: false, name: '' }

  let m = cleaned.match(/^(大さじ|小さじ)\s*(\d+(?:\.\d+)?)\s*(.+)$/)
  if (m) {
    const unit = resolveUnit(m[1]!)
    const amount = Number(m[2])
    const name = m[3]!.trim()
    if (unit && name && Number.isFinite(amount)) return ok(raw, amount, unit, name)
  }

  m = cleaned.match(
    /^(\d+(?:\.\d+)?)\s*(g|grams?|ml|milliliters?|millilitres?|l|liters?|litres?|tsp|teaspoons?|tbsp|tablespoons?|pcs?|pieces?|cloves?|大さじ|小さじ|個|本|枚|グラム)\b[ \t]*(?:of[ \t]+)?(.+)$/i,
  )
  if (m) {
    const unitToken = m[2]!
    const amount = Number(m[1])
    const name = m[3]!.trim()
    if (name && Number.isFinite(amount)) {
      if (/^l$/i.test(unitToken) || /^liters?$/i.test(unitToken) || /^litres?$/i.test(unitToken)) {
        // Keep liters as ml measure (display in ml).
        return ok(raw, amount * 1000, 'ml', name)
      }
      const unit = resolveUnit(unitToken)
      if (unit) return ok(raw, amount, unit, name)
    }
  }

  m = cleaned.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (m) {
    const amount = Number(m[1])
    const name = m[2]!.trim()
    if (name && Number.isFinite(amount)) return ok(raw, amount, 'pcs', name)
  }

  return { raw, parsed: false, name: cleaned }
}

export function suggestIngredientId(
  name: string,
  catalog: { id?: number; name: string }[],
  synonyms: Record<string, string>,
): number | undefined {
  const key = normalizeIngredientName(name)
  const synonymTarget = synonyms[key]
  const target = synonymTarget ? normalizeIngredientName(synonymTarget) : key

  const exact = catalog.find((i) => normalizeIngredientName(i.name) === target)
  if (exact?.id != null) return exact.id

  const partial = catalog.find((i) => {
    const n = normalizeIngredientName(i.name)
    return (target.length >= 3 && n.includes(target)) || (n.length >= 3 && target.includes(n))
  })
  return partial?.id
}
