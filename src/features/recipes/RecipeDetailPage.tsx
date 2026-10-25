import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '@/db/database'
import { EFFORT_LEVELS } from '@/domain/types'
import { dishCategoryLabel, recipeTechnique, techniqueLabel } from '@/domain/dishTaxonomy'
import {
  formatQuantity,
  isAlwaysAvailable,
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
import { timerToSeconds, formatDuration } from '@/domain/nutrition'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { ChefTipsPanel } from '@/shared/ChefTips'
import { assetUrl } from '@/shared/assetUrl'
import { RecipeStoragePanel } from '@/shared/RecipeStoragePanel'
import {
  galleryItemsFromSteps,
  StepImageGallery,
  StepImageThumb,
} from '@/shared/StepImageGallery'
import { normalizeYoutubeUrl } from '@/domain/youtube'
import { YoutubeWatchButton } from '@/shared/YoutubeWatchButton'
import { loadRecipeTaste, setRecipeTaste, type RecipeTaste } from '@/domain/weekPlanner'
import { recipeMealRoles } from '@/domain/mealRoles'
import { appConfirm } from '@/shared/dialog'
import { Badge, Button, PageHeader, WarnBanner } from '@/shared/ui'

export function RecipeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const recipeId = Number(id)
  const goals = useGoals()
  const recipe = useLiveQuery(() => db.recipes.get(recipeId), [recipeId])
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const allRecipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const servings = useLiveQuery(() => db.servings.toArray(), []) ?? []
  const [taste, setTaste] = useState<RecipeTaste | null>(
    () => loadRecipeTaste()[String(recipeId)] ?? null,
  )
  useEffect(() => {
    setTaste(loadRecipeTaste()[String(recipeId)] ?? null)
  }, [recipeId])
  const sessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []
  const [galleryStartId, setGalleryStartId] = useState<string | null>(null)

  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const recipeById = useMemo(() => new Map(allRecipes.map((r) => [r.id!, r])), [allRecipes])
  const stock = useMemo(() => stockTotals(pantry), [pantry])

  function close() {
    navigate('/recipes')
  }

  if (!id || id === 'new' || Number.isNaN(recipeId)) {
    return null
  }

  if (!recipe) {
    return (
      <div>
        <PageHeader
          title="Recipe"
          actions={
            <Button variant="secondary" onClick={close}>
              Back
            </Button>
          }
        />
        <p className="text-ink-muted">Recipe not found.</p>
      </div>
    )
  }

  const r = recipe
  const nutrition = recipeNutrition(r, ingById)
  const avail = recipePortionsAvailable(r, stock, ingById)
  const prep = isPrepRecipe(r)
  const staged = isStagedRecipe(r)
  const lead = leadDaysAhead(r)
  const stages = activeRecipeStages(r)
  const yieldIng = r.yieldIngredientId
    ? ingById.get(r.yieldIngredientId)
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
  const stepGalleryItems = galleryItemsFromSteps(r.steps)
  const youtubeHref = normalizeYoutubeUrl(r.youtubeUrl ?? '')
  const mealRoles = recipeMealRoles(r)

  async function startCookNow() {
    if (staged) {
      const ok = await appConfirm(
        `${r.name} starts ${lead} day${lead === 1 ? '' : 's'} ahead. Cooking now covers only the cook-day stage — plan a session to book the earlier prep days.\n\nCook the final stage now?`,
      )
      if (!ok) return
    }
    const active = await db.cookingSessions.where('status').equals('active').first()
    if (active) {
      if (!(await appConfirm('A session is already active. Open it instead?'))) return
      navigate(`/cook/${active.id}`)
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const newId = await db.cookingSessions.add({
      date: today,
      status: 'active',
      dishes: [{ recipeId, portions: r.portions, stepsDone: [] }],
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
    if (!(await appConfirm(`Delete “${r.name}”? This cannot be undone.`, { danger: true, confirmLabel: 'Delete' }))) return
    await db.recipes.delete(recipeId)
    close()
  }

  return (
    <>
    <div>
      <PageHeader
        title={r.name}
        subtitle={r.description || undefined}
        actions={
          <Button variant="secondary" onClick={close}>
            Back
          </Button>
        }
      />

      {r.imageDataUrl ? (
        <img
          src={assetUrl(r.imageDataUrl)}
          alt=""
          className="mb-5 h-52 w-full rounded-[var(--radius-card)] object-cover shadow-card sm:h-64"
        />
      ) : null}

      <div className="mb-5 flex flex-col gap-2">
        <Button className="w-full" onClick={() => void startCookNow()}>
          Cook now
        </Button>
        <div className="flex gap-2">
          <Button className="flex-1" variant="secondary" onClick={() => void addToSession()}>
            Add to session
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => navigate(`/recipes/${recipeId}/edit`)}
          >
            Edit
          </Button>
        </div>
      </div>

      {!avail.cookable ? (
        <div className="mb-4">
          <WarnBanner>Some ingredients are missing from the pantry for a full cook.</WarnBanner>
        </div>
      ) : null}

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {prep ? <Badge tone="accent">Prep</Badge> : null}
          {staged ? <Badge tone="accent">{leadTimeLabel(lead)}</Badge> : null}
          <Badge>{dishCategoryLabel(r.category)}</Badge>
          <Badge tone="accent">{EFFORT_LEVELS.find((e) => e.id === r.effort)?.label}</Badge>
          <Badge tone={avail.cookable ? 'ok' : 'warn'}>
            {avail.available}/{avail.needed} in pantry
          </Badge>
        </div>
        {mealRoles.length > 0 ? (
          <p className="text-sm text-ink-muted">Plate roles: {mealRoles.join(' · ')}</p>
        ) : null}
        <p className="text-sm text-ink-muted">
          {techniqueLabel(recipeTechnique(r))} · {formatQuantity(r, r.portions)}
        </p>
      </div>

      {!prep ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant={taste === 'liked' ? 'primary' : 'secondary'}
            className="!py-1.5"
            onClick={() => {
              const next = taste === 'liked' ? null : 'liked'
              setRecipeTaste(recipeId, next)
              setTaste(next)
            }}
          >
            Liked
          </Button>
          <Button
            variant={taste === 'skip' ? 'primary' : 'secondary'}
            className="!py-1.5"
            onClick={() => {
              const next = taste === 'skip' ? null : 'skip'
              setRecipeTaste(recipeId, next)
              setTaste(next)
            }}
          >
            Skip next time
          </Button>
        </div>
      ) : null}

      {r.source ? (
        <p className="mb-4 text-sm text-ink-muted">
          Source:{' '}
          {/^https?:\/\//i.test(r.source.trim()) ? (
            <a
              href={r.source.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline"
            >
              {r.source.trim()}
            </a>
          ) : (
            r.source
          )}
        </p>
      ) : null}

      {youtubeHref ? <YoutubeWatchButton href={youtubeHref} className="mb-4" /> : null}

      {prep && r.yieldAmount != null && yieldIng ? (
        <section className="mb-5 border-b border-line pb-5">
          <h2 className="mb-2 text-lg">Pantry yield</h2>
          <p className="text-sm text-ink-muted">
            One cook of {r.portions} {r.portions === 1 ? 'batch' : 'batches'} adds{' '}
            <span className="font-medium text-ink">
              {prepYieldAmount(r, r.portions)} {yieldIng.unit}
            </span>{' '}
            of {yieldIng.name} to the pantry (Homemade).
          </p>
        </section>
      ) : (
        <section className="mb-5 border-b border-line pb-5">
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
          {r.ingredients.map((line, idx) => {
            const ing = ingById.get(line.ingredientId)
            const always = isAlwaysAvailable(ing)
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
                <span
                  className={`text-right ${
                    always || have >= line.amount ? 'text-ok' : 'text-warn'
                  }`}
                >
                  {formatted.primary}
                  {formatted.stockHint ? (
                    <span className="text-ink-muted"> ({formatted.stockHint})</span>
                  ) : null}
                  <span className="block text-xs text-ink-muted">
                    {always
                      ? 'always available'
                      : `have ${have}${ing ? ` ${ing.unit}` : ''}`}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <ChefTipsPanel recipe={r} />

      <section className="mb-5">
        <h2 className="mb-2 text-lg">Steps</h2>
        <div className="space-y-5">
          {stages.map((stage) => (
            <div key={stage.daysAhead}>
              {staged ? (
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-base font-semibold">{stageLabel(stage.daysAhead)}</h3>
                  <span className="text-xs text-ink-muted">
                    {stage.steps.length} step{stage.steps.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : null}
              <div className="space-y-4">
                {groupRecipeSteps(stage.steps).map((section) => (
                  <div
                    key={`${section.name}-${section.steps[0]?.id}`}
                    className="rounded-md border border-line bg-paper-elevated/60 p-3"
                  >
                    <h4 className="mb-2 text-base font-semibold text-ink">
                      {section.name}
                    </h4>
                    <ol className="space-y-3">
                      {section.steps.map((step, idx) => (
                        <li
                          key={step.id}
                          className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm"
                        >
                          <div className="flex gap-3">
                            {step.imageDataUrl ? (
                              <StepImageThumb
                                src={step.imageDataUrl}
                                className="h-16 w-16"
                                onOpen={() => setGalleryStartId(step.id)}
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <span className="text-ink-muted">{idx + 1}.</span>{' '}
                              {step.description}
                              {step.requiresTimer && step.timerDuration && step.timerUnit ? (
                                <div className="mt-1 text-xs font-medium text-lacquer">
                                  Timer{' '}
                                  {formatDuration(
                                    timerToSeconds(step.timerDuration, step.timerUnit),
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
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

      {!prep && (r.repurposesFromRecipeIds?.length || allRecipes.some((o) => o.repurposesFromRecipeIds?.includes(recipeId))) ? (
        <section className="mb-5 border-b border-line pb-5">
          <h2 className="mb-2 text-lg">Leftover transforms</h2>
          {r.repurposesFromRecipeIds?.length ? (
            <p className="mb-2 text-sm text-ink-muted">
              Uses leftovers from:{' '}
              {r.repurposesFromRecipeIds
                .map((id) => recipeById.get(id)?.name ?? `#${id}`)
                .join(', ')}
            </p>
          ) : null}
          {(() => {
            const into = allRecipes.filter(
              (o) => o.id != null && o.repurposesFromRecipeIds?.includes(recipeId),
            )
            if (into.length === 0) return null
            return (
              <p className="text-sm text-ink-muted">
                Can become:{' '}
                {into.map((o) => o.name).join(', ')}
              </p>
            )
          })()}
        </section>
      ) : null}

      <RecipeStoragePanel
        fridgeDays={r.fridgeDays}
        freezerDays={r.freezerDays}
        storageDays={r.storageDays}
        storageEnv={r.storageEnv}
        storageInstructions={r.storageInstructions}
      />

      <Button variant="ghost" className="mt-6 w-full text-danger" onClick={() => void remove()}>
        Delete recipe
      </Button>
    </div>
    <StepImageGallery
      open={galleryStartId != null}
      startId={galleryStartId}
      items={stepGalleryItems}
      onClose={() => setGalleryStartId(null)}
    />
    </>
  )
}
