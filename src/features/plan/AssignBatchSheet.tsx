import { useEffect, useMemo, useState } from 'react'
import { assignBatchToMeal } from '@/db/servingOps'
import type { MealSlot, ReadyBatch, Recipe } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'
import { appAlert } from '@/shared/dialog'
import { DateField, NumberField, SelectField } from '@/shared/forms'
import { Button, EmptyState, Field } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

export function AssignBatchSheet({
  open,
  onClose,
  batches,
  recipes,
  initialBatchId,
  initialDate,
  lockDate = false,
}: {
  open: boolean
  onClose: () => void
  batches: ReadyBatch[]
  recipes: Recipe[]
  initialBatchId?: number
  initialDate?: string
  lockDate?: boolean
}) {
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const free = batches.filter((b) => b.id != null && b.portionsLeft > 0)
  const [batchId, setBatchId] = useState<number>(initialBatchId ?? free[0]?.id ?? 0)
  const [date, setDate] = useState(initialDate ?? todayISO())
  const [meal, setMeal] = useState<MealSlot>('lunch')
  const [portions, setPortions] = useState(1)

  useEffect(() => {
    if (!open) return
    const start = initialBatchId ?? free[0]?.id ?? 0
    setBatchId(start)
    setDate(initialDate ?? todayISO())
    setMeal('lunch')
    const batch = free.find((b) => b.id === start)
    setPortions(batch ? Math.min(1, batch.portionsLeft) || batch.portionsLeft : 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBatchId, initialDate])

  const selected = free.find((b) => b.id === batchId)

  async function save() {
    if (!selected?.id) {
      await appAlert('Nothing free to assign.', { title: 'Cannot assign' })
      return
    }
    if (selected.expiresAt < date) {
      await appAlert(`${recipeById.get(selected.recipeId)?.name ?? 'This dish'} expires before ${date}.`, {
        title: 'Cannot assign',
      })
      return
    }
    const error = await assignBatchToMeal({
      batchId: selected.id,
      date,
      meal,
      portions,
    })
    if (error) {
      await appAlert(error, { title: 'Cannot assign' })
      return
    }
    onClose()
  }

  return (
    <Sheet open={open} title="Assign free portions" onClose={onClose}>
      {free.length === 0 ? (
        <EmptyState title="No free portions" body="Cooked food that is not already on a meal shows up here." />
      ) : (
        <div className="space-y-3">
          <Field label="Dish">
            <SelectField
              title="Dish"
              value={batchId}
              onChange={(id) => {
                setBatchId(id)
                const batch = free.find((b) => b.id === id)
                if (batch) setPortions(Math.min(portions, batch.portionsLeft) || batch.portionsLeft)
              }}
              options={free.map((b) => ({
                id: b.id!,
                label: `${recipeById.get(b.recipeId)?.name ?? 'Dish'} · ${b.portionsLeft} free`,
              }))}
            />
          </Field>
          {lockDate ? (
            <p className="text-sm text-ink-muted">
              Onto {date}
              {selected ? ` · keeps until ${selected.expiresAt}` : ''}.
            </p>
          ) : (
            <Field label="Date" hint={selected ? `Keeps until ${selected.expiresAt}` : undefined}>
              <DateField title="Meal date" value={date} onChange={setDate} />
            </Field>
          )}
          <Field label="Meal">
            <SelectField
              title="Meal"
              value={meal}
              onChange={setMeal}
              options={MEAL_SLOTS.map((m) => ({ id: m.id, label: m.label }))}
            />
          </Field>
          <Field label="Portions" hint={selected ? `Up to ${selected.portionsLeft} free` : undefined}>
            <NumberField
              value={portions}
              min={1}
              max={selected?.portionsLeft ?? 1}
              step={1}
              onChange={setPortions}
            />
          </Field>
          <Button className="w-full" onClick={() => void save()}>
            Assign to plan
          </Button>
        </div>
      )}
    </Sheet>
  )
}
