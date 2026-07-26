import { addDays, format, parseISO } from 'date-fns'
import type { Recipe, RecipeKind, StorageEnv } from './types'

export function recipeKindOf(recipe: { recipeKind?: RecipeKind } | null | undefined): RecipeKind {
  return recipe?.recipeKind === 'prep' ? 'prep' : 'dish'
}

export function isPrepRecipe(recipe: { recipeKind?: RecipeKind } | null | undefined): boolean {
  return recipeKindOf(recipe) === 'prep'
}

export function isDishRecipe(recipe: { recipeKind?: RecipeKind } | null | undefined): boolean {
  return recipeKindOf(recipe) === 'dish'
}

/** UI label for recipe scale: dish → portions, prep → batches. */
export function quantityNoun(
  recipe: { recipeKind?: RecipeKind } | null | undefined,
  count = 2,
): string {
  const plural = count !== 1
  if (isPrepRecipe(recipe)) return plural ? 'batches' : 'batch'
  return plural ? 'portions' : 'portion'
}

/** e.g. "4 portions" or "1 batch" */
export function formatQuantity(
  recipe: { recipeKind?: RecipeKind } | null | undefined,
  count: number,
): string {
  const n = Math.round(count * 10) / 10
  return `${n} ${quantityNoun(recipe, n)}`
}

/** Scaled pantry yield for a prep cook. */
export function prepYieldAmount(recipe: Recipe, cookScale: number): number {
  const base = recipe.yieldAmount ?? 0
  const scale = cookScale / Math.max(1, recipe.portions)
  return Math.round(base * scale * 10) / 10
}

export function expiryFromCook(cookedAt: string, storageDays: number): string {
  return format(addDays(parseISO(cookedAt.slice(0, 10)), storageDays), 'yyyy-MM-dd')
}

export function storageLabel(env: StorageEnv): string {
  if (env === 'fridge') return 'Fridge'
  if (env === 'freezer') return 'Freezer'
  return 'Room temperature'
}

export function isLowStock(amountLeft: number, threshold: number): boolean {
  return amountLeft > 0 && amountLeft <= threshold
}

export function isOutOfStock(amountLeft: number): boolean {
  return amountLeft <= 0
}

export function recipePortionsAvailable(
  recipe: Recipe,
  stockByIngredient: Map<number, number>,
): { needed: number; available: number; cookable: boolean } {
  // Lines can repeat an ingredient across stages, so total per ingredient.
  const perIngredient = new Map<number, number>()
  for (const line of recipe.ingredients) {
    perIngredient.set(
      line.ingredientId,
      (perIngredient.get(line.ingredientId) ?? 0) + line.amount,
    )
  }
  let available = 0
  for (const [ingredientId, amount] of perIngredient) {
    const have = stockByIngredient.get(ingredientId) ?? 0
    if (have >= amount) available += 1
  }
  const needed = perIngredient.size
  return { needed, available, cookable: available === needed && needed > 0 }
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // HTTP LAN dev (e.g. iPhone on local network) is not a secure context — randomUUID is missing.
  const bytes = new Uint8Array(16)
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes)
    } else {
      throw new Error('no getRandomValues')
    }
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
