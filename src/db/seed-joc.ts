import joc from './seed-joc.json'
import type { Ingredient, MeasureUnit } from '@/domain/types'
import type { SeedRecipeDraft } from './seed-data'

type SeedIngredient = Omit<Ingredient, 'id' | 'createdAt'>

export const JOC_SEED_INGREDIENTS: SeedIngredient[] = joc.ingredients as SeedIngredient[]

export const JOC_SEED_RECIPE_DRAFTS: SeedRecipeDraft[] = joc.recipes.map((r) => ({
  name: r.name,
  description: r.description,
  source: r.source,
  tips: r.tips,
  category: r.category as SeedRecipeDraft['category'],
  effort: r.effort as SeedRecipeDraft['effort'],
  portions: r.portions,
  imageDataUrl: r.imageDataUrl,
  storageInstructions: r.storageInstructions,
  storageDays: r.storageDays,
  storageEnv: r.storageEnv as SeedRecipeDraft['storageEnv'],
  seeded: true,
  recipeKind: 'dish' as const,
  steps: r.steps.map((s) => ({
    id: '', // filled in draftToRecipe
    description: s.description,
    requiresTimer: Boolean(s.requiresTimer),
    group: s.group || undefined,
  })),
  ingredientNames: r.ingredientNames.map((line) => ({
    name: line.name,
    amount: line.amount,
    ...(line.measureUnit
      ? { measureUnit: line.measureUnit as MeasureUnit }
      : {}),
  })),
}))

/** All seed recipes: core kitchen set + Just One Cookbook import. */
export function allSeedRecipeDrafts(core: SeedRecipeDraft[]): SeedRecipeDraft[] {
  const names = new Set(core.map((r) => r.name.toLowerCase()))
  const extra = JOC_SEED_RECIPE_DRAFTS.filter((r) => !names.has(r.name.toLowerCase()))
  return [...core, ...extra]
}

export function allSeedIngredients(core: SeedIngredient[]): SeedIngredient[] {
  const names = new Set(core.map((i) => i.name.toLowerCase()))
  const extra = JOC_SEED_INGREDIENTS.filter((i) => !names.has(i.name.toLowerCase()))
  return [...core, ...extra]
}
