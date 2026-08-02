import { db } from '@/db/database'
import { TAP_WATER, isTapWaterName } from '@/db/builtInIngredients'
import type { Ingredient, Recipe, RecipeIngredientLine } from '@/domain/types'
import catalog from './catalog.json'

type SeedIngredient = Omit<Ingredient, 'id' | 'createdAt'> & { key: string }

type SeedRecipe = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'ingredients'> & {
  ingredientLines: {
    ingredientKey: string
    amount: number
    measureUnit?: RecipeIngredientLine['measureUnit']
  }[]
}

const SEED_INGREDIENTS = catalog.ingredients as SeedIngredient[]
const SEED_RECIPES = catalog.recipes as SeedRecipe[]

/** Insert starter ingredients + recipes when the kitchen has no dishes yet. */
export async function ensureSeedCatalog(): Promise<void> {
  const recipeCount = await db.recipes.count()
  if (recipeCount > 0) return
  await loadSeedCatalog({ replaceRecipes: false })
}

/**
 * Load the built-in starter catalog.
 * - Merges ingredients by name (keeps existing IDs when present).
 * - Adds seed recipes that are not already present by name.
 */
export async function loadSeedCatalog(options?: {
  replaceRecipes?: boolean
}): Promise<{ ingredients: number; recipes: number }> {
  const now = new Date().toISOString()
  const keyToId = new Map<string, number>()

  const existingIngredients = await db.ingredients.toArray()
  const byName = new Map(
    existingIngredients
      .filter((i) => i.id != null)
      .map((i) => [i.name.trim().toLowerCase(), i]),
  )

  let ingredientsUpserted = 0
  for (const raw of SEED_INGREDIENTS) {
    const { key, ...rest } = raw
    const nameKey = rest.name.trim().toLowerCase()
    const existing = byName.get(nameKey)

    if (existing?.id != null) {
      // Preserve alwaysAvailable / user edits on built-ins; fill gaps lightly.
      if (isTapWaterName(existing.name) || existing.alwaysAvailable) {
        await db.ingredients.put({
          id: existing.id,
          ...TAP_WATER,
          category: existing.category || TAP_WATER.category,
          createdAt: existing.createdAt,
        })
      }
      keyToId.set(key, existing.id)
      continue
    }

    const id = await db.ingredients.add({
      ...rest,
      createdAt: now,
    })
    keyToId.set(key, id)
    ingredientsUpserted += 1
  }

  // Resolve tap water for recipes even if seed list omitted it somehow.
  if (![...keyToId.keys()].includes('tap_water')) {
    const water =
      (await db.ingredients.toArray()).find((i) => i.alwaysAvailable) ??
      (await db.ingredients.toArray()).find((i) => isTapWaterName(i.name))
    if (water?.id != null) keyToId.set('tap_water', water.id)
  }

  if (options?.replaceRecipes) {
    await db.recipes.clear()
  }

  const existingRecipes = await db.recipes.toArray()
  const recipeNames = new Set(existingRecipes.map((r) => r.name.trim().toLowerCase()))

  let recipesAdded = 0
  for (const raw of SEED_RECIPES) {
    const nameKey = raw.name.trim().toLowerCase()
    if (!options?.replaceRecipes && recipeNames.has(nameKey)) continue

    const ingredients: RecipeIngredientLine[] = raw.ingredientLines.map((line) => {
      const ingredientId = keyToId.get(line.ingredientKey)
      if (ingredientId == null) {
        throw new Error(`Seed recipe "${raw.name}" missing ingredient ${line.ingredientKey}`)
      }
      return {
        ingredientId,
        amount: line.amount,
        measureUnit: line.measureUnit,
      }
    })

    const { ingredientLines: _lines, ...rest } = raw
    await db.recipes.add({
      ...rest,
      ingredients,
      youtubeUrl: rest.youtubeUrl || undefined,
      createdAt: now,
      updatedAt: now,
      seeded: true,
    })
    recipesAdded += 1
  }

  return { ingredients: ingredientsUpserted, recipes: recipesAdded }
}

export function seedCatalogStats() {
  return {
    version: catalog.version as number,
    ingredientCount: SEED_INGREDIENTS.length,
    recipeCount: SEED_RECIPES.length,
  }
}
