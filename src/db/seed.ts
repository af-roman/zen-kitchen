import { db } from './database'
import { dedupeSeedDatabase } from './seed-dedupe'
import type { Meta } from '@/domain/types'

const SCHEMA_VERSION = 1

const KITCHEN_TABLES = [
  db.ingredients,
  db.pantryItems,
  db.recipes,
  db.cookingSessions,
  db.readyBatches,
  db.servings,
  db.restocks,
  db.shoppingLists,
  db.cookLog,
  db.waste,
] as const

/** Clear recipes, ingredients, and all dependent kitchen data. Keeps goals + meta. */
export async function clearKitchenCatalog(): Promise<void> {
  await db.transaction('rw', [...KITCHEN_TABLES], async () => {
    await Promise.all(KITCHEN_TABLES.map((table) => table.clear()))
  })
}

async function ensureGoals(): Promise<void> {
  const existingGoals = await db.goals.get(1)
  if (!existingGoals) {
    await db.goals.put({
      id: 1,
      dailyKcal: 2000,
      carbsPct: 40,
      proteinPct: 30,
      fatPct: 30,
    })
  }
}

async function readMeta(): Promise<Meta | undefined> {
  return db.meta.get(1)
}

async function writeMeta(patch: Partial<Omit<Meta, 'id'>>): Promise<void> {
  const existing = await readMeta()
  const now = new Date().toISOString()
  await db.meta.put({
    id: 1,
    schemaVersion: existing?.schemaVersion ?? SCHEMA_VERSION,
    seededAt: existing?.seededAt ?? now,
    catalogResetAt: existing?.catalogResetAt,
    ...patch,
  })
}

/**
 * One-shot wipe of the old auto-seeded catalog for installs that never ran
 * the clean-slate migration. New installs just get the flag stamped.
 */
async function ensureCatalogReset(): Promise<void> {
  const meta = await readMeta()
  if (meta?.catalogResetAt) return

  const [ingredientCount, recipeCount] = await Promise.all([
    db.ingredients.count(),
    db.recipes.count(),
  ])

  // Existing kitchens (or any leftover seed) get a full catalog wipe once.
  if (ingredientCount > 0 || recipeCount > 0 || meta?.seededAt) {
    await clearKitchenCatalog()
  }

  await writeMeta({
    schemaVersion: SCHEMA_VERSION,
    catalogResetAt: new Date().toISOString(),
    seededAt: meta?.seededAt ?? new Date().toISOString(),
  })
}

/**
 * Lightweight boot: goals defaults, one-shot catalog reset, optional name dedupe.
 * Does not insert recipes or ingredients from seed files.
 */
export async function ensureSeeded(): Promise<void> {
  await ensureGoals()
  await ensureCatalogReset()
  await dedupeSeedDatabase()
  await writeMeta({ schemaVersion: SCHEMA_VERSION })
}

/** Stamp catalogResetAt so a restored backup is not wiped on the next boot. */
export async function markCatalogResetDone(): Promise<void> {
  const meta = await readMeta()
  if (meta?.catalogResetAt) return
  await writeMeta({ catalogResetAt: new Date().toISOString() })
}
