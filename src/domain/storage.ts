import type { BatchStorage, Recipe, StorageEnv } from './types'
import { storageLabel } from './kitchen'

export type StorageOption = { place: BatchStorage; days: number }

function positiveDays(n: number | undefined | null): number | undefined {
  if (n == null || !Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n)
}

/** Fridge / freezer options defined on a recipe (with legacy field fallback). */
export function recipeStorageOptions(recipe: {
  fridgeDays?: number
  freezerDays?: number
  storageDays?: number
  storageEnv?: StorageEnv
}): StorageOption[] {
  const options: StorageOption[] = []
  const fridge = positiveDays(recipe.fridgeDays)
  const freezer = positiveDays(recipe.freezerDays)
  if (fridge != null) options.push({ place: 'fridge', days: fridge })
  if (freezer != null) options.push({ place: 'freezer', days: freezer })
  if (options.length > 0) return options

  const legacy = positiveDays(recipe.storageDays)
  if (legacy != null) {
    const place: BatchStorage = recipe.storageEnv === 'freezer' ? 'freezer' : 'fridge'
    return [{ place, days: legacy }]
  }
  return [{ place: 'fridge', days: 3 }]
}

export function storageDaysFor(
  recipe: {
    fridgeDays?: number
    freezerDays?: number
    storageDays?: number
    storageEnv?: StorageEnv
  },
  place: BatchStorage,
): number {
  const match = recipeStorageOptions(recipe).find((o) => o.place === place)
  if (match) return match.days
  return recipeStorageOptions(recipe)[0]?.days ?? 3
}

/** Longest keep time — used when planning meals before storage place is chosen. */
export function maxStorageDays(recipe: {
  fridgeDays?: number
  freezerDays?: number
  storageDays?: number
  storageEnv?: StorageEnv
}): number {
  return Math.max(...recipeStorageOptions(recipe).map((o) => o.days))
}

export function defaultStoragePlace(recipe: {
  fridgeDays?: number
  freezerDays?: number
  storageDays?: number
  storageEnv?: StorageEnv
}): BatchStorage {
  return recipeStorageOptions(recipe)[0]?.place ?? 'fridge'
}

export function batchStoragePlace(batch: { storagePlace?: BatchStorage }): BatchStorage {
  return batch.storagePlace === 'freezer' ? 'freezer' : 'fridge'
}

export function formatStorageSummary(recipe: {
  fridgeDays?: number
  freezerDays?: number
  storageDays?: number
  storageEnv?: StorageEnv
}): string {
  return recipeStorageOptions(recipe)
    .map((o) => `${storageLabel(o.place)} ${o.days} day${o.days === 1 ? '' : 's'}`)
    .join(' · ')
}

/** Fields written when saving a recipe. */
export function recipeStorageFields(fridgeDays: number, freezerDays: number) {
  const fridge = positiveDays(fridgeDays)
  const freezer = positiveDays(freezerDays)
  const primary = fridge != null ? ('fridge' as const) : freezer != null ? ('freezer' as const) : ('fridge' as const)
  const primaryDays = fridge ?? freezer ?? 3
  return {
    fridgeDays: fridge,
    freezerDays: freezer,
    // Keep legacy fields in sync for older backups / readers.
    storageDays: primaryDays,
    storageEnv: primary as StorageEnv,
  }
}

export function readRecipeStorageDays(recipe: Recipe): { fridgeDays: number; freezerDays: number } {
  const options = recipeStorageOptions(recipe)
  return {
    fridgeDays: options.find((o) => o.place === 'fridge')?.days ?? 0,
    freezerDays: options.find((o) => o.place === 'freezer')?.days ?? 0,
  }
}
