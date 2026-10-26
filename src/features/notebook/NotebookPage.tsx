import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CookLogList } from '@/features/log/CookLogPage'
import { db } from '@/db/database'
import { mealNutritionFromItems } from '@/domain/servings'
import { todayISO } from '@/domain/kitchen'
import {
  averageEatenNutrition,
  cookStats,
  pastWindow,
  wasteStats,
  type LogWindow,
} from '@/domain/logbook'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { Button, PageHeader, SegmentedControl } from '@/shared/ui'

export function NotebookPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const today = todayISO()
  const [window, setWindow] = useState<LogWindow>(7)
  const servings = useLiveQuery(() => db.servings.toArray(), []) ?? []
  const waste = useLiveQuery(() => db.waste.toArray(), []) ?? []
  const logs = useLiveQuery(() => db.cookLog.toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const restocks = useLiveQuery(() => db.restocks.toArray(), []) ?? []

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const range = pastWindow(today, window)

  const nutrition = useMemo(
    () =>
      averageEatenNutrition(servings, today, window, (serving) =>
        mealNutritionFromItems(serving.items, recipeById, ingById),
      ),
    [servings, today, window, recipeById, ingById],
  )

  const spent = useMemo(() => {
    const rows = restocks.filter((r) => r.date >= range.from && r.date <= range.to)
    const total = rows.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0)
    const perDay = total / window
    const perMeal = nutrition.mealCount > 0 ? total / nutrition.mealCount : 0
    return {
      total: Math.round(total),
      perDay: Math.round(perDay),
      perMeal: Math.round(perMeal),
      trips: rows.length,
    }
  }, [restocks, range.from, range.to, window, nutrition.mealCount])

  const cooking = useMemo(
    () => cookStats(logs, recipes, range.from, range.to),
    [logs, recipes, range.from, range.to],
  )

  const wasted = useMemo(
    () => wasteStats(waste, (id) => (id != null ? recipeById.get(id)?.name ?? 'Dish' : 'Dish'), range.from, range.to),
    [waste, recipeById, range.from, range.to],
  )

  return (
    <div>
      <PageHeader
        title="Logbook"
        subtitle="Complete days only. A past meal counts unless you leave it out. Marking today as consumed records the meal; it joins this average tomorrow."
        actions={
          <Button variant="secondary" onClick={() => navigate('/more')}>
            Back
          </Button>
        }
      />
      <SegmentedControl
        className="mb-5"
        value={String(window)}
        onChange={(id) => setWindow(Number(id) as LogWindow)}
        options={[
          { id: '7', label: '7 days' },
          { id: '30', label: '30 days' },
          { id: '365', label: 'Year' },
        ]}
      />

      <section className="mb-5 card-elevated p-4">
        <h2 className="mb-1 text-lg">Nutrition</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Average of {nutrition.daysWithFood} day{nutrition.daysWithFood === 1 ? '' : 's'} with food
          · {nutrition.mealCount} meals · {range.from} to {range.to}
        </p>
        <MacroBar nutrition={nutrition.average} goals={goals} />
      </section>

      <section className="mb-5 card-elevated p-4">
        <h2 className="mb-3 text-lg">Shopping</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Spent" value={`${spent.total} Kč`} />
          <Stat label="Per day" value={`${spent.perDay} Kč`} />
          <Stat label="Per eaten meal" value={`${spent.perMeal} Kč`} />
          <Stat label="Restocks" value={String(spent.trips)} />
        </dl>
      </section>

      <section className="mb-5 card-elevated p-4">
        <h2 className="mb-1 text-lg">Cooking</h2>
        <p className="mb-3 text-sm text-ink-muted">
          {cooking.sessionCount} logged session{cooking.sessionCount === 1 ? '' : 's'} in this window.
        </p>
        {cooking.mostCooked.length > 0 ? (
          <ul className="mb-3 space-y-1 text-sm">
            {cooking.mostCooked.map((row) => (
              <li key={row.name} className="flex justify-between gap-2">
                <span>{row.name}</span>
                <span className="text-ink-muted">{row.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-ink-muted">No cooks in this window.</p>
        )}
        <h3 className="mb-1 text-sm font-semibold">Never cooked</h3>
        {cooking.neverCooked.length === 0 ? (
          <p className="text-sm text-ink-muted">Every dish has been cooked at least once.</p>
        ) : (
          <p className="text-sm text-ink-muted">{cooking.neverCooked.slice(0, 12).join(' · ')}</p>
        )}
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-semibold">Sessions</h3>
          <CookLogList from={range.from} to={today} />
        </div>
      </section>

      <section className="card-elevated p-4">
        <h2 className="mb-3 text-lg">Waste</h2>
        <dl className="mb-3 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Portions discarded" value={String(wasted.portions)} />
          <Stat
            label="Cost"
            value={wasted.cost > 0 ? `${Math.round(wasted.cost)} Kč` : '—'}
          />
        </dl>
        {wasted.pricedPortions < wasted.portions ? (
          <p className="mb-3 text-xs text-ink-muted">
            Cost covers discards made after a lot had a price. Older waste has no cost.
          </p>
        ) : null}
        {wasted.top.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {wasted.top.map((row) => (
              <li key={row.name} className="flex justify-between gap-2">
                <span>{row.name}</span>
                <span className="text-ink-muted">
                  {row.portions}
                  {row.cost > 0 ? ` · ${Math.round(row.cost)} Kč` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Nothing discarded in this window.</p>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-display text-2xl">{value}</dd>
    </div>
  )
}
