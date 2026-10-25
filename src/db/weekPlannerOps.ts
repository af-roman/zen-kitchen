import { db } from '@/db/database'
import { addShortfallsToShopping } from '@/db/shoppingOps'
import {
  applyServingItemAllocations,
  clearServingsForMeal,
  deleteCookingSession,
  findServingsForMeal,
} from '@/db/servingOps'
import { recipeNutrition } from '@/domain/recipeMath'
import type { Ingredient, Recipe, ServingItem } from '@/domain/types'
import type { WeekDraft } from '@/domain/weekPlanner'

export type AcceptDraftMode = 'fill' | 'replace'

/**
 * Accept a week draft.
 * `fill` writes only empty meal slots and says how many occupied slots were left alone.
 * `replace` clears meals in the draft and rewrites planned cooks on those days.
 * Active or finished cooks are left in place, and meals that depend on them are skipped.
 */
export async function acceptWeekDraft(
  draft: WeekDraft,
  recipes: Recipe[],
  ingredients: Ingredient[],
  mode: AcceptDraftMode = 'fill',
): Promise<{
  sessionsCreated: number
  sessionsRemoved: number
  mealsWritten: number
  mealsSkipped: number
  mealsBlocked: number
  shopAdded: number
  shopUpdated: number
}> {
  const recipeById = new Map(recipes.filter((r) => r.id != null).map((r) => [r.id!, r]))
  const ingredientById = new Map(
    ingredients.filter((i) => i.id != null).map((i) => [i.id!, i]),
  )
  const now = new Date().toISOString()

  const blockedDates = new Set<string>()
  let sessionsRemoved = 0
  if (mode === 'replace') {
    const dates = new Set(draft.sessions.map((s) => s.date))
    const existing = await db.cookingSessions.toArray()
    for (const session of existing) {
      if (session.id == null || !dates.has(session.date)) continue
      if (session.status === 'planned') {
        await deleteCookingSession(session.id, 'remove-meals')
        sessionsRemoved++
      } else {
        blockedDates.add(session.date)
      }
    }
  }

  // Map cookDate → sessionId
  const sessionIdByDate = new Map<string, number>()
  let sessionsCreated = 0

  for (const session of draft.sessions) {
    if (session.dishes.length === 0) continue
    if (blockedDates.has(session.date)) continue
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
  let mealsSkipped = 0
  let mealsBlocked = 0
  for (const [, group] of byMeal) {
    const { date, meal } = group[0]
    if (group.some((s) => blockedDates.has(s.cookDate))) {
      mealsBlocked++
      continue
    }
    const existing = await findServingsForMeal(date, meal)
    const occupied = existing.some((s) => s.items.length > 0)
    if (mode === 'fill' && occupied) {
      mealsSkipped++
      continue
    }
    if (mode === 'replace') await clearServingsForMeal(date, meal)

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
    sessionsRemoved,
    mealsWritten,
    mealsSkipped,
    mealsBlocked,
    shopAdded: shopResult.added,
    shopUpdated: shopResult.updated,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
