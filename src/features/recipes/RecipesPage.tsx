import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { stockTotals } from '@/domain/recipeMath'
import { assetUrl } from '@/shared/assetUrl'
import { Checkbox, SelectField } from '@/shared/forms'
import { IconPlus } from '@/shared/icons'
import { Badge, Button, EmptyState, PageHeader, SegmentedControl, inputClass } from '@/shared/ui'

type SortKey = 'name' | 'effort' | 'newest'
type KindFilter = 'all' | RecipeKind

const FILTERS_KEY = 'zen-kitchen:recipes-list-v2'

type SavedFilters = {
  q: string
  kind: KindFilter
  category: DishCategory | 'all'
  technique: PreparationTechnique | 'all'
  effort: Effort | 'all'
  cookableOnly: boolean
  sort: SortKey
}

function loadFilters(): Partial<SavedFilters> {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as SavedFilters
  } catch {
    return {}
  }
}

export function RecipesPage() {
  const navigate = useNavigate()
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
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    const next: SavedFilters = {
      q,
      kind,
      category,
      technique,
      effort,
      cookableOnly,
      sort,
    }
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(next))
  }, [q, kind, category, technique, effort, cookableOnly, sort])

  const filtersActive =
    q.trim() !== '' ||
    kind !== 'all' ||
    category !== 'all' ||
    technique !== 'all' ||
    effort !== 'all' ||
    cookableOnly ||
    sort !== 'name'

  function clearFilters() {
    setQ('')
    setKind('all')
    setCategory('all')
    setTechnique('all')
    setEffort('all')
    setCookableOnly(false)
    setSort('name')
  }

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
        subtitle={`${filtered.length} displayed`}
        actions={
          <Button className="gap-1.5" onClick={() => navigate('/recipes/new')}>
            <IconPlus className="h-4 w-4" />
            Add
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <input
          className={inputClass}
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SegmentedControl
          value={kind}
          onChange={setKind}
          options={[
            { id: 'all', label: 'All' },
            { id: 'dish', label: 'Dishes' },
            { id: 'prep', label: 'Prep' },
          ]}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-sm font-semibold text-ink-muted"
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? 'Hide filters' : 'More filters'}
          </button>
          {filtersActive ? (
            <button
              type="button"
              className="text-sm font-semibold text-lacquer"
              onClick={clearFilters}
            >
              Clear
            </button>
          ) : null}
        </div>
        {showFilters ? (
          <div className="grid gap-2 sm:grid-cols-2">
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
                { id: 'name', label: 'A–Z' },
                { id: 'effort', label: 'Effort' },
                { id: 'newest', label: 'Newest' },
              ]}
            />
            <Checkbox
              checked={cookableOnly}
              onChange={setCookableOnly}
              label="Cookable now"
            />
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        recipes.length === 0 ? (
          <EmptyState
            title="No recipes yet"
            body="Add a dish to start planning weeks."
            actions={<Button onClick={() => navigate('/recipes/new')}>Add recipe</Button>}
          />
        ) : (
          <EmptyState
            title="No matches"
            body="Try clearing filters."
            actions={
              <Button variant="secondary" onClick={clearFilters}>
                Clear
              </Button>
            }
          />
        )
      ) : (
        <ul className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} stock={stock} ingredientById={ingById} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RecipeCard({
  recipe,
  stock,
  ingredientById,
}: {
  recipe: Recipe
  stock: Map<number, number>
  ingredientById: Map<number, { alwaysAvailable?: boolean }>
}) {
  const avail = recipePortionsAvailable(recipe, stock, ingredientById)
  const prep = isPrepRecipe(recipe)
  const effort = EFFORT_LEVELS.find((level) => level.id === recipe.effort)?.label

  return (
    <li className="flex">
      <Link
        to={`/recipes/${recipe.id}`}
        className="meal-tile flex h-full w-full flex-col transition hover:scale-[1.02]"
      >
        <div className="aspect-[4/3] shrink-0 bg-ink/5">
          {recipe.imageDataUrl ? (
            <img
              src={assetUrl(recipe.imageDataUrl)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs font-medium text-ink-muted">
              {prep ? 'Prep' : 'Dish'}
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{recipe.name}</p>
          <div className="mt-2 flex flex-wrap content-start gap-1">
            <Badge>{dishCategoryLabel(recipe.category)}</Badge>
            {effort ? <Badge tone="accent">{effort}</Badge> : null}
            {prep ? <Badge>Prep</Badge> : null}
            <Badge tone={avail.cookable ? 'ok' : 'neutral'}>
              {avail.available}/{avail.needed}
            </Badge>
          </div>
        </div>
      </Link>
    </li>
  )
}
