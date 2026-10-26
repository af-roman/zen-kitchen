import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  downloadKitchenBackup,
  exportKitchenBackup,
  importKitchenBackup,
  parseKitchenBackup,
} from '@/db/backup'
import { clearKitchenCatalog, ensureBuiltInIngredients, markCatalogResetDone } from '@/db/seed'
import { loadSeedCatalog, seedCatalogStats } from '@/db/seed-catalog/load'
import { CloudSyncPanel } from '@/features/backup/CloudSyncPanel'
import { appAlert, appConfirm } from '@/shared/dialog'
import { Button, PageHeader, WarnBanner } from '@/shared/ui'

export function BackupPage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function exportBackup() {
    const payload = await exportKitchenBackup()
    downloadKitchenBackup(payload)
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
      const data = parseKitchenBackup(json)
      await importKitchenBackup(data)
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
        title="Backup & sync"
        subtitle="Cloud sync across your devices, or export a full JSON snapshot."
        actions={
          <Button variant="secondary" onClick={() => navigate('/more')}>
            Back
          </Button>
        }
      />
      <WarnBanner>
        Local data usually survives app updates. Cloud sync (or a downloaded backup) matters for
        phones, new browsers, and cleared storage.
      </WarnBanner>

      <CloudSyncPanel />

      <section className="mt-5 card-elevated p-4 text-sm text-ink-muted">
        <h2 className="mb-2 font-display text-lg text-ink">Starter catalog workflow</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Empty kitchens load the starter recipes automatically on first open.</li>
          <li>Edit ingredients, amounts, storage, and steps in the app until they feel right.</li>
          <li>Sync to the cloud (or download a backup) so you don’t lose work.</li>
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
