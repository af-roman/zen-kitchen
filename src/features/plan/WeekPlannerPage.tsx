import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import { acceptWeekDraft } from '@/db/weekPlannerOps'
import { MEAL_SLOTS, mealSlotIndex, type MealSlot, type Nutrition } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'
import {
  adjustServingPortions,
  buildPlannerCatalog,
  cookChoiceDates,
  generateWeekDraft,
  loadPlannerPrefs,
  savePlannerPrefs,
  suggestCookDates,
  type PlannerPrefs,
  type WeekDraft,
  type WeekDraftServing,
} from '@/domain/weekPlanner'
import { addNutrition, emptyNutrition, scaleNutrition } from '@/domain/nutrition'
import { useGoals } from '@/shared/hooks'
import { appAlert, appConfirm } from '@/shared/dialog'
import { Checkbox, DateField, NumberField, SelectField } from '@/shared/forms'
import { IconCheck, IconSpark } from '@/shared/icons'
import { Button, EmptyState, Field, PageHeader, WarnBanner } from '@/shared/ui'
import { MacroRings } from '@/shared/MacroBar'

function dayNutrition(
  items: { recipeId: number; portions: number }[],
  byId: Map<number, { nutritionPerPortion: Nutrition }>,
): Nutrition {
  let total = emptyNutrition()
  for (const item of items) {
    const candidate = byId.get(item.recipeId)
    if (!candidate) continue
    total = addNutrition(total, scaleNutrition(candidate.nutritionPerPortion, item.portions))
  }
  return total
}

