import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { CookingSession, Ingredient, Nutrition, Recipe, ServingItem } from './types'
import { addNutrition, emptyNutrition, scaleNutrition } from './nutrition'
import { recipeNutrition } from './recipeMath'
import { expiryFromCook } from './kitchen'

export function daysUntilExpiry(expiryDate: string, fromDate = new Date()): number {
  return differenceInCalendarDays(parseISO(expiryDate), fromDate)
}

export function formatExpiryLabel(expiryDate: string): string {
  const days = daysUntilExpiry(expiryDate)
  const formatted = expiryDate
  if (days < 0) return `${formatted} · expired ${Math.abs(days)}d ago`
  if (days === 0) return `${formatted} · expires today`
  if (days === 1) return `${formatted} · 1 day left`
  return `${formatted} · ${days} days left`
}

export function isPastDate(date: string): boolean {
  return date < new Date().toISOString().slice(0, 10)
}

export function isAdhocServingItem(item: Pick<ServingItem, 'recipeId' | 'name'>): boolean {
  return item.recipeId == null && Boolean(item.name)
}

export function servingItemLabel(
  item: Pick<ServingItem, 'recipeId' | 'name'>,
  recipeById: Map<number, Recipe>,
): string {
  if (item.name?.trim()) return item.name.trim()
  if (item.recipeId != null) return recipeById.get(item.recipeId)?.name ?? 'Dish'
  return 'Dish'
}

export function resolveServingNutrition(
  item: ServingItem,
  recipeById: Map<number, Recipe>,
  ingById: Map<number, Ingredient>,
): Nutrition {
  // Ad-hoc always uses the snapshotted macros (including honest zero kcal).
  if (isAdhocServingItem(item)) {
    return item.nutrition ?? emptyNutrition()
  }
  if (item.nutrition && item.nutrition.energyKcal > 0) {
    return item.nutrition
  }
  if (item.recipeId == null) return item.nutrition ?? emptyNutrition()
  const recipe = recipeById.get(item.recipeId)
  if (!recipe) return item.nutrition ?? emptyNutrition()
  return recipeNutrition(recipe, ingById)
}

export function mealNutritionFromItems(
  items: ServingItem[],
  recipeById: Map<number, Recipe>,
  ingById: Map<number, Ingredient>,
): Nutrition {
  return items.reduce((acc, item) => {
    const perPortion = resolveServingNutrition(item, recipeById, ingById)
    return addNutrition(acc, scaleNutrition(perPortion, item.portions))
  }, emptyNutrition())
}

export function plannedDishExpiresAt(sessionDate: string, storageDays: number): string {
  return expiryFromCook(sessionDate, storageDays)
}

export function plannedDishAvailable(
  dishPortions: number,
  portionsPlanned: number,
): number {
  return Math.max(0, dishPortions - portionsPlanned)
}

export type ServePick =
  | { kind: 'batch'; batchId: number; portions: number }
  | { kind: 'planned'; sessionId: number; recipeId: number; portions: number }
  | {
      kind: 'adhoc'
      /** Stable id for the pick while editing the meal form */
      key: string
      name: string
      portions: number
      nutrition: Nutrition
      usage?: ServingItem['usage']
    }

export function servePickKey(pick: ServePick): string {
  if (pick.kind === 'batch') return `batch:${pick.batchId}`
  if (pick.kind === 'planned') return `planned:${pick.sessionId}:${pick.recipeId}`
  return `adhoc:${pick.key}`
}

/** True when a planned dish no longer has a cook session or ready batch behind it. */
export function servingItemNeedsFood(
  item: ServingItem,
  sessionById: Map<number, CookingSession>,
  batchIds: Set<number>,
): boolean {
  if (item.needsFood) return true
  if (isAdhocServingItem(item)) return false

  if (item.batchId != null) {
    return !batchIds.has(item.batchId)
  }

  if (item.plannedSessionId != null) {
    const session = sessionById.get(item.plannedSessionId)
    if (!session) return true
    if (!session.dishes.some((d) => d.recipeId === item.recipeId)) return true
    return false
  }

  return false
}
