import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import {
  MEAL_SLOTS,
  type Ingredient,
  type MealSlot,
  type Nutrition,
  type PantryItem,
  type Recipe,
  type ServingItem,
} from '@/domain/types'
import {
  isAdhocServingItem,
  isPastDate,
  mealNutritionFromItems,
  plannedDishAvailable,
  plannedDishExpiresAt,
  resolveServingNutrition,
  servePickKey,
  servingItemLabel,
  type ServePick,
} from '@/domain/servings'
import {
  addNutrition,
  emptyNutrition,
  nutritionForAmount,
  scaleNutrition,
} from '@/domain/nutrition'
import { recipeNutrition } from '@/domain/recipeMath'
import { isPrepLeg } from '@/domain/stages'
import { isPrepRecipe, uid } from '@/domain/kitchen'
import { pantryCandidatesForIngredient } from '@/domain/pantryOrder'
import { maxStorageDays } from '@/domain/storage'
import {
  applyServingItemAllocations,
  clearServingsForMeal,
  findServingsForMeal,
  validateServePicks,
} from '@/db/servingOps'
import { MealShareLegend, MealStack, dishColorClass, type MealSegment } from '@/shared/MealShare'
import { Sheet } from '@/shared/Sheet'
import { appAlert, appConfirm } from '@/shared/dialog'
import { NumberField, SelectField } from '@/shared/forms'
import { assetUrl } from '@/shared/assetUrl'
import { Badge, Button, Field, RemoveButton, WarnBanner, inputClass } from '@/shared/ui'

type AdhocUsageLine = NonNullable<ServingItem['usage']>[number]

function segmentsForItems(
  items: ServingItem[],
  recipeById: Map<number, Recipe>,
  ingById: Map<number, Ingredient>,
): MealSegment[] {
  return items.map((item, index) => ({
    key: `${index}-${servingItemLabel(item, recipeById)}`,
    label: `${servingItemLabel(item, recipeById)} × ${item.portions}`,
    kcal: scaleNutrition(resolveServingNutrition(item, recipeById, ingById), item.portions)
      .energyKcal,
    colorClass: dishColorClass(index),
  }))
}

function picksFromItems(items: ServingItem[]): ServePick[] {
  const picks: ServePick[] = []
  function add(pick: ServePick) {
    const key = servePickKey(pick)
    const existing = picks.find((item) => servePickKey(item) === key)
    if (existing) {
      existing.portions += pick.portions
      return
    }
    picks.push(pick)
  }
  for (const item of items) {
    if (item.portions <= 0) continue
    if (item.batchId != null) {
      add({ kind: 'batch', batchId: item.batchId, portions: item.portions })
      continue
    }
    if (item.plannedSessionId != null && item.recipeId != null) {
      add({
        kind: 'planned',
        sessionId: item.plannedSessionId,
        recipeId: item.recipeId,
        portions: item.portions,
      })
      continue
    }
    if (isAdhocServingItem(item) && item.name) {
      add({
        kind: 'adhoc',
        key: uid(),
        name: item.name,
        portions: item.portions,
        nutrition: item.nutrition,
        ...(item.usage?.length ? { usage: item.usage } : {}),
      })
    }
  }
  return picks
}

function heldPortions(items: ServingItem[], match: (item: ServingItem) => boolean): number {
  return items.reduce((sum, item) => (match(item) ? sum + item.portions : sum), 0)
}

function RecipeThumb({ src }: { src?: string }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ink/5">
      {src ? (
        <img src={assetUrl(src)} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] font-medium text-ink-muted">
          Dish
        </div>
      )}
    </div>
  )
}

