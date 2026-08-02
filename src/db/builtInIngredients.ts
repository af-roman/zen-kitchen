import type { Ingredient } from '@/domain/types'

/** Built-in catalog entry: always available, ml (+ tsp/tbsp), zero calories. */
export const TAP_WATER_NAME = 'Tap water'

export const TAP_WATER: Omit<Ingredient, 'id' | 'createdAt'> = {
  name: TAP_WATER_NAME,
  category: 'staples',
  unit: 'ml',
  alwaysAvailable: true,
  nutritionPer100: { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
  lowStockThreshold: 0,
}

export function isTapWaterName(name: string): boolean {
  const n = name.trim().toLowerCase()
  return n === 'tap water' || n === 'water' || n === 'plain water' || n === 'plain tap water'
}
