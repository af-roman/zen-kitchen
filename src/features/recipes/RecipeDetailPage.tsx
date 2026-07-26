import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db/database'
import { DISH_CATEGORIES, EFFORT_LEVELS } from '@/domain/types'
import {
  formatQuantity,
  isPrepRecipe,
  prepYieldAmount,
  recipePortionsAvailable,
} from '@/domain/kitchen'
import { formatRecipeAmount, measureUnitOf } from '@/domain/measures'
import { recipeNutrition, stockTotals, groupRecipeSteps } from '@/domain/recipeMath'
import {
  activeRecipeStages,
  isStagedRecipe,
  leadDaysAhead,
  leadTimeLabel,
  stageLabel,
  stageOfLine,
} from '@/domain/stages'
import { timerToSeconds } from '@/domain/nutrition'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { ChefTipsPanel } from '@/shared/ChefTips'
import { RecipeStoragePanel } from '@/shared/RecipeStoragePanel'
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
  const prep = isPrepRecipe(recipe)
  const staged = isStagedRecipe(recipe)
  const lead = leadDaysAhead(recipe)
  const stages = activeRecipeStages(recipe)
  const yieldIng = recipe.yieldIngredientId
    ? ingById.get(recipe.yieldIngredientId)
    : undefined
  const upcoming = [
    ...sessions
      .filter((s) => s.status !== 'done' && s.dishes.some((d) => d.recipeId === recipeId))
      .map((s) => `Session ${s.date}`),
    ...(prep
      ? []
      : servings
          .filter((s) => s.items.some((i) => i.recipeId === recipeId))
          .map((s) => `${s.meal} on ${s.date}`)),
  ].slice(0, 5)

  async function startCookNow() {
    if (staged) {
      const ok = confirm(
        `${recipe!.name} starts ${lead} day${lead === 1 ? '' : 's'} ahead. Cooking now covers only the cook-day stage — plan a session to book the earlier prep days.\n\nCook the final stage now?`,
      )
      if (!ok) return
    }
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
        {prep ? <Badge tone="accent">Prep</Badge> : null}
        {staged ? <Badge tone="accent">{leadTimeLabel(lead)}</Badge> : null}
        <Badge>{DISH_CATEGORIES.find((c) => c.id === recipe.category)?.label}</Badge>
        <Badge tone="accent">{EFFORT_LEVELS.find((e) => e.id === recipe.effort)?.label}</Badge>
        <Badge>
          {formatQuantity(recipe, recipe.portions)}
        </Badge>
        <Badge tone={avail.cookable ? 'ok' : 'warn'}>
          {avail.available}/{avail.needed} in pantry
        </Badge>
      </div>
      {recipe.source ? (
        <p className="mb-4 text-sm text-ink-muted">
          Source:{' '}
          {/^https?:\/\//i.test(recipe.source.trim()) ? (
            <a
              href={recipe.source.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-deep underline"
            >
              {recipe.source.trim()}
            </a>
          ) : (
            recipe.source
          )}
        </p>
      ) : null}
      {prep && recipe.yieldAmount != null && yieldIng ? (
        <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <h2 className="mb-2 text-lg">Pantry yield</h2>
          <p className="text-sm text-ink-muted">
            One cook of {recipe.portions}{' '}
            {recipe.portions === 1 ? 'batch' : 'batches'} adds{' '}
            <span className="font-medium text-ink">
              {prepYieldAmount(recipe, recipe.portions)} {yieldIng.unit}
            </span>{' '}
            of {yieldIng.name} to the pantry (Homemade).
          </p>
        </section>
      ) : (
        <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <h2 className="mb-3 text-lg">Nutrition per portion</h2>
          <MacroBar
            nutrition={nutrition}
            goals={goals}
            goalCaption="Compared to your daily targets (one portion)"
          />
        </section>
      )}

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
          {recipe.ingredients.map((line, idx) => {
            const ing = ingById.get(line.ingredientId)
            const have = stock.get(line.ingredientId) ?? 0
            const formatted = ing
              ? formatRecipeAmount(line.amount, measureUnitOf(line, ing), ing)
              : { primary: String(line.amount) }
            return (
              <li
                key={`${line.ingredientId}-${idx}`}
                className="flex justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
              >
                <span>
                  {ing?.name ?? 'Unknown'}
                  {staged && stageOfLine(line) > 0 ? (
                    <span className="block text-xs text-ink-muted">
                      {stageLabel(stageOfLine(line))}
                    </span>
                  ) : null}
                </span>
                <span className={`text-right ${have >= line.amount ? 'text-ok' : 'text-warn'}`}>
                  {formatted.primary}
                  {formatted.stockHint ? (
                    <span className="block text-xs text-ink-muted">({formatted.stockHint})</span>
                  ) : null}
                  <span className="block text-xs text-ink-muted">
                    have {have}
                    {ing ? ` ${ing.unit}` : ''}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <ChefTipsPanel recipe={recipe} />

      <RecipeStoragePanel
        storageDays={recipe.storageDays}
        storageEnv={recipe.storageEnv}
        storageInstructions={recipe.storageInstructions}
      />

      <section className="mb-5">
        <h2 className="mb-2 text-lg">Steps</h2>
        <div className="space-y-5">
          {stages.map((stage) => (
            <div key={stage.daysAhead}>
              {staged ? (
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="font-display text-base">{stageLabel(stage.daysAhead)}</h3>
                  <span className="text-xs text-ink-muted">
                    {stage.steps.length} step{stage.steps.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : null}
              <div className="space-y-4">
                {groupRecipeSteps(stage.steps).map((section) => (
                  <div
                    key={`${section.name ?? 'steps'}-${section.steps[0]?.id}`}
                    className={
                      section.name
                        ? 'rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 p-3'
                        : undefined
                    }
                  >
                    {section.name ? (
                      <h4 className="mb-2 font-display text-base text-accent-deep">
                        {section.name}
                      </h4>
                    ) : null}
                    <ol className="space-y-3">
                      {section.steps.map((step, idx) => (
                        <li
                          key={step.id}
                          className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm"
                        >
                          <span className="text-ink-muted">{idx + 1}.</span> {step.description}
                          {step.requiresTimer && step.timerDuration && step.timerUnit ? (
                            <div className="mt-1 text-xs text-accent-deep">
                              Timer{' '}
                              {formatDuration(timerToSeconds(step.timerDuration, step.timerUnit))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {!avail.cookable ? (
        <div className="mb-4">
          <WarnBanner>Some ingredients are missing from the pantry for a full cook.</WarnBanner>
        </div>
      ) : null}

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
          Seeded recipe — edit freely; delete if you prefer your own set.
        </p>
      )}
      <div className="mt-4 text-center">
        <Link to="/recipes" className="text-sm text-ink-muted underline">
          Back to recipes
        </Link>
      </div>
    </div>
  )
}
