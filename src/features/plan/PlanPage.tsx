import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import {
  consolidateDuplicateMealSlots,
  healOrphanedServingItems,
} from '@/db/servingOps'
import type { Nutrition, Serving } from '@/domain/types'
import { addNutrition, emptyNutrition, scaleNutrition } from '@/domain/nutrition'
import { todayISO } from '@/domain/kitchen'
import {
  daysInMonth,
  daysInMonthGrid,
  daysInWeek,
  isSameMonth,
  rangeLabel,
  shiftAnchor,
  summarizeDay,
  type PlanRange,
} from '@/domain/planCalendar'
import {
  isPastDate,
  mealNutritionFromItems,
  servingItemNeedsFood,
} from '@/domain/servings'
import { useGoals } from '@/shared/hooks'
import { MacroBar } from '@/shared/MacroBar'
import { Badge, Button, EmptyState, PageHeader, WarnBanner } from '@/shared/ui'

export function PlanPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const today = todayISO()
  const [range, setRange] = useState<Exclude<PlanRange, 'day'>>('week')
  const [anchor, setAnchor] = useState(today)

  const visibleDays = useMemo(
    () => (range === 'week' ? daysInWeek(anchor) : daysInMonthGrid(anchor)),
    [range, anchor],
  )
  const nutritionDays = useMemo(
    () => (range === 'week' ? daysInWeek(anchor) : daysInMonth(anchor)),
    [range, anchor],
  )
  const rangeStart = visibleDays[0]
  const rangeEnd = visibleDays[visibleDays.length - 1]

  const sessions =
    useLiveQuery(
      () =>
        db.cookingSessions
          .where('date')
          .between(rangeStart, rangeEnd, true, true)
          .toArray(),
      [rangeStart, rangeEnd],
    ) ?? []
  const servings =
    useLiveQuery(
      () => db.servings.where('date').between(rangeStart, rangeEnd, true, true).toArray(),
      [rangeStart, rangeEnd],
    ) ?? []
  const allSessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []
  const allBatches = useLiveQuery(() => db.readyBatches.toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []

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

  const servingNeedsFood = (serving: Serving) =>
    serving.items.some((item) => servingItemNeedsFood(item, sessionById, batchIds))

  const needsFoodCount = servings.filter(servingNeedsFood).length

  useEffect(() => {
    void (async () => {
      await consolidateDuplicateMealSlots()
      await healOrphanedServingItems()
    })()
  }, [])

  function dayNutrition(date: string): Nutrition {
    const dayServings = servings.filter((s) => s.date === date)
    return dayServings.reduce(
      (acc, s) => addNutrition(acc, mealNutritionFromItems(s.items, recipeById, ingById)),
      emptyNutrition(),
    )
  }

  const rangeAverage = useMemo(() => {
    if (nutritionDays.length === 0) return emptyNutrition()
    const total = nutritionDays.reduce(
      (acc, d) => addNutrition(acc, dayNutrition(d)),
      emptyNutrition(),
    )
    return scaleNutrition(total, 1 / nutritionDays.length)
    // dayNutrition closes over servings/recipe maps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nutritionDays, servings, recipeById, ingById])

  const summaries = useMemo(
    () =>
      visibleDays.map((date) =>
        summarizeDay(date, sessions, servings, servingNeedsFood),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleDays, sessions, servings, sessionById, batchIds],
  )

  const hasAnything = sessions.length > 0 || servings.length > 0

  function goToday() {
    setAnchor(today)
  }

  function openDay(date: string) {
    navigate(`/plan/${date}`)
  }

  function selectRange(next: Exclude<PlanRange, 'day'> | 'day') {
    if (next === 'day') {
      navigate(`/plan/${today}`)
      return
    }
    setRange(next)
  }

  return (
    <div>
      <PageHeader
        title="Plan"
        subtitle="See what’s cooking and eating — open a day to act."
        actions={
          <Button onClick={() => navigate(`/sessions/new?date=${today}`)}>Plan session</Button>
        }
      />

      {needsFoodCount > 0 ? (
        <div className="mb-4">
          <WarnBanner>
            {needsFoodCount} meal{needsFoodCount > 1 ? 's' : ''} need food after a session change.
          </WarnBanner>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['day', 'week', 'month'] as const).map((r) => (
          <Button
            key={r}
            variant={r === 'day' ? 'secondary' : range === r ? 'primary' : 'secondary'}
            className="!py-1.5 !capitalize"
            onClick={() => selectRange(r)}
          >
            {r}
          </Button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setAnchor(shiftAnchor(anchor, range, -1))}
        >
          ←
        </Button>
        <span className="min-w-0 flex-1 text-center text-sm font-medium sm:flex-none sm:text-left">
          {rangeLabel(anchor, range)}
        </span>
        <Button
          variant="secondary"
          onClick={() => setAnchor(shiftAnchor(anchor, range, 1))}
        >
          →
        </Button>
        <Button variant="secondary" onClick={goToday}>
          Today
        </Button>
      </div>

      <section className="mb-4 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-2 text-lg">
          {range === 'week' ? 'This week’s nutrition' : 'This month’s nutrition'}
        </h2>
        <MacroBar
          goals={goals}
          nutrition={rangeAverage}
          goalCaption="Average per day vs your kitchen goals"
        />
      </section>

      {range === 'week' ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {summaries.map((day) => {
            const kcal = Math.round(dayNutrition(day.date).energyKcal)
            const isToday = day.date === today
            const past = isPastDate(day.date)
            return (
              <li key={day.date}>
                <button
                  type="button"
                  onClick={() => openDay(day.date)}
                  className={`flex w-full flex-col rounded-[var(--radius-card)] border px-3 py-3 text-left transition sm:min-h-[8.5rem] ${
                    isToday
                      ? 'border-accent bg-accent/10 ring-1 ring-accent/25'
                      : past
                        ? 'border-line/60 bg-paper-elevated/50'
                        : 'border-line bg-paper-elevated hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="font-display text-base text-accent-deep sm:text-sm">
                      <span className="sm:hidden">
                        {format(parseISO(day.date), 'EEEE d MMM')}
                      </span>
                      <span className="hidden sm:inline">
                        {format(parseISO(day.date), 'EEE')}
                      </span>
                    </span>
                    <span className="text-xs text-ink-muted sm:block">
                      {format(parseISO(day.date), 'd')}
                    </span>
                  </div>
                  {isToday ? (
                    <div className="mt-1">
                      <Badge tone="accent">Today</Badge>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {day.hasSessions ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-plan-session" title="Sessions" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-line" title="No sessions" />
                    )}
                    {day.hasMeals ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-plan-meal" title="Meals" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-line" title="No meals" />
                    )}
                    {day.needsFood ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Needs food" />
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    {day.sessionCount} session{day.sessionCount === 1 ? '' : 's'}
                    {' · '}
                    {day.mealCount}/{day.mealSlots} meals
                  </p>
                  {kcal > 0 ? (
                    <p className="mt-1 text-xs font-medium text-ink">{kcal} kcal</p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">No meals yet</p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <ul className="grid grid-cols-7 gap-1">
            {summaries.map((day) => {
              const inMonth = isSameMonth(day.date, anchor)
              const kcal = Math.round(dayNutrition(day.date).energyKcal)
              const isToday = day.date === today
              return (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => openDay(day.date)}
                    className={`flex aspect-square w-full flex-col items-center rounded-lg border px-0.5 py-1 text-center transition sm:aspect-auto sm:min-h-[4.5rem] sm:py-2 ${
                      isToday
                        ? 'border-accent bg-accent/10 ring-1 ring-accent/25'
                        : inMonth
                          ? 'border-line bg-paper-elevated hover:border-accent/40'
                          : 'border-transparent bg-transparent text-ink-muted/50'
                    }`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        inMonth ? 'text-ink' : 'text-ink-muted/50'
                      }`}
                    >
                      {format(parseISO(day.date), 'd')}
                    </span>
                    <div className="mt-1 flex gap-0.5">
                      {day.hasSessions ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-plan-session" title="Sessions" />
                      ) : null}
                      {day.hasMeals ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-plan-meal" title="Meals" />
                      ) : null}
                      {day.needsFood ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Needs food" />
                      ) : null}
                    </div>
                    {inMonth && kcal > 0 ? (
                      <span className="mt-auto hidden text-[9px] text-ink-muted sm:block">
                        {kcal}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {!hasAnything ? (
        <div className="mt-6">
          <EmptyState
            title="A quiet stretch"
            body="Plan a cooking session, then open a day to serve meals."
          />
        </div>
      ) : null}

      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-plan-session" aria-hidden />
          Cook session
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-plan-meal" aria-hidden />
          Meal planned
        </span>
        {needsFoodCount > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
            Needs food
          </span>
        ) : null}
      </p>
    </div>
  )
}
