import { db } from './database'
import { dedupeSeedDatabase, migrateLegacySeedNames } from './seed-dedupe'
import { SEED_INGREDIENTS, SEED_RECIPE_DRAFTS, type SeedRecipeDraft } from './seed-data'
import { allSeedIngredients, allSeedRecipeDrafts } from './seed-joc'
import { uid } from '@/domain/kitchen'
import type { Recipe } from '@/domain/types'

const SCHEMA_VERSION = 1

const ALL_SEED_INGREDIENTS = allSeedIngredients(SEED_INGREDIENTS)
const ALL_SEED_RECIPE_DRAFTS = allSeedRecipeDrafts(SEED_RECIPE_DRAFTS)

async function ingredientIdByName(): Promise<Map<string, number>> {
  const all = await db.ingredients.toArray()
  return new Map(all.filter((i) => i.id != null).map((i) => [i.name.toLowerCase(), i.id!]))
}

async function ensureSeedIngredients(): Promise<Map<string, number>> {
  const now = new Date().toISOString()
  let byName = await ingredientIdByName()
  for (const ing of ALL_SEED_INGREDIENTS) {
    const key = ing.name.toLowerCase()
    const existingId = byName.get(key)
    if (existingId == null) {
      const id = await db.ingredients.add({ ...ing, createdAt: now })
      byName.set(key, id)
      continue
    }
    // Backfill / refresh density for spoon measures on seeded kitchens
    if (ing.gramsPerMl != null) {
      const row = await db.ingredients.get(existingId)
      if (row && row.gramsPerMl !== ing.gramsPerMl) {
        await db.ingredients.update(existingId, { gramsPerMl: ing.gramsPerMl })
      }
    }
  }
  return byName
}

function draftToRecipe(
  draft: SeedRecipeDraft,
  byName: Map<string, number>,
  now: string,
): Omit<Recipe, 'id'> {
  const { ingredientNames, yieldIngredientName, ...rest } = draft
  const yieldIngredientId = yieldIngredientName
    ? byName.get(yieldIngredientName.toLowerCase())
    : undefined
  if (yieldIngredientName && !yieldIngredientId) {
    throw new Error(`Missing seed yield ingredient: ${yieldIngredientName}`)
  }
  return {
    ...rest,
    ...(yieldIngredientId != null ? { yieldIngredientId } : {}),
    steps: (rest.steps ?? []).map((s) => ({
      ...s,
      id: s.id || uid(),
    })),
    ingredients: draftIngredientLines(
      { ...draft, ingredientNames },
      byName,
    ),
    createdAt: now,
    updatedAt: now,
  }
}

function draftIngredientLines(
  draft: Pick<SeedRecipeDraft, 'ingredientNames'>,
  byName: Map<string, number>,
): Recipe['ingredients'] {
  return draft.ingredientNames.map((line) => {
    const id = byName.get(line.name.toLowerCase())
    if (!id) throw new Error(`Missing seed ingredient: ${line.name}`)
    return {
      ingredientId: id,
      amount: line.amount,
      ...(line.measureUnit ? { measureUnit: line.measureUnit } : {}),
      ...(line.daysAhead ? { daysAhead: line.daysAhead } : {}),
    }
  })
}

function ingredientsMatch(
  a: Recipe['ingredients'],
  b: Recipe['ingredients'],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].ingredientId !== b[i].ingredientId ||
      a[i].amount !== b[i].amount ||
      (a[i].measureUnit ?? undefined) !== (b[i].measureUnit ?? undefined) ||
      (a[i].daysAhead ?? 0) !== (b[i].daysAhead ?? 0)
    ) {
      return false
    }
  }
  return true
}

