import type { ReactNode } from 'react'
import type { StorageEnv } from '@/domain/types'
import { formatStorageSummary } from '@/domain/storage'
import { Field, inputClass } from '@/shared/ui'

export function RecipeStoragePanel({
  storageDays,
  storageEnv,
  storageInstructions,
}: {
  storageDays: number
  storageEnv: StorageEnv
  storageInstructions?: string
}) {
  return (
    <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
      <h2 className="mb-3 text-lg">Storage</h2>
      <p className="mb-3 text-sm font-medium text-ink">
        {formatStorageSummary({ storageDays, storageEnv })}
      </p>
      {storageInstructions?.trim() ? (
        <p className="whitespace-pre-wrap text-sm text-ink-muted">{storageInstructions.trim()}</p>
      ) : (
        <p className="text-sm text-ink-muted">No extra storage notes.</p>
      )}
    </section>
  )
}

export function RecipeStorageFields({
  storageDays,
  storageEnv,
  storageInstructions,
  onStorageDaysChange,
  onStorageEnvChange,
  onStorageInstructionsChange,
  footer,
}: {
  storageDays: number
  storageEnv: StorageEnv
  storageInstructions: string
  onStorageDaysChange: (days: number) => void
  onStorageEnvChange: (env: StorageEnv) => void
  onStorageInstructionsChange: (text: string) => void
  footer?: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
      <h2 className="text-lg">Storage</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Keeps (days)">
          <input
            className={inputClass}
            type="number"
            min={1}
            value={storageDays}
            onChange={(e) => onStorageDaysChange(Number(e.target.value))}
          />
        </Field>
        <Field label="Where">
          <select
            className={inputClass}
            value={storageEnv}
            onChange={(e) => onStorageEnvChange(e.target.value as StorageEnv)}
          >
            <option value="fridge">Fridge</option>
            <option value="freezer">Freezer</option>
            <option value="room">Room temperature</option>
          </select>
        </Field>
      </div>
      <Field
        label="Storage instructions"
        hint="Optional notes — container, reheating, freezing tips, etc."
      >
        <textarea
          className={inputClass}
          rows={3}
          value={storageInstructions}
          placeholder="e.g. Cool completely, store in an airtight container…"
          onChange={(e) => onStorageInstructionsChange(e.target.value)}
        />
      </Field>
      {footer}
    </section>
  )
}
