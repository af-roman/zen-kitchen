import { db } from './database'
import type { Recipe } from '@/domain/types'

/** Keep the canonical row when multiple share the same lowercase name. */
function pickCanonicalIngredientId(ids: number[], rows: Map<number, { id?: number; createdAt: string }>): number {
  return [...ids].sort((a, b) => {
    const ca = rows.get(a)?.createdAt ?? ''
    const cb = rows.get(b)?.createdAt ?? ''
    if (ca !== cb) return ca.localeCompare(cb)
    return a - b
  })[0]
}

function pickCanonicalRecipeId(ids: number[], rows: Map<number, Recipe>): number {
  return [...ids].sort((a, b) => {
    const sa = rows.get(a)?.seeded ? 0 : 1
    const sb = rows.get(b)?.seeded ? 0 : 1
    if (sa !== sb) return sa - sb
    const ca = rows.get(a)?.createdAt ?? ''
    const cb = rows.get(b)?.createdAt ?? ''
    if (ca !== cb) return ca.localeCompare(cb)
    return a - b
  })[0]
}

async function remapIngredientId(fromId: number, toId: number): Promise<void> {
  if (fromId === toId) return

  for (const item of await db.pantryItems.where('ingredientId').equals(fromId).toArray()) {
    if (item.id != null) await db.pantryItems.update(item.id, { ingredientId: toId })
  }

  for (const recipe of await db.recipes.toArray()) {
    if (recipe.id == null) continue
    let changed = false
    const ingredients = recipe.ingredients.map((line) => {
      if (line.ingredientId !== fromId) return line
      changed = true
      return { ...line, ingredientId: toId }
    })
    const yieldIngredientId =
      recipe.yieldIngredientId === fromId ? toId : recipe.yieldIngredientId
    if (changed || yieldIngredientId !== recipe.yieldIngredientId) {
      await db.recipes.update(recipe.id, { ingredients, yieldIngredientId })
    }
  }

  for (const restock of await db.restocks.toArray()) {
    if (restock.id == null) continue
    if (!restock.lines.some((l) => l.ingredientId === fromId)) continue
    await db.restocks.update(restock.id, {
      lines: restock.lines.map((l) =>
        l.ingredientId === fromId ? { ...l, ingredientId: toId } : l,
      ),
    })
  }

  for (const list of await db.shoppingLists.toArray()) {
    if (list.id == null) continue
    if (!list.items.some((i) => i.ingredientId === fromId)) continue
    await db.shoppingLists.update(list.id, {
      items: list.items.map((i) =>
        i.ingredientId === fromId ? { ...i, ingredientId: toId } : i,
      ),
    })
  }

  for (const entry of await db.cookLog.toArray()) {
    if (entry.id == null) continue
    if (!entry.dishes.some((d) => d.usage.some((u) => u.ingredientId === fromId))) continue
    await db.cookLog.update(entry.id, {
      dishes: entry.dishes.map((d) => ({
        ...d,
        usage: d.usage.map((u) =>
          u.ingredientId === fromId ? { ...u, ingredientId: toId } : u,
        ),
      })),
    })
  }

  for (const serving of await db.servings.toArray()) {
    if (serving.id == null) continue
    if (!serving.items.some((i) => i.usage?.some((u) => u.ingredientId === fromId))) continue
    await db.servings.update(serving.id, {
      items: serving.items.map((i) =>
        i.usage?.some((u) => u.ingredientId === fromId)
          ? {
              ...i,
              usage: i.usage!.map((u) =>
                u.ingredientId === fromId ? { ...u, ingredientId: toId } : u,
              ),
            }
          : i,
      ),
    })
  }
}

async function remapRecipeId(fromId: number, toId: number): Promise<void> {
  if (fromId === toId) return

  for (const batch of await db.readyBatches.where('recipeId').equals(fromId).toArray()) {
    if (batch.id != null) await db.readyBatches.update(batch.id, { recipeId: toId })
  }

  for (const session of await db.cookingSessions.toArray()) {
    if (session.id == null) continue
    if (!session.dishes.some((d) => d.recipeId === fromId)) continue
    await db.cookingSessions.update(session.id, {
      dishes: session.dishes.map((d) =>
        d.recipeId === fromId ? { ...d, recipeId: toId } : d,
      ),
    })
  }

  for (const serving of await db.servings.toArray()) {
    if (serving.id == null) continue
    if (!serving.items.some((i) => i.recipeId === fromId)) continue
    await db.servings.update(serving.id, {
      items: serving.items.map((i) =>
        i.recipeId === fromId ? { ...i, recipeId: toId } : i,
      ),
    })
  }

  for (const entry of await db.cookLog.toArray()) {
    if (entry.id == null) continue
    if (!entry.dishes.some((d) => d.recipeId === fromId)) continue
    await db.cookLog.update(entry.id, {
      dishes: entry.dishes.map((d) =>
        d.recipeId === fromId ? { ...d, recipeId: toId } : d,
      ),
    })
  }

  for (const w of await db.waste.where('recipeId').equals(fromId).toArray()) {
    if (w.id != null) await db.waste.update(w.id, { recipeId: toId })
  }
}

