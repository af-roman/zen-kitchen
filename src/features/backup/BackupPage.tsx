import { useRef, useState } from 'react'
import { z } from 'zod'
import { db } from '@/db/database'
import { clearKitchenCatalog, ensureBuiltInIngredients, markCatalogResetDone } from '@/db/seed'
import { loadSeedCatalog, seedCatalogStats } from '@/db/seed-catalog/load'
import { appAlert, appConfirm } from '@/shared/dialog'
import { Button, PageHeader, WarnBanner } from '@/shared/ui'

const backupSchema = z.object({
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

export function BackupPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function exportBackup() {
    const payload = {
      version: 2 as const,
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
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zen-kitchen-backup-${payload.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('Backup downloaded.')
  }

  async function importBackup(file: File) {
    if (
      !(await appConfirm(
        'Import will replace all local kitchen data with the backup. Continue?',
        { danger: true, confirmLabel: 'Import' },
      ))
    ) {
      return
    }
    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      const data = backupSchema.parse(json)
      await db.transaction(
        'rw',
        [
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
        ],
        async () => {
          await Promise.all([
            db.goals.clear(),
            db.ingredients.clear(),
            db.pantryItems.clear(),
            db.recipes.clear(),
            db.cookingSessions.clear(),
            db.readyBatches.clear(),
            db.servings.clear(),
            db.restocks.clear(),
            db.shoppingLists.clear(),
            db.cookLog.clear(),
            db.waste.clear(),
            db.meta.clear(),
          ])
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
        },
      )
      // Prevent the clean-slate migration from wiping a restored curated kitchen.
      await markCatalogResetDone()
      setMessage('Backup restored. Reloading…')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      console.error(e)
      setMessage(e instanceof Error ? e.message : 'Import failed')
    }
  }

  async function resetKitchen() {
    if (
      !(await appConfirm(
        'Reset kitchen data? This deletes all recipes, ingredients, pantry, sessions, meals, shopping, and cook log. Goals are kept. The starter recipe catalog is loaded again. Export a backup first if you might need this data.',
        { danger: true, confirmLabel: 'Reset' },
      ))
    ) {
      return
    }
    if (!(await appConfirm('Really wipe the kitchen catalog? This cannot be undone.', { danger: true, confirmLabel: 'Wipe' }))) {
      return
    }
    try {
      await clearKitchenCatalog()
      await markCatalogResetDone()
      await ensureBuiltInIngredients()
      await loadSeedCatalog({ replaceRecipes: true })
      setMessage('Kitchen reset and starter catalog loaded. Reloading…')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      console.error(e)
      setMessage(e instanceof Error ? e.message : 'Reset failed')
    }
  }

  async function loadStarters() {
    const stats = seedCatalogStats()
    if (
      !(await appConfirm(
        `Add the starter catalog (${stats.recipeCount} recipes, ${stats.ingredientCount} ingredients)? Existing recipes with the same name are left unchanged; new ingredients are merged by name.`,
        { confirmLabel: 'Load starters' },
      ))
    ) {
      return
    }
    try {
      const result = await loadSeedCatalog()
      await appAlert(
        `Added ${result.recipes} recipe${result.recipes === 1 ? '' : 's'} and ${result.ingredients} new ingredient${result.ingredients === 1 ? '' : 's'}.`,
        { title: 'Starter catalog' },
      )
      setMessage('Starter catalog updated. Reloading…')
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      console.error(e)
      setMessage(e instanceof Error ? e.message : 'Load failed')
    }
  }

  return (
    <div>
      <PageHeader
        title="Backup"
        subtitle="Export or restore a full JSON snapshot of your kitchen notebook."
      />
      <WarnBanner>
        Local data usually survives app updates. Backup still matters for new devices and
        cleared browser storage.
      </WarnBanner>

      <section className="mt-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4 text-sm text-ink-muted">
        <h2 className="mb-2 font-display text-lg text-accent-deep">Starter catalog workflow</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Empty kitchens load the starter recipes automatically on first open.</li>
          <li>Edit ingredients, amounts, storage, and steps in the app until they feel right.</li>
          <li>Download a backup periodically so you don’t lose work.</li>
          <li>
            When the curated backup is ready, we can promote it back into the repo seed (images as
            files, not base64).
          </li>
        </ol>
      </section>

      <div className="mt-5 space-y-3">
        <Button className="w-full" onClick={() => void exportBackup()}>
          Download backup
        </Button>
        <Button className="w-full" variant="secondary" onClick={() => void loadStarters()}>
          Load starter recipes
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
        >
          Restore from backup
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importBackup(f)
            e.target.value = ''
          }}
        />
        <Button className="w-full" variant="danger" onClick={() => void resetKitchen()}>
          Reset kitchen data
        </Button>
        {message ? <p className="text-sm text-ink-muted">{message}</p> : null}
      </div>
    </div>
  )
}
