import type { Ingredient, MeasureUnit } from './types'
import { formatAmount, roundAmount } from './amountInput'

/** Metric cooking: 1 tsp = 5 ml, 1 tbsp = 15 ml */
export const ML_PER_TSP = 5
export const ML_PER_TBSP = 15

export function measureUnitOf(
  line: { measureUnit?: MeasureUnit } | null | undefined,
  ingredient: Pick<Ingredient, 'unit'> | null | undefined,
): MeasureUnit {
  return line?.measureUnit ?? ingredient?.unit ?? 'g'
}

export function isSpoonUnit(unit: MeasureUnit): unit is 'tsp' | 'tbsp' {
  return unit === 'tsp' || unit === 'tbsp'
}

/** Spoons and pieces are measured in fractions. Grams and millilitres stay coarse. */
export function usesFineAmount(unit: string | undefined): boolean {
  return unit === 'tsp' || unit === 'tbsp' || unit === 'pcs'
}

export function amountEntry(unit: string | undefined): { step: number; fractions: boolean } {
  if (usesFineAmount(unit)) return { step: 0.25, fractions: true }
  return { step: 0.1, fractions: false }
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
  return roundAmount(n, 1)
}

/** Keep quarter-spoons and quarter-pieces (0.25) instead of collapsing them to one decimal. */
function roundStock(n: number, measureUnit: MeasureUnit): number {
  return roundAmount(n, usesFineAmount(measureUnit) ? 2 : 1)
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
  if (measureUnit === ingredient.unit) return roundStock(measureAmount, measureUnit)

  if (isSpoonUnit(measureUnit)) {
    const ml = measureAmount * mlPerSpoon(measureUnit)
    if (ingredient.unit === 'ml') return roundStock(ml, measureUnit)
    // unit === 'g'
    const density = ingredient.gramsPerMl
    if (density == null || density <= 0) {
      throw new Error(`${ingredient.name}: set grams per ml to measure by spoons`)
    }
    return roundStock(ml * density, measureUnit)
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
    return roundStock(stockAmount, measureUnit)
  }
  if (measureUnit === ingredient.unit) return roundStock(stockAmount, measureUnit)

  if (isSpoonUnit(measureUnit)) {
    const factor = mlPerSpoon(measureUnit)
    if (ingredient.unit === 'ml') return roundStock(stockAmount / factor, measureUnit)
    const density = ingredient.gramsPerMl
    if (density == null || density <= 0) return roundStock(stockAmount, ingredient.unit)
    return roundStock(stockAmount / (factor * density), measureUnit)
  }

  return roundStock(stockAmount, measureUnit)
}

/** Human-readable measure + optional stock equivalent (not shown for spoons). */
export function formatRecipeAmount(
  stockAmount: number,
  measureUnit: MeasureUnit,
  ingredient: Pick<Ingredient, 'unit' | 'gramsPerMl' | 'name'>,
): { primary: string; stockHint?: string } {
  const unit = canUseMeasureUnit(ingredient, measureUnit) ? measureUnit : ingredient.unit
  const shown = fromStockAmount(stockAmount, unit, ingredient)
  const primary = `${formatAmount(shown, usesFineAmount(unit), usesFineAmount(unit) ? 2 : 1)} ${unit}`
  if (unit === ingredient.unit || isSpoonUnit(unit)) return { primary }
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

/** Pantry / shop quantity. Pieces use fractions; grams and millilitres keep two places when needed. */
export function formatStockAmount(amount: number, unit: string | undefined): string {
  return formatAmount(amount, unit === 'pcs', 2)
}

export function gramsPerTbspFromMl(gramsPerMl: number | undefined): number {
  if (gramsPerMl == null || gramsPerMl <= 0) return 0
  return round1(gramsPerMl * ML_PER_TBSP)
}
