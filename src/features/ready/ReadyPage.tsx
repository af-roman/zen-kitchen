import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { BatchStorage, Ingredient, ReadyBatch, Recipe } from '@/domain/types'
import { dishCategoryLabel } from '@/domain/dishTaxonomy'
import { appConfirm } from '@/shared/dialog'
import { Badge, Button, EmptyState, Field, PageHeader, inputClass } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'
import { MacroInline } from '@/shared/MacroBar'
import { isDishRecipe, storageLabel, todayISO } from '@/domain/kitchen'
import { formatExpiryLabel, resolveServingNutrition } from '@/domain/servings'
import { batchStoragePlace } from '@/domain/storage'
import { assetUrl } from '@/shared/assetUrl'

const STORAGE_SECTIONS: BatchStorage[] = ['fridge', 'freezer']

export function ReadyPage() {
  const navigate = useNavigate()
  const batches = useLiveQuery(() => db.readyBatches.orderBy('cookedAt').reverse().toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  const [adjustId, setAdjustId] = useState<number | null>(null)
  const batch = batches.find((b) => b.id === adjustId)

  const byPlace = useMemo(() => {
    const sections: Record<BatchStorage, Map<number, ReadyBatch[]>> = {
      fridge: new Map(),
      freezer: new Map(),
    }
    for (const b of batches) {
      const recipe = recipeById.get(b.recipeId)
      if (recipe && !isDishRecipe(recipe)) continue
      const place = batchStoragePlace(b)
      const map = sections[place]
      const list = map.get(b.recipeId) ?? []
      list.push(b)
      map.set(b.recipeId, list)
    }
    return sections
  }, [batches, recipeById])

  const hasAny = STORAGE_SECTIONS.some((place) => byPlace[place].size > 0)

  return (
    <div>
      <PageHeader
        title="Ready to eat"
        subtitle="Cooked dish portions waiting to be served through the week. Prep stays in the pantry."
      />
      {!hasAny ? (
        <EmptyState
          title="Nothing ready yet"
          body="Finish a cooking session to add batches here."
        />
      ) : (
        <div className="space-y-8">
          {STORAGE_SECTIONS.map((place) => {
            const grouped = [...byPlace[place].entries()]
            return (
              <section key={place}>
                <h2 className="mb-3 font-display text-2xl text-accent-deep">
                  {storageLabel(place)}
                </h2>
                {grouped.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    Nothing in the {storageLabel(place).toLowerCase()}.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {grouped.map(([recipeId, list]) => {
                      const recipe = recipeById.get(recipeId)
                      return (
                        <li key={`${place}-${recipeId}`}>
                          <h3 className="mb-2 text-lg text-ink">{recipe?.name ?? 'Dish'}</h3>
                          <ul className="space-y-2">
                            {list.map((b) => (
                              <BatchRow
                                key={b.id}
                                batch={b}
                                recipe={recipe}
                                recipeById={recipeById}
                                ingById={ingById}
                                onAdjust={() => b.id != null && setAdjustId(b.id)}
                              />
                            ))}
                          </ul>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      <AdjustSheet
        open={adjustId !== null}
        batch={batch}
        recipeName={batch ? recipeById.get(batch.recipeId)?.name : undefined}
        onClose={() => setAdjustId(null)}
        onCookAgain={(recipeId) => {
          setAdjustId(null)
          navigate(`/sessions/new?recipeId=${recipeId}`)
        }}
      />
    </div>
  )
}

function BatchRow({
  batch: b,
  recipe,
  recipeById,
  ingById,
  onAdjust,
}: {
  batch: ReadyBatch
  recipe?: Recipe
  recipeById: Map<number, Recipe>
  ingById: Map<number, Ingredient>
  onAdjust: () => void
}) {
  const perPortion = resolveServingNutrition(
    {
      batchId: b.id,
      recipeId: b.recipeId,
      portions: 1,
      nutrition: b.nutritionPerPortion,
    },
    recipeById,
    ingById,
  )
  const expiryLabel = formatExpiryLabel(b.expiresAt)
  const expired = expiryLabel.includes('expired')

  return (
    <li>
      <button
        type="button"
        onClick={onAdjust}
        className="flex w-full gap-3 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-3 text-left"
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-line/40">
          {recipe?.imageDataUrl ? (
            <img
              src={assetUrl(recipe.imageDataUrl)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Badge>{dishCategoryLabel(recipe?.category)}</Badge>
            <Badge>Cooked {b.cookedAt}</Badge>
            <Badge tone={expired ? 'warn' : 'neutral'}>{expiryLabel}</Badge>
          </div>
          <div className="mt-2 text-sm">
            {b.portionsLeft} portions left
            {b.portionsPlanned > 0 ? ` · ${b.portionsPlanned} planned` : ''}
          </div>
          <div className="mt-1">
            <MacroInline nutrition={perPortion} />
            <span className="text-xs text-ink-muted"> / portion</span>
          </div>
        </div>
      </button>
    </li>
  )
}

function AdjustSheet({
  open,
  batch,
  recipeName,
  onClose,
  onCookAgain,
}: {
  open: boolean
  batch?: { id?: number; recipeId: number; portionsLeft: number; portionsPlanned: number }
  recipeName?: string
  onClose: () => void
  onCookAgain: (recipeId: number) => void
}) {
  const [amount, setAmount] = useState(0)
  const [mode, setMode] = useState<'set' | 'decrease' | 'increase'>('set')
  const [decreaseReason, setDecreaseReason] = useState<'consumed' | 'discarded'>('consumed')
  const [consumeDate, setConsumeDate] = useState(todayISO())
  const [increaseReason, setIncreaseReason] = useState<'correction' | 'newBatch'>('correction')

  useEffect(() => {
    if (batch) {
      setAmount(batch.portionsLeft)
      setMode('set')
    }
  }, [batch])

  async function save() {
    if (!batch?.id) return
    const current = batch.portionsLeft
    if (mode === 'set' || (mode === 'increase' && increaseReason === 'correction')) {
      const next = amount
      await db.readyBatches.update(batch.id, { portionsLeft: next })
      onClose()
      return
    }
    if (mode === 'decrease' || amount < current) {
      const next = mode === 'decrease' ? amount : amount
      const removed = current - next
      if (removed <= 0) {
        await db.readyBatches.update(batch.id, { portionsLeft: next })
        onClose()
        return
      }
      if (decreaseReason === 'discarded') {
        await db.waste.add({
          batchId: batch.id,
          recipeId: batch.recipeId,
          portions: removed,
          date: todayISO(),
          reason: 'discarded',
          createdAt: new Date().toISOString(),
        })
      } else {
        if (
          !(await appConfirm(
            `Log ${removed} portion${removed === 1 ? '' : 's'} as a Snack on ${consumeDate}? This adds to the plan.`,
          ))
        ) {
          return
        }
        const nutrition = (await db.readyBatches.get(batch.id))!.nutritionPerPortion
        const item = {
          batchId: batch.id,
          recipeId: batch.recipeId,
          portions: removed,
          nutrition,
        }
        const onDay = await db.servings.where('date').equals(consumeDate).toArray()
        const existingSnack = onDay.find((s) => s.meal === 'snack')
        if (existingSnack?.id != null) {
          await db.servings.update(existingSnack.id, {
            items: [...existingSnack.items, item],
          })
        } else {
          await db.servings.add({
            date: consumeDate,
            meal: 'snack',
            items: [item],
            createdAt: new Date().toISOString(),
          })
        }
      }
      const plannedReduce = Math.min(batch.portionsPlanned, removed)
      await db.readyBatches.update(batch.id, {
        portionsLeft: next,
        portionsPlanned: Math.max(0, batch.portionsPlanned - plannedReduce),
      })
      onClose()
      return
    }
    if (mode === 'increase') {
      if (increaseReason === 'newBatch') {
        onCookAgain(batch.recipeId)
        return
      }
      await db.readyBatches.update(batch.id, { portionsLeft: amount })
      onClose()
    }
  }

  return (
    <Sheet open={open} title={`Adjust · ${recipeName ?? 'Batch'}`} onClose={onClose}>
      {!batch ? null : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">Currently {batch.portionsLeft} portions left.</p>
          <Field label="New amount">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={amount}
              onChange={(e) => {
                const v = Number(e.target.value)
                setAmount(v)
                if (v < batch.portionsLeft) setMode('decrease')
                else if (v > batch.portionsLeft) setMode('increase')
                else setMode('set')
              }}
            />
          </Field>
          {amount < batch.portionsLeft ? (
            <>
              <Field
                label="Reason for decrease"
                hint={
                  decreaseReason === 'consumed'
                    ? 'Adds those portions to Snack on the plan.'
                    : 'Records waste; does not change meals.'
                }
              >
                <select
                  className={inputClass}
                  value={decreaseReason}
                  onChange={(e) =>
                    setDecreaseReason(e.target.value as 'consumed' | 'discarded')
                  }
                >
                  <option value="consumed">Ate it (log as Snack)</option>
                  <option value="discarded">Discarded / waste</option>
                </select>
              </Field>
              {decreaseReason === 'consumed' ? (
                <Field label="Snack date">
                  <input
                    className={inputClass}
                    type="date"
                    value={consumeDate}
                    onChange={(e) => setConsumeDate(e.target.value)}
                  />
                </Field>
              ) : null}
            </>
          ) : null}
          {amount > batch.portionsLeft ? (
            <Field label="Reason for increase">
              <select
                className={inputClass}
                value={increaseReason}
                onChange={(e) =>
                  setIncreaseReason(e.target.value as 'correction' | 'newBatch')
                }
              >
                <option value="correction">Correction</option>
                <option value="newBatch">New batch cooked</option>
              </select>
            </Field>
          ) : null}
          <Button className="w-full" onClick={() => void save()}>
            Save
          </Button>
        </div>
      )}
    </Sheet>
  )
}
