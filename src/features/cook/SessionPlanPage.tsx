import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { CookingSession, SessionDishPlan } from '@/domain/types'
import { isLowStock, todayISO } from '@/domain/kitchen'
import { isPastDate } from '@/domain/servings'
import { reservedIngredientUsage, stockTotals } from '@/domain/recipeMath'
import { Badge, Button, Field, PageHeader, WarnBanner, inputClass } from '@/shared/ui'

export function SessionPlanPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetRecipeId = params.get('recipeId') ? Number(params.get('recipeId')) : null
  const editId = params.get('edit') ? Number(params.get('edit')) : null
  const today = todayISO()

  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []
  const existing = useLiveQuery(
    () => (editId ? db.cookingSessions.get(editId) : undefined),
    [editId],
  )

  const [date, setDate] = useState(today)
  const [dishes, setDishes] = useState<SessionDishPlan[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated) return
    if (existing) {
      setDate(existing.date)
      setDishes(existing.dishes.map((d) => ({ recipeId: d.recipeId, portions: d.portions })))
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

  const stock = useMemo(() => stockTotals(pantry), [pantry])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])

  /** Other sessions from today through this cook date reserve pantry before / alongside this one. */
  const reserved = useMemo(
    () => reservedIngredientUsage(sessions, recipeById, today, date, editId),
    [sessions, recipeById, today, date, editId],
  )

  const needs = useMemo(() => {
    const map = new Map<number, number>()
    for (const dish of dishes) {
      const recipe = recipeById.get(dish.recipeId)
      if (!recipe) continue
      const scale = dish.portions / recipe.portions
      for (const line of recipe.ingredients) {
        map.set(line.ingredientId, (map.get(line.ingredientId) ?? 0) + line.amount * scale)
      }
    }
    return [...map.entries()].map(([ingredientId, amount]) => {
      const ing = ingById.get(ingredientId)
      const onHand = stock.get(ingredientId) ?? 0
      const reservedAmt = reserved.get(ingredientId) ?? 0
      const have = Math.max(0, onHand - reservedAmt)
      const low = ing ? isLowStock(have, ing.lowStockThreshold) || have < amount : true
      return { ingredientId, amount, have, onHand, reservedAmt, ing, low }
    })
  }, [dishes, recipeById, ingById, stock, reserved])

  async function save() {
    if (isPastDate(date)) {
      alert('Cooking sessions cannot be planned for past days.')
      return
    }
    if (dishes.length === 0) {
      alert('Add at least one dish.')
      return
    }
    const now = new Date().toISOString()
    if (editId && existing) {
      await db.cookingSessions.update(editId, {
        date,
        dishes: dishes.map((d) => ({
          ...d,
          completed: existing.dishes.find((x) => x.recipeId === d.recipeId)?.completed,
          portionsPlanned: existing.dishes.find((x) => x.recipeId === d.recipeId)?.portionsPlanned,
        })),
        updatedAt: now,
      })
      navigate('/')
      return
    }
    const session: Omit<CookingSession, 'id'> = {
      date,
      status: 'planned',
      dishes,
      notes: '',
      createdAt: now,
      updatedAt: now,
    }
    const id = await db.cookingSessions.add(session)
    if (confirm('Session saved. Serve portions across the week now?')) {
      navigate(`/serve?sessionId=${id}`)
    } else {
      navigate('/')
    }
  }

  return (
    <div>
      <PageHeader
        title={editId ? 'Edit cooking session' : 'Plan cooking session'}
        subtitle="Pick a date and the dishes you’ll batch."
      />
      <div className="space-y-4">
        {dateLocked ? (
          <WarnBanner>This session is in the past and cannot be changed.</WarnBanner>
        ) : null}
        {isPastDate(date) && !dateLocked ? (
          <WarnBanner>Sessions cannot be planned for past days.</WarnBanner>
        ) : null}

        <Field label="Date">
          <input
            className={inputClass}
            type="date"
            min={today}
            value={date}
            disabled={dateLocked}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg">Dishes</h2>
            {!dateLocked ? (
              <Button
                variant="secondary"
                onClick={() => {
                  const first = recipes[0]
                  if (!first?.id) return
                  setDishes([...dishes, { recipeId: first.id, portions: first.portions }])
                }}
              >
                Add dish
              </Button>
            ) : null}
          </div>
          <div className="space-y-2">
            {dishes.map((dish, idx) => (
              <div key={idx} className="flex gap-2">
                <select
                  className={inputClass}
                  value={dish.recipeId}
                  disabled={dateLocked}
                  onChange={(e) => {
                    const recipeId = Number(e.target.value)
                    const r = recipes.find((x) => x.id === recipeId)
                    const next = [...dishes]
                    next[idx] = { recipeId, portions: r?.portions ?? 4 }
                    setDishes(next)
                  }}
                >
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <input
                  className={`${inputClass} w-24`}
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
                {!dateLocked ? (
                  <Button variant="ghost" onClick={() => setDishes(dishes.filter((_, i) => i !== idx))}>
                    ×
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <h2 className="mb-2 text-lg">Ingredients needed</h2>
          <p className="mb-2 text-xs text-ink-muted">
            Available = pantry now minus other sessions planned through this cook day.
          </p>
          {needs.length === 0 ? (
            <p className="text-sm text-ink-muted">Add dishes to see combined needs.</p>
          ) : (
            <ul className="space-y-1.5">
              {needs.map((n) => (
                <li key={n.ingredientId} className="flex items-center justify-between text-sm">
                  <span>{n.ing?.name}</span>
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {Math.round(n.amount * 10) / 10} {n.ing?.unit}
                    <Badge tone={n.low ? 'warn' : 'ok'}>
                      avail {Math.round(n.have * 10) / 10}
                    </Badge>
                    {n.reservedAmt > 0 ? (
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
            <Button className="w-full" onClick={() => void save()} disabled={isPastDate(date)}>
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
    </div>
  )
}