export function MealSlotEditor({
  date,
  meal,
  sessionId,
  initialItems,
  onDraftChange,
  onMealChange,
  onClose,
  onSaved,
}: {
  date: string
  meal: MealSlot
  sessionId?: number
  initialItems: ServingItem[]
  onDraftChange?: (meal: MealSlot, items: ServingItem[]) => void
  onMealChange: (meal: MealSlot) => void
  onClose: () => void
  onSaved: () => void
}) {
  const rootRef = useRef<HTMLElement>(null)
  const batchesQuery = useLiveQuery(() => db.readyBatches.toArray(), [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const sessionsQuery = useLiveQuery(() => db.cookingSessions.toArray(), [])
  const batches = batchesQuery ?? []
  const sessions = sessionsQuery ?? []
  const sourcesReady = batchesQuery !== undefined && sessionsQuery !== undefined
  const dayServings =
    useLiveQuery(() => db.servings.where('date').equals(date).toArray(), [date]) ?? []

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  const [picks, setPicks] = useState<ServePick[]>(() => picksFromItems(initialItems))
  const droppedMissing = useRef(false)
  const [adhocOpen, setAdhocOpen] = useState(false)
  const [editingAdhocKey, setEditingAdhocKey] = useState<string | null>(null)

  const mealLabel = MEAL_SLOTS.find((slot) => slot.id === meal)?.label ?? meal
  const mealAlreadyPlanned = dayServings.some((s) => s.meal === meal && s.items.length > 0)

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (!sourcesReady || droppedMissing.current) return
    droppedMissing.current = true
    setPicks((prev) =>
      prev.filter((pick) => {
        if (pick.kind === 'batch') return batches.some((batch) => batch.id === pick.batchId)
        if (pick.kind === 'planned') return sessions.some((session) => session.id === pick.sessionId)
        return true
      }),
    )
  }, [sourcesReady, batches, sessions])

  const readyAvailable = useMemo(() => {
    const list = batches.filter((b) => {
      const onMeal = initialItems.some((item) => item.batchId === b.id)
      if (b.portionsLeft <= 0 && !onMeal) return false
      if (date < b.cookedAt && !onMeal) return false
      if (b.expiresAt < date && !onMeal) return false
      const recipe = recipeById.get(b.recipeId)
      if (recipe && isPrepRecipe(recipe)) return false
      return true
    })
    return list
  }, [batches, date, recipeById, initialItems])

  const plannedAvailable = useMemo(() => {
    const list: {
      sessionId: number
      sessionDate: string
      recipeId: number
      portionsLeft: number
      expiresAt: string
    }[] = []

    for (const session of sessions) {
      const referenced = initialItems.some((item) => item.plannedSessionId === session.id)
      if (session.status === 'done' && !referenced) continue
      if (date < session.date) continue
      for (const dish of session.dishes) {
        if (isPrepLeg(dish)) continue
        const recipe = recipeById.get(dish.recipeId)
        if (!recipe || isPrepRecipe(recipe)) continue
        const expiresAt = plannedDishExpiresAt(session.date, maxStorageDays(recipe))
        const onThisMeal = initialItems.some(
          (item) => item.plannedSessionId === session.id && item.recipeId === dish.recipeId,
        )
        if (expiresAt < date && !onThisMeal) continue
        const left = plannedDishAvailable(dish.portions, dish.portionsPlanned ?? 0)
        if (sessionId != null && session.id !== sessionId && !onThisMeal) continue
        if (left <= 0 && !onThisMeal) continue
        list.push({
          sessionId: session.id!,
          sessionDate: session.date,
          recipeId: dish.recipeId,
          portionsLeft: left,
          expiresAt,
        })
      }
    }
    return list
  }, [sessions, date, recipeById, sessionId, initialItems])

  const previewItems: ServingItem[] = useMemo(() => {
    return picks.map((pick) => {
      if (pick.kind === 'batch') {
        const batch = batches.find((b) => b.id === pick.batchId)
        return {
          batchId: pick.batchId,
          recipeId: batch?.recipeId,
          portions: pick.portions,
          nutrition: batch?.nutritionPerPortion ?? emptyNutrition(),
        }
      }
      if (pick.kind === 'planned') {
        const recipe = recipeById.get(pick.recipeId)
        return {
          recipeId: pick.recipeId,
          plannedSessionId: pick.sessionId,
          portions: pick.portions,
          nutrition: recipe ? recipeNutrition(recipe, ingById) : emptyNutrition(),
        }
      }
      return {
        name: pick.name,
        portions: pick.portions,
        nutrition: pick.nutrition,
        usage: pick.usage,
      }
    })
  }, [picks, batches, recipeById, ingById])

  const adhocPicks = useMemo(
    () => picks.filter((p): p is Extract<ServePick, { kind: 'adhoc' }> => p.kind === 'adhoc'),
    [picks],
  )

  const draftSegments = useMemo(
    () => segmentsForItems(previewItems, recipeById, ingById),
    [previewItems, recipeById, ingById],
  )

  const draftKcal = mealNutritionFromItems(previewItems, recipeById, ingById).energyKcal

  useEffect(() => {
    onDraftChange?.(meal, previewItems)
  }, [meal, previewItems, onDraftChange])

  const missingDishLabels = useMemo(() => {
    if (!sourcesReady) return []
    return initialItems.flatMap((item) => {
      if (item.portions <= 0 || isAdhocServingItem(item)) return []
      if (item.batchId != null) {
        return batches.some((batch) => batch.id === item.batchId)
          ? []
          : [servingItemLabel(item, recipeById)]
      }
      if (item.plannedSessionId != null) {
        return sessions.some((session) => session.id === item.plannedSessionId)
          ? []
          : [servingItemLabel(item, recipeById)]
      }
      return item.needsFood ? [servingItemLabel(item, recipeById)] : []
    })
  }, [sourcesReady, initialItems, batches, sessions, recipeById])

  function setPick(pick: ServePick) {
    setPicks((prev) => {
      const key = servePickKey(pick)
      const others = prev.filter((p) => servePickKey(p) !== key)
      if (pick.portions <= 0) return others
      return [...others, pick]
    })
  }

  function getPickPortions(pick: ServePick): number {
    const key = servePickKey(pick)
    return picks.find((p) => servePickKey(p) === key)?.portions ?? 0
  }

  async function save() {
    if (isPastDate(date)) {
      await appAlert('You cannot serve meals to a day in the past.', { title: 'Cannot save' })
      return
    }
    if (picks.length === 0) {
      await appAlert('Select at least one dish.', { title: 'Cannot save' })
      return
    }

    const existingMeals = await findServingsForMeal(date, meal)
    if (existingMeals.length > 0) {
      if (
        !(await appConfirm(
          `${mealLabel} is already planned for ${date}. Replace it with this meal?`,
        ))
      ) {
        return
      }
    }

    const creditFromReplace = existingMeals.flatMap((s) => s.items)
    const shortfalls = await validateServePicks(
      picks,
      date,
      (recipeId) => recipeById.get(recipeId)?.name ?? 'Unknown dish',
      recipeById,
      creditFromReplace,
    )
    if (shortfalls.length > 0) {
      await appAlert(`Can't save this meal:\n\n${shortfalls.join('\n')}`, { title: 'Cannot save' })
      return
    }

    const items: ServingItem[] = picks.map((pick) => {
      if (pick.kind === 'batch') {
        const batch = batches.find((b) => b.id === pick.batchId)!
        return {
          batchId: pick.batchId,
          recipeId: batch.recipeId,
          portions: pick.portions,
          nutrition: batch.nutritionPerPortion,
        }
      }
      if (pick.kind === 'planned') {
        const recipe = recipeById.get(pick.recipeId)!
        return {
          recipeId: pick.recipeId,
          plannedSessionId: pick.sessionId,
          portions: pick.portions,
          nutrition: recipeNutrition(recipe, ingById),
        }
      }
      return {
        name: pick.name.trim(),
        portions: pick.portions,
        nutrition: pick.nutrition,
        ...(pick.usage?.length ? { usage: pick.usage } : {}),
      }
    })

    await clearServingsForMeal(date, meal)

    await db.servings.add({
      date,
      meal,
      items,
      sessionId,
      createdAt: new Date().toISOString(),
    })

    await applyServingItemAllocations(items)
    onSaved()
  }

  return (
    <section ref={rootRef} className="mb-5 scroll-mt-4 rounded-lg border border-lacquer/30 bg-lacquer/5 p-3">
      <h2 className="text-lg">Serve {mealLabel}</h2>
      <p className="mt-1 text-xs text-ink-muted">
        {format(parseISO(date), 'EEEE d MMMM')}. Portions come from Ready, a planned cook, or other
        food.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {MEAL_SLOTS.map((slot) => {
          const selected = slot.id === meal
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onMealChange(slot.id)}
              className={`rounded-full px-2 py-2 text-xs font-semibold ${
                selected ? 'bg-ink text-white' : 'bg-paper text-ink-muted hover:text-ink'
              }`}
            >
              {slot.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4 space-y-4">
        {mealAlreadyPlanned ? (
          <WarnBanner>Saving replaces this meal.</WarnBanner>
        ) : null}
        {missingDishLabels.length > 0 ? (
          <WarnBanner>
            {missingDishLabels.join(', ')} no longer has food behind it. Saving this meal drops{' '}
            {missingDishLabels.length === 1 ? 'it' : 'them'} unless you add something else.
          </WarnBanner>
        ) : null}
        {sessionId != null ? (
          <p className="text-xs text-ink-muted">Showing dishes from this cooking session.</p>
        ) : null}

        {picks.length > 0 ? (
          <div>
            <MealStack segments={draftSegments} />
            <MealShareLegend segments={draftSegments} />
            <p className="mt-1 text-xs tabular-nums text-ink-muted">
              {Math.round(draftKcal)} kcal in this meal
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Choose portions below to build this meal.</p>
        )}

        <div>
          <h3 className="mb-2 text-base font-medium">Ready to eat</h3>
          {readyAvailable.length === 0 ? (
            <p className="text-sm text-ink-muted">No ready batches for this day.</p>
          ) : (
            <ul className="space-y-2">
              {readyAvailable.map((b) => {
                const held = heldPortions(initialItems, (item) => item.batchId === b.id)
                const available = b.portionsLeft + held
                const portions = getPickPortions({ kind: 'batch', batchId: b.id!, portions: 0 })
                return (
                  <li key={b.id} className="rounded-lg border border-line bg-paper p-3">
                    <div className="flex gap-3">
                      <RecipeThumb src={recipeById.get(b.recipeId)?.imageDataUrl} />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div>
                          <div className="font-medium leading-snug">
                            {recipeById.get(b.recipeId)?.name}
                          </div>
                          <p className="mt-0.5 text-xs leading-snug text-ink-muted">
                            Cooked {b.cookedAt} · until {b.expiresAt} · {available} left
                          </p>
                        </div>
                        <Field label="Portions to serve" className="space-y-1">
                          <NumberField
                            value={portions}
                            min={0}
                            max={available}
                            step={1}
                            inputMode="numeric"
                            onChange={(nextPortions) =>
                              setPick({
                                kind: 'batch',
                                batchId: b.id!,
                                portions: nextPortions,
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-base font-medium">Planned from sessions</h3>
          {plannedAvailable.length === 0 ? (
            <p className="text-sm text-ink-muted">No planned dishes available for this day.</p>
          ) : (
            <ul className="space-y-2">
              {plannedAvailable.map((p) => {
                const held = heldPortions(
                  initialItems,
                  (item) => item.plannedSessionId === p.sessionId && item.recipeId === p.recipeId,
                )
                const available = p.portionsLeft + held
                const portions = getPickPortions({
                  kind: 'planned',
                  sessionId: p.sessionId,
                  recipeId: p.recipeId,
                  portions: 0,
                })
                const recipe = recipeById.get(p.recipeId)
                return (
                  <li
                    key={`${p.sessionId}-${p.recipeId}`}
                    className="rounded-lg border border-line bg-paper p-3"
                  >
                    <div className="flex gap-3">
                      <RecipeThumb src={recipe?.imageDataUrl} />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div>
                          <div className="font-medium leading-snug">{recipe?.name}</div>
                          <p className="mt-0.5 text-xs leading-snug text-ink-muted">
                            Session {p.sessionDate} · {available} left · until {p.expiresAt}
                          </p>
                        </div>
                        <Field label="Portions to serve" className="space-y-1">
                          <NumberField
                            value={portions}
                            min={0}
                            max={available}
                            step={1}
                            inputMode="numeric"
                            onChange={(nextPortions) =>
                              setPick({
                                kind: 'planned',
                                sessionId: p.sessionId,
                                recipeId: p.recipeId,
                                portions: nextPortions,
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-base font-medium">Other food</h3>
            <Button
              variant="secondary"
              onClick={() => {
                setEditingAdhocKey(null)
                setAdhocOpen(true)
              }}
            >
              Add
            </Button>
          </div>
          {adhocPicks.length === 0 ? (
            <p className="text-sm text-ink-muted">No other food on this meal yet.</p>
          ) : (
            <ul className="space-y-2">
              {adhocPicks.map((pick) => (
                <li key={pick.key} className="rounded-lg border border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium leading-snug">{pick.name}</span>
                    <Badge>Other</Badge>
                  </div>
                  {pick.usage?.length ? (
                    <p className="mt-0.5 text-xs leading-snug text-ink-muted">
                      {pick.usage.length} pantry item{pick.usage.length === 1 ? '' : 's'}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="w-36">
                      <Field label="Portions">
                        <NumberField
                          value={pick.portions}
                          min={0}
                          step={1}
                          inputMode="numeric"
                          onChange={(portions) => setPick({ ...pick, portions })}
                        />
                      </Field>
                    </div>
                    <Button
                      variant="secondary"
                      className="!py-1 !text-xs"
                      onClick={() => {
                        setEditingAdhocKey(pick.key)
                        setAdhocOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <RemoveButton
                      className="!py-1 !text-xs"
                      onClick={() => setPick({ ...pick, portions: 0 })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button className="w-full" onClick={() => void save()} disabled={isPastDate(date)}>
          Save meal
        </Button>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>

      <AdhocFoodSheet
        open={adhocOpen}
        onClose={() => {
          setAdhocOpen(false)
          setEditingAdhocKey(null)
        }}
        ingredients={ingredients}
        pantry={pantry}
        initial={
          editingAdhocKey ? (adhocPicks.find((p) => p.key === editingAdhocKey) ?? null) : null
        }
        onSave={(pick) => {
          setPick(pick)
          setAdhocOpen(false)
          setEditingAdhocKey(null)
        }}
      />
    </section>
  )
}

function nutritionFromPantryUsage(
  usage: AdhocUsageLine[],
  pantry: PantryItem[],
  ingById: Map<number, Ingredient>,
  portions: number,
): Nutrition {
  let total = emptyNutrition()
  for (const u of usage) {
    if (!u.pantryItemId || u.amountUsed <= 0) continue
    const item = pantry.find((p) => p.id === u.pantryItemId)
    const ing = ingById.get(u.ingredientId)
    if (!ing) continue
    const per100 = item?.nutritionOverride ?? ing.nutritionPer100
    total = addNutrition(
      total,
      nutritionForAmount(per100, u.amountUsed, ing.unit, ing.avgPieceGrams),
    )
  }
  return scaleNutrition(total, 1 / Math.max(1, portions))
}

function AdhocFoodSheet({
  open,
  onClose,
  ingredients,
  pantry,
  initial,
  onSave,
}: {
  open: boolean
  onClose: () => void
  ingredients: Ingredient[]
  pantry: PantryItem[]
  initial: Extract<ServePick, { kind: 'adhoc' }> | null
  onSave: (pick: Extract<ServePick, { kind: 'adhoc' }>) => void
}) {
  const [name, setName] = useState('')
  const [portions, setPortions] = useState(1)
  const [nutrition, setNutrition] = useState<Nutrition>(emptyNutrition())
  const [usage, setUsage] = useState<AdhocUsageLine[]>([])
  const [showPantry, setShowPantry] = useState(false)
  const key = initial?.key ?? ''

  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  useEffect(() => {
    if (!open) return
    if (initial) {
      setName(initial.name)
      setPortions(initial.portions)
      setNutrition(initial.nutrition)
      setUsage(initial.usage ?? [])
      setShowPantry(Boolean(initial.usage?.length))
    } else {
      setName('')
      setPortions(1)
      setNutrition(emptyNutrition())
      setUsage([])
      setShowPantry(false)
    }
  }, [open, initial])

  function updateMacro(field: keyof Nutrition, value: number) {
    setNutrition((prev) => ({ ...prev, [field]: value }))
  }

  function addPantryLine() {
    const withStock = ingredients.find((ing) =>
      pantry.some((p) => p.ingredientId === ing.id && p.amountLeft > 0),
    )
    const ingredientId = withStock?.id ?? ingredients[0]?.id
    if (ingredientId == null) return
    const candidates = pantryCandidatesForIngredient(pantry, ingredientId)
    setUsage([
      ...usage,
      {
        ingredientId,
        pantryItemId: candidates[0]?.id ?? 0,
        amountUsed: 0,
      },
    ])
    setShowPantry(true)
  }

  return (
    <Sheet open={open} title={initial ? 'Edit other food' : 'Add other food'} onClose={onClose} wide>
      <div className="space-y-3">
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            placeholder="e.g. Sushi takeaway"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Portions">
          <NumberField value={portions} min={1} step={1} inputMode="numeric" onChange={setPortions} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Energy (kcal)">
            <NumberField
              value={nutrition.energyKcal}
              min={0}
              step={1}
              onChange={(n) => updateMacro('energyKcal', n)}
            />
          </Field>
          <Field label="Protein (g)">
            <NumberField
              value={nutrition.proteinG}
              min={0}
              step={0.1}
              onChange={(n) => updateMacro('proteinG', n)}
            />
          </Field>
          <Field label="Carbs (g)">
            <NumberField
              value={nutrition.carbsG}
              min={0}
              step={0.1}
              onChange={(n) => updateMacro('carbsG', n)}
            />
          </Field>
          <Field label="Fat (g)">
            <NumberField
              value={nutrition.fatG}
              min={0}
              step={0.1}
              onChange={(n) => updateMacro('fatG', n)}
            />
          </Field>
        </div>
        <p className="text-xs text-ink-muted">Macros are per portion.</p>

        <div className="rounded-[var(--radius-card)] border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-sm font-medium text-ink"
              onClick={() => setShowPantry((v) => !v)}
            >
              From pantry {showPantry ? '▾' : '▸'}
            </button>
            {showPantry ? (
              <Button variant="secondary" className="!py-1 !text-xs" onClick={addPantryLine}>
                Add line
              </Button>
            ) : null}
          </div>
          {showPantry ? (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted">
                Optional — deduct stock when this food came from your pantry.
              </p>
              {usage.length === 0 ? (
                <p className="text-sm text-ink-muted">No pantry lines yet.</p>
              ) : (
                usage.map((line, idx) => {
                  const ing = ingById.get(line.ingredientId)
                  const candidates = pantryCandidatesForIngredient(pantry, line.ingredientId)
                  return (
                    <div key={idx} className="space-y-2 rounded-lg border border-line p-2">
                      <Field label="Ingredient">
                        <SelectField<number>
                          title="Ingredient"
                          value={line.ingredientId}
                          onChange={(ingredientId) => {
                            const nextCandidates = pantryCandidatesForIngredient(pantry, ingredientId)
                            const next = [...usage]
                            next[idx] = {
                              ingredientId,
                              pantryItemId: nextCandidates[0]?.id ?? 0,
                              amountUsed: line.amountUsed,
                            }
                            setUsage(next)
                          }}
                          options={ingredients.map((i) => ({ id: i.id!, label: i.name }))}
                        />
                      </Field>
                      <Field label="Pantry item">
                        <SelectField<number>
                          title="Pantry item"
                          value={line.pantryItemId}
                          onChange={(pantryItemId) => {
                            const next = [...usage]
                            next[idx] = { ...line, pantryItemId }
                            setUsage(next)
                          }}
                          options={
                            candidates.length === 0
                              ? [{ id: 0, label: 'No stock' }]
                              : candidates.map((c) => ({
                                  id: c.id!,
                                  label: `${c.brand || 'Unbranded'} · ${c.amountLeft} ${ing?.unit}${
                                    c.expiryDate ? ` · exp ${c.expiryDate}` : ''
                                  }`,
                                }))
                          }
                        />
                      </Field>
                      <Field label={`Amount used (${ing?.unit ?? ''})`}>
                        <NumberField
                          value={line.amountUsed}
                          min={0}
                          step={0.1}
                          max={pantry.find((p) => p.id === line.pantryItemId)?.amountLeft ?? undefined}
                          onChange={(amountUsed) => {
                            const next = [...usage]
                            next[idx] = { ...line, amountUsed }
                            setUsage(next)
                          }}
                        />
                      </Field>
                      <RemoveButton
                        className="!py-1 !text-xs"
                        label="Remove line"
                        onClick={() => setUsage(usage.filter((_, i) => i !== idx))}
                      />
                    </div>
                  )
                })
              )}
              {usage.some((u) => u.pantryItemId && u.amountUsed > 0) ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() =>
                    setNutrition(nutritionFromPantryUsage(usage, pantry, ingById, Math.max(1, portions)))
                  }
                >
                  Fill macros from pantry
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button
          className="w-full"
          onClick={async () => {
            if (!name.trim()) {
              await appAlert('Give this food a name.', { title: 'Cannot save' })
              return
            }
            if (portions <= 0) {
              await appAlert('Portions must be greater than zero.', { title: 'Cannot save' })
              return
            }
            const cleanUsage = usage.filter((u) => u.pantryItemId > 0 && u.amountUsed > 0)
            onSave({
              kind: 'adhoc',
              key: key || uid(),
              name: name.trim(),
              portions,
              nutrition: {
                energyKcal: Number(nutrition.energyKcal) || 0,
                fatG: Number(nutrition.fatG) || 0,
                carbsG: Number(nutrition.carbsG) || 0,
                proteinG: Number(nutrition.proteinG) || 0,
              },
              ...(cleanUsage.length ? { usage: cleanUsage } : {}),
            })
          }}
        >
          {initial ? 'Update' : 'Add to meal'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  )
}
