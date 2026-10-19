import { db } from '@/db/database'
import {
  applyServingItemAllocations,
  clearServingsForMeal,
  findServingsForMeal,
} from '@/db/servingOps'
import type { Nutrition, Recipe, ServingItem } from '@/domain/types'
import { recipeNutrition } from '@/domain/recipeMath'
import type { WeekFillAssignment } from '@/domain/weekFill'

function groupKey(a: WeekFillAssignment): string {
  return `${a.date}|${a.meal}`
}

/**
 * Apply week-fill assignments: merge into each meal slot (replaces that slot).
 * Returns how many meal slots were written.
 */
export async function applyWeekFillAssignments(
  assignments: WeekFillAssignment[],
  recipeById: Map<number, Recipe>,
  ingredientById: Map<number, { nutritionPer100: Nutrition; unit: 'g' | 'ml' | 'pcs'; avgPieceGrams?: number }>,
): Promise<{ mealsWritten: number; portionsAssigned: number }> {
  const byMeal = new Map<string, WeekFillAssignment[]>()
  for (const a of assignments) {
    const k = groupKey(a)
    const list = byMeal.get(k) ?? []
    list.push(a)
    byMeal.set(k, list)
  }

  let mealsWritten = 0
  let portionsAssigned = 0
  const now = new Date().toISOString()

  for (const [, group] of byMeal) {
    const { date, meal } = group[0]
    const existing = await findServingsForMeal(date, meal)
    // Skip slots that already have food — week-fill only fills empty slots
    if (existing.some((s) => s.items.length > 0)) continue

    const items: ServingItem[] = []
    for (const a of group) {
      const recipe = recipeById.get(a.source.recipeId)
      const nutrition = recipe
        ? recipeNutrition(recipe, ingredientById as Map<number, import('@/domain/types').Ingredient>)
        : { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 }
      if (a.source.kind === 'planned') {
        items.push({
          recipeId: a.source.recipeId,
          plannedSessionId: a.source.sessionId,
          portions: a.portions,
          nutrition,
        })
      } else {
        items.push({
          batchId: a.source.batchId,
          recipeId: a.source.recipeId,
          portions: a.portions,
          nutrition,
        })
      }
      portionsAssigned += a.portions
    }
    if (items.length === 0) continue
    await clearServingsForMeal(date, meal)
    await db.servings.add({
      date,
      meal,
      items,
      createdAt: now,
    })
    await applyServingItemAllocations(items)
    mealsWritten++
  }

  return { mealsWritten, portionsAssigned }
}
