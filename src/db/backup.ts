import { z } from 'zod'
import { db } from '@/db/database'
import { markCatalogResetDone } from '@/db/seed'

export const BACKUP_VERSION = 2 as const

export const backupSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string(),
  goals: z.array(z.any()),
  ingredients: z.array(z.any()),
  pantryItems: z.array(z.any()),
  recipes: z.array(z.any()),
  cookingSessions: z.array(z.any()),
  readyBatches: z.array(z.any()),
  servings: z.array(z.any()),
  restocks: z.array(z.any()),
  shoppingLists: z.array(z.any()).optional().default([]),
  cookLog: z.array(z.any()),
  waste: z.array(z.any()),
  meta: z.array(z.any()),
})

export type KitchenBackup = z.infer<typeof backupSchema>

const ALL_TABLES = [
  db.goals,
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
  db.meta,
] as const

/** True while a restore/pull is writing IndexedDB (skip dirty hooks). */
let applyingBackup = false

export function isApplyingBackup() {
  return applyingBackup
}

export async function exportKitchenBackup(): Promise<KitchenBackup> {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    goals: await db.goals.toArray(),
    ingredients: await db.ingredients.toArray(),
    pantryItems: await db.pantryItems.toArray(),
    recipes: await db.recipes.toArray(),
    cookingSessions: await db.cookingSessions.toArray(),
    readyBatches: await db.readyBatches.toArray(),
    servings: await db.servings.toArray(),
    restocks: await db.restocks.toArray(),
    shoppingLists: await db.shoppingLists.toArray(),
    cookLog: await db.cookLog.toArray(),
    waste: await db.waste.toArray(),
    meta: await db.meta.toArray(),
  }
}

export function parseKitchenBackup(json: unknown): KitchenBackup {
  return backupSchema.parse(json)
}

/**
 * Replace all kitchen tables with a snapshot.
 * Does not reload the page — callers decide.
 */
export async function importKitchenBackup(data: KitchenBackup): Promise<void> {
  applyingBackup = true
  try {
    await db.transaction('rw', ALL_TABLES, async () => {
      await Promise.all(ALL_TABLES.map((t) => t.clear()))
      await db.goals.bulkAdd(data.goals)
      await db.ingredients.bulkAdd(data.ingredients)
      await db.pantryItems.bulkAdd(data.pantryItems)
      await db.recipes.bulkAdd(data.recipes)
      await db.cookingSessions.bulkAdd(data.cookingSessions)
      await db.readyBatches.bulkAdd(data.readyBatches)
      await db.servings.bulkAdd(data.servings)
      await db.restocks.bulkAdd(data.restocks)
      if (data.shoppingLists.length) await db.shoppingLists.bulkAdd(data.shoppingLists)
      await db.cookLog.bulkAdd(data.cookLog)
      await db.waste.bulkAdd(data.waste)
      await db.meta.bulkAdd(data.meta)
    })
    // Prevent the clean-slate migration from wiping a restored curated kitchen.
    await markCatalogResetDone()
  } finally {
    applyingBackup = false
  }
}

export function downloadKitchenBackup(payload: KitchenBackup) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zen-kitchen-backup-${payload.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