/** Merge duplicate ingredients (same name, case-insensitive). */
export async function dedupeIngredients(): Promise<number> {
  const all = await db.ingredients.toArray()
  const byName = new Map<string, number[]>()
  const rowById = new Map(all.filter((i) => i.id != null).map((i) => [i.id!, i]))

  for (const ing of all) {
    if (ing.id == null) continue
    const key = ing.name.toLowerCase()
    const list = byName.get(key) ?? []
    list.push(ing.id)
    byName.set(key, list)
  }

  let removed = 0
  for (const ids of byName.values()) {
    if (ids.length < 2) continue
    const keep = pickCanonicalIngredientId(ids, rowById)
    for (const dup of ids) {
      if (dup === keep) continue
      await remapIngredientId(dup, keep)
      await db.ingredients.delete(dup)
      removed += 1
    }
  }
  return removed
}

/** Merge duplicate recipes (same name, case-insensitive). */
export async function dedupeRecipes(): Promise<number> {
  const all = await db.recipes.toArray()
  const byName = new Map<string, number[]>()
  const rowById = new Map(all.filter((r) => r.id != null).map((r) => [r.id!, r]))

  for (const recipe of all) {
    if (recipe.id == null) continue
    const key = recipe.name.toLowerCase()
    const list = byName.get(key) ?? []
    list.push(recipe.id)
    byName.set(key, list)
  }

  let removed = 0
  for (const ids of byName.values()) {
    if (ids.length < 2) continue
    const keep = pickCanonicalRecipeId(ids, rowById)
    for (const dup of ids) {
      if (dup === keep) continue
      await remapRecipeId(dup, keep)
      await db.recipes.delete(dup)
      removed += 1
    }
  }
  return removed
}

/** Merge duplicate Starter pantry rows per ingredient (seed double-runs). */
export async function dedupeStarterPantry(): Promise<number> {
  const starter = (await db.pantryItems.toArray()).filter((p) => p.brand === 'Starter')
  const byIngredient = new Map<number, typeof starter>()
  for (const row of starter) {
    const list = byIngredient.get(row.ingredientId) ?? []
    list.push(row)
    byIngredient.set(row.ingredientId, list)
  }

  let removed = 0
  for (const rows of byIngredient.values()) {
    if (rows.length < 2) continue
    rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    const keep = rows[0]
    if (keep.id == null) continue
    const total = rows.reduce((sum, r) => sum + r.amountLeft, 0)
    await db.pantryItems.update(keep.id, {
      amountLeft: Math.round(total * 10) / 10,
      updatedAt: new Date().toISOString(),
    })
    for (const dup of rows.slice(1)) {
      if (dup.id != null) {
        await db.pantryItems.delete(dup.id)
        removed += 1
      }
    }
  }
  return removed
}

export async function dedupeSeedDatabase(): Promise<void> {
  await dedupeIngredients()
  await dedupeRecipes()
  await dedupeStarterPantry()
}

/** One-time renames so prep recipes do not share ingredient names. */
export async function migrateLegacySeedNames(): Promise<void> {
  const renames: { from: string; to: string }[] = [
    { from: 'All-purpose miso sauce', to: 'Homemade all-purpose miso sauce' },
  ]

  for (const { from, to } of renames) {
    const fromKey = from.toLowerCase()
    const toKey = to.toLowerCase()
    const candidates = await db.recipes.toArray()
    const oldRow = candidates.find(
      (r) =>
        r.name.toLowerCase() === fromKey &&
        r.seeded &&
        (r.recipeKind === 'prep' || r.yieldIngredientId != null),
    )
    if (!oldRow?.id) continue

    const newRow = candidates.find((r) => r.name.toLowerCase() === toKey)
    if (newRow?.id && newRow.id !== oldRow.id) {
      await remapRecipeId(oldRow.id, newRow.id)
      await db.recipes.delete(oldRow.id)
    } else {
      await db.recipes.update(oldRow.id, {
        name: to,
        updatedAt: new Date().toISOString(),
      })
    }
  }
}
