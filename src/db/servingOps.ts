import { db } from './database'
import type { Recipe, Serving, ServingItem } from '@/domain/types'
import {
  plannedDishAvailable,
  plannedDishExpiresAt,
  servingItemNeedsFood,
} from '@/domain/servings'
import type { ServePick } from '@/domain/servings'

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
    }
  }
}

function creditPortions(items: ServingItem[] | undefined, match: (item: ServingItem) => boolean) {
  if (!items?.length) return 0
  return items.reduce((sum, item) => (match(item) ? sum + item.portions : sum), 0)
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
    } else {
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
      if (recipe) {
        const expiresAt = plannedDishExpiresAt(session.date, recipe.storageDays)
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
    }
  }

  return shortfalls
}

export async function findServingsForMeal(date: string, meal: Serving['meal']) {
  const onDay = await db.servings.where('date').equals(date).toArray()
  return onDay.filter((s) => s.meal === meal)
}

export async function findServingForMeal(date: string, meal: Serving['meal']) {
  const all = await findServingsForMeal(date, meal)
  return all[0]
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

  await db.cookingSessions.delete(sessionId)
}
