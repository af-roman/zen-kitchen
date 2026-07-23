import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { MEAL_SLOTS, type MealSlot, type ServingItem } from '@/domain/types'
import {
  isPastDate,
  mealNutritionFromItems,
  plannedDishAvailable,
  plannedDishExpiresAt,
  resolveServingNutrition,
  servePickKey,
  servingItemNeedsFood,
  type ServePick,
} from '@/domain/servings'
import { recipeNutrition } from '@/domain/recipeMath'
import { todayISO } from '@/domain/kitchen'
import {
  applyServingItemAllocations,
  clearServingsForMeal,
  findServingsForMeal,
  healOrphanedServingItems,
  validateServePicks,
} from '@/db/servingOps'
import { useGoals } from '@/shared/hooks'
import { MacroBar, MacroInline } from '@/shared/MacroBar'
import { Badge, Button, Field, PageHeader, WarnBanner, inputClass } from '@/shared/ui'

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
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  const [date, setDate] = useState(() => initialServeDate(params, today))
  const [meal, setMeal] = useState<MealSlot>('lunch')
  const [picks, setPicks] = useState<ServePick[]>([])

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
      return true
    })
  }, [batches, date])

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
        const recipe = recipeById.get(dish.recipeId)
        if (!recipe) continue
        const expiresAt = plannedDishExpiresAt(session.date, recipe.storageDays)
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
          recipeId: batch?.recipeId ?? 0,
          portions: pick.portions,
          nutrition: batch?.nutritionPerPortion ?? { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
        }
      }
      const recipe = recipeById.get(pick.recipeId)
      return {
        recipeId: pick.recipeId,
        plannedSessionId: pick.sessionId,
        portions: pick.portions,
        nutrition: recipe ? recipeNutrition(recipe, ingById) : { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 },
      }
    })
  }, [picks, batches, recipeById, ingById])

  const mealNutrition = useMemo(
    () => mealNutritionFromItems(previewItems, recipeById, ingById),
    [previewItems, recipeById, ingById],
  )

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
      alert('You cannot serve meals to a day in the past.')
      return
    }
    if (picks.length === 0) {
      alert('Select at least one dish.')
      return
    }

    const existingMeals = await findServingsForMeal(date, meal)
    if (existingMeals.length > 0) {
      const mealLabel = MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal
      if (
        !confirm(
          `${mealLabel} is already planned for ${date}. Replace it with this meal?`,
        )
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
      alert(`Not enough portions available:\n\n${shortfalls.join('\n')}`)
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
      const recipe = recipeById.get(pick.recipeId)!
      return {
        recipeId: pick.recipeId,
        plannedSessionId: pick.sessionId,
        portions: pick.portions,
        nutrition: recipeNutrition(recipe, ingById),
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
      <PageHeader title="Serve" subtitle="Assign dishes to a meal — ready now or planned from a session." />
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
                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      onClick={() => setMeal(slot.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-dashed border-line hover:border-accent/40'
                      }`}
                    >
                      <span className="font-medium">{slot.label}</span>
                      <Badge tone="warn">Missing</Badge>
                    </button>
                  </li>
                )
              }
              const broken = serving.items.some(itemBroken)
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{slot.label}</span>
                      <Badge tone={broken ? 'warn' : 'ok'}>{broken ? 'Needs food' : 'Planned'}</Badge>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-ink-muted">
                      {serving.items.map((item, idx) => (
                        <li key={idx} className="flex flex-wrap items-center gap-1.5">
                          <span>
                            {recipeById.get(item.recipeId)?.name ?? 'Dish'} ×{item.portions}
                          </span>
                          {itemBroken(item) ? <Badge tone="warn">needs food</Badge> : null}
                        </li>
                      ))}
                    </ul>
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
                const perPortion = recipe ? recipeNutrition(recipe, ingById) : emptyNutritionFallback()
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

        <section className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <h2 className="mb-3 text-lg">Meal nutrition</h2>
          <MacroBar nutrition={mealNutrition} goals={goals} />
        </section>

        <Button className="w-full" onClick={() => void save()} disabled={isPastDate(date)}>
          Save meal
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function emptyNutritionFallback() {
  return { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 }
}
