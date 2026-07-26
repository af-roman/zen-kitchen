import type { Ingredient, MeasureUnit, Unit } from './types'

/** Metric cooking: 1 tsp = 5 ml, 1 tbsp = 15 ml */
export const ML_PER_TSP = 5
export const ML_PER_TBSP = 15

export const MEASURE_UNITS: { id: MeasureUnit; label: string }[] = [
  { id: 'g', label: 'g' },
  { id: 'ml', label: 'ml' },
  { id: 'pcs', label: 'pcs' },
  { id: 'tsp', label: 'tsp' },
  { id: 'tbsp', label: 'tbsp' },
]

export function measureUnitOf(
  line: { measureUnit?: MeasureUnit } | null | undefined,
  ingredient: Pick<Ingredient, 'unit'> | null | undefined,
): MeasureUnit {
  return line?.measureUnit ?? ingredient?.unit ?? 'g'
}

export function isSpoonUnit(unit: MeasureUnit): unit is 'tsp' | 'tbsp' {
  return unit === 'tsp' || unit === 'tbsp'
}

export function mlPerSpoon(unit: 'tsp' | 'tbsp'): number {
  return unit === 'tsp' ? ML_PER_TSP : ML_PER_TBSP
}

/** Units allowed for recipe entry given an ingredient’s stock unit + density. */
export function allowedMeasureUnits(ingredient: Pick<Ingredient, 'unit' | 'gramsPerMl'>): MeasureUnit[] {
  if (ingredient.unit === 'pcs') return ['pcs']
  if (ingredient.unit === 'ml') return ['ml', 'tsp', 'tbsp']
  // g stock
  if (ingredient.gramsPerMl != null && ingredient.gramsPerMl > 0) {
    return ['g', 'tsp', 'tbsp']
  }
  return ['g']
}

export function canUseMeasureUnit(
  ingredient: Pick<Ingredient, 'unit' | 'gramsPerMl'>,
  measureUnit: MeasureUnit,
): boolean {
  return allowedMeasureUnits(ingredient).includes(measureUnit)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Convert a recipe measure amount into the ingredient’s stock unit (g / ml / pcs).
 */
export function toStockAmount(
  measureAmount: number,
  measureUnit: MeasureUnit,
  ingredient: Pick<Ingredient, 'unit' | 'gramsPerMl' | 'name'>,
): number {
  if (!canUseMeasureUnit(ingredient, measureUnit)) {
    throw new Error(
      `${ingredient.name}: cannot use ${measureUnit} with stock unit ${ingredient.unit}`,
    )
  }
  if (measureUnit === ingredient.unit) return round1(measureAmount)

  if (isSpoonUnit(measureUnit)) {
    const ml = measureAmount * mlPerSpoon(measureUnit)
    if (ingredient.unit === 'ml') return round1(ml)
    // unit === 'g'
    const density = ingredient.gramsPerMl
    if (density == null || density <= 0) {
      throw new Error(`${ingredient.name}: set grams per ml to measure by spoons`)
    }
    return round1(ml * density)
  }

  throw new Error(`${ingredient.name}: unsupported conversion ${measureUnit} → ${ingredient.unit}`)
}

/**
 * Convert a stock amount into a recipe measure unit for display / edit.
 */
export function fromStockAmount(
  stockAmount: number,
  measureUnit: MeasureUnit,
  ingredient: Pick<Ingredient, 'unit' | 'gramsPerMl' | 'name'>,
): number {
  if (!canUseMeasureUnit(ingredient, measureUnit)) {
    return round1(stockAmount)
  }
  if (measureUnit === ingredient.unit) return round1(stockAmount)

  if (isSpoonUnit(measureUnit)) {
    const factor = mlPerSpoon(measureUnit)
    if (ingredient.unit === 'ml') return round1(stockAmount / factor)
    const density = ingredient.gramsPerMl
    if (density == null || density <= 0) return round1(stockAmount)
    return round1(stockAmount / (factor * density))
  }

  return round1(stockAmount)
}

/** Human-readable measure + optional stock equivalent. */
export function formatRecipeAmount(
  stockAmount: number,
  measureUnit: MeasureUnit,
  ingredient: Pick<Ingredient, 'unit' | 'gramsPerMl' | 'name'>,
): { primary: string; stockHint?: string } {
  const unit = canUseMeasureUnit(ingredient, measureUnit) ? measureUnit : ingredient.unit
  const shown = fromStockAmount(stockAmount, unit, ingredient)
  const primary = `${shown} ${unit}`
  if (unit === ingredient.unit) return { primary }
  return {
    primary,
    stockHint: `${round1(stockAmount)} ${ingredient.unit}`,
  }
}

/** Store g/ml from a “g per tbsp” form field. */
export function gramsPerMlFromTbsp(gramsPerTbsp: number): number | undefined {
  if (gramsPerTbsp <= 0) return undefined
  return Math.round((gramsPerTbsp / ML_PER_TBSP) * 100) / 100
}

export function gramsPerTbspFromMl(gramsPerMl: number | undefined): number {
  if (gramsPerMl == null || gramsPerMl <= 0) return 0
  return round1(gramsPerMl * ML_PER_TBSP)
}

export function stockUnitLabel(unit: Unit): string {
  if (unit === 'pcs') return 'pcs'
  return unit
}
