import type { CookingSession, Ingredient, Nutrition, Recipe, RecipeStep } from '@/domain/types'
import { emptyNutrition, nutritionForAmount, addNutrition, scaleNutrition } from '@/domain/nutrition'

export function recipeNutrition(
  recipe: Recipe,
  ingredientsById: Map<number, Ingredient>,
): Nutrition {
  let total = emptyNutrition()
  for (const line of recipe.ingredients) {
    const ing = ingredientsById.get(line.ingredientId)
    if (!ing) continue
    total = addNutrition(
      total,
      nutritionForAmount(ing.nutritionPer100, line.amount, ing.unit, ing.avgPieceGrams),
    )
  }
  return scaleNutrition(total, 1 / Math.max(1, recipe.portions))
}

export function stockTotals(pantryAmounts: { ingredientId: number; amountLeft: number }[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const p of pantryAmounts) {
    map.set(p.ingredientId, (map.get(p.ingredientId) ?? 0) + p.amountLeft)
  }
  return map
}

/** Ingredient amounts a session still needs to pull from pantry (skips completed dishes). */
export function sessionIngredientNeeds(
  session: CookingSession,
  recipes: Map<number, Recipe> | Recipe[],
): Map<number, number> {
  const recipeById =
    recipes instanceof Map ? recipes : new Map(recipes.map((r) => [r.id!, r]))
  const map = new Map<number, number>()
  for (const dish of session.dishes) {
    if (dish.completed) continue
    const recipe = recipeById.get(dish.recipeId)
    if (!recipe) continue
    const scale = dish.portions / recipe.portions
    for (const line of recipe.ingredients) {
      map.set(line.ingredientId, (map.get(line.ingredientId) ?? 0) + line.amount * scale)
    }
  }
  return map
}

/**
 * Ingredients reserved by other cooking sessions between `fromDate` and `untilDate` (inclusive).
 * Use when planning a session on `untilDate` so "available" reflects stock left after earlier cooks.
 */
export function reservedIngredientUsage(
  sessions: CookingSession[],
  recipes: Map<number, Recipe> | Recipe[],
  fromDate: string,
  untilDate: string,
  excludeSessionId?: number | null,
): Map<number, number> {
  const map = new Map<number, number>()
  for (const session of sessions) {
    if (session.status === 'done') continue
    if (excludeSessionId != null && session.id === excludeSessionId) continue
    if (session.date < fromDate || session.date > untilDate) continue
    const needs = sessionIngredientNeeds(session, recipes)
    for (const [ingredientId, amount] of needs) {
      map.set(ingredientId, (map.get(ingredientId) ?? 0) + amount)
    }
  }
  return map
}

export type RecipeStepGroup = {
  /** Null when steps have no subrecipe name */
  name: string | null
  steps: RecipeStep[]
}

/** Group consecutive steps that share the same subrecipe name. */
export function groupRecipeSteps(steps: RecipeStep[]): RecipeStepGroup[] {
  const groups: RecipeStepGroup[] = []
  for (const step of steps) {
    const name = step.group?.trim() || null
    const last = groups[groups.length - 1]
    if (last && last.name === name) {
      last.steps.push(step)
    } else {
      groups.push({ name, steps: [step] })
    }
  }
  return groups
}

export async function fileToDataUrl(file: File, maxWidth = 640): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.72)
}