export function WeekPlannerPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const readyBatches = useLiveQuery(() => db.readyBatches.toArray(), []) ?? []

  const [prefs, setPrefs] = useState<PlannerPrefs>(() => loadPlannerPrefs())
  const [draft, setDraft] = useState<WeekDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const recipeById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id!, recipe])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((ingredient) => [ingredient.id!, ingredient])), [ingredients])

  useEffect(() => {
    savePlannerPrefs(prefs)
  }, [prefs])

  const catalog = useMemo(
    () =>
      buildPlannerCatalog({
        recipes,
        ingredients,
        pantry,
        readyBatches,
        goals,
        seed: Date.now() % 1_000_000,
      }),
    [recipes, ingredients, pantry, readyBatches, goals],
  )
  const nutritionByRecipe = useMemo(
    () => new Map(catalog.candidates.map((candidate) => [candidate.recipeId, candidate])),
    [catalog],
  )

  function updatePrefs(next: PlannerPrefs) {
    setPrefs(next)
    setDraft(null)
  }

  function toggleMeal(meal: MealSlot) {
    updatePrefs({
      ...prefs,
      meals: (() => {
        const has = prefs.meals.includes(meal)
        const meals = MEAL_SLOTS.map((slot) => slot.id).filter((id) =>
          id === meal ? !has : prefs.meals.includes(id),
        )
        return meals.length === 0 ? prefs.meals : meals
      })(),
    })
  }

  function toggleCook(date: string) {
    const has = prefs.cookDates.includes(date)
    const cookDates = has
      ? prefs.cookDates.filter((cook) => cook !== date)
      : [...prefs.cookDates, date].sort()
    updatePrefs({ ...prefs, cookDates })
  }

  function setWeekStart(weekStartDate: string) {
    updatePrefs({
      ...prefs,
      weekStartDate,
      cookDates: suggestCookDates(weekStartDate, prefs.dayCount).filter((date) => date >= todayISO()),
    })
  }

  function setDayCount(dayCount: number) {
    updatePrefs({
      ...prefs,
      dayCount,
      cookDates: suggestCookDates(prefs.weekStartDate, dayCount).filter((date) => date >= todayISO()),
    })
  }

  async function generate() {
    if (catalog.candidates.length === 0) {
      await appAlert('Add some dish recipes first.', { title: 'Nothing to plan' })
      return
    }
    if (prefs.cookDates.length === 0 && catalog.ready.length === 0) {
      await appAlert('Choose at least one evening you can cook.', { title: 'No cook day' })
      return
    }
    setBusy(true)
    try {
      setDraft(generateWeekDraft(prefs, { ...catalog, seed: Date.now() % 1_000_000 }))
    } finally {
      setBusy(false)
    }
  }

  async function accept() {
    if (!draft) return
    const cookLabel = draft.sessions.map((session) => format(parseISO(session.date), 'EEE d')).join(', ')
    const confirmed = await appConfirm(
      cookLabel
        ? `Replace meals from ${format(parseISO(draft.prefs.weekStartDate), 'EEE d')} for ${draft.prefs.dayCount} days. Cook evenings: ${cookLabel}.`
        : `Replace meals from ${format(parseISO(draft.prefs.weekStartDate), 'EEE d')} using food already cooked.`,
      { confirmLabel: 'Use this plan' },
    )
    if (!confirmed) return
    setBusy(true)
    try {
      const result = await acceptWeekDraft(draft, recipes, ingredients)
      const cleared = result.mealsCleared > 0 ? ` Cleared: ${result.mealsCleared}.` : ''
      const blocked = result.mealsBlocked > 0 ? ` Blocked by a cook already underway: ${result.mealsBlocked}.` : ''
      await appAlert(
        `Sessions: ${result.sessionsCreated}. Meals written: ${result.mealsWritten}.${cleared}${blocked} Shop lines: ${result.shopAdded + result.shopUpdated}.`,
        { title: 'Plan saved' },
      )
      navigate('/week')
    } finally {
      setBusy(false)
    }
  }

  const days = useMemo(() => {
    if (!draft) return [] as string[]
    return Array.from({ length: draft.prefs.dayCount }, (_, index) =>
      format(addDays(parseISO(draft.prefs.weekStartDate), index), 'yyyy-MM-dd'),
    )
  }, [draft])

  const choiceDates = cookChoiceDates(prefs.weekStartDate, prefs.dayCount)
  const today = todayISO()

  function servingLabel(serving: WeekDraftServing): string {
    const name = recipeById.get(serving.recipeId)?.name ?? `Recipe ${serving.recipeId}`
    if (serving.fromRecipeId != null) {
      const source = recipeById.get(serving.fromRecipeId)?.name
      return source ? `${name} (from ${source})` : name
    }
    return name
  }

  return (
    <div>
      <PageHeader
        title="Plan my week"
        subtitle="Pick the first day you want to eat, and the evenings you can cook."
      />

      <section className="card-elevated mb-4 space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First day of meals">
            <DateField value={prefs.weekStartDate} onChange={setWeekStart} />
          </Field>
          <Field label="Days">
            <NumberField value={prefs.dayCount} min={3} max={14} step={1} onChange={setDayCount} />
          </Field>
        </div>
        <div>
          <p className="mb-1 text-sm text-ink-muted">Meals to fill</p>
          <div className="flex flex-wrap gap-3">
            {MEAL_SLOTS.map((slot) => (
              <Checkbox
                key={slot.id}
                checked={prefs.meals.includes(slot.id)}
                onChange={() => toggleMeal(slot.id)}
                label={slot.label}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm text-ink-muted">Evenings you can cook</p>
          <p className="mb-2 text-xs text-ink-muted">
            A dish is eaten from the next morning through its keep-by date. A 3-day dish cooked Sunday
            lasts through Wednesday.
          </p>
          <div className="flex flex-wrap gap-3">
            {choiceDates.map((date) => (
              <Checkbox
                key={date}
                checked={prefs.cookDates.includes(date)}
                onChange={() => toggleCook(date)}
                label={format(parseISO(date), 'EEE d MMM')}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Same main may repeat">
            <SelectField<number>
              title="Repeat"
              value={prefs.varietyGapDays}
              onChange={(varietyGapDays) => updatePrefs({ ...prefs, varietyGapDays })}
              options={[
                { id: 0, label: 'The next day' },
                { id: 1, label: 'After a day off' },
                { id: 2, label: 'After two days off' },
              ]}
            />
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox
              checked={prefs.preferExpiring}
              onChange={(preferExpiring) => updatePrefs({ ...prefs, preferExpiring })}
              label="Use food that's about to expire first"
            />
          </div>
        </div>
        <button
          type="button"
          className="text-sm font-semibold text-ink-muted"
          onClick={() => setShowMore((open) => !open)}
        >
          {showMore ? 'Hide target leeway' : 'Target leeway'}
        </button>
        {showMore ? (
          <Field label="How far from each daily target still counts as close (%)">
            <NumberField
              value={prefs.macroTolerancePct}
              min={5}
              max={40}
              step={1}
              onChange={(macroTolerancePct) => updatePrefs({ ...prefs, macroTolerancePct })}
            />
          </Field>
        ) : null}
        <Button className="w-full gap-2 sm:w-auto" disabled={busy} onClick={() => void generate()}>
          <IconSpark className="h-4 w-4" />
          {draft ? 'Regenerate' : 'Generate plan'}
        </Button>
      </section>

      {!draft ? (
        <EmptyState
          title={busy ? 'Planning…' : 'No plan yet'}
          body="Each meal is one dish, plus a soup or side when that moves the day closer to your targets. Breakfast stays a single dish."
        />
      ) : (
        <>
          <section className="card-elevated mb-4 p-4">
            <p className="text-sm font-medium text-ink">
            {`${draft.score.dishes} ${draft.score.dishes === 1 ? 'dish' : 'dishes'} · ${draft.score.cooks} ${draft.score.cooks === 1 ? 'cook evening' : 'cook evenings'}`}
              {draft.score.daysOver > 0
                ? ` · ${draft.score.daysOver} day${draft.score.daysOver === 1 ? '' : 's'} over target`
                : ''}
            </p>
            <div className="mt-3">
              <MacroRings
                goals={goals}
                nutrition={draft.avgNutrition}
                size="lg"
                caption="Average planned day vs kitchen goals"
              />
            </div>
            {draft.warnings.length > 0 ? (
              <div className="mt-3 space-y-1">
                {draft.warnings.slice(0, 8).map((warning) => (
                  <WarnBanner key={warning}>{warning}</WarnBanner>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                Filled days are within ±{prefs.macroTolerancePct}% of calories, protein, carbs, and fat.
              </p>
            )}
          </section>

          <section className="card-elevated mb-4 p-4">
            <h2 className="mb-2 text-lg">Cook evenings</h2>
            {draft.sessions.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing new to cook. Meals use food already in the fridge.</p>
            ) : (
              <ul className="space-y-2">
                {draft.sessions.map((session) => (
                  <li key={session.date} className="rounded-lg border border-line px-3 py-2">
                    <div className="font-medium">
                      {format(parseISO(session.date), 'EEE d MMM')}
                      {session.date === today ? ' · today' : ''}
                    </div>
                    <ul className="mt-1 text-sm text-ink-muted">
                      {session.dishes.map((dish) => (
                        <li key={dish.recipeId}>
                          {recipeById.get(dish.recipeId)?.name ?? `Recipe ${dish.recipeId}`} · {dish.portions}{' '}
                          portions
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card-elevated mb-4 p-4">
            <h2 className="mb-1 text-lg">Meals</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Portions change the cook batch. Half portions are for rice, soup, and sides.
            </p>
            <div className="space-y-4">
              {days.map((date) => (
                <div key={date}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="shrink-0 text-sm font-medium">
                      {format(parseISO(date), 'EEE d MMM')}
                      {date === today ? ' · today' : ''}
                    </div>
                    <MacroRings
                      nutrition={dayNutrition(
                        draft.servings.filter((serving) => serving.date === date),
                        nutritionByRecipe,
                      )}
                      goals={goals}
                      size="xs"
                      className="min-w-0 flex-1"
                    />
                  </div>
                  <div className="space-y-2">
                    {[...draft.prefs.meals]
                      .sort((a, b) => mealSlotIndex(a) - mealSlotIndex(b))
                      .map((meal) => {
                        const items = draft.servings.filter((serving) => serving.date === date && serving.meal === meal)
                        const mealLabel = MEAL_SLOTS.find((slot) => slot.id === meal)?.label ?? meal
                        return (
                          <div
                            key={meal}
                            className="rounded-[var(--radius-card)] border border-line bg-ink/[0.03] p-3"
                          >
                            <p className="mb-2 font-medium">{mealLabel}</p>
                            {items.length === 0 ? (
                              <p className="text-sm text-ink-muted">Left open</p>
                            ) : (
                              <ul className="space-y-1">
                                {items.map((serving) => (
                                  <li
                                    key={`${serving.date}|${serving.meal}|${serving.recipeId}|${serving.cookDate}|${serving.batchId ?? ''}|${serving.roleLabel ?? ''}`}
                                    className="flex flex-nowrap items-center gap-2 rounded-lg border border-line bg-paper px-2 py-2 sm:px-3"
                                  >
                                    <div className="min-w-0 flex-1 text-sm">
                                      {serving.roleLabel ? (
                                        <span className="text-ink-muted">{serving.roleLabel}: </span>
                                      ) : null}
                                      {servingLabel(serving)}
                                      <span className="block text-xs text-ink-muted">
                                        {serving.batchId != null
                                          ? 'Already cooked'
                                          : `Cook ${format(parseISO(serving.cookDate), 'EEE d')}`}
                                      </span>
                                    </div>
                                    <NumberField
                                      compact
                                      value={serving.portions}
                                      min={0}
                                      max={8}
                                      step={serving.roleLabel === 'Dish' ? 1 : 0.5}
                                      onChange={(portions) =>
                                        setDraft(adjustServingPortions(draft, serving, portions, catalog))
                                      }
                                    />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card-elevated mb-4 p-4">
            <h2 className="mb-2 text-lg">Shopping</h2>
            {draft.shopping.length === 0 ? (
              <p className="text-sm text-ink-muted">No shortfalls — pantry covers the cook plan.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {draft.shopping.map((line) => {
                  const ingredient = ingById.get(line.ingredientId)
                  return (
                    <li key={line.ingredientId} className="flex justify-between gap-2">
                      <span>{ingredient?.name ?? line.ingredientId}</span>
                      <span className="text-ink-muted">
                        need {line.need}
                        {ingredient?.unit ? ` ${ingredient.unit}` : ''} → buy {line.buy}
                        {line.packs != null ? ` (${line.packs} pack)` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <div className="panel-action flex flex-col gap-2 p-4 pb-8 sm:flex-row sm:flex-wrap">
            <Button className="w-full gap-2 sm:w-auto" disabled={busy} onClick={() => void accept()}>
              <IconCheck className="h-4 w-4" />
              Use this plan
            </Button>
            <Button variant="secondary" className="gap-1.5" disabled={busy} onClick={() => void generate()}>
              <IconSpark className="h-4 w-4" />
              Regenerate
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
