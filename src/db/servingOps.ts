import { db } from './database'
import { removeSiblingLegsOf } from './sessionChains'
import type { Recipe, Serving, ServingItem, SessionDishPlan } from '@/domain/types'
import { isPrepRecipe } from '@/domain/kitchen'
import { maxStorageDays } from '@/domain/storage'
import {
  plannedDishAvailable,
  plannedDishExpiresAt,
  servingItemNeedsFood,
} from '@/domain/servings'
import type { ServePick } from '@/domain/servings'

async function restoreAdhocPantryUsage(item: ServingItem): Promise<void> {
  if (!item.usage?.length) return
  const now = new Date().toISOString()
  for (const u of item.usage) {
    if (!u.pantryItemId || u.amountUsed <= 0) continue
    const pantry = await db.pantryItems.get(u.pantryItemId)
    if (!pantry) continue
    await db.pantryItems.update(u.pantryItemId, {
      amountLeft: Math.round((pantry.amountLeft + u.amountUsed) * 10) / 10,
      updatedAt: now,
    })
  }
}

async function deductAdhocPantryUsage(item: ServingItem): Promise<void> {
  if (!item.usage?.length) return
  const now = new Date().toISOString()
  for (const u of item.usage) {
    if (!u.pantryItemId || u.amountUsed <= 0) continue
    const pantry = await db.pantryItems.get(u.pantryItemId)
    if (!pantry) continue
    await db.pantryItems.update(u.pantryItemId, {
      amountLeft: Math.max(0, Math.round((pantry.amountLeft - u.amountUsed) * 10) / 10),
      updatedAt: now,
    })
  }
}

export async function revertServingAllocations(serving: Serving): Promise<void> {
  for (const item of serving.items) {
    if (item.batchId) {
      const batch = await db.readyBatches.get(item.batchId)
      if (!batch) continue
      await db.readyBatches.update(item.batchId, {
        portionsLeft: batch.portionsLeft + item.portions,
        portionsPlanned: Math.max(0, batch.portionsPlanned - item.portions),
      })
    } else if (item.plannedSessionId) {
      const session = await db.cookingSessions.get(item.plannedSessionId)
      if (!session) continue
      await db.cookingSessions.update(item.plannedSessionId, {
        dishes: session.dishes.map((d) =>
          d.recipeId === item.recipeId
            ? { ...d, portionsPlanned: Math.max(0, (d.portionsPlanned ?? 0) - item.portions) }
            : d,
        ),
        updatedAt: new Date().toISOString(),
      })
    } else if (item.usage?.length) {
      await restoreAdhocPantryUsage(item)
    }
  }
}

export async function applyServingItemAllocations(items: ServingItem[]): Promise<void> {
  for (const item of items) {
    if (item.batchId) {
      const batch = await db.readyBatches.get(item.batchId)
      if (!batch) continue
      await db.readyBatches.update(item.batchId, {
        portionsPlanned: batch.portionsPlanned + item.portions,
        portionsLeft: Math.max(0, batch.portionsLeft - item.portions),
      })
    } else if (item.plannedSessionId) {
      const session = await db.cookingSessions.get(item.plannedSessionId)
      if (!session) continue
      await db.cookingSessions.update(item.plannedSessionId, {
        dishes: session.dishes.map((d) =>
          d.recipeId === item.recipeId
            ? { ...d, portionsPlanned: (d.portionsPlanned ?? 0) + item.portions }
            : d,
        ),
        updatedAt: new Date().toISOString(),
      })
    } else if (item.usage?.length) {
      await deductAdhocPantryUsage(item)
    }
  }
}

function creditPortions(items: ServingItem[] | undefined, match: (item: ServingItem) => boolean) {
  if (!items?.length) return 0
  return items.reduce((sum, item) => (match(item) ? sum + item.portions : sum), 0)
}

function creditPantryUsage(
  items: ServingItem[] | undefined,
  pantryItemId: number,
): number {
  if (!items?.length) return 0
  let sum = 0
  for (const item of items) {
    for (const u of item.usage ?? []) {
      if (u.pantryItemId === pantryItemId) sum += u.amountUsed
    }
  }
  return sum
}

