import { db } from '@/db/database'
import { addShortfallsToShopping } from '@/db/shoppingOps'
import {
  applyServingItemAllocations,
  clearServingsForMeal,
  findServingsForMeal,
} from '@/db/servingOps'
import { recipeNutrition } from '@/domain/recipeMath'
import type { Ingredient, Recipe, ServingItem } from '@/domain/types'
import type { WeekDraft } from '@/domain/weekPlanner'

/**
 * Accept a week draft: write cook sessions, meal servings, and shopping shortfalls.
 * Overwrites meal slots that the draft fills; leaves other slots alone.
 */
export async function acceptWeekDraft(
  draft: WeekDraft,
  recipes: Recipe[],
  ingredients: Ingredient[],
): Promise<{
  sessionsCreated: number
  mealsWritten: number
  shopAdded: number
  shopUpdated: number
}> {
  const recipeById = new Map(recipes.filter((r) => r.id != null).map((r) => [r.id!, r]))
  const ingredientById = new Map(
    ingredients.filter((i) => i.id != null).map((i) => [i.id!, i]),
  )
  const now = new Date().toISOString()

  // Map cookDate → sessionId
  const sessionIdByDate = new Map<string, number>()
  let sessionsCreated = 0

  for (const session of draft.sessions) {
    if (session.dishes.length === 0) continue
    const id = await db.cookingSessions.add({
      date: session.date,
      status: 'planned',
      dishes: session.dishes.map((d) => ({
        recipeId: d.recipeId,
        portions: d.portions,
        portionsPlanned: 0,
      })),
      notes: 'From week planner',
      createdAt: now,
      updatedAt: now,
    })
    sessionIdByDate.set(session.date, id)
    sessionsCreated++
  }

  // Group servings by meal slot
  const byMeal = new Map<string, typeof draft.servings>()
  for (const s of draft.servings) {
    const key = `${s.date}|${s.meal}`
    const list = byMeal.get(key) ?? []
    list.push(s)
    byMeal.set(key, list)
  }

  let mealsWritten = 0
  for (const [, group] of byMeal) {
    const { date, meal } = group[0]
    const existing = await findServingsForMeal(date, meal)
    if (existing.some((s) => s.items.length > 0)) {
      // Skip occupied slots — same as week-fill
      continue
    }

    const items: ServingItem[] = []
    for (const s of group) {
      const transform = recipeById.get(s.recipeId)
      const source = s.fromRecipeId != null ? recipeById.get(s.fromRecipeId) : undefined
      // Allocation must target the cooked dish on the session (source when repurposing).
      const allocRecipeId = s.fromRecipeId ?? s.recipeId
      const nutritionRecipe = transform ?? source
      const nutrition = nutritionRecipe
        ? recipeNutrition(nutritionRecipe, ingredientById)
        : { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 }
      const sessionId = sessionIdByDate.get(s.cookDate)
      items.push({
        recipeId: allocRecipeId,
        plannedSessionId: sessionId,
        portions: s.portions,
        nutrition,
        name:
          s.fromRecipeId != null && transform && source
            ? `${transform.name} (from ${source.name})`
            : undefined,
      })
    }
    if (items.length === 0) continue
    await clearServingsForMeal(date, meal)
    await db.servings.add({ date, meal, items, createdAt: now })
    await applyServingItemAllocations(items)
    mealsWritten++
  }

  // Update portionsPlanned on sessions
  for (const [cookDate, sessionId] of sessionIdByDate) {
    const session = await db.cookingSessions.get(sessionId)
    if (!session) continue
    const plannedByRecipe = new Map<number, number>()
    for (const s of draft.servings) {
      if (s.cookDate !== cookDate) continue
      const allocId = s.fromRecipeId ?? s.recipeId
      plannedByRecipe.set(allocId, (plannedByRecipe.get(allocId) ?? 0) + s.portions)
    }
    const dishes = session.dishes.map((d) => ({
      ...d,
      portionsPlanned: plannedByRecipe.get(d.recipeId) ?? d.portionsPlanned ?? 0,
    }))
    await db.cookingSessions.update(sessionId, { dishes, updatedAt: now })
  }

  const shopResult = await addShortfallsToShopping(
    draft.shopping.map((l) => ({
      ingredientId: l.ingredientId,
      need: l.need,
      have: Math.max(0, round1(l.need - l.buy)),
      buy: l.buy,
      packs: l.packs,
    })),
  )

  return {
    sessionsCreated,
    mealsWritten,
    shopAdded: shopResult.added,
    shopUpdated: shopResult.updated,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
