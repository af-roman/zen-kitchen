import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { db } from '@/db/database'
import { acceptWeekDraft } from '@/db/weekPlannerOps'
import { MEAL_SLOTS, type MealSlot } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'
import {
  MEAL_PATTERN_OPTIONS,
  buildPlannerCatalog,
  changeServingPortions,
  generateWeekDraft,
  improveWeekDraft,
  loadPlannerPrefs,
  resolveRecipeShortlist,
  savePlannerPrefs,
  swapServingRecipes,
  type MealPatternId,
  type PlannerPrefs,
  type WeekDraft,
} from '@/domain/weekPlanner'
import { useGoals } from '@/shared/hooks'
import { appAlert, appConfirm } from '@/shared/dialog'
import { Checkbox, DateField, NumberField, SelectField } from '@/shared/forms'
import { IconCheck, IconSpark } from '@/shared/icons'
import { Badge, Button, EmptyState, Field, PageHeader, WarnBanner } from '@/shared/ui'
import { MacroRings } from '@/shared/MacroBar'

export function WeekPlannerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const goals = useGoals()
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []

  const [prefs, setPrefs] = useState<PlannerPrefs>(() => loadPlannerPrefs())
  const [draft, setDraft] = useState<WeekDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [shortlistSource, setShortlistSource] = useState<'ai' | 'local' | 'none' | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [didAutogen, setDidAutogen] = useState(false)

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])

  useEffect(() => {
    savePlannerPrefs(prefs)
  }, [prefs])

  const baseCatalog = useMemo(
    () =>
      buildPlannerCatalog({
        recipes,
        ingredients,
        pantry,
        goals,
        seed: Date.now() % 1_000_000,
      }),
    [recipes, ingredients, pantry, goals],
  )

  async function generate(improve: boolean) {
    if (baseCatalog.candidates.length === 0) {
      await appAlert('Add some dish recipes first.', { title: 'Nothing to plan' })
      return
    }
    setBusy(true)
    try {
      const { ids, source } = await resolveRecipeShortlist(prefs, baseCatalog, false)
      setShortlistSource(source)
      const catalog = {
        ...baseCatalog,
        shortlistIds: ids,
        seed: (Date.now() % 1_000_000) + Math.floor(Math.random() * 1000),
      }
      let next = generateWeekDraft(prefs, catalog, 14)
      if (improve) next = improveWeekDraft(next, catalog, 100)
      setDraft(next)
      setSelectedKey(null)
    } finally {
      setBusy(false)
    }
  }

  // Autogen when arriving from Plan CTA
  useEffect(() => {
    if (didAutogen) return
    if (searchParams.get('autogen') !== '1') return
    if (recipes.length === 0) return
    setDidAutogen(true)
    void generate(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, recipes.length, didAutogen])

  async function accept(mode: 'fill' | 'replace') {
    if (!draft) return
    const message =
      mode === 'fill'
        ? `Fill empty meal slots only. Meals that already have food stay as they are. Create ${draft.sessions.length} cook session(s) and merge shopping?`
        : `Replace meals in this date range. Planned cook sessions on those days are removed and rewritten. Active or finished cooks stay.`
    if (
      !(await appConfirm(message, {
        confirmLabel: mode === 'fill' ? 'Fill empty slots' : 'Replace these days',
        danger: mode === 'replace',
      }))
    ) {
      return
    }
    setBusy(true)
    try {
      const result = await acceptWeekDraft(draft, recipes, ingredients, mode)
      const skipped =
        result.mealsSkipped > 0 ? ` Left alone: ${result.mealsSkipped}.` : ''
      const blocked =
        result.mealsBlocked > 0 ? ` Blocked by a cook already underway: ${result.mealsBlocked}.` : ''
      const removed =
        result.sessionsRemoved > 0 ? ` Planned sessions replaced: ${result.sessionsRemoved}.` : ''
      await appAlert(
        `Sessions: ${result.sessionsCreated}.${removed} Meals written: ${result.mealsWritten}.${skipped}${blocked} Shop lines: ${result.shopAdded + result.shopUpdated}.`,
        { title: mode === 'fill' ? 'Empty slots filled' : 'Days replaced' },
      )
      navigate('/week')
    } finally {
      setBusy(false)
    }
  }

  function toggleMeal(meal: MealSlot) {
    setPrefs((p) => {
      const has = p.meals.includes(meal)
      if (has && p.meals.length === 1) return p
      return {
        ...p,
        meals: has ? p.meals.filter((m) => m !== meal) : [...p.meals, meal],
      }
    })
  }

  function setWeekStart(date: string) {
    const monday = format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    setPrefs((p) => ({ ...p, weekStartDate: monday }))
  }

  function setPattern(meal: MealSlot, id: MealPatternId) {
    setPrefs((p) => ({
      ...p,
      mealPatterns: { ...p.mealPatterns, [meal]: id },
    }))
  }

  const days = useMemo(() => {
    if (!draft) return [] as string[]
    return Array.from({ length: draft.prefs.dayCount }, (_, i) =>
      format(addDays(parseISO(draft.prefs.weekStartDate), i), 'yyyy-MM-dd'),
    )
  }, [draft])

  function servingKey(s: {
    date: string
    meal: MealSlot
    recipeId: number
    cookDate: string
    fromRecipeId?: number
    role?: string
  }) {
    return `${s.date}|${s.meal}|${s.recipeId}|${s.cookDate}|${s.fromRecipeId ?? ''}|${s.role ?? ''}`
  }

  function servingLabel(s: { recipeId: number; fromRecipeId?: number }): string {
    const name = recipeById.get(s.recipeId)?.name ?? `Recipe ${s.recipeId}`
    if (s.fromRecipeId == null) return name
    const from = recipeById.get(s.fromRecipeId)?.name
    return from ? `${name} (from ${from})` : name
  }

  function onSelectServing(key: string) {
    if (!draft) return
    if (!selectedKey) {
      setSelectedKey(key)
      return
    }
    if (selectedKey === key) {
      setSelectedKey(null)
      return
    }
    const a = draft.servings.find((s) => servingKey(s) === selectedKey)
    const b = draft.servings.find((s) => servingKey(s) === key)
    if (a && b) {
      setDraft(swapServingRecipes(draft, a, b, baseCatalog))
    }
    setSelectedKey(null)
  }

  const prefsSummary = useMemo(() => {
    const mealBits = prefs.meals.map((m) => {
      const label = MEAL_SLOTS.find((x) => x.id === m)?.label ?? m
      const pat = prefs.mealPatterns?.[m]
      const patLabel = MEAL_PATTERN_OPTIONS.find((p) => p.id === pat)?.label ?? pat ?? 'simple'
      return `${label}: ${patLabel}`
    })
    return mealBits.join(' · ')
  }, [prefs])

  return (
    <div>
      <PageHeader
        title="Plan my week"
        icon={<IconSpark className="h-5 w-5" />}
        subtitle={prefsSummary || 'Lunch & dinner · batch cooks'}
        actions={
          <Button variant="secondary" onClick={() => navigate('/week')}>
            Back
          </Button>
        }
      />

      <section className="card-elevated mb-6 p-5">
        <div className="flex flex-col gap-3">
          <Button
            className="w-full gap-2"
            disabled={busy}
            onClick={() => void generate(true)}
          >
            <IconSpark className="h-4 w-4" />
            {busy ? 'Planning…' : draft ? 'Regenerate' : 'Generate week'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setShowAdjust((v) => !v)}>
            {showAdjust ? 'Hide options' : 'Adjust options'}
          </Button>
        </div>

        {showAdjust ? (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Week start (Mon)">
                <DateField title="Week start" value={prefs.weekStartDate} onChange={setWeekStart} />
              </Field>
              <Field label="Days">
                <NumberField
                  value={prefs.dayCount}
                  min={3}
                  max={14}
                  step={1}
                  onChange={(dayCount) => setPrefs((p) => ({ ...p, dayCount }))}
                />
              </Field>
              <Field label="Batch cook sessions">
                <NumberField
                  value={prefs.batchCookCount}
                  min={1}
                  max={4}
                  step={1}
                  onChange={(batchCookCount) => setPrefs((p) => ({ ...p, batchCookCount }))}
                />
              </Field>
              <Field label="Macro tolerance (±%)">
                <NumberField
                  value={prefs.macroTolerancePct}
                  min={5}
                  max={40}
                  step={1}
                  onChange={(macroTolerancePct) => setPrefs((p) => ({ ...p, macroTolerancePct }))}
                />
              </Field>
              <Field label="Variety gap (days)">
                <SelectField<number>
                  title="Variety gap"
                  value={prefs.varietyGapDays}
                  onChange={(varietyGapDays) => setPrefs((p) => ({ ...p, varietyGapDays }))}
                  options={[
                    { id: 0, label: 'Allow same day next' },
                    { id: 1, label: 'No consecutive days' },
                    { id: 2, label: 'Skip 1 day' },
                  ]}
                />
              </Field>
            </div>
            <div>
              <p className="mb-1 text-sm text-ink-muted">Meals to fill</p>
              <div className="flex flex-wrap gap-3">
                {MEAL_SLOTS.map((m) => (
                  <Checkbox
                    key={m.id}
                    checked={prefs.meals.includes(m.id)}
                    onChange={() => toggleMeal(m.id)}
                    label={m.label}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-ink-muted">Meal patterns</p>
              {prefs.meals.map((meal) => (
                <Field key={meal} label={MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal}>
                  <SelectField<MealPatternId>
                    title="Pattern"
                    value={prefs.mealPatterns?.[meal] ?? 'simple'}
                    onChange={(id) => setPattern(meal, id)}
                    options={MEAL_PATTERN_OPTIONS}
                  />
                </Field>
              ))}
            </div>
            <Checkbox
              checked={prefs.stapleExtraCadence}
              onChange={(stapleExtraCadence) => setPrefs((p) => ({ ...p, stapleExtraCadence }))}
              label="Allow staples (rice etc.) more often"
            />
          </div>
        ) : null}
      </section>

      {!draft ? (
        <EmptyState
          title={busy ? 'Planning…' : 'No draft yet'}
          body="Generate a week from your recipe catalog. Dinner defaults to 一汁三菜, lunch to bento."
        />
      ) : (
        <>
          <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="min-w-0 flex-1 gap-2 sm:flex-none sm:min-w-[10rem]"
                disabled={busy}
                onClick={() => void accept('fill')}
              >
                <IconCheck className="h-4 w-4" />
                Fill empty slots
              </Button>
              <Button
                variant="secondary"
                className="gap-1.5"
                disabled={busy}
                onClick={() => void accept('replace')}
              >
                Replace these days
              </Button>
              <Button
                variant="secondary"
                className="gap-1.5"
                disabled={busy}
                onClick={() => void generate(true)}
              >
                <IconSpark className="h-4 w-4" />
                Regenerate
              </Button>
              <Badge tone="accent">Score {draft.score.total}</Badge>
              <Button variant="ghost" className="ml-auto" onClick={() => setDraft(null)}>
                Discard
              </Button>
            </div>
          </div>

          <section className="card-elevated mb-4 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg">Score</h2>
              <Badge tone="neutral">{draft.score.total}</Badge>
              {shortlistSource ? (
                <span className="text-xs text-ink-muted">Shortlist: {shortlistSource}</span>
              ) : null}
            </div>
            <MacroRings
              goals={goals}
              nutrition={draft.avgNutrition}
              size="lg"
              caption="Average planned day vs kitchen goals"
            />
            {draft.dayGoalGaps.some((g) => g.offGoal) ? (
              <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                {draft.dayGoalGaps
                  .filter((g) => g.offGoal)
                  .map((g) => (
                    <li key={g.date}>{g.summary}</li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                All filled days within ±{prefs.macroTolerancePct}% of kitchen goals.
              </p>
            )}
            {draft.warnings.length > 0 ? (
              <div className="mt-3 space-y-1">
                {draft.warnings.slice(0, 8).map((w) => (
                  <WarnBanner key={w}>{w}</WarnBanner>
                ))}
              </div>
            ) : null}
          </section>

          <section className="card-elevated mb-4 p-4">
            <h2 className="mb-2 text-lg">Cook days</h2>
            <ul className="space-y-2">
              {draft.sessions.map((session) => (
                <li key={session.date} className="rounded-lg border border-line px-3 py-2">
                  <div className="font-medium">{format(parseISO(session.date), 'EEE d MMM')}</div>
                  <ul className="mt-1 text-sm text-ink-muted">
                    {session.dishes.map((d) => (
                      <li key={d.recipeId}>
                        {recipeById.get(d.recipeId)?.name ?? `Recipe ${d.recipeId}`} · {d.portions}{' '}
                        portions
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <section className="card-elevated mb-4 p-4">
            <h2 className="mb-1 text-lg">Plates</h2>
            <p className="mb-3 text-xs text-ink-muted">
              Each meal is a composed plate. Tap two items to swap. Adjust portions with the stepper.
            </p>
            <div className="space-y-4">
              {days.map((date) => (
                <div key={date}>
                  <div className="mb-2 text-sm font-medium">
                    {format(parseISO(date), 'EEE d MMM')}
                    {date === todayISO() ? ' · today' : ''}
                  </div>
                  <div className="space-y-2">
                    {draft.prefs.meals.map((meal) => {
                      const items = draft.servings.filter(
                        (s) => s.date === date && s.meal === meal,
                      )
                      const mealLabel = MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal
                      const pat = draft.prefs.mealPatterns?.[meal]
                      const patLabel =
                        MEAL_PATTERN_OPTIONS.find((p) => p.id === pat)?.label ?? ''
                      return (
                        <div
                          key={meal}
                          className="rounded-[var(--radius-card)] border border-line bg-ink/[0.03] p-3"
                        >
                          <div className="mb-2 flex flex-wrap items-baseline gap-2">
                            <span className="font-medium">{mealLabel}</span>
                            {patLabel ? (
                              <span className="text-xs text-ink-muted">{patLabel}</span>
                            ) : null}
                          </div>
                          {items.length === 0 ? (
                            <p className="text-sm text-ink-muted">Empty</p>
                          ) : (
                            <ul className="space-y-1">
                              {items.map((s) => {
                                const key = servingKey(s)
                                const selected = selectedKey === key
                                return (
                                  <li
                                    key={key}
                                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                                      selected
                                        ? 'border-lacquer/40 bg-lacquer/5'
                                        : 'border-line bg-paper'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 text-left text-sm"
                                      onClick={() => onSelectServing(key)}
                                    >
                                      {s.roleLabel || s.role ? (
                                        <span className="text-ink-muted">
                                          {s.roleLabel ?? s.role}:{' '}
                                        </span>
                                      ) : null}
                                      {servingLabel(s)}
                                      <span className="block text-xs text-ink-muted">
                                        {s.fromRecipeId != null ? 'leftover · ' : ''}
                                        cook {format(parseISO(s.cookDate), 'EEE d')}
                                      </span>
                                    </button>
                                    <NumberField
                                      value={s.portions}
                                      min={0.5}
                                      max={8}
                                      step={0.5}
                                      onChange={(portions) =>
                                        setDraft(
                                          changeServingPortions(draft, s, portions, baseCatalog),
                                        )
                                      }
                                    />
                                  </li>
                                )
                              })}
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
                  const ing = ingById.get(line.ingredientId)
                  return (
                    <li key={line.ingredientId} className="flex justify-between gap-2">
                      <span>{ing?.name ?? line.ingredientId}</span>
                      <span className="text-ink-muted">
                        need {line.need}
                        {ing?.unit ? ` ${ing.unit}` : ''} → buy {line.buy}
                        {line.packs != null ? ` (${line.packs} pack)` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <div className="panel-action flex flex-col gap-2 p-4 pb-8 sm:flex-row sm:flex-wrap">
            <Button
              className="w-full gap-2 sm:w-auto sm:min-w-[10rem]"
              disabled={busy}
              onClick={() => void accept('fill')}
            >
              <IconCheck className="h-4 w-4" />
              Fill empty slots
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void accept('replace')}
            >
              Replace these days
            </Button>
            <Button
              variant="secondary"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void generate(true)}
            >
              <IconSpark className="h-4 w-4" />
              Regenerate
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Discard draft
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
