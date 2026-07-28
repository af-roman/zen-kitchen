import type { CookingSession, Ingredient, Nutrition, Recipe, RecipeStep } from '@/domain/types'
import { emptyNutrition, nutritionForAmount, addNutrition, scaleNutrition } from '@/domain/nutrition'
import { dishStage, stageIngredients } from '@/domain/stages'

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

/**
 * Ingredient amounts a session still needs to pull from pantry (skips completed dishes).
 * Only the stage each dish cooks counts, so chained prep legs are not double-counted.
 */
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
    for (const line of stageIngredients(recipe, dishStage(dish))) {
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

export const DEFAULT_SUBRECIPE = 'Main'

export type RecipeStepGroup = {
  name: string
  steps: RecipeStep[]
}

/** Ensure every step has a non-empty subrecipe name (legacy rows → Main). */
export function ensureStepGroups(steps: RecipeStep[]): RecipeStep[] {
  return steps.map((step) => ({
    ...step,
    group: step.group?.trim() || DEFAULT_SUBRECIPE,
  }))
}

/** Group consecutive steps that share the same subrecipe name. */
export function groupRecipeSteps(steps: RecipeStep[]): RecipeStepGroup[] {
  const groups: RecipeStepGroup[] = []
  for (const step of ensureStepGroups(steps)) {
    const name = step.group!.trim()
    const last = groups[groups.length - 1]
    if (last && last.name === name) {
      last.steps.push(step)
    } else {
      groups.push({ name, steps: [step] })
    }
  }
  return groups
}

/** Normalize tips from new `tips` array or legacy single `tip`. */
export function recipeTips(recipe: { tips?: string[]; tip?: string }): string[] {
  if (Array.isArray(recipe.tips)) {
    return recipe.tips.map((t) => t.trim()).filter(Boolean)
  }
  if (recipe.tip?.trim()) return [recipe.tip.trim()]
  return []
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
