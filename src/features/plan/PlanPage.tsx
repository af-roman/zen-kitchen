import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import {
  consolidateDuplicateMealSlots,
  healOrphanedServingItems,
} from '@/db/servingOps'
import type { MealSlot, Nutrition, Recipe, Serving } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'
import { addNutrition, emptyNutrition } from '@/domain/nutrition'
import {
  daysInMonthGrid,
  daysInWeek,
  isSameMonth,
  rangeLabel,
  shiftAnchor,
} from '@/domain/planCalendar'
import { loadPlannerPrefs } from '@/domain/weekPlanner/prefs'
import { mealNutritionFromItems, servingItemNeedsFood } from '@/domain/servings'
import { canRemovePlannedMeal, confirmRemovePlannedMeal } from '@/features/plan/removePlannedMeal'
import { SwipeReveal } from '@/shared/SwipeReveal'
import { assetUrl } from '@/shared/assetUrl'
import { useGoals } from '@/shared/hooks'
import { IconCook, IconMeal, IconServe, IconSpark } from '@/shared/icons'
import { MacroRings } from '@/shared/MacroBar'
import { Badge, Button, EmptyState, PageHeader, SegmentedControl } from '@/shared/ui'

function mealLabel(meal: MealSlot): string {
  return MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal
}

function MealIcon({ meal }: { meal: MealSlot }) {
  return <IconMeal meal={meal} className="h-3.5 w-3.5" />
}

function dishNames(
  serving: Serving | undefined,
  recipeById: Map<number, Recipe>,
): string {
  if (!serving || serving.items.length === 0) return 'Add dishes'
  return serving.items
    .map((item) => {
      if (item.name) return item.name
      if (item.recipeId != null) return recipeById.get(item.recipeId)?.name ?? 'Dish'
      return 'Dish'
    })
    .join(' · ')
}

