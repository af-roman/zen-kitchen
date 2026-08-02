import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { DISH_CATEGORIES, type CookingSession, type SessionDishPlan } from '@/domain/types'
import { dishCategoryLabel, recipeCategory } from '@/domain/dishTaxonomy'
import {
  isAlwaysAvailable,
  isDishRecipe,
  isLowStock,
  isPrepRecipe,
  quantityNoun,
  todayISO,
} from '@/domain/kitchen'
import { isPastDate } from '@/domain/servings'
import { appAlert } from '@/shared/dialog'
import { reservedIngredientUsage, stockTotals } from '@/domain/recipeMath'
import {
  dishStage,
  isPrepLeg,
  isStagedRecipe,
  leadDaysAhead,
  stageIngredients,
  stageLabel,
} from '@/domain/stages'
import { stageLegsFor, syncStageLegs, withChainIds } from '@/db/sessionChains'
import { SearchPickerSheet } from '@/shared/SearchPickerSheet'
import { Badge, Button, Field, PageHeader, RemoveButton, WarnBanner, inputClass } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

export function SessionPlanPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetRecipeId = params.get('recipeId') ? Number(params.get('recipeId')) : null
  const editId = params.get('edit') ? Number(params.get('edit')) : null
  const presetDate = params.get('date')
  const today = todayISO()
  const initialDate =
    presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate) && !isPastDate(presetDate)
      ? presetDate
      : today

  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []
  const existing = useLiveQuery(
    () => (editId ? db.cookingSessions.get(editId) : undefined),
    [editId],
  )

  const [date, setDate] = useState(initialDate)
  const [dishes, setDishes] = useState<SessionDishPlan[]>([])
  const [hydrated, setHydrated] = useState(false)
  /** null = closed; 'add' = append; number = replace dish at index */
  const [recipePicker, setRecipePicker] = useState<'add' | number | null>(null)
  const [savedOffer, setSavedOffer] = useState<{
    id: number
    canServe: boolean
    legDates: string[]
  } | null>(null)

  useEffect(() => {
    if (hydrated) return
    if (existing) {
      setDate(existing.date)
      setDishes(
        existing.dishes.map((d) => ({
          recipeId: d.recipeId,
          portions: d.portions,
          stageDaysAhead: d.stageDaysAhead,
          chainId: d.chainId,
        })),
      )
      setHydrated(true)
      return
    }
    if (editId) return
    if (presetRecipeId && recipes.length) {
      const r = recipes.find((x) => x.id === presetRecipeId)
      setDishes([{ recipeId: presetRecipeId, portions: r?.portions ?? 4 }])
      setHydrated(true)
      return
    }
    if (!presetRecipeId && !editId) setHydrated(true)
  }, [existing, editId, presetRecipeId, recipes, hydrated])

  const dateLocked = Boolean(existing && isPastDate(existing.date))
  /** Editing a prep leg: its date follows the cook day it belongs to. */
  const isLegSession = Boolean(editId) && dishes.some((d) => isPrepLeg(d))

  const recipePickerItems = useMemo(
    () =>
      recipes
        .filter((r) => r.id != null)
        .map((r) => {
          const cat = dishCategoryLabel(r.category)
          const kind = isPrepRecipe(r) ? 'Prep' : cat
          return {
            id: r.id!,
            label: r.name,
            detail: kind,
            group: recipeCategory(r),
            searchText: `${r.name} ${kind ?? ''} ${r.description ?? ''}`,
          }
        }),
    [recipes],
  )

  function applyPickedRecipe(recipeId: number) {
    const r = recipes.find((x) => x.id === recipeId)
    if (!r?.id) return
    if (recipePicker === 'add') {
      setDishes([...dishes, { recipeId: r.id, portions: r.portions }])
      return
    }
    if (typeof recipePicker === 'number') {
      const idx = recipePicker
      const dish = dishes[idx]
      if (!dish) return
      const next = [...dishes]
      next[idx] = {
        recipeId: r.id,
        portions: r.portions,
        stageDaysAhead: dish.stageDaysAhead,
        chainId: dish.chainId,
      }
      setDishes(next)
    }
  }

  const stock = useMemo(() => stockTotals(pantry), [pantry])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])

  /** Other sessions from today through this cook date reserve pantry before / alongside this one. */
  const reserved = useMemo(
    () => reservedIngredientUsage(sessions, recipeById, today, date, editId, ingById),
    [sessions, recipeById, today, date, editId, ingById],
  )

  /** Prep sessions this cook date implies, grouped by date. */
  const legDays = useMemo(() => {
    const legs = stageLegsFor(dishes, recipeById, date)
    const byDate = new Map<string, typeof legs>()
    for (const leg of legs) {
      const list = byDate.get(leg.date) ?? []
      list.push(leg)
      byDate.set(leg.date, list)
    }
    return [...byDate.entries()].map(([legDate, legs]) => ({
      date: legDate,
      legs,
      past: isPastDate(legDate),
    }))
  }, [dishes, recipeById, date])

  const needs = useMemo(() => {
    const map = new Map<number, number>()
    for (const dish of dishes) {
      const recipe = recipeById.get(dish.recipeId)
      if (!recipe) continue
      const scale = dish.portions / recipe.portions
      for (const line of stageIngredients(recipe, dishStage(dish))) {
        map.set(line.ingredientId, (map.get(line.ingredientId) ?? 0) + line.amount * scale)
      }
    }
    return [...map.entries()].map(([ingredientId, amount]) => {
      const ing = ingById.get(ingredientId)
      const always = isAlwaysAvailable(ing)
      const onHand = stock.get(ingredientId) ?? 0
      const reservedAmt = reserved.get(ingredientId) ?? 0
      const have = always ? amount : Math.max(0, onHand - reservedAmt)
      const low = always
        ? false
        : ing
          ? isLowStock(have, ing.lowStockThreshold) || have < amount
          : true
      return { ingredientId, amount, have, onHand, reservedAmt, ing, low, always }
    })
  }, [dishes, recipeById, ingById, stock, reserved])

  async function save() {
    if (isPastDate(date)) {
      await appAlert('Cooking sessions cannot be planned for past days.', { title: 'Cannot save' })
      return
    }
    if (dishes.length === 0) {
      await appAlert('Add at least one recipe.', { title: 'Cannot save' })
      return
    }
    const pastLeg = legDays.find((d) => d.past)
    if (pastLeg) {
      const names = pastLeg.legs
        .map((l) => recipeById.get(l.recipeId)?.name ?? 'A recipe')
        .join(', ')
      await appAlert(
        `${names} needs prep on ${pastLeg.date}, which is in the past. Pick a later cook date.`,
        { title: 'Cannot save' },
      )
      return
    }
    const now = new Date().toISOString()
    const planned = withChainIds(dishes)
    if (editId && existing) {
      const nextDishes = planned.map((d) => ({
        ...d,
        completed: existing.dishes.find((x) => x.recipeId === d.recipeId)?.completed,
        portionsPlanned: existing.dishes.find((x) => x.recipeId === d.recipeId)?.portionsPlanned,
      }))
      await db.cookingSessions.update(editId, {
        date,
        dishes: nextDishes,
        updatedAt: now,
      })
      await syncStageLegs(editId, date, nextDishes, recipeById)
      navigate('/')
      return
    }
    const session: Omit<CookingSession, 'id'> = {
      date,
      status: 'planned',
      dishes: planned,
      notes: '',
      createdAt: now,
      updatedAt: now,
    }
    const id = await db.cookingSessions.add(session)
    await syncStageLegs(id, date, planned, recipeById)
    const canServe = planned.some((d) => {
      const r = recipeById.get(d.recipeId)
      return r ? isDishRecipe(r) : true
    })
    setSavedOffer({ id, canServe, legDates: legDays.map((d) => d.date) })
  }

  return (
    <div>
      <PageHeader
        title={editId ? 'Edit cooking session' : 'Plan cooking session'}
        subtitle="Pick a date and the recipes you’ll cook — dishes for meals, prep for the pantry."
      />
      <div className="space-y-4">
        {dateLocked ? (
          <WarnBanner>This session is in the past and cannot be changed.</WarnBanner>
        ) : null}
        {isPastDate(date) && !dateLocked ? (
          <WarnBanner>Sessions cannot be planned for past days.</WarnBanner>
        ) : null}

        {isLegSession ? (
          <WarnBanner>
            This is a prep session for a later cook. Move the cook date on the main session to
            reschedule it.
          </WarnBanner>
        ) : null}

        <Field label={isLegSession ? 'Prep date' : 'Date'}>
          <input
            className={inputClass}
            type="date"
            min={today}
            value={date}
            disabled={dateLocked || isLegSession}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg">Recipes</h2>
            {!dateLocked ? (
              <Button
                variant="secondary"
                disabled={recipes.length === 0}
                onClick={() => setRecipePicker('add')}
              >
                Add recipe
              </Button>
            ) : null}
          </div>
          <div className="space-y-2">
            {dishes.map((dish, idx) => {
              const selected = recipeById.get(dish.recipeId)
              const prep = selected ? isPrepRecipe(selected) : false
              const qtyLabel = quantityNoun(selected, 2)
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex flex-wrap items-end gap-2">
                    <button
                      type="button"
                      disabled={dateLocked}
                      onClick={() => setRecipePicker(idx)}
                      className={`${inputClass} min-w-0 flex-1 text-left disabled:opacity-40`}
                    >
                      <span className="block truncate font-medium">
                        {selected?.name ?? 'Choose recipe'}
                      </span>
                      {selected ? (
                        <span className="block text-xs text-ink-muted">
                          {isPrepRecipe(selected)
                            ? 'Prep'
                            : dishCategoryLabel(selected.category)}
                          {' · '}
                          Tap to change
                        </span>
                      ) : (
                        <span className="block text-xs text-ink-muted">Tap to search</span>
                      )}
                    </button>
                    <div className="w-28 shrink-0">
                      <Field label={qtyLabel}>
                        <input
                          className={inputClass}
                          type="number"
                          min={1}
                          value={dish.portions}
                          disabled={dateLocked}
                          onChange={(e) => {
                            const next = [...dishes]
                            next[idx] = { ...dish, portions: Number(e.target.value) }
                            setDishes(next)
                          }}
                        />
                      </Field>
                    </div>
                    {!dateLocked ? (
                      <RemoveButton
                        icon
                        className="mt-7"
                        onClick={() => setDishes(dishes.filter((_, i) => i !== idx))}
                      />
                    ) : null}
                  </div>
                  {prep ? (
                    <p className="pl-0.5 text-xs text-accent-deep">Adds to pantry</p>
                  ) : null}
                  {isPrepLeg(dish) ? (
                    <p className="pl-0.5 text-xs text-accent-deep">
                      {stageLabel(dishStage(dish))} stage only
                    </p>
                  ) : selected && isStagedRecipe(selected) ? (
                    <p className="pl-0.5 text-xs text-accent-deep">
                      Starts {leadDaysAhead(selected)} day
                      {leadDaysAhead(selected) === 1 ? '' : 's'} ahead — a prep session gets planned
                      too
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        {legDays.length > 0 ? (
          <section className="rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-4">
            <h2 className="mb-2 text-lg">Prep sessions to be planned</h2>
            <p className="mb-2 text-xs text-ink-muted">
              Saving also books these earlier days. Each one cooks only its own stage.
            </p>
            <ul className="space-y-1.5 text-sm">
              {legDays.map((day) => (
                <li key={day.date} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {day.date}
                    {day.past ? <span className="text-warn"> — in the past</span> : null}
                  </span>
                  <span className="text-right text-ink-muted">
                    {day.legs
                      .map(
                        (leg) =>
                          `${recipeById.get(leg.recipeId)?.name ?? 'Recipe'} · ${stageLabel(
                            leg.daysAhead,
                          ).toLowerCase()}`,
                      )
                      .join(', ')}
                  </span>
                </li>
              ))}
            </ul>
            {legDays.some((d) => d.past) ? (
              <div className="mt-3">
                <WarnBanner>
                  A prep day falls in the past — pick a later cook date.
                </WarnBanner>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <h2 className="mb-2 text-lg">Ingredients needed</h2>
          <p className="mb-2 text-xs text-ink-muted">
            Amounts are in pantry stock units (g / ml / pcs). Available = pantry now minus other
            sessions planned through this cook day.
            {legDays.length > 0
              ? ' Ingredients used on an earlier prep day are listed with that session.'
              : ''}
          </p>
          {needs.length === 0 ? (
            <p className="text-sm text-ink-muted">Add recipes to see combined needs.</p>
          ) : (
            <ul className="space-y-1.5">
              {needs.map((n) => (
                <li key={n.ingredientId} className="flex items-center justify-between text-sm">
                  <span>{n.ing?.name}</span>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {Math.round(n.amount * 10) / 10} {n.ing?.unit}
                    <Badge tone={n.low ? 'warn' : 'ok'}>
                      {n.always ? 'always available' : `avail ${Math.round(n.have * 10) / 10}`}
                    </Badge>
                    {!n.always && n.reservedAmt > 0 ? (
                      <span className="text-xs text-ink-muted">
                        (stock {Math.round(n.onHand * 10) / 10} − reserved{' '}
                        {Math.round(n.reservedAmt * 10) / 10})
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {needs.some((n) => n.low) ? (
            <div className="mt-3">
              <WarnBanner>Some items are low or short for this session.</WarnBanner>
            </div>
          ) : null}
        </section>

        {!dateLocked ? (
          <>
            <Button
              className="w-full"
              onClick={() => void save()}
              disabled={isPastDate(date) || legDays.some((d) => d.past)}
            >
              Save session
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => navigate(-1)}>
            Back
          </Button>
        )}
      </div>

      <SearchPickerSheet
        open={recipePicker != null}
        title={recipePicker === 'add' ? 'Add recipe' : 'Change recipe'}
        items={recipePickerItems}
        groups={DISH_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
        selectedId={
          typeof recipePicker === 'number' ? dishes[recipePicker]?.recipeId : null
        }
        emptyTitle="No recipes found"
        emptyBody="Try another search or category."
        onClose={() => setRecipePicker(null)}
        onSelect={applyPickedRecipe}
      />

      <Sheet
        open={savedOffer != null}
        title="Session planned"
        onClose={() => {
          setSavedOffer(null)
          navigate('/')
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {savedOffer?.canServe
              ? 'Next you’ll cook this session. You can optionally pre-assign dish portions to meals now — or serve after cooking.'
              : 'Prep in this session will go to the pantry when you finish cooking.'}
          </p>
          {savedOffer?.legDates.length ? (
            <p className="rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 px-3 py-2 text-sm text-ink-muted">
              Prep session{savedOffer.legDates.length === 1 ? '' : 's'} also planned for{' '}
              {savedOffer.legDates.join(', ')}.
            </p>
          ) : null}
          {savedOffer?.canServe ? (
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => {
                const id = savedOffer.id
                setSavedOffer(null)
                navigate(`/serve?sessionId=${id}`)
              }}
            >
              Pre-assign meals (optional)
            </Button>
          ) : null}
          <Button
            className="w-full"
            onClick={() => {
              setSavedOffer(null)
              navigate('/')
            }}
          >
            Back to week
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
