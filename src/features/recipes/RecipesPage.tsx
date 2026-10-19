import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  DISH_CATEGORIES,
  EFFORT_LEVELS,
  PREPARATION_TECHNIQUES,
  type DishCategory,
  type Effort,
  type PreparationTechnique,
  type Recipe,
  type RecipeKind,
} from '@/domain/types'
import { dishCategoryLabel, recipeCategory, recipeTechnique, techniqueLabel } from '@/domain/dishTaxonomy'
import { isPrepRecipe, recipeKindOf, recipePortionsAvailable } from '@/domain/kitchen'
import { recipeNutrition, stockTotals } from '@/domain/recipeMath'
import { useGoals } from '@/shared/hooks'
import { assetUrl } from '@/shared/assetUrl'
import { MacroInline } from '@/shared/MacroBar'
import { Checkbox, SelectField } from '@/shared/forms'
import { Badge, Button, EmptyState, PageHeader, SegmentedControl, inputClass } from '@/shared/ui'

type SortKey = 'name' | 'effort' | 'newest'
type KindFilter = 'all' | RecipeKind

const FILTERS_KEY = 'zen-kitchen:recipes-list'

type SavedFilters = {
  q: string
  kind: KindFilter
  category: DishCategory | 'all'
  technique: PreparationTechnique | 'all'
  effort: Effort | 'all'
  cookableOnly: boolean
  sort: SortKey
  compact: boolean
}

function loadFilters(): Partial<SavedFilters> {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SavedFilters
    const category =
      parsed.category === 'all' || DISH_CATEGORIES.some((c) => c.id === parsed.category)
        ? parsed.category
        : 'all'
    const technique =
      parsed.technique === 'all' ||
      PREPARATION_TECHNIQUES.some((t) => t.id === parsed.technique)
        ? parsed.technique
        : 'all'
    return { ...parsed, category, technique }
  } catch {
    return {}
  }
}

