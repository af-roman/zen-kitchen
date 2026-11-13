import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import { addShortfallsToShopping } from '@/db/shoppingOps'
import {
  applyServingItemAllocations,
  clearServingsForMeal,
  deleteCookingSession,
} from '@/db/servingOps'
import { recipeNutrition } from '@/domain/recipeMath'
import type { Ingredient, Recipe, ServingItem } from '@/domain/types'
import type { WeekDraft } from '@/domain/weekPlanner'

/**
 * Replace meals in the plan range with this draft.
 * Planned sessions created by the planner in that stretch are removed first.
 * A cook already underway on one of the new cook dates is left in place, and meals
 * that depend on it are skipped.
 */
export async function acceptWeekDraft(
  draft: WeekDraft,
  recipes: Recipe[],
  ingredients: Ingredient[],
): Promise<{
  sessionsCreated: number
  sessionsRemoved: number
  mealsWritten: number
  mealsCleared: number
  mealsBlocked: number
  shopAdded: number
  shopUpdated: number
}> {
  const recipeById = new Map(recipes.filter((recipe) => recipe.id != null).map((recipe) => [recipe.id!, recipe]))
  const ingredientById = new Map(
    ingredients.filter((ingredient) => ingredient.id != null).map((ingredient) => [ingredient.id!, ingredient]),
  )
  const now = new Date().toISOString()
  const prefs = draft.prefs
  const eatDays = Array.from({ length: prefs.dayCount }, (_, index) =>
    format(addDays(parseISO(prefs.weekStartDate), index), 'yyyy-MM-dd'),
  )
  const spanStart = format(addDays(parseISO(prefs.weekStartDate), -1), 'yyyy-MM-dd')
  const spanEnd = eatDays[eatDays.length - 1] ?? prefs.weekStartDate
  const draftCookDates = new Set(draft.sessions.map((session) => session.date))

  const blockedDates = new Set<string>()
  let sessionsRemoved = 0
  const existing = await db.cookingSessions.toArray()
  for (const session of existing) {
    if (session.id == null) continue
    const inSpan = session.date >= spanStart && session.date <= spanEnd
    const replaces = draftCookDates.has(session.date)
    if (!inSpan && !replaces) continue
    const plannerSession = session.notes === 'From week planner'
    if (session.status === 'planned' && (plannerSession || replaces)) {
      await deleteCookingSession(session.id, 'remove-meals')
      sessionsRemoved++
    } else if (session.status !== 'done' && replaces) {
      blockedDates.add(session.date)
    }
  }

  const sessionIdByDate = new Map<string, number>()
  let sessionsCreated = 0
  for (const session of draft.sessions) {
    if (session.dishes.length === 0 || blockedDates.has(session.date)) continue
    const id = await db.cookingSessions.add({
      date: session.date,
      status: 'planned',
      dishes: session.dishes.map((dish) => ({
        recipeId: dish.recipeId,
        portions: dish.portions,
        portionsPlanned: 0,
      })),
      notes: 'From week planner',
      createdAt: now,
      updatedAt: now,
    })
    sessionIdByDate.set(session.date, id as number)
    sessionsCreated++
  }

  const byMeal = new Map<string, typeof draft.servings>()
  for (const serving of draft.servings) {
    const key = `${serving.date}|${serving.meal}`
    const list = byMeal.get(key) ?? []
    list.push(serving)
    byMeal.set(key, list)
  }

  let mealsWritten = 0
  let mealsCleared = 0
  let mealsBlocked = 0
  for (const date of eatDays) {
    for (const meal of prefs.meals) {
      const group = byMeal.get(`${date}|${meal}`) ?? []
      if (group.some((serving) => serving.batchId == null && blockedDates.has(serving.cookDate))) {
        mealsBlocked++
        continue
      }
      await clearServingsForMeal(date, meal)
      if (group.length === 0) {
        mealsCleared++
        continue
      }

      const items: ServingItem[] = []
      for (const serving of group) {
        const transform = recipeById.get(serving.recipeId)
        const source = serving.fromRecipeId != null ? recipeById.get(serving.fromRecipeId) : undefined
        const nutritionRecipe = transform ?? source
        const nutrition = nutritionRecipe
          ? recipeNutrition(nutritionRecipe, ingredientById)
          : { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 }
        if (serving.batchId != null) {
          items.push({
            recipeId: serving.recipeId,
            batchId: serving.batchId,
            portions: serving.portions,
            nutrition,
          })
          continue
        }
        const sessionId = sessionIdByDate.get(serving.cookDate)
        items.push({
          recipeId: serving.fromRecipeId ?? serving.recipeId,
          plannedSessionId: sessionId,
          portions: serving.portions,
          nutrition,
          name:
            serving.fromRecipeId != null && transform && source
              ? `${transform.name} (from ${source.name})`
              : undefined,
        })
      }
      if (items.length === 0) continue
      await db.servings.add({ date, meal, items, createdAt: now })
      await applyServingItemAllocations(items)
      mealsWritten++
    }
  }

  for (const [cookDate, sessionId] of sessionIdByDate) {
    const session = await db.cookingSessions.get(sessionId)
    if (!session) continue
    const plannedByRecipe = new Map<number, number>()
    for (const serving of draft.servings) {
      if (serving.batchId != null || serving.cookDate !== cookDate) continue
      const allocId = serving.fromRecipeId ?? serving.recipeId
      plannedByRecipe.set(allocId, (plannedByRecipe.get(allocId) ?? 0) + serving.portions)
      if (serving.fromRecipeId != null && serving.fromRecipeId !== serving.recipeId) {
        plannedByRecipe.set(
          serving.recipeId,
          (plannedByRecipe.get(serving.recipeId) ?? 0) + serving.portions,
        )
      }
    }
    const dishes = session.dishes.map((dish) => ({
      ...dish,
      portionsPlanned: plannedByRecipe.get(dish.recipeId) ?? dish.portionsPlanned ?? 0,
    }))
    await db.cookingSessions.update(sessionId, { dishes, updatedAt: now })
  }

  const shopResult = await addShortfallsToShopping(
    draft.shopping.map((line) => ({
      ingredientId: line.ingredientId,
      need: line.need,
      have: Math.max(0, round1(line.need - line.buy)),
      buy: line.buy,
      packs: line.packs,
    })),
  )

  return {
    sessionsCreated,
    sessionsRemoved,
    mealsWritten,
    mealsCleared,
    mealsBlocked,
    shopAdded: shopResult.added,
    shopUpdated: shopResult.updated,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
