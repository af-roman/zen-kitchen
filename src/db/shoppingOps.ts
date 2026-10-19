import { db } from '@/db/database'
import type { Ingredient, ShoppingListItem } from '@/domain/types'
import { isAlwaysAvailable, uid } from '@/domain/kitchen'
import {
  reservedIngredientUsage,
  sessionIngredientNeeds,
  stockTotals,
} from '@/domain/recipeMath'
import type { CookingSession, Recipe } from '@/domain/types'

export async function ensureOpenShoppingList(): Promise<number> {
  const open = await db.shoppingLists.where('status').equals('open').first()
  if (open?.id != null) return open.id
  const now = new Date().toISOString()
  return db.shoppingLists.add({
    items: [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
  })
}

/** Round need up to pack size when packSize is set. */
export function roundUpToPack(need: number, packSize?: number): number {
  if (!(packSize != null && packSize > 0)) return Math.max(0, Math.round(need * 10) / 10)
  if (need <= 0) return 0
  return Math.ceil(need / packSize) * packSize
}

export type ShortfallLine = {
  ingredientId: number
  need: number
  have: number
  buy: number
  packs?: number
}

/**
 * Ingredient shortfalls for a session: need − (onHand − reserved by others).
 */
export function sessionShortfalls(
  session: CookingSession,
  sessions: CookingSession[],
  recipeById: Map<number, Recipe>,
  pantry: { ingredientId: number; amountLeft: number }[],
  ingredientById: Map<number, Ingredient>,
  today: string,
): ShortfallLine[] {
  const stock = stockTotals(pantry)
  const needs = sessionIngredientNeeds(session, recipeById, ingredientById)
  const reserved = reservedIngredientUsage(
    sessions,
    recipeById,
    today,
    session.date,
    session.id,
    ingredientById,
  )
  const lines: ShortfallLine[] = []
  for (const [ingredientId, need] of needs) {
    const ing = ingredientById.get(ingredientId)
    if (isAlwaysAvailable(ing)) continue
    const onHand = stock.get(ingredientId) ?? 0
    const reservedAmt = reserved.get(ingredientId) ?? 0
    const have = Math.max(0, onHand - reservedAmt)
    const deficit = need - have
    if (deficit <= 0.05) continue
    const buy = roundUpToPack(deficit, ing?.packSize)
    lines.push({
      ingredientId,
      need: Math.round(need * 10) / 10,
      have: Math.round(have * 10) / 10,
      buy,
      packs:
        ing?.packSize && ing.packSize > 0
          ? Math.round((buy / ing.packSize) * 10) / 10
          : undefined,
    })
  }
  return lines
}

/**
 * Merge shortfall lines into the open shopping list.
 * Updates amount if ingredient already present; otherwise appends.
 */
export async function addShortfallsToShopping(
  lines: ShortfallLine[],
): Promise<{ added: number; updated: number; listId: number }> {
  const listId = await ensureOpenShoppingList()
  const list = (await db.shoppingLists.get(listId))!
  const items = [...list.items]
  let added = 0
  let updated = 0
  for (const line of lines) {
    if (line.buy <= 0) continue
    const existing = items.find((i) => i.ingredientId === line.ingredientId)
    if (existing) {
      existing.amount = Math.max(existing.amount, line.buy)
      if (line.packs != null && line.packs > 0) {
        existing.notes = `≈ ${line.packs} pack${line.packs === 1 ? '' : 's'} (need ${line.need})`
      }
      updated++
    } else {
      const item: ShoppingListItem = {
        id: uid(),
        ingredientId: line.ingredientId,
        amount: line.buy,
        brand: '',
        cost: 0,
        store: '',
        notes:
          line.packs != null && line.packs > 0
            ? `≈ ${line.packs} pack${line.packs === 1 ? '' : 's'} (need ${line.need})`
            : `need ${line.need}`,
      }
      items.push(item)
      added++
    }
  }
  await db.shoppingLists.update(listId, {
    items,
    updatedAt: new Date().toISOString(),
  })
  return { added, updated, listId }
}
