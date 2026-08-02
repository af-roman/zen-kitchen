import type { ReactNode } from 'react'
import { formatStorageSummary } from '@/domain/storage'
import { AutoTextarea, Field, inputClass } from '@/shared/ui'

export function RecipeStoragePanel({
  fridgeDays,
  freezerDays,
  storageDays,
  storageEnv,
  storageInstructions,
}: {
  fridgeDays?: number
  freezerDays?: number
  /** @deprecated legacy */
  storageDays?: number
  /** @deprecated legacy */
  storageEnv?: 'fridge' | 'freezer' | 'room'
  storageInstructions?: string
}) {
  return (
    <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
      <h2 className="mb-3 text-lg">Storage</h2>
      <p className="mb-3 text-sm font-medium text-ink">
        {formatStorageSummary({ fridgeDays, freezerDays, storageDays, storageEnv })}
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
  fridgeDays,
  freezerDays,
  storageInstructions,
  onFridgeDaysChange,
  onFreezerDaysChange,
  onStorageInstructionsChange,
  footer,
}: {
  fridgeDays: number
  freezerDays: number
  storageInstructions: string
  onFridgeDaysChange: (days: number) => void
  onFreezerDaysChange: (days: number) => void
  onStorageInstructionsChange: (text: string) => void
  footer?: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
      <h2 className="text-lg">Storage</h2>
      <p className="text-sm text-ink-muted">
        Set how long leftovers keep in each place. Leave a field at 0 to skip that option. When you
        cook, you choose fridge or freezer.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fridge (days)" hint="0 = not offered">
          <input
            className={inputClass}
            type="number"
            min={0}
            value={fridgeDays}
            onChange={(e) => onFridgeDaysChange(Number(e.target.value))}
          />
        </Field>
        <Field label="Freezer (days)" hint="0 = not offered">
          <input
            className={inputClass}
            type="number"
            min={0}
            value={freezerDays}
            onChange={(e) => onFreezerDaysChange(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field
        label="Storage instructions"
        hint="Optional notes — container, reheating, freezing tips, etc."
      >
        <AutoTextarea
          minRows={3}
          value={storageInstructions}
          placeholder="e.g. Cool completely, store in an airtight container…"
          onChange={(e) => onStorageInstructionsChange(e.target.value)}
        />
      </Field>
      {footer}
    </section>
  )
}
