import { db } from '@/db/database'
import type { Ingredient, Restock, ShopHorizon, ShoppingListItem } from '@/domain/types'
import { isAlwaysAvailable, uid } from '@/domain/kitchen'
import { lastUnitCost, money } from '@/domain/lotCost'
import { buyAmountForShortfall, roundUpToPack } from '@/domain/shoppingMath'
import {
  reservedIngredientUsage,
  sessionIngredientNeeds,
  stockTotals,
} from '@/domain/recipeMath'
import type { CookingSession, Recipe } from '@/domain/types'

export { roundUpToPack, buyAmountForShortfall }

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

export type ShortfallLine = {
  ingredientId: number
  need: number
  have: number
  buy: number
  packs?: number
}

/**
 * Ingredient shortfalls for a session: cover the cook deficit (pack-rounded).
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
    const buy = buyAmountForShortfall({
      need,
      have,
      packSize: ing?.packSize,
    })
    if (buy <= 0) continue
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
      existing.source = 'plan'
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
        source: 'plan',
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

/** Unfinished cooks inside the shop horizon, earliest first. */
export function sessionsInHorizon(
  sessions: CookingSession[],
  today: string,
  horizon: ShopHorizon,
  throughDate: string,
): CookingSession[] {
  const upcoming = sessions
    .filter((s) => s.status !== 'done' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (horizon === 'next') return upcoming.slice(0, 1)
  return upcoming.filter((s) => s.date <= throughDate)
}

/**
 * Combined buy list for every cook in the horizon.
 * Needs are summed once so a single shop covers the whole range.
 */
export function horizonShortfalls(
  sessions: CookingSession[],
  recipeById: Map<number, Recipe>,
  pantry: { ingredientId: number; amountLeft: number }[],
  ingredientById: Map<number, Ingredient>,
  today: string,
  horizon: ShopHorizon,
  throughDate: string,
): ShortfallLine[] {
  const inRange = sessionsInHorizon(sessions, today, horizon, throughDate)
  const needs = new Map<number, number>()
  for (const session of inRange) {
    for (const [ingredientId, amount] of sessionIngredientNeeds(
      session,
      recipeById,
      ingredientById,
    )) {
      needs.set(ingredientId, (needs.get(ingredientId) ?? 0) + amount)
    }
  }
  const stock = stockTotals(pantry)
  const lines: ShortfallLine[] = []
  for (const [ingredientId, need] of needs) {
    const ing = ingredientById.get(ingredientId)
    if (isAlwaysAvailable(ing)) continue
    const have = stock.get(ingredientId) ?? 0
    const buy = buyAmountForShortfall({
      need,
      have,
      packSize: ing?.packSize,
    })
    if (buy <= 0) continue
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

let syncChain: Promise<void> = Promise.resolve()

/**
 * Rebuild plan-sourced rows from the horizon. Keeps store, brand, and a
 * hand-entered unit price. Manual rows stay. Lines no longer needed drop off.
 */
export function syncPlanShopping(input: {
  horizon: ShopHorizon
  throughDate: string
  today: string
  sessions: CookingSession[]
  recipes: Recipe[]
  ingredients: Ingredient[]
  pantry: { ingredientId: number; amountLeft: number }[]
  restocks: Restock[]
}): Promise<void> {
  const run = syncChain.then(() => syncPlanShoppingInner(input))
  syncChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function syncPlanShoppingInner(input: {
  horizon: ShopHorizon
  throughDate: string
  today: string
  sessions: CookingSession[]
  recipes: Recipe[]
  ingredients: Ingredient[]
  pantry: { ingredientId: number; amountLeft: number }[]
  restocks: Restock[]
}): Promise<void> {
  const recipeById = new Map(input.recipes.filter((r) => r.id != null).map((r) => [r.id!, r]))
  const ingredientById = new Map(
    input.ingredients.filter((i) => i.id != null).map((i) => [i.id!, i]),
  )
  const lines = horizonShortfalls(
    input.sessions,
    recipeById,
    input.pantry,
    ingredientById,
    input.today,
    input.horizon,
    input.throughDate,
  )
  const needed = new Set(lines.map((l) => l.ingredientId))
  const listId = await ensureOpenShoppingList()
  const list = (await db.shoppingLists.get(listId))!
  let items = list.items.filter(
    (item) =>
      !isAlwaysAvailable(ingredientById.get(item.ingredientId)) &&
      (item.source !== 'plan' || needed.has(item.ingredientId)),
  )

  for (const line of lines) {
    const note =
      line.packs != null && line.packs > 0
        ? `≈ ${line.packs} pack${line.packs === 1 ? '' : 's'} (need ${line.need})`
        : `need ${line.need}`
    const history = lastUnitCost(input.restocks, line.ingredientId)
    const existing = items.find((item) => item.ingredientId === line.ingredientId)
    if (existing) {
      if (existing.amount > 0 && existing.cost > 0) {
        existing.cost = money((existing.cost / existing.amount) * line.buy)
      } else if (history != null) {
        existing.cost = money(history * line.buy)
      }
      existing.amount = line.buy
      existing.source = 'plan'
      existing.notes = note
    } else {
      const item: ShoppingListItem = {
        id: uid(),
        ingredientId: line.ingredientId,
        amount: line.buy,
        brand: '',
        cost: history != null ? money(history * line.buy) : 0,
        store: '',
        notes: note,
        source: 'plan',
      }
      items.push(item)
    }
  }

  await db.shoppingLists.update(listId, {
    items,
    horizon: input.horizon,
    horizonDate: input.throughDate,
    updatedAt: new Date().toISOString(),
  })
}
