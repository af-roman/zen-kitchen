import { recipeCategory, recipeTechnique } from '@/domain/dishTaxonomy'
import { suitableMealsFor } from '@/domain/mealSuitability'
import { isDishRecipe, isPrepRecipe } from '@/domain/kitchen'
import { recipeNutrition } from '@/domain/recipeMath'
import { recipeStorageOptions, storageDaysFor } from '@/domain/storage'
import type { DishCategory, Goals, Ingredient, PantryItem, PreparationTechnique, ReadyBatch, Recipe } from '@/domain/types'
import type { DishRole, PlannerCatalog, RecipeCandidate } from './types'

/** Fridge keep days for planning. The morning after cooking is day one. */
function planningFridgeDays(recipe: Recipe): number {
  const fridge = storageDaysFor(recipe, 'fridge')
  if (fridge > 0 && recipeStorageOptions(recipe).some((o) => o.place === 'fridge')) {
    return fridge
  }
  const opts = recipeStorageOptions(recipe)
  return opts[0]?.days ?? 3
}

export function dishRole(category: DishCategory, includesStaple: boolean): DishRole {
  if (category === 'soup') return 'soup'
  if (category === 'staple') return 'staple'
  if (category === 'side' || category === 'sauce') return 'side'
  if (category === 'dessert' || category === 'snack') return 'snack'
  if (includesStaple) return 'complete'
  return 'center'
}

/** Pan-fried, stir-fried, and deep-fried count as one family. */
export function techniqueFamily(technique: PreparationTechnique): string | null {
  if (technique === 'other' || technique === 'assembled') return null
  if (technique === 'stir_fried' || technique === 'pan_fried' || technique === 'deep_fried') return 'fried'
  return technique
}

export function buildPlannerCatalog(input: {
  recipes: Recipe[]
  ingredients: Ingredient[]
  pantry: PantryItem[]
  readyBatches?: ReadyBatch[]
  goals: Goals
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
      ingredientNeeds.set(line.ingredientId, (ingredientNeeds.get(line.ingredientId) ?? 0) + line.amount)
    }

    const category = recipeCategory(recipe)
    const includesStaple = recipe.includesStaple === true && category !== 'staple'
    const role = dishRole(category, includesStaple)
    const technique = recipeTechnique(recipe)
    candidates.push({
      recipeId: recipe.id,
      name: recipe.name,
      category,
      role,
      technique,
      techniqueFamily: techniqueFamily(technique),
      isStaple: category === 'staple',
      includesStaple,
      divisible: role === 'soup' || role === 'side' || role === 'staple',
      portionsBase: Math.max(1, recipe.portions),
      nutritionPerPortion: recipeNutrition(recipe, ingredientById),
      fridgeDays: planningFridgeDays(recipe),
      ingredientNeeds,
      repurposesFromRecipeIds: [...(recipe.repurposesFromRecipeIds ?? [])],
      suitableMeals: suitableMealsFor(recipe),
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
          rawFridgeDays: i.rawFridgeDays,
          name: i.name,
          unit: i.unit,
        },
      ]),
  )

  const ready = (input.readyBatches ?? [])
    .filter((batch) => batch.id != null && batch.portionsLeft > 0)
    .map((batch) => ({
      batchId: batch.id!,
      recipeId: batch.recipeId,
      portions: batch.portionsLeft,
      cookedOn: batch.cookedAt.slice(0, 10),
      expiresAt: batch.expiresAt.slice(0, 10),
    }))

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
    ready,
    ingredients,
    seed: input.seed,
  }
}
