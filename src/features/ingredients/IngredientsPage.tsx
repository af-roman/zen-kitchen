import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { INGREDIENT_CATEGORIES, type Ingredient, type IngredientCategory } from '@/domain/types'
import { hasUnsetNutrition, isAlwaysAvailable } from '@/domain/kitchen'
import { appAlert, appConfirm } from '@/shared/dialog'
import { SelectField } from '@/shared/forms'
import { SwipeReveal } from '@/shared/SwipeReveal'
import { Badge, Button, EmptyState, PageHeader, inputClass } from '@/shared/ui'
import { IngredientEditorSheet } from '@/features/ingredients/IngredientEditorSheet'

export function IngredientsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const missingOnly = params.get('nutrition') === 'missing'
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []) ?? []
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<IngredientCategory | 'all'>('all')
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [creating, setCreating] = useState(false)

  const missing = useMemo(() => ingredients.filter(hasUnsetNutrition), [ingredients])

  const filtered = useMemo(() => {
    return ingredients.filter((i) => {
      if (missingOnly && !hasUnsetNutrition(i)) return false
      if (category !== 'all' && i.category !== category) return false
      if (q && !i.name.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [ingredients, q, category, missingOnly])

  function showAll() {
    const next = new URLSearchParams(params)
    next.delete('nutrition')
    setParams(next, { replace: true })
  }

  function showMissing() {
    const next = new URLSearchParams(params)
    next.set('nutrition', 'missing')
    setParams(next, { replace: true })
  }

  async function remove(id: number) {
    const ing = ingredients.find((i) => i.id === id)
    if (isAlwaysAvailable(ing)) {
      await appAlert('Tap water is built-in and cannot be deleted.')
      return
    }
    if (
      !(await appConfirm('Delete this ingredient? Pantry items that use it will remain orphaned.', {
        danger: true,
        confirmLabel: 'Delete',
      }))
    )
      return
    await db.ingredients.delete(id)
  }

  return (
    <div>
      <PageHeader
        title="Ingredients"
        subtitle="The building blocks for recipes and the pantry."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/more')}>
              Back
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setCreating(true)
              }}
            >
              Add
            </Button>
          </>
        }
      />
      {missing.length > 0 ? (
        <button
          type="button"
          onClick={() => (missingOnly ? showAll() : showMissing())}
          className="mb-4 w-full rounded-2xl bg-warn/10 px-4 py-3 text-left"
        >
          <p className="text-sm font-semibold text-warn">
            {missing.length} ingredient{missing.length === 1 ? '' : 's'} with no nutrition
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Energy and macros are still 0, so meals that use them undercount.{' '}
            {missingOnly ? 'Show every ingredient.' : 'Show only these.'}
          </p>
        </button>
      ) : null}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          className={inputClass}
          placeholder="Search ingredients…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SelectField
          title="Category"
          value={category}
          onChange={setCategory}
          options={[
            { id: 'all', label: 'All categories' },
            ...INGREDIENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
          ]}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={missingOnly ? 'Nutrition is filled in' : 'No ingredients'}
          body={
            missingOnly
              ? 'Every ingredient has energy or macros.'
              : 'Add your first ingredient to get started.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((ing) => {
            const row = (
              <button
                type="button"
                className="card-elevated w-full px-3 py-3 text-left"
                onClick={() => {
                  setEditing(ing)
                  setCreating(true)
                }}
              >
                <div className="font-medium">{ing.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge>
                    {INGREDIENT_CATEGORIES.find((c) => c.id === ing.category)?.label}
                  </Badge>
                  <Badge tone="accent">{ing.unit}</Badge>
                  {isAlwaysAvailable(ing) ? <Badge tone="ok">Always available</Badge> : null}
                  {hasUnsetNutrition(ing) ? <Badge tone="warn">No nutrition</Badge> : null}
                  {ing.unit === 'g' && ing.gramsPerMl != null ? <Badge>spoons ok</Badge> : null}
                  <span className="text-xs text-ink-muted">
                    {ing.nutritionPer100.energyKcal} kcal / 100
                    {ing.unit === 'pcs' ? 'g' : ing.unit}
                  </span>
                  {ing.averagePackPrice ? (
                    <span className="text-xs text-ink-muted">{ing.averagePackPrice} Kč / pack</span>
                  ) : null}
                </div>
              </button>
            )
            return (
              <li key={ing.id}>
                {isAlwaysAvailable(ing) ? (
                  row
                ) : (
                  <SwipeReveal
                    actionLabel={`Delete ${ing.name}`}
                    onAction={() => void remove(ing.id!)}
                  >
                    {row}
                  </SwipeReveal>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <IngredientEditorSheet
        open={creating}
        ingredient={editing}
        onClose={() => setCreating(false)}
        onSaved={() => setCreating(false)}
      />
    </div>
  )
}
