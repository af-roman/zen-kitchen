import type { Recipe, StorageEnv } from './types'
import { storageLabel } from './kitchen'

export function formatStorageSummary(recipe: {
  storageDays: number
  storageEnv: StorageEnv
}): string {
  return `Keeps ${recipe.storageDays} day${recipe.storageDays === 1 ? '' : 's'} · ${storageLabel(recipe.storageEnv)}`
}

export function hasStorageDetails(recipe: {
  storageInstructions?: string
  storageDays: number
  storageEnv: StorageEnv
}): boolean {
  return Boolean(recipe.storageInstructions?.trim()) || recipe.storageDays > 0
}

export type RecipeStorageFields = Pick<
  Recipe,
  'storageDays' | 'storageEnv' | 'storageInstructions'
>