/** Align seeded recipe ingredient lists/amounts with current seed drafts (from scrape). */
async function syncSeededRecipeIngredients(byName: Map<string, number>): Promise<void> {
  const byRecipeName = new Map(ALL_SEED_RECIPE_DRAFTS.map((d) => [d.name.toLowerCase(), d]))
  const now = new Date().toISOString()

  for (const recipe of await db.recipes.toArray()) {
    if (!recipe.seeded || recipe.id == null) continue
    const draft = byRecipeName.get(recipe.name.toLowerCase())
    if (!draft) continue

    let nextIngredients: Recipe['ingredients']
    try {
      nextIngredients = draftIngredientLines(draft, byName)
    } catch {
      continue
    }

    if (ingredientsMatch(recipe.ingredients, nextIngredients)) continue
    await db.recipes.update(recipe.id, {
      ingredients: nextIngredients,
      updatedAt: now,
    })
  }
}

/** Add any seed recipes that are missing (by name) so existing kitchens get new recipes. */
async function ensureSeedRecipes(byName: Map<string, number>): Promise<void> {
  const now = new Date().toISOString()
  const existing = await db.recipes.toArray()
  const names = new Set(existing.map((r) => r.name.toLowerCase()))

  for (const draft of ALL_SEED_RECIPE_DRAFTS) {
    if (names.has(draft.name.toLowerCase())) continue
    await db.recipes.add(draftToRecipe(draft, byName, now))
  }
}

/** Remove seeded recipes that were dropped from seed data (by name). */
async function removeDroppedSeedRecipes(): Promise<void> {
  const keepNames = new Set(ALL_SEED_RECIPE_DRAFTS.map((d) => d.name.toLowerCase()))

  for (const recipe of await db.recipes.toArray()) {
    if (!recipe.seeded || recipe.id == null) continue
    if (keepNames.has(recipe.name.toLowerCase())) continue

    const recipeId = recipe.id

    for (const batch of await db.readyBatches.where('recipeId').equals(recipeId).toArray()) {
      if (batch.id != null) await db.readyBatches.delete(batch.id)
    }

    for (const session of await db.cookingSessions.toArray()) {
      if (session.id == null) continue
      if (!session.dishes.some((d) => d.recipeId === recipeId)) continue
      const dishes = session.dishes.filter((d) => d.recipeId !== recipeId)
      if (dishes.length === 0) await db.cookingSessions.delete(session.id)
      else await db.cookingSessions.update(session.id, { dishes })
    }

    for (const serving of await db.servings.toArray()) {
      if (serving.id == null) continue
      if (!serving.items.some((i) => i.recipeId === recipeId)) continue
      const items = serving.items.filter((i) => i.recipeId !== recipeId)
      if (items.length === 0) await db.servings.delete(serving.id)
      else await db.servings.update(serving.id, { items })
    }

    for (const entry of await db.cookLog.toArray()) {
      if (entry.id == null) continue
      if (!entry.dishes.some((d) => d.recipeId === recipeId)) continue
      const dishes = entry.dishes.filter((d) => d.recipeId !== recipeId)
      if (dishes.length === 0) await db.cookLog.delete(entry.id)
      else await db.cookLog.update(entry.id, { dishes })
    }

    for (const w of await db.waste.where('recipeId').equals(recipeId).toArray()) {
      if (w.id != null) await db.waste.delete(w.id)
    }

    await db.recipes.delete(recipeId)
  }
}

/**
 * Give already-seeded recipes the stage offsets their draft now declares.
 * Matched on step description so a user’s own edits and extra steps survive.
 */
async function migrateSeedRecipeStages(): Promise<void> {
  const byName = new Map(ALL_SEED_RECIPE_DRAFTS.map((d) => [d.name.toLowerCase(), d]))
  const now = new Date().toISOString()

  for (const recipe of await db.recipes.toArray()) {
    if (!recipe.seeded || recipe.id == null) continue
    const draft = byName.get(recipe.name.toLowerCase())
    if (!draft) continue
    const stageByDescription = new Map(
      (draft.steps ?? []).map((s) => [s.description.trim(), s.daysAhead ?? 0]),
    )
    if (![...stageByDescription.values()].some((d) => d > 0)) continue

    let changed = false
    const steps = recipe.steps.map((step) => {
      const daysAhead = stageByDescription.get(step.description.trim())
      if (daysAhead == null || (step.daysAhead ?? 0) === daysAhead) return step
      changed = true
      return { ...step, daysAhead: daysAhead > 0 ? daysAhead : undefined }
    })
    if (changed) await db.recipes.update(recipe.id, { steps, updatedAt: now })
  }
}

