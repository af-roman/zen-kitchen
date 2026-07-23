import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db/database'
import { DISH_CATEGORIES, EFFORT_LEVELS } from '@/domain/types'
import { recipePortionsAvailable, storageLabel } from '@/domain/kitchen'
import { recipeNutrition, stockTotals, groupRecipeSteps } from '@/domain/recipeMath'
import { timerToSeconds } from '@/domain/nutrition'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { Badge, Button, PageHeader, WarnBanner } from '@/shared/ui'
import { formatDuration } from '@/domain/nutrition'

export function RecipeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recipeId = Number(id)
  const goals = useGoals()
  const recipe = useLiveQuery(() => db.recipes.get(recipeId), [recipeId])
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const servings = useLiveQuery(() => db.servings.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []

  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const stock = useMemo(() => stockTotals(pantry), [pantry])

  if (!recipe) {
    return <p className="text-ink-muted">Recipe not found.</p>
  }

  const nutrition = recipeNutrition(recipe, ingById)
  const avail = recipePortionsAvailable(recipe, stock)
  const upcoming = [
    ...sessions
      .filter((s) => s.status !== 'done' && s.dishes.some((d) => d.recipeId === recipeId))
      .map((s) => `Session ${s.date}`),
    ...servings
      .filter((s) => s.items.some((i) => i.recipeId === recipeId))
      .map((s) => `${s.meal} on ${s.date}`),
  ].slice(0, 5)

  async function startCookNow() {
    const active = await db.cookingSessions.where('status').equals('active').first()
    if (active) {
      if (!confirm('A session is already active. Open it instead?')) return
      navigate(`/cook/${active.id}`)
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const newId = await db.cookingSessions.add({
      date: today,
      status: 'active',
      dishes: [{ recipeId, portions: recipe!.portions, stepsDone: [] }],
      notes: '',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    navigate(`/cook/${newId}`)
  }

  async function addToSession() {
    navigate(`/sessions/new?recipeId=${recipeId}`)
  }

  async function remove() {
    if (!confirm('Delete this recipe?')) return
    await db.recipes.delete(recipeId)
    navigate('/recipes')
  }

  return (
    <div>
      <PageHeader
        title={recipe.name}
        subtitle={recipe.description}
        actions={
          <Button variant="secondary" onClick={() => navigate(`/recipes/${recipeId}/edit`)}>
            Edit
          </Button>
        }
      />
      {recipe.imageDataUrl ? (
        <img
          src={recipe.imageDataUrl}
          alt=""
          className="mb-4 h-48 w-full rounded-[var(--radius-card)] object-cover"
        />
      ) : null}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge>{DISH_CATEGORIES.find((c) => c.id === recipe.category)?.label}</Badge>
        <Badge tone="accent">{EFFORT_LEVELS.find((e) => e.id === recipe.effort)?.label}</Badge>
        <Badge>
          {recipe.portions} portions · keeps {recipe.storageDays}d ({storageLabel(recipe.storageEnv)})
        </Badge>
        <Badge tone={avail.cookable ? 'ok' : 'warn'}>
          {avail.available}/{avail.needed} in pantry
        </Badge>
      </div>
      {recipe.tip ? (
        <p className="mb-4 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm italic text-accent-deep">
          Chef’s tip: {recipe.tip}
        </p>
      ) : null}

      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-3 text-lg">Nutrition per portion</h2>
        <MacroBar nutrition={nutrition} goals={goals} />
      </section>

      {upcoming.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-lg">Upcoming</h2>
          <ul className="space-y-1 text-sm text-ink-muted">
            {upcoming.map((u) => (
              <li key={u}>· {u}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-5">
        <h2 className="mb-2 text-lg">Ingredients</h2>
        <ul className="space-y-1.5">
          {recipe.ingredients.map((line) => {
            const ing = ingById.get(line.ingredientId)
            const have = stock.get(line.ingredientId) ?? 0
            return (
              <li
                key={line.ingredientId}
                className="flex justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span>{ing?.name ?? 'Unknown'}</span>
                <span className={have >= line.amount ? 'text-ok' : 'text-warn'}>
                  {line.amount} {ing?.unit} (have {have})
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-lg">Steps</h2>
        <div className="space-y-4">
          {groupRecipeSteps(recipe.steps).map((section) => (
            <div
              key={`${section.name ?? 'steps'}-${section.steps[0]?.id}`}
              className={
                section.name
                  ? 'rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-3'
                  : undefined
              }
            >
              {section.name ? (
                <h3 className="mb-2 font-display text-base text-accent-deep">{section.name}</h3>
              ) : null}
              <ol className="space-y-3">
                {section.steps.map((step, idx) => (
                  <li key={step.id} className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm">
                    <span className="text-ink-muted">{idx + 1}.</span> {step.description}
                    {step.requiresTimer && step.timerDuration && step.timerUnit ? (
                      <div className="mt-1 text-xs text-accent-deep">
                        Timer {formatDuration(timerToSeconds(step.timerDuration, step.timerUnit))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" onClick={() => void startCookNow()}>
          Cook now
        </Button>
        <Button className="flex-1" variant="secondary" onClick={() => void addToSession()}>
          Add to session
        </Button>
      </div>
      {!recipe.seeded ? (
        <Button variant="danger" className="mt-3 w-full" onClick={() => void remove()}>
          Delete recipe
        </Button>
      ) : (
        <p className="mt-3 text-center text-xs text-ink-muted">
          Seeded recipe — you can edit it; deleting is available after edit if you prefer a custom set.
        </p>
      )}
      <div className="mt-4 text-center">
        <Link to="/recipes" className="text-sm text-ink-muted underline">
          Back to recipes
        </Link>
      </div>
      {!avail.cookable ? (
        <div className="mt-4">
          <WarnBanner>Some ingredients are missing from the pantry for a full cook.</WarnBanner>
        </div>
      ) : null}
    </div>
  )
}
