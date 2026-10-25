import { isDishRecipe, isPrepRecipe } from '@/domain/kitchen'
import { recipeMealRoles } from '@/domain/mealRoles'
import { recipeNutrition } from '@/domain/recipeMath'
import { recipeStorageOptions, storageDaysFor } from '@/domain/storage'
import type { Goals, Ingredient, PantryItem, Recipe } from '@/domain/types'
import type { PlannerCatalog, RecipeCandidate } from './types'

/** Fridge keep days for planning; fall back to any storage option. */
function planningFridgeDays(recipe: Recipe): number {
  const fridge = storageDaysFor(recipe, 'fridge')
  if (fridge > 0 && recipeStorageOptions(recipe).some((o) => o.place === 'fridge')) {
    return fridge
  }
  const opts = recipeStorageOptions(recipe)
  return opts[0]?.days ?? 3
}

export function buildPlannerCatalog(input: {
  recipes: Recipe[]
  ingredients: Ingredient[]
  pantry: PantryItem[]
  goals: Goals
  shortlistIds?: number[]
  seed?: number
}): PlannerCatalog {
  const ingredientById = new Map(input.ingredients.map((i) => [i.id!, i]))
  const candidates: RecipeCandidate[] = []

  for (const recipe of input.recipes) {
    if (recipe.id == null) continue
    if (!isDishRecipe(recipe) || isPrepRecipe(recipe)) continue
    if (!recipe.ingredients.length) continue

    const ingredientNeeds = new Map<number, number>()
    for (const line of recipe.ingredients) {
      ingredientNeeds.set(
        line.ingredientId,
        (ingredientNeeds.get(line.ingredientId) ?? 0) + line.amount,
      )
    }

    candidates.push({
      recipeId: recipe.id,
      name: recipe.name,
      category: recipe.category,
      isStaple: recipe.category === 'staple',
      mealRoles: recipeMealRoles(recipe),
      portionsBase: Math.max(1, recipe.portions),
      nutritionPerPortion: recipeNutrition(recipe, ingredientById),
      fridgeDays: planningFridgeDays(recipe),
      ingredientNeeds,
      repurposesFromRecipeIds: [...(recipe.repurposesFromRecipeIds ?? [])],
    })
  }

  const ingredients = new Map(
    input.ingredients
      .filter((i) => i.id != null)
      .map((i) => [
        i.id!,
        {
          packSize: i.packSize,
          alwaysAvailable: i.alwaysAvailable,
          lowStockThreshold: i.lowStockThreshold,
          rawFridgeDays: i.rawFridgeDays,
          name: i.name,
          unit: i.unit,
        },
      ]),
  )

  return {
    candidates,
    goals: {
      dailyKcal: input.goals.dailyKcal,
      carbsPct: input.goals.carbsPct,
      proteinPct: input.goals.proteinPct,
      fatPct: input.goals.fatPct,
    },
    pantry: input.pantry.map((p) => ({
      ingredientId: p.ingredientId,
      amountLeft: p.amountLeft,
      expiryDate: p.expiryDate,
    })),
    ingredients,
    shortlistIds: input.shortlistIds,
    seed: input.seed,
  }
}