export async function validateServePicks(
  picks: ServePick[],
  serveDate: string,
  recipeName: (recipeId: number) => string,
  recipeById?: Map<number, Recipe>,
  /** Portions freed when replacing an existing meal for the same slot */
  creditFromReplace?: ServingItem[],
): Promise<string[]> {
  const shortfalls: string[] = []
  /** Aggregate ad-hoc pantry demand across picks in this save. */
  const adhocDemand = new Map<number, { amount: number; label: string }>()

  for (const pick of picks) {
    if (pick.kind === 'batch') {
      const batch = await db.readyBatches.get(pick.batchId)
      const name = recipeName(batch?.recipeId ?? 0)
      if (!batch) {
        shortfalls.push(`${name}: no longer available`)
        continue
      }
      if (serveDate < batch.cookedAt) {
        shortfalls.push(`${name}: not cooked until ${batch.cookedAt}`)
        continue
      }
      if (batch.expiresAt < serveDate) {
        shortfalls.push(`${name}: expires before ${serveDate}`)
        continue
      }
      const credit = creditPortions(
        creditFromReplace,
        (item) => item.batchId === pick.batchId,
      )
      const left = batch.portionsLeft + credit
      if (pick.portions > left) {
        shortfalls.push(`${name}: need ${pick.portions} portions, only ${left} left`)
      }
    } else if (pick.kind === 'planned') {
      const session = await db.cookingSessions.get(pick.sessionId)
      const dish = session?.dishes.find((d) => d.recipeId === pick.recipeId)
      const name = recipeName(pick.recipeId)
      if (!session || !dish) {
        shortfalls.push(`${name}: planned dish no longer available`)
        continue
      }
      if (serveDate < session.date) {
        shortfalls.push(`${name}: not cooked until ${session.date}`)
        continue
      }
      const recipe = recipeById?.get(pick.recipeId)
      if (recipe && isPrepRecipe(recipe)) {
        shortfalls.push(`${name}: prep recipes go to pantry, not meals`)
        continue
      }
      if (recipe) {
        const expiresAt = plannedDishExpiresAt(session.date, maxStorageDays(recipe))
        if (serveDate > expiresAt) {
          shortfalls.push(`${name}: would be past storage on ${serveDate}`)
          continue
        }
      }
      const credit = creditPortions(
        creditFromReplace,
        (item) =>
          item.plannedSessionId === pick.sessionId && item.recipeId === pick.recipeId,
      )
      const left = plannedDishAvailable(dish.portions, dish.portionsPlanned ?? 0) + credit
      if (pick.portions > left) {
        shortfalls.push(`${name}: need ${pick.portions} portions, only ${left} left`)
      }
    } else {
      const name = pick.name.trim() || 'Other food'
      if (!pick.name.trim()) {
        shortfalls.push('Other food: name is required')
        continue
      }
      if (pick.portions <= 0) {
        shortfalls.push(`${name}: portions must be greater than zero`)
        continue
      }
      for (const u of pick.usage ?? []) {
        if (!u.pantryItemId || u.amountUsed <= 0) {
          shortfalls.push(`${name}: each pantry line needs an item and amount`)
          continue
        }
        const prev = adhocDemand.get(u.pantryItemId)
        adhocDemand.set(u.pantryItemId, {
          amount: (prev?.amount ?? 0) + u.amountUsed,
          label: name,
        })
      }
    }
  }

  for (const [pantryItemId, demand] of adhocDemand) {
    const pantry = await db.pantryItems.get(pantryItemId)
    if (!pantry) {
      shortfalls.push(`${demand.label}: a pantry item is no longer available`)
      continue
    }
    const credit = creditPantryUsage(creditFromReplace, pantryItemId)
    const left = pantry.amountLeft + credit
    if (demand.amount > left + 1e-9) {
      shortfalls.push(
        `${demand.label}: need ${Math.round(demand.amount * 10) / 10}, only ${
          Math.round(left * 10) / 10
        } left in pantry`,
      )
    }
  }

  return shortfalls
}

export async function findServingsForMeal(date: string, meal: Serving['meal']) {
  const onDay = await db.servings.where('date').equals(date).toArray()
  return onDay.filter((s) => s.meal === meal)
}

/** Revert allocations and delete every serving for this date + meal slot. */
export async function clearServingsForMeal(date: string, meal: Serving['meal']) {
  const existing = await findServingsForMeal(date, meal)
  for (const serving of existing) {
    await revertServingAllocations(serving)
    if (serving.id != null) await db.servings.delete(serving.id)
  }
  return existing.length
}

/**
 * Keep the newest serving per date+meal; revert and delete older duplicates.
 * Fixes legacy data from before one-meal-per-slot was enforced.
 */