export function RecipesPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const stock = useMemo(() => stockTotals(pantry), [pantry])

  const saved = useMemo(() => loadFilters(), [])
  const [q, setQ] = useState(saved.q ?? '')
  const [kind, setKind] = useState<KindFilter>(saved.kind ?? 'all')
  const [category, setCategory] = useState<DishCategory | 'all'>(saved.category ?? 'all')
  const [technique, setTechnique] = useState<PreparationTechnique | 'all'>(
    saved.technique ?? 'all',
  )
  const [effort, setEffort] = useState<Effort | 'all'>(saved.effort ?? 'all')
  const [cookableOnly, setCookableOnly] = useState(saved.cookableOnly ?? false)
  const [sort, setSort] = useState<SortKey>(saved.sort ?? 'name')
  const [compact, setCompact] = useState(saved.compact ?? false)

  useEffect(() => {
    const next: SavedFilters = {
      q,
      kind,
      category,
      technique,
      effort,
      cookableOnly,
      sort,
      compact,
    }
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(next))
  }, [q, kind, category, technique, effort, cookableOnly, sort, compact])

  const filtered = useMemo(() => {
    let list = [...recipes]
    const qLower = q.trim().toLowerCase()
    list = list.filter((r) => {
      if (kind !== 'all' && recipeKindOf(r) !== kind) return false
      if (category !== 'all' && recipeCategory(r) !== category) return false
      if (technique !== 'all' && recipeTechnique(r) !== technique) return false
      if (effort !== 'all' && r.effort !== effort) return false
      if (qLower) {
        const hay = `${r.name} ${dishCategoryLabel(r.category)} ${techniqueLabel(recipeTechnique(r))}`.toLowerCase()
        if (!hay.includes(qLower)) return false
      }
      const avail = recipePortionsAvailable(r, stock, ingById)
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
  }, [recipes, q, kind, category, technique, effort, cookableOnly, sort, stock, ingById])

  return (
    <div>
      <PageHeader
        title="Recipes"
        subtitle="Dishes for the week, and prep bases that refill the pantry."
        actions={
          <Button onClick={() => navigate('/recipes/new')}>Add recipe</Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Search recipes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SegmentedControl
          className="sm:col-span-2"
          value={kind}
          onChange={setKind}
          options={[
            { id: 'all', label: 'All' },
            { id: 'dish', label: 'Dishes' },
            { id: 'prep', label: 'Prep' },
          ]}
        />
        <SelectField
          title="Category"
          value={category}
          onChange={setCategory}
          options={[
            { id: 'all', label: 'All categories' },
            ...DISH_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
          ]}
        />
        <SelectField
          title="Technique"
          value={technique}
          onChange={setTechnique}
          options={[
            { id: 'all', label: 'Any technique' },
            ...PREPARATION_TECHNIQUES.map((t) => ({ id: t.id, label: t.label })),
          ]}
        />
        <SelectField
          title="Effort"
          value={effort}
          onChange={setEffort}
          options={[
            { id: 'all', label: 'Any effort' },
            ...EFFORT_LEVELS.map((e) => ({ id: e.id, label: e.label })),
          ]}
        />
        <SelectField
          title="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { id: 'name', label: 'Sort A–Z' },
            { id: 'effort', label: 'Sort by effort' },
            { id: 'newest', label: 'Sort by newest' },
          ]}
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-4">
        <Checkbox
          checked={cookableOnly}
          onChange={setCookableOnly}
          label="Cookable now"
        />
        <Checkbox checked={compact} onChange={setCompact} label="Compact list" />
      </div>

      {filtered.length === 0 ? (
        recipes.length === 0 ? (
          <EmptyState
            title="No recipes yet"
            body="Add a quick recipe to start planning cook sessions."
            actions={
              <Button onClick={() => navigate('/recipes/new')}>Add recipe</Button>
            }
          />
        ) : (
          <EmptyState
            title="No recipes match"
            body="Try clearing filters or add a new recipe."
            actions={
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('')
                    setKind('all')
                    setCategory('all')
                    setTechnique('all')
                    setEffort('all')
                    setCookableOnly(false)
                  }}
                >
                  Clear filters
                </Button>
                <Button onClick={() => navigate('/recipes/new')}>Add recipe</Button>
              </>
            }
          />
        )
      ) : (
        <ul className={compact ? 'space-y-2' : 'space-y-3'}>
          {filtered.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              compact={compact}
              stock={stock}
              ingredientById={ingById}
              nutrition={recipeNutrition(recipe, ingById)}
              goalsKcal={goals.dailyKcal}
              yieldName={
                recipe.yieldIngredientId
                  ? ingById.get(recipe.yieldIngredientId)?.name
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      <Outlet />
    </div>
  )
}

function RecipeRow({
  recipe,
  compact,
  stock,
  ingredientById,
  nutrition,
  yieldName,
}: {
  recipe: Recipe
  compact: boolean
  stock: Map<number, number>
  ingredientById: Map<number, { alwaysAvailable?: boolean }>
  nutrition: ReturnType<typeof recipeNutrition>
  goalsKcal: number
  yieldName?: string
}) {
  const avail = recipePortionsAvailable(recipe, stock, ingredientById)
  const cat = dishCategoryLabel(recipe.category)
  const tech = techniqueLabel(recipeTechnique(recipe))
  const effort = EFFORT_LEVELS.find((e) => e.id === recipe.effort)?.label
  const prep = isPrepRecipe(recipe)

  if (compact) {
    return (
      <li>
        <Link
          to={`/recipes/${recipe.id}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-line bg-paper-elevated px-3 py-2"
        >
          <span className="font-medium">
            {recipe.name}
            {prep ? <span className="ml-1.5 text-xs text-accent-deep">Prep</span> : null}
          </span>
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
        className="flex gap-3 card-elevated p-3 transition hover:border-accent/40"
      >
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-line/40">
          {recipe.imageDataUrl ? (
            <img src={assetUrl(recipe.imageDataUrl)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-ink-muted">
              {prep ? 'Prep' : 'Dish'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg text-accent-deep">{recipe.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {prep ? <Badge tone="accent">Prep</Badge> : null}
            <Badge>{cat}</Badge>
            <Badge>{tech}</Badge>
            <Badge tone="accent">{effort}</Badge>
            <Badge tone={avail.cookable ? 'ok' : 'neutral'}>
              {avail.available}/{avail.needed} ingredients
            </Badge>
          </div>
          {prep && recipe.yieldAmount != null && yieldName ? (
            <p className="mt-2 text-xs text-ink-muted">
              Yields {recipe.yieldAmount} → {yieldName} (pantry)
            </p>
          ) : (
            <div className="mt-2">
              <MacroInline nutrition={nutrition} />
              <span className="text-xs text-ink-muted"> / portion</span>
            </div>
          )}
        </div>
      </Link>
    </li>
  )
}