function coverImage(
  serving: Serving | undefined,
  recipeById: Map<number, Recipe>,
): string | undefined {
  if (!serving) return undefined
  for (const item of serving.items) {
    if (item.recipeId == null) continue
    const img = recipeById.get(item.recipeId)?.imageDataUrl
    if (img) return img
  }
  return undefined
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function PlanPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const today = todayISO()

  const allSessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []
  const allServings = useLiveQuery(() => db.servings.toArray(), []) ?? []
  const allBatches = useLiveQuery(() => db.readyBatches.toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const openLists =
    useLiveQuery(() => db.shoppingLists.where('status').equals('open').toArray(), []) ?? []

  const [range, setRange] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(today)
  const tolerancePct = loadPlannerPrefs().macroTolerancePct
  const weekDays = useMemo(() => daysInWeek(anchor), [anchor])
  const monthDays = useMemo(() => daysInMonthGrid(anchor), [anchor])
  const rangeStart = weekDays[0]
  const rangeEnd = weekDays[weekDays.length - 1]

  const sessions = useMemo(
    () => allSessions.filter((s) => s.date >= rangeStart && s.date <= rangeEnd),
    [allSessions, rangeStart, rangeEnd],
  )
  const servings = useMemo(
    () => allServings.filter((s) => s.date >= rangeStart && s.date <= rangeEnd),
    [allServings, rangeStart, rangeEnd],
  )

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const sessionById = useMemo(
    () => new Map(allSessions.filter((s) => s.id != null).map((s) => [s.id!, s])),
    [allSessions],
  )
  const batchIds = useMemo(
    () => new Set(allBatches.map((b) => b.id).filter((id): id is number => id != null)),
    [allBatches],
  )

  function dayNutrition(date: string): Nutrition {
    return allServings
      .filter((s) => s.date === date && !s.skipped)
      .reduce(
        (acc, s) => addNutrition(acc, mealNutritionFromItems(s.items, recipeById, ingById)),
        emptyNutrition(),
      )
  }

  const weekAverage = useMemo(() => {
    if (weekDays.length === 0) return emptyNutrition()
    const total = weekDays.reduce(
      (acc, d) => addNutrition(acc, dayNutrition(d)),
      emptyNutrition(),
    )
    const daysWithFood = weekDays.filter((d) => dayNutrition(d).energyKcal > 0).length
    const n = Math.max(1, daysWithFood || weekDays.length)
    return {
      energyKcal: Math.round((total.energyKcal / n) * 10) / 10,
      carbsG: Math.round((total.carbsG / n) * 10) / 10,
      proteinG: Math.round((total.proteinG / n) * 10) / 10,
      fatG: Math.round((total.fatG / n) * 10) / 10,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays, allServings, recipeById, ingById])

  useEffect(() => {
    void (async () => {
      await consolidateDuplicateMealSlots()
      await healOrphanedServingItems()
    })()
  }, [])

  const hasPlannedContent =
    sessions.some((s) => s.status !== 'done') ||
    servings.some((s) => s.items.length > 0) ||
    allSessions.some((s) => s.status !== 'done' && s.date >= today) ||
    allServings.some((s) => s.date >= today && s.items.length > 0) ||
    (openLists[0]?.items.length ?? 0) > 0

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, typeof sessions>()
    for (const s of sessions) {
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    return map
  }, [sessions])

  const weekIsCurrent = rangeStart === daysInWeek(today)[0]

  function dayHasCook(date: string): boolean {
    return allSessions.some((s) => s.date === date && s.status !== 'done')
  }

  function dayHasMeals(date: string): boolean {
    return allServings.some((s) => s.date === date && s.items.length > 0 && !s.skipped)
  }

  function dayOffGoal(date: string): boolean {
    const kcal = dayNutrition(date).energyKcal
    const goal = goals?.dailyKcal ?? 0
    if (kcal <= 0 || goal <= 0) return false
    return (Math.abs(kcal - goal) / goal) * 100 > tolerancePct
  }

  return (
    <div>
      <PageHeader
        title="Plan"
        subtitle={rangeLabel(anchor, range)}
        actions={
          hasPlannedContent ? (
            <>
              <Button
                variant="secondary"
                className="gap-1.5"
                onClick={() => navigate('/plan-week?autogen=1')}
              >
                <IconSpark className="h-4 w-4" />
                Replan week
              </Button>
              <Button className="gap-1.5" onClick={() => navigate(`/serve?date=${today}`)}>
                <IconServe className="h-4 w-4" />
                Serve today
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setAnchor((a) => shiftAnchor(a, range, -1))}>
          ←
        </Button>
        <Button variant="secondary" onClick={() => setAnchor((a) => shiftAnchor(a, range, 1))}>
          →
        </Button>
        {!weekIsCurrent || range === 'month' ? (
          <Button variant="ghost" onClick={() => setAnchor(today)}>
            Today
          </Button>
        ) : null}
        <SegmentedControl
          className="ml-auto"
          value={range}
          onChange={setRange}
          options={[
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ]}
        />
      </div>

      {range === 'month' ? (
        <section className="mb-6">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((date) => {
              const inMonth = isSameMonth(date, anchor)
              const cook = dayHasCook(date)
              const meals = dayHasMeals(date)
              const off = dayOffGoal(date)
              const upcomingEmpty = inMonth && date >= today && !meals && !cook
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => navigate(`/plan/${date}`)}
                  className={`flex min-h-14 flex-col items-center rounded-xl px-0.5 py-1.5 text-xs ${
                    inMonth ? 'bg-paper-elevated' : 'bg-transparent text-ink-muted/50'
                  } ${date === today ? 'ring-1 ring-lacquer' : ''}`}
                >
                  <span className="font-semibold">{format(parseISO(date), 'd')}</span>
                  <span className="mt-1 flex gap-0.5">
                    {cook ? <span className="h-1.5 w-1.5 rounded-full bg-lacquer" /> : null}
                    {off ? <span className="h-1.5 w-1.5 rounded-full bg-warn" /> : null}
                    {upcomingEmpty ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-ink-muted">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lacquer" />
              A cook
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              kcal outside ±{tolerancePct}%
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/20" />
              Empty from today on
            </li>
          </ul>
        </section>
      ) : null}

      {range === 'week' && !hasPlannedContent ? (
        <EmptyState
          title="Your week is empty"
          body="Generate cook days, meals, and a shopping list from your recipes — then just follow the prompts."
          actions={
            <Button className="min-w-[12rem] gap-2" onClick={() => navigate('/plan-week?autogen=1')}>
              <IconSpark className="h-4 w-4" />
              Plan my week
            </Button>
          }
          />
      ) : range === 'week' ? (
        <div className="space-y-8">
          {weekAverage.energyKcal > 0 ? (
            <section className="card-elevated px-4 py-4">
              <MacroRings
                nutrition={weekAverage}
                goals={goals}
                size="lg"
                caption="Average filled day vs goals"
              />
            </section>
          ) : null}

          {weekDays.map((date) => {
            const isToday = date === today
            const daySessions = sessionsByDate.get(date) ?? []
            const cookSessions = daySessions.filter(
              (s) => s.id != null && (s.status === 'planned' || s.status === 'active'),
            )
            const dayN = dayNutrition(date)
            return (
              <section key={date}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="min-w-0 shrink font-semibold leading-tight">
                    <span className="block text-base sm:text-lg">
                      {isToday ? 'Today' : format(parseISO(date), 'EEE')}
                    </span>
                    <span className="block text-xs font-medium text-ink-muted">
                      {format(parseISO(date), 'd MMM')}
                    </span>
                  </h2>
                  {dayN.energyKcal > 0 ? (
                    <MacroRings
                      nutrition={dayN}
                      goals={goals}
                      size="xs"
                      className="min-w-0 flex-1"
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>

                <ul className="space-y-3">
                  {cookSessions.map((session) => {
                    const dishNamesList = session.dishes
                      .map((d) => recipeById.get(d.recipeId)?.name ?? 'Dish')
                      .join(' · ')
                    const active = session.status === 'active'
                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/cook/${session.id}`)}
                          className="meal-tile flex w-full items-center gap-3 bg-ink px-4 py-3.5 text-left text-white transition hover:scale-[1.01] active:scale-[0.99]"
                        >
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lacquer">
                            <IconCook className="h-6 w-6 text-white" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                              {active ? 'Cooking now' : 'Cook session'}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-base font-semibold leading-snug">
                              {dishNamesList || 'Open session'}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-lacquer px-3 py-1.5 text-xs font-semibold">
                            {active ? 'Resume' : 'Cook'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                  {MEAL_SLOTS.map(({ id: meal }) => {
                    const serving = servings.find((s) => s.date === date && s.meal === meal)
                    const needsFood =
                      serving?.items.some((item) =>
                        servingItemNeedsFood(item, sessionById, batchIds),
                      ) ?? false
                    const names = dishNames(serving, recipeById)
                    const image = coverImage(serving, recipeById)
                    const empty = !serving || serving.items.length === 0

                    const removable = canRemovePlannedMeal(serving, date, today)
                    const tile = (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              empty || needsFood
                                ? `/serve?date=${date}`
                                : `/plan/${date}`,
                            )
                          }
                          className={`meal-tile flex w-full gap-0 text-left transition active:scale-[0.99] ${
                            removable ? '' : 'hover:scale-[1.01]'
                          }`}
                        >
                          <div className="h-24 w-24 shrink-0 bg-ink/5 sm:h-28 sm:w-28">
                            {image ? (
                              <img
                                src={assetUrl(image)}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs font-medium text-ink-muted">
                                {empty ? '+' : mealLabel(meal)[0]}
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                                <MealIcon meal={meal} />
                                {mealLabel(meal)}
                              </span>
                              {needsFood ? <Badge tone="warn">Needs food</Badge> : null}
                              {empty ? <Badge>Open</Badge> : null}
                            </div>
                            <p
                              className={`mt-1 line-clamp-2 text-base font-semibold leading-snug ${
                                empty ? 'text-ink-muted' : 'text-ink'
                              }`}
                            >
                              {names}
                            </p>
                          </div>
                        </button>
                    )
                    return (
                      <li key={meal}>
                        {removable ? (
                          <SwipeReveal
                            actionLabel={`Remove ${mealLabel(meal)}`}
                            onAction={() => void confirmRemovePlannedMeal(date, meal)}
                          >
                            {tile}
                          </SwipeReveal>
                        ) : (
                          tile
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      ) : null}

    </div>
  )
}
