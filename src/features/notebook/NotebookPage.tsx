import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import { addNutrition, emptyNutrition, scaleNutrition } from '@/domain/nutrition'
import { mealNutritionFromItems } from '@/domain/servings'
import { todayISO } from '@/domain/kitchen'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { PageHeader } from '@/shared/ui'

export function NotebookPage() {
  const goals = useGoals()
  const today = todayISO()
  const from = format(addDays(parseISO(today), -6), 'yyyy-MM-dd')
  const servings =
    useLiveQuery(
      () => db.servings.where('date').between(from, today, true, true).toArray(),
      [from, today],
    ) ?? []
  const waste = useLiveQuery(() => db.waste.toArray(), []) ?? []
  const logs = useLiveQuery(() => db.cookLog.toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  const todayN = useMemo(() => {
    return servings
      .filter((s) => s.date === today)
      .reduce(
        (acc, s) => addNutrition(acc, mealNutritionFromItems(s.items, recipeById, ingById)),
        emptyNutrition(),
      )
  }, [servings, today, recipeById, ingById])

  const weekAvg = useMemo(() => {
    const total = servings.reduce(
      (acc, s) => addNutrition(acc, mealNutritionFromItems(s.items, recipeById, ingById)),
      emptyNutrition(),
    )
    return scaleNutrition(total, 1 / 7)
  }, [servings, recipeById, ingById])

  const wastedPortions = waste.reduce((s, w) => s + w.portions, 0)
  const cooks = logs.length

  return (
    <div>
      <PageHeader
        title="Notebook"
        subtitle="A light glance at nutrition and kitchen rhythm."
      />
      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-3 text-lg">Today</h2>
        <MacroBar nutrition={todayN} goals={goals} />
      </section>
      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-3 text-lg">7-day average</h2>
        <MacroBar nutrition={weekAvg} goals={goals} />
      </section>
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-card)] border border-line p-4">
          <p className="text-xs text-ink-muted">Cooking sessions</p>
          <p className="font-display text-2xl">{cooks}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line p-4">
          <p className="text-xs text-ink-muted">Portions discarded</p>
          <p className="font-display text-2xl">{wastedPortions}</p>
        </div>
      </section>
    </div>
  )
}
