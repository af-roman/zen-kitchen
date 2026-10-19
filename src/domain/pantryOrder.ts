import type { Ingredient, PantryItem } from '@/domain/types'
import { addDays, format, parseISO } from 'date-fns'
import { todayISO } from '@/domain/kitchen'

/** Sooner expiry first; missing expiry sorts last. */
export function sortPantryByExpiry(items: PantryItem[]): PantryItem[] {
  return [...items].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate)
    if (a.expiryDate) return -1
    if (b.expiryDate) return 1
    return (b.amountLeft ?? 0) - (a.amountLeft ?? 0)
  })
}

export function pantryCandidatesForIngredient(
  pantry: PantryItem[],
  ingredientId: number,
): PantryItem[] {
  return sortPantryByExpiry(
    pantry.filter((p) => p.ingredientId === ingredientId && p.amountLeft > 0),
  )
}

/** Suggested expiry when restocking: today + rawFridgeDays if set. */
export function suggestedExpiryFromIngredient(
  ing: Pick<Ingredient, 'rawFridgeDays'> | undefined,
): string | undefined {
  if (!ing?.rawFridgeDays || ing.rawFridgeDays <= 0) return undefined
  return format(addDays(parseISO(todayISO()), ing.rawFridgeDays), 'yyyy-MM-dd')
}

/** Days until expiry; null if unknown. Negative = past. */
export function daysUntilPantryExpiry(item: PantryItem, today = todayISO()): number | null {
  if (!item.expiryDate) return null
  return Math.round(
    (parseISO(item.expiryDate).getTime() - parseISO(today).getTime()) / 86400000,
  )
}
