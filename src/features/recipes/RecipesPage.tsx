import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  DISH_CATEGORIES,
  EFFORT_LEVELS,
  type DishCategory,
  type Effort,
  type Recipe,
} from '@/domain/types'
import { recipePortionsAvailable } from '@/domain/kitchen'
import { recipeNutrition, stockTotals } from '@/domain/recipeMath'
import { useGoals } from '@/shared/hooks'
import { MacroInline } from '@/shared/MacroBar'
import { Badge, Button, EmptyState, PageHeader, inputClass } from '@/shared/ui'

type SortKey = 'name' | 'effort' | 'newest'

export function RecipesPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const stock = useMemo(() => stockTotals(pantry), [pantry])

  const [q, setQ] = useState('')
  const [category, setCategory] = useState<DishCategory | 'all'>('all')
  const [effort, setEffort] = useState<Effort | 'all'>('all')
  const [cookableOnly, setCookableOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('name')
  const [compact, setCompact] = useState(false)

  const filtered = useMemo(() => {
    let list = [...recipes]
    list = list.filter((r) => {
      if (category !== 'all' && r.category !== category) return false
      if (effort !== 'all' && r.effort !== effort) return false
      if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false
      const avail = recipePortionsAvailable(r, stock)
      if (cookableOnly && !avail.cookable) return false
      return true
    })
    const effortOrder = { easy: 0, medium: 1, advanced: 2 }
    list.sort((a, b) => {
      if (sort === 'effort') return effortOrder[a.effort] - effortOrder[b.effort]
      if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt)
      return a.name.localeCompare(b.name)
    })
    return list
  }, [recipes, q, category, effort, cookableOnly, sort, stock])

  return (
    <div>
      <PageHeader
        title="Recipes"
        subtitle="Batch-friendly dishes for a calm Japanese week."
        actions={
          <Button onClick={() => navigate('/recipes/new')}>Add</Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <input
          className={inputClass}
          placeholder="Search recipes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={inputClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as DishCategory | 'all')}
        >
          <option value="all">All dish types</option>
          {DISH_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={effort}
          onChange={(e) => setEffort(e.target.value as Effort | 'all')}
        >
          <option value="all">Any effort</option>
          {EFFORT_LEVELS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name">Sort A–Z</option>
          <option value="effort">Sort by effort</option>
          <option value="newest">Sort by newest</option>
        </select>
      </div>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={cookableOnly}
            onChange={(e) => setCookableOnly(e.target.checked)}
          />
          Cookable now
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
          Compact list
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No recipes match" body="Try clearing filters or add a new recipe." />
      ) : (
        <ul className={compact ? 'space-y-2' : 'space-y-3'}>
          {filtered.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              compact={compact}
              stock={stock}
              nutrition={recipeNutrition(recipe, ingById)}
              goalsKcal={goals.dailyKcal}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function RecipeRow({
  recipe,
  compact,
  stock,
  nutrition,
}: {
  recipe: Recipe
  compact: boolean
  stock: Map<number, number>
  nutrition: ReturnType<typeof recipeNutrition>
  goalsKcal: number
}) {
  const avail = recipePortionsAvailable(recipe, stock)
  const cat = DISH_CATEGORIES.find((c) => c.id === recipe.category)?.label
  const effort = EFFORT_LEVELS.find((e) => e.id === recipe.effort)?.label

  if (compact) {
    return (
      <li>
        <Link
          to={`/recipes/${recipe.id}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper-elevated px-3 py-2"
        >
          <span className="font-medium">{recipe.name}</span>
          <span className="text-xs text-ink-muted">
            {avail.available}/{avail.needed} · {effort}
          </span>
        </Link>
      </li>
    )
  }

  return (
    <li>
      <Link
        to={`/recipes/${recipe.id}`}
        className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-3 transition hover:border-accent/40"
      >
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-line/40">
          {recipe.imageDataUrl ? (
            <img src={recipe.imageDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-ink-muted">Dish</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg text-accent-deep">{recipe.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge>{cat}</Badge>
            <Badge tone="accent">{effort}</Badge>
            <Badge tone={avail.cookable ? 'ok' : 'neutral'}>
              {avail.available}/{avail.needed} ingredients
            </Badge>
          </div>
          <div className="mt-2">
            <MacroInline nutrition={nutrition} />
            <span className="text-xs text-ink-muted"> / portion</span>
          </div>
        </div>
      </Link>
    </li>
  )
}
