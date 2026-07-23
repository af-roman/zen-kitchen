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

export function resolveServingNutrition(
  item: ServingItem,
  recipeById: Map<number, Recipe>,
  ingById: Map<number, Ingredient>,
): Nutrition {
  if (item.nutrition && item.nutrition.energyKcal > 0) {
    return item.nutrition
  }
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

export function servePickKey(pick: ServePick): string {
  return pick.kind === 'batch'
    ? `batch:${pick.batchId}`
    : `planned:${pick.sessionId}:${pick.recipeId}`
}

/** True when a planned dish no longer has a cook session or ready batch behind it. */
export function servingItemNeedsFood(
  item: ServingItem,
  sessionById: Map<number, CookingSession>,
  batchIds: Set<number>,
): boolean {
  if (item.needsFood) return true

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
