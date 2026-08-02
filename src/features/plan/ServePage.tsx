import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  MEAL_SLOTS,
  type Ingredient,
  type MealSlot,
  type Nutrition,
  type PantryItem,
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
  servingItemNeedsFood,
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
import { isPrepRecipe, todayISO, uid } from '@/domain/kitchen'
import { maxStorageDays } from '@/domain/storage'
import {
  applyServingItemAllocations,
  clearServingsForMeal,
  findServingsForMeal,
  healOrphanedServingItems,
  validateServePicks,
} from '@/db/servingOps'
import { useGoals } from '@/shared/hooks'
import { MacroBar, MacroInline } from '@/shared/MacroBar'
import { Sheet } from '@/shared/Sheet'
import { appAlert, appConfirm } from '@/shared/dialog'
import { Badge, Button, Field, PageHeader, RemoveButton, WarnBanner, inputClass } from '@/shared/ui'

type AdhocUsageLine = NonNullable<ServingItem['usage']>[number]

function initialServeDate(params: URLSearchParams, today: string): string {
  const fromUrl = params.get('date')
  if (fromUrl && !isPastDate(fromUrl)) return fromUrl
  return today
}

export function ServePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const goals = useGoals()
  const sessionIdParam = params.get('sessionId') ? Number(params.get('sessionId')) : undefined
  const today = todayISO()

  const batches = useLiveQuery(() => db.readyBatches.toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  const [date, setDate] = useState(() => initialServeDate(params, today))
  const [meal, setMeal] = useState<MealSlot>('lunch')
  const [picks, setPicks] = useState<ServePick[]>([])
  const [adhocOpen, setAdhocOpen] = useState(false)
  const [editingAdhocKey, setEditingAdhocKey] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = params.get('date')
    if (fromUrl && !isPastDate(fromUrl)) setDate(fromUrl)
  }, [params])

  useEffect(() => {
    void healOrphanedServingItems()
  }, [])

  const dayServings = useLiveQuery(
    () => db.servings.where('date').equals(date).toArray(),
    [date],
  ) ?? []
  const mealAlreadyPlanned = dayServings.some((s) => s.meal === meal)

  const sessionById = useMemo(
    () => new Map(sessions.filter((s) => s.id != null).map((s) => [s.id!, s])),
    [sessions],
  )
  const batchIds = useMemo(
    () => new Set(batches.map((b) => b.id).filter((id): id is number => id != null)),
    [batches],
  )
  const itemBroken = (item: ServingItem) => servingItemNeedsFood(item, sessionById, batchIds)
  const missingMeals = MEAL_SLOTS.filter((m) => !dayServings.some((s) => s.meal === m.id))
  const dayHasBroken = dayServings.some((s) => s.items.some(itemBroken))

  const readyAvailable = useMemo(() => {
    return batches.filter((b) => {
      if (b.portionsLeft <= 0) return false
      if (date < b.cookedAt) return false
      if (b.expiresAt < date) return false
      const recipe = recipeById.get(b.recipeId)
      if (recipe && isPrepRecipe(recipe)) return false
      return true
    })
  }, [batches, date, recipeById])

  const plannedAvailable = useMemo(() => {
    const list: {
      sessionId: number
      sessionDate: string
      recipeId: number
      portionsLeft: number
      expiresAt: string
    }[] = []

    for (const session of sessions) {
      if (session.status === 'done') continue
      if (date < session.date) continue
      for (const dish of session.dishes) {
        // Prep legs cook an early stage only — no food to serve from them.
        if (isPrepLeg(dish)) continue
        const recipe = recipeById.get(dish.recipeId)
        if (!recipe || isPrepRecipe(recipe)) continue
        const expiresAt = plannedDishExpiresAt(session.date, maxStorageDays(recipe))
        if (expiresAt < date) continue
        const left = plannedDishAvailable(dish.portions, dish.portionsPlanned ?? 0)
        if (left <= 0) continue
        if (sessionIdParam && session.id !== sessionIdParam) continue
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
  }, [sessions, date, recipeById, sessionIdParam])

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

  const mealNutrition = useMemo(
    () => mealNutritionFromItems(previewItems, recipeById, ingById),
    [previewItems, recipeById, ingById],
  )

  /** Dishes in the meal being edited (scaled to chosen portions). */
  const dishNutritionRows = useMemo(() => {
    return picks.map((pick, idx) => {
      const item = previewItems[idx]
      if (!item) return null
      const perPortion = resolveServingNutrition(item, recipeById, ingById)
      return {
        key: servePickKey(pick),
        label: servingItemLabel(item, recipeById),
        portions: item.portions,
        nutrition: scaleNutrition(perPortion, item.portions),
        adhoc: isAdhocServingItem(item),
      }
    }).filter((row): row is NonNullable<typeof row> => row != null)
  }, [picks, previewItems, recipeById, ingById])

  /**
   * Day total while editing: other saved meals + this meal’s current picks
   * (or the saved meal if nothing is picked yet).
   */
  const dayNutritionPreview = useMemo(() => {
    let total = emptyNutrition()
    for (const slot of MEAL_SLOTS) {
      if (slot.id === meal) {
        if (picks.length > 0) {
          total = addNutrition(total, mealNutrition)
        } else {
          const existing = dayServings.find((s) => s.meal === slot.id)
          if (existing) {
            total = addNutrition(
              total,
              mealNutritionFromItems(existing.items, recipeById, ingById),
            )
          }
        }
        continue
      }
      const serving = dayServings.find((s) => s.meal === slot.id)
      if (!serving) continue
      total = addNutrition(
        total,
        mealNutritionFromItems(serving.items, recipeById, ingById),
      )
    }
    return total
  }, [meal, picks.length, mealNutrition, dayServings, recipeById, ingById])

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
      const mealLabel = MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal
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

    // Always clear this slot first so only one breakfast/lunch/dinner/snack exists per day.
    await clearServingsForMeal(date, meal)

    await db.servings.add({
      date,
      meal,
      items,
      sessionId: sessionIdParam,
      createdAt: new Date().toISOString(),
    })

    await applyServingItemAllocations(items)

    navigate('/')
  }

  return (
    <div>
      <PageHeader
        title="Serve"
        subtitle="Put Ready portions, planned session dishes, or other food onto a meal for the week."
      />
      <div className="space-y-4">
        {isPastDate(date) ? (
          <WarnBanner>Meals cannot be planned for past days.</WarnBanner>
        ) : null}
        {mealAlreadyPlanned ? (
          <WarnBanner>
            {MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal} is already planned for this day —
            saving will replace it.
          </WarnBanner>
        ) : null}

        <div className="rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 px-3 py-2 text-sm">
          Assigning{' '}
          <span className="font-medium text-accent-deep">
            {MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal}
          </span>{' '}
          on <span className="font-medium text-accent-deep">{date}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <input
              className={inputClass}
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Meal to edit">
            <select
              className={inputClass}
              value={meal}
              onChange={(e) => setMeal(e.target.value as MealSlot)}
            >
              {MEAL_SLOTS.map((m) => {
                const taken = dayServings.some((s) => s.meal === m.id)
                return (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {taken ? ' (planned)' : ' (missing)'}
                  </option>
                )
              })}
            </select>
          </Field>
        </div>

        <section className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <h2 className="mb-1 text-lg">This day</h2>
          <p className="mb-3 text-xs text-ink-muted">
            What’s already planned, and which meals still need dishes.
          </p>
          {dayHasBroken ? (
            <div className="mb-3">
              <WarnBanner>
                Some dishes need food — their cooking session was removed. Replace them below.
              </WarnBanner>
            </div>
          ) : null}
          <ul className="space-y-2">
            {MEAL_SLOTS.map((slot) => {
              const serving = dayServings.find((s) => s.meal === slot.id)
              const selected = meal === slot.id
              if (!serving) {
                const showingPreview = selected && picks.length > 0
                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      onClick={() => setMeal(slot.id)}
                      className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-dashed border-line hover:border-accent/40'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{slot.label}</span>
                        <Badge tone={showingPreview ? 'ok' : 'warn'}>
                          {showingPreview ? 'Editing' : 'Missing'}
                        </Badge>
                      </div>
                      {showingPreview ? (
                        <>
                          <ul className="mt-1 w-full space-y-1 text-ink-muted">
                            {previewItems.map((item, idx) => {
                              const dishN = scaleNutrition(
                                resolveServingNutrition(item, recipeById, ingById),
                                item.portions,
                              )
                              return (
                                <li key={idx} className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span>
                                      {servingItemLabel(item, recipeById)} ×{item.portions}
                                    </span>
                                    {isAdhocServingItem(item) ? <Badge>Other</Badge> : null}
                                  </div>
                                  <MacroInline nutrition={dishN} />
                                </li>
                              )
                            })}
                          </ul>
                          <div className="mt-1.5 w-full border-t border-line/60 pt-1.5">
                            <span className="text-xs font-medium text-ink">Meal · </span>
                            <MacroInline nutrition={mealNutrition} goals={goals} />
                          </div>
                        </>
                      ) : null}
                    </button>
                  </li>
                )
              }
              const broken = serving.items.some(itemBroken)
              const mealN = mealNutritionFromItems(serving.items, recipeById, ingById)
              const showingPreview = selected && picks.length > 0
              const displayItems = showingPreview ? previewItems : serving.items
              const displayMealN = showingPreview ? mealNutrition : mealN
              return (
                <li key={slot.id}>
                  <button
                    type="button"
                    onClick={() => setMeal(slot.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selected
                        ? 'border-accent bg-accent/10'
                        : broken
                          ? 'border-warn bg-warn/10 hover:border-warn'
                          : 'border-line hover:border-accent/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{slot.label}</span>
                      <Badge tone={broken ? 'warn' : 'ok'}>
                        {broken ? 'Needs food' : showingPreview ? 'Editing' : 'Planned'}
                      </Badge>
                    </div>
                    <ul className="mt-1 space-y-1 text-ink-muted">
                      {displayItems.map((item, idx) => {
                        const dishN = scaleNutrition(
                          resolveServingNutrition(item, recipeById, ingById),
                          item.portions,
                        )
                        return (
                          <li key={idx} className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>
                                {servingItemLabel(item, recipeById)} ×{item.portions}
                              </span>
                              {isAdhocServingItem(item) ? <Badge>Other</Badge> : null}
                              {!showingPreview && itemBroken(item) ? (
                                <Badge tone="warn">needs food</Badge>
                              ) : null}
                            </div>
                            <MacroInline nutrition={dishN} />
                          </li>
                        )
                      })}
                    </ul>
                    <div className="mt-1.5 border-t border-line/60 pt-1.5">
                      <span className="text-xs font-medium text-ink">Meal · </span>
                      <MacroInline nutrition={displayMealN} goals={goals} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {missingMeals.length > 0 ? (
            <p className="mt-3 text-xs text-ink-muted">
              Missing: {missingMeals.map((m) => m.label).join(', ')}. Select a meal above, then
              add dishes.
            </p>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">All meal slots have dishes for this day.</p>
          )}
          <div className="mt-3 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2">
            <span className="text-xs font-medium text-ink">Day total · </span>
            <MacroInline nutrition={dayNutritionPreview} goals={goals} />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg">Ready to eat</h2>
          {readyAvailable.length === 0 ? (
            <p className="text-sm text-ink-muted">No ready batches for this day.</p>
          ) : (
            <ul className="space-y-2">
              {readyAvailable.map((b) => {
                const pick: ServePick = { kind: 'batch', batchId: b.id!, portions: 0 }
                const portions = getPickPortions({ ...pick, batchId: b.id! })
                const perPortion = resolveServingNutrition(
                  { batchId: b.id, recipeId: b.recipeId, portions: 1, nutrition: b.nutritionPerPortion },
                  recipeById,
                  ingById,
                )
                return (
                  <li key={b.id} className="rounded-lg border border-line p-3">
                    <div className="font-medium">{recipeById.get(b.recipeId)?.name}</div>
                    <div className="text-xs text-ink-muted">
                      Cooked {b.cookedAt} · until {b.expiresAt} · {b.portionsLeft} left
                    </div>
                    <div className="mt-1">
                      <MacroInline nutrition={perPortion} />
                      <span className="text-xs text-ink-muted"> / portion</span>
                    </div>
                    {portions > 0 ? (
                      <div className="mt-1">
                        <span className="text-xs font-medium text-ink">This pick · </span>
                        <MacroInline
                          nutrition={scaleNutrition(perPortion, portions)}
                          goals={goals}
                        />
                      </div>
                    ) : null}
                    <Field label="Portions to serve">
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        max={b.portionsLeft}
                        value={portions || ''}
                        onChange={(e) =>
                          setPick({
                            kind: 'batch',
                            batchId: b.id!,
                            portions: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg">Planned from sessions</h2>
          <p className="mb-2 text-xs text-ink-muted">
            Dishes from upcoming cooking sessions — available from the session date until they expire.
          </p>
          {plannedAvailable.length === 0 ? (
            <p className="text-sm text-ink-muted">No planned dishes available for this day.</p>
          ) : (
            <ul className="space-y-2">
              {plannedAvailable.map((p) => {
                const portions = getPickPortions({
                  kind: 'planned',
                  sessionId: p.sessionId,
                  recipeId: p.recipeId,
                  portions: 0,
                })
                const recipe = recipeById.get(p.recipeId)
                const perPortion = recipe ? recipeNutrition(recipe, ingById) : emptyNutrition()
                return (
                  <li key={`${p.sessionId}-${p.recipeId}`} className="rounded-lg border border-accent/25 bg-accent/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{recipe?.name}</span>
                      <Badge tone="accent">Session {p.sessionDate}</Badge>
                    </div>
                    <div className="text-xs text-ink-muted">
                      {p.portionsLeft} portions left · until {p.expiresAt}
                    </div>
                    <div className="mt-1">
                      <MacroInline nutrition={perPortion} />
                      <span className="text-xs text-ink-muted"> / portion</span>
                    </div>
                    {portions > 0 ? (
                      <div className="mt-1">
                        <span className="text-xs font-medium text-ink">This pick · </span>
                        <MacroInline
                          nutrition={scaleNutrition(perPortion, portions)}
                          goals={goals}
                        />
                      </div>
                    ) : null}
                    <Field label="Portions to serve">
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        max={p.portionsLeft}
                        value={portions || ''}
                        onChange={(e) =>
                          setPick({
                            kind: 'planned',
                            sessionId: p.sessionId,
                            recipeId: p.recipeId,
                            portions: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg">Other food</h2>
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
          <p className="mb-2 text-xs text-ink-muted">
            Eat out or cook something off-plan — track macros without a recipe. Optionally deduct
            pantry if it came from stock.
          </p>
          {adhocPicks.length === 0 ? (
            <p className="text-sm text-ink-muted">No other food on this meal yet.</p>
          ) : (
            <ul className="space-y-2">
              {adhocPicks.map((pick) => (
                <li
                  key={pick.key}
                  className="rounded-lg border border-line bg-paper-elevated p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pick.name}</span>
                    <Badge>Other</Badge>
                    {pick.usage?.length ? (
                      <span className="text-xs text-ink-muted">
                        {pick.usage.length} pantry item{pick.usage.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1">
                    <MacroInline nutrition={pick.nutrition} />
                    <span className="text-xs text-ink-muted"> / portion</span>
                  </div>
                  {pick.portions > 0 ? (
                    <div className="mt-1">
                      <span className="text-xs font-medium text-ink">This pick · </span>
                      <MacroInline
                        nutrition={scaleNutrition(pick.nutrition, pick.portions)}
                        goals={goals}
                      />
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="w-28">
                      <Field label="Portions">
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          value={pick.portions || ''}
                          onChange={(e) =>
                            setPick({
                              ...pick,
                              portions: Number(e.target.value),
                            })
                          }
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
        </section>

        <section className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <h2 className="mb-1 text-lg">Nutrition</h2>
          <p className="mb-4 text-xs text-ink-muted">
            Dishes in this meal, the meal total, and the whole day — so you can balance as you
            pick.
          </p>

          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-medium text-ink">
                Dishes · {MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal}
              </h3>
              {dishNutritionRows.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Choose portions above to see each dish’s macros.
                </p>
              ) : (
                <ul className="space-y-2">
                  {dishNutritionRows.map((row) => (
                    <li
                      key={row.key}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line px-3 py-2"
                    >
                      <span className="text-sm">
                        {row.label} ×{row.portions}
                        {row.adhoc ? (
                          <span className="ml-1.5 align-middle">
                            <Badge>Other</Badge>
                          </span>
                        ) : null}
                      </span>
                      <MacroInline nutrition={row.nutrition} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-medium text-ink">This meal</h3>
              <MacroBar
                nutrition={mealNutrition}
                goals={goals}
                compact
                goalCaption="This meal vs your daily targets"
              />
            </div>

            <div className="border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-medium text-ink">Whole day · {date}</h3>
              <ul className="mb-3 space-y-1.5">
                {MEAL_SLOTS.map((slot) => {
                  const isEditing = slot.id === meal && picks.length > 0
                  const serving = dayServings.find((s) => s.meal === slot.id)
                  const slotN =
                    isEditing
                      ? mealNutrition
                      : serving
                        ? mealNutritionFromItems(serving.items, recipeById, ingById)
                        : emptyNutrition()
                  const empty = !isEditing && !serving
                  return (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="text-ink-muted">
                        {slot.label}
                        {isEditing ? (
                          <span className="ml-1 text-accent-deep">· editing</span>
                        ) : null}
                      </span>
                      {empty ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        <MacroInline nutrition={slotN} goals={goals} />
                      )}
                    </li>
                  )
                })}
              </ul>
              <MacroBar
                nutrition={dayNutritionPreview}
                goals={goals}
                goalCaption="Full day vs your daily targets (includes this meal as edited)"
              />
            </div>
          </div>
        </section>

        <Button className="w-full" onClick={() => void save()} disabled={isPastDate(date)}>
          Save meal
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
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
          editingAdhocKey
            ? (adhocPicks.find((p) => p.key === editingAdhocKey) ?? null)
            : null
        }
        onSave={(pick) => {
          setPick(pick)
          setAdhocOpen(false)
          setEditingAdhocKey(null)
        }}
      />
    </div>
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
    const candidates = pantry.filter((p) => p.ingredientId === ingredientId && p.amountLeft > 0)
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
    <Sheet
      open={open}
      title={initial ? 'Edit other food' : 'Add other food'}
      onClose={onClose}
      wide
    >
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
          <input
            className={inputClass}
            type="number"
            min={1}
            value={portions}
            onChange={(e) => setPortions(Number(e.target.value))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Energy (kcal)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step={1}
              value={nutrition.energyKcal || ''}
              onChange={(e) => updateMacro('energyKcal', Number(e.target.value))}
            />
          </Field>
          <Field label="Protein (g)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step={0.1}
              value={nutrition.proteinG || ''}
              onChange={(e) => updateMacro('proteinG', Number(e.target.value))}
            />
          </Field>
          <Field label="Carbs (g)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step={0.1}
              value={nutrition.carbsG || ''}
              onChange={(e) => updateMacro('carbsG', Number(e.target.value))}
            />
          </Field>
          <Field label="Fat (g)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step={0.1}
              value={nutrition.fatG || ''}
              onChange={(e) => updateMacro('fatG', Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="text-xs text-ink-muted">Macros are per portion.</p>

        <div className="rounded-[var(--radius-card)] border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-sm font-medium text-accent-deep"
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
                  const candidates = pantry.filter((p) => p.ingredientId === line.ingredientId)
                  return (
                    <div key={idx} className="space-y-2 rounded-lg border border-line p-2">
                      <Field label="Ingredient">
                        <select
                          className={inputClass}
                          value={line.ingredientId}
                          onChange={(e) => {
                            const ingredientId = Number(e.target.value)
                            const nextCandidates = pantry.filter(
                              (p) => p.ingredientId === ingredientId && p.amountLeft > 0,
                            )
                            const next = [...usage]
                            next[idx] = {
                              ingredientId,
                              pantryItemId: nextCandidates[0]?.id ?? 0,
                              amountUsed: line.amountUsed,
                            }
                            setUsage(next)
                          }}
                        >
                          {ingredients.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Pantry item">
                        <select
                          className={inputClass}
                          value={line.pantryItemId}
                          onChange={(e) => {
                            const next = [...usage]
                            next[idx] = { ...line, pantryItemId: Number(e.target.value) }
                            setUsage(next)
                          }}
                        >
                          {candidates.length === 0 ? (
                            <option value={0}>No stock</option>
                          ) : (
                            candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.brand || 'Unbranded'} · {c.amountLeft} {ing?.unit}
                              </option>
                            ))
                          )}
                        </select>
                      </Field>
                      <Field label={`Amount used (${ing?.unit ?? ''})`}>
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          step={0.1}
                          max={
                            pantry.find((p) => p.id === line.pantryItemId)?.amountLeft ?? undefined
                          }
                          value={line.amountUsed || ''}
                          onChange={(e) => {
                            const next = [...usage]
                            next[idx] = { ...line, amountUsed: Number(e.target.value) }
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
                    setNutrition(
                      nutritionFromPantryUsage(usage, pantry, ingById, Math.max(1, portions)),
                    )
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
