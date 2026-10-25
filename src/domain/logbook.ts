import { addDays, format, parseISO } from 'date-fns'
import type { CookLogEntry, Recipe, Serving, WasteEntry } from '@/domain/types'
import { isDishRecipe } from '@/domain/kitchen'
import { addNutrition, emptyNutrition, scaleNutrition } from '@/domain/nutrition'
import type { Nutrition } from '@/domain/types'

export type LogWindow = 7 | 30 | 365

/** Inclusive past range ending yesterday. Today is handled separately. */
export function pastWindow(today: string, days: LogWindow): { from: string; to: string } {
  const end = parseISO(today)
  return {
    from: format(addDays(end, -days), 'yyyy-MM-dd'),
    to: format(addDays(end, -1), 'yyyy-MM-dd'),
  }
}

export function isEatenServing(serving: Serving, today: string): boolean {
  if (serving.skipped || serving.items.length === 0) return false
  if (serving.date < today) return true
  if (serving.date === today) return serving.kept === true
  return false
}

export function averageEatenNutrition(
  servings: Serving[],
  today: string,
  window: LogWindow,
  nutritionOf: (serving: Serving) => Nutrition,
): { average: Nutrition; daysWithFood: number; mealCount: number } {
  const { from, to } = pastWindow(today, window)
  const eaten = servings.filter(
    (s) => s.date >= from && s.date <= to && isEatenServing(s, today),
  )
  const byDay = new Map<string, Nutrition>()
  for (const serving of eaten) {
    byDay.set(serving.date, addNutrition(byDay.get(serving.date) ?? emptyNutrition(), nutritionOf(serving)))
  }
  const total = [...byDay.values()].reduce((acc, n) => addNutrition(acc, n), emptyNutrition())
  const daysWithFood = byDay.size
  const divisor = Math.max(1, daysWithFood)
  return {
    average: scaleNutrition(total, 1 / divisor),
    daysWithFood,
    mealCount: eaten.length,
  }
}

export function cookStats(
  logs: CookLogEntry[],
  recipes: Recipe[],
  from: string,
  to: string,
): { sessionCount: number; mostCooked: { name: string; count: number }[]; neverCooked: string[] } {
  const inWindow = logs.filter((l) => l.date >= from && l.date <= to)
  const counts = new Map<number, { name: string; count: number }>()
  const ever = new Set<number>()
  for (const log of logs) {
    for (const dish of log.dishes) ever.add(dish.recipeId)
  }
  for (const log of inWindow) {
    for (const dish of log.dishes) {
      const prev = counts.get(dish.recipeId)
      counts.set(dish.recipeId, {
        name: dish.recipeName,
        count: (prev?.count ?? 0) + 1,
      })
    }
  }
  const mostCooked = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  const neverCooked = recipes
    .filter((r) => r.id != null && isDishRecipe(r) && !ever.has(r.id))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b))
  return { sessionCount: inWindow.length, mostCooked, neverCooked }
}

export function wasteStats(
  waste: WasteEntry[],
  recipeName: (id: number | undefined) => string,
  from: string,
  to: string,
): {
  portions: number
  cost: number
  pricedPortions: number
  top: { name: string; portions: number; cost: number }[]
} {
  const rows = waste.filter((w) => w.date >= from && w.date <= to)
  const byRecipe = new Map<string, { name: string; portions: number; cost: number }>()
  let portions = 0
  let cost = 0
  let pricedPortions = 0
  for (const row of rows) {
    portions += row.portions
    const rowCost = row.cost ?? 0
    if (row.cost != null) pricedPortions += row.portions
    cost += rowCost
    const name = recipeName(row.recipeId)
    const prev = byRecipe.get(name) ?? { name, portions: 0, cost: 0 }
    prev.portions += row.portions
    prev.cost += rowCost
    byRecipe.set(name, prev)
  }
  const top = [...byRecipe.values()].sort((a, b) => b.portions - a.portions).slice(0, 5)
  return {
    portions: Math.round(portions * 10) / 10,
    cost: Math.round(cost * 100) / 100,
    pricedPortions,
    top,
  }
}