export async function consolidateDuplicateMealSlots(): Promise<number> {
  const all = await db.servings.toArray()
  const groups = new Map<string, Serving[]>()
  for (const s of all) {
    const key = `${s.date}|${s.meal}`
    const list = groups.get(key) ?? []
    list.push(s)
    groups.set(key, list)
  }

  let removed = 0
  for (const [, list] of groups) {
    if (list.length <= 1) continue
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const older of sorted.slice(0, -1)) {
      await revertServingAllocations(older)
      if (older.id != null) await db.servings.delete(older.id)
      removed += 1
    }
  }
  return removed
}

/** Persist needsFood on items whose session/batch no longer exists. */
export async function healOrphanedServingItems(): Promise<number> {
  const [servings, sessions, batches] = await Promise.all([
    db.servings.toArray(),
    db.cookingSessions.toArray(),
    db.readyBatches.toArray(),
  ])
  const sessionById = new Map(
    sessions.filter((s) => s.id != null).map((s) => [s.id!, s]),
  )
  const batchIds = new Set(
    batches.map((b) => b.id).filter((id): id is number => id != null),
  )

  let healed = 0
  for (const serving of servings) {
    if (serving.id == null) continue
    let changed = false
    const items = serving.items.map((item) => {
      if (servingItemNeedsFood(item, sessionById, batchIds) && !item.needsFood) {
        changed = true
        healed += 1
        return { ...item, needsFood: true }
      }
      return item
    })
    if (changed) await db.servings.update(serving.id, { items })
  }
  return healed
}

export async function deleteCookingSession(
  sessionId: number,
  mode: 'keep-meals' | 'remove-meals',
): Promise<void> {
  const batches = (await db.readyBatches.toArray()).filter((b) => b.sessionId === sessionId)
  const batchIds = new Set(
    batches.map((b) => b.id).filter((id): id is number => id != null),
  )

  const isFromSession = (item: ServingItem) =>
    item.plannedSessionId === sessionId ||
    (item.batchId != null && batchIds.has(item.batchId))

  const allServings = await db.servings.toArray()
  const affected = allServings.filter(
    (s) => s.sessionId === sessionId || s.items.some(isFromSession),
  )

  if (mode === 'remove-meals') {
    for (const s of affected) {
      if (s.id == null) continue
      const remaining = s.items.filter((i) => !isFromSession(i))
      if (remaining.length === 0) await db.servings.delete(s.id)
      else await db.servings.update(s.id, { items: remaining, sessionId: undefined })
    }
    for (const b of batches) {
      if (b.id != null) await db.readyBatches.delete(b.id)
    }
  } else {
    for (const s of affected) {
      if (s.id == null) continue
      const items = s.items.map((i) =>
        isFromSession(i) ? { ...i, needsFood: true } : i,
      )
      const next: Serving = { ...s, items }
      if (s.sessionId === sessionId) delete next.sessionId
      await db.servings.put(next)
    }
  }

  const session = await db.cookingSessions.get(sessionId)
  await db.cookingSessions.delete(sessionId)
  // A cook day going away leaves its prep legs pointless.
  if (session) await removeSiblingLegsOf(session)
}

/** Abandon an active cook: restore pantry, discard progress, no Ready/prep/log. */
export async function cancelActiveCookingSession(sessionId: number): Promise<void> {
  const session = await db.cookingSessions.get(sessionId)
  if (!session) return
  if (session.status !== 'active') {
    throw new Error('Only an active cooking session can be canceled.')
  }

  const now = new Date().toISOString()

  for (const dish of session.dishes) {
    if (!dish.completed) continue
    for (const u of dish.usage ?? []) {
      if (!u.pantryItemId || u.amountUsed <= 0) continue
      const item = await db.pantryItems.get(u.pantryItemId)
      if (!item) continue
      await db.pantryItems.update(u.pantryItemId, {
        amountLeft: Math.round((item.amountLeft + u.amountUsed) * 10) / 10,
        updatedAt: now,
      })
    }
  }

  const resetDishes: SessionDishPlan[] = session.dishes.map((d) => ({
    recipeId: d.recipeId,
    portions: d.portions,
    ...(d.portionsPlanned != null ? { portionsPlanned: d.portionsPlanned } : {}),
    ...(d.stageDaysAhead != null ? { stageDaysAhead: d.stageDaysAhead } : {}),
    ...(d.chainId != null ? { chainId: d.chainId } : {}),
  }))

  await db.cookingSessions.update(sessionId, {
    status: 'planned',
    dishes: resetDishes,
    notes: '',
    startedAt: undefined,
    finishedAt: undefined,
    updatedAt: now,
  })
}
