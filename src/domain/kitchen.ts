import { addDays, format, parseISO } from 'date-fns'
import type { Recipe, StorageEnv } from './types'

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
  let available = 0
  for (const line of recipe.ingredients) {
    const have = stockByIngredient.get(line.ingredientId) ?? 0
    if (have >= line.amount) available += 1
  }
  const needed = recipe.ingredients.length
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