/** Backfill storage fields and remove “To Store” steps from seeded recipes. */
async function migrateSeedRecipeStorage(): Promise<void> {
  const byName = new Map(ALL_SEED_RECIPE_DRAFTS.map((d) => [d.name.toLowerCase(), d]))
  const now = new Date().toISOString()

  for (const recipe of await db.recipes.toArray()) {
    if (!recipe.seeded || recipe.id == null) continue
    const draft = byName.get(recipe.name.toLowerCase())
    if (!draft) continue

    const withoutStoreSteps = recipe.steps.filter(
      (s) => !s.group || !/^to store$/i.test(s.group.trim()),
    )
    const updates: Partial<Recipe> = {
      storageDays: draft.storageDays,
      storageEnv: draft.storageEnv,
      storageInstructions: draft.storageInstructions,
      updatedAt: now,
    }
    if (withoutStoreSteps.length !== recipe.steps.length) {
      updates.steps = withoutStoreSteps
    }

    const changed =
      recipe.storageDays !== updates.storageDays ||
      recipe.storageEnv !== updates.storageEnv ||
      (recipe.storageInstructions ?? '') !== (updates.storageInstructions ?? '') ||
      withoutStoreSteps.length !== recipe.steps.length

    if (changed) {
      await db.recipes.update(recipe.id, updates)
    }
  }
}

export async function ensureSeeded(): Promise<void> {
  await dedupeSeedDatabase()
  await migrateLegacySeedNames()
  await removeDroppedSeedRecipes()
  await migrateSeedRecipeStorage()
  await migrateSeedRecipeStages()

  const meta = await db.meta.get(1)
  if (meta?.seededAt) {
    const byName = await ensureSeedIngredients()
    await ensureSeedRecipes(byName)
    await syncSeededRecipeIngredients(byName)
    await dedupeSeedDatabase()
    return
  }

  await db.transaction(
    'rw',
    [db.goals, db.ingredients, db.recipes, db.pantryItems, db.meta],
    async () => {
      const existingGoals = await db.goals.get(1)
      if (!existingGoals) {
        await db.goals.put({
          id: 1,
          dailyKcal: 2000,
          carbsPct: 40,
          proteinPct: 30,
          fatPct: 30,
        })
      }

      const ingredientCount = await db.ingredients.count()
      if (ingredientCount === 0) {
        const now = new Date().toISOString()
        const ids = await db.ingredients.bulkAdd(
          ALL_SEED_INGREDIENTS.map((ing) => ({ ...ing, createdAt: now })),
          { allKeys: true },
        )
        const all = await db.ingredients.bulkGet(ids as number[])
        const byName = new Map(
          all.filter(Boolean).map((i) => [i!.name.toLowerCase(), i!.id!]),
        )

        const recipes: Recipe[] = ALL_SEED_RECIPE_DRAFTS.map((draft) =>
          draftToRecipe(draft, byName, now),
        )
        await db.recipes.bulkAdd(recipes)

        // Starter pantry for the core set only (not every JOC specialty item)
        const coreNames = new Set(SEED_INGREDIENTS.map((i) => i.name.toLowerCase()))
        const pantryRows = all
          .filter((ing) => ing && coreNames.has(ing.name.toLowerCase()))
          .map((ing) => ({
            ingredientId: ing!.id!,
            brand: 'Starter',
            amountLeft:
              ing!.unit === 'pcs'
                ? Math.max(ing!.lowStockThreshold * 3, 12)
                : Math.max(ing!.lowStockThreshold * 4, 400),
            createdAt: now,
            updatedAt: now,
          }))
        await db.pantryItems.bulkAdd(pantryRows)
      } else {
        const byName = await ensureSeedIngredients()
        await ensureSeedRecipes(byName)
        await syncSeededRecipeIngredients(byName)
      }

      await dedupeSeedDatabase()

      await db.meta.put({
        id: 1,
        schemaVersion: SCHEMA_VERSION,
        seededAt: new Date().toISOString(),
      })
    },
  )
}
