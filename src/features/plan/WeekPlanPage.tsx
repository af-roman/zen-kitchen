import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { db } from '@/db/database'
import {
  consolidateDuplicateMealSlots,
  deleteCookingSession,
  healOrphanedServingItems,
} from '@/db/servingOps'
import type { Nutrition, ServingItem } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { addNutrition, emptyNutrition, scaleNutrition } from '@/domain/nutrition'
import { todayISO } from '@/domain/kitchen'
import {
  isPastDate,
  mealNutritionFromItems,
  resolveServingNutrition,
  servingItemNeedsFood,
} from '@/domain/servings'
import { useGoals } from '@/shared/hooks'
import { MacroBar, MacroInline } from '@/shared/MacroBar'
import { Badge, Button, EmptyState, PageHeader, WarnBanner, inputClass } from '@/shared/ui'

type ShowFilter = 'both' | 'sessions' | 'meals'
type Detail = 'simple' | 'full'
type NutriLevel = 'day' | 'meal' | 'dish'

function currentWeekStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function WeekPlanPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const today = todayISO()
  const todayRef = useRef<HTMLLIElement>(null)
  const [weekStart, setWeekStart] = useState(currentWeekStart)
  const [show, setShow] = useState<ShowFilter>('both')
  const [detail, setDetail] = useState<Detail>('full')
  const [nutri, setNutri] = useState<NutriLevel>('day')

  const isCurrentWeek = weekStart === currentWeekStart()

  const days = useMemo(() => {
    const start = parseISO(weekStart)
    return eachDayOfInterval({ start, end: addDays(start, 6) }).map((d) =>
      format(d, 'yyyy-MM-dd'),
    )
  }, [weekStart])

  const sessions =
    useLiveQuery(
      () =>
        db.cookingSessions
          .where('date')
          .between(days[0], days[6], true, true)
          .toArray(),
      [days[0], days[6]],
    ) ?? []
  const servings =
    useLiveQuery(
      () => db.servings.where('date').between(days[0], days[6], true, true).toArray(),
      [days[0], days[6]],
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

  const itemBroken = (item: ServingItem) =>
    servingItemNeedsFood(item, sessionById, batchIds)

  const needsFoodCount = servings.filter((s) => s.items.some(itemBroken)).length

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

  function goToThisWeek() {
    setWeekStart(currentWeekStart())
    requestAnimationFrame(() => {
      todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function deleteSession(sessionId: number) {
    const choice = prompt(
      'Delete session:\n1 = session only (meals stay, marked needs food)\n2 = session and linked meals\n3 = keep meals, mark needs food\n\nEnter 1, 2, or 3',
      '1',
    )
    if (!choice) return
    if (choice === '2') await deleteCookingSession(sessionId, 'remove-meals')
    else await deleteCookingSession(sessionId, 'keep-meals')
  }

  async function startSession(sessionId: number) {
    const active = await db.cookingSessions.where('status').equals('active').first()
    if (active && active.id !== sessionId) {
      alert('Finish or leave the current active session first.')
      navigate(`/cook/${active.id}`)
      return
    }
    const now = new Date().toISOString()
    await db.cookingSessions.update(sessionId, {
      status: 'active',
      startedAt: now,
      updatedAt: now,
    })
    navigate(`/cook/${sessionId}`)
  }

  return (
    <div>
      <PageHeader
        title="Week plan"
        subtitle="What to cook and what to eat — the calm centre of the kitchen."
        actions={
          <Button onClick={() => navigate('/sessions/new')}>Plan session</Button>
        }
      />

      {needsFoodCount > 0 ? (
        <div className="mb-4">
          <WarnBanner>
            {needsFoodCount} meal{needsFoodCount > 1 ? 's' : ''} need food after a session change.
          </WarnBanner>
        </div>
      ) : null}

      <section className="mb-4 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-2 text-lg">This week’s nutrition</h2>
        <MacroBar
          goals={goals}
          nutrition={scaleNutrition(
            days.reduce((acc, d) => addNutrition(acc, dayNutrition(d)), emptyNutrition()),
            1 / 7,
          )}
        />
        <p className="mt-2 text-xs text-ink-muted">Average per day vs your kitchen goals</p>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => setWeekStart(format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd'))}
        >
          ←
        </Button>
        <span className="text-sm font-medium">
          Week of {format(parseISO(weekStart), 'd MMM yyyy')}
        </span>
        <Button
          variant="secondary"
          onClick={() => setWeekStart(format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd'))}
        >
          →
        </Button>
        {!isCurrentWeek ? (
          <Button variant="primary" onClick={goToThisWeek}>
            This week
          </Button>
        ) : (
          <Button variant="secondary" onClick={goToThisWeek}>
            Today
          </Button>
        )}
        <select
          className={inputClass}
          value={show}
          onChange={(e) => setShow(e.target.value as ShowFilter)}
        >
          <option value="both">Sessions & meals</option>
          <option value="sessions">Sessions only</option>
          <option value="meals">Meals only</option>
        </select>
        <select
          className={inputClass}
          value={detail}
          onChange={(e) => setDetail(e.target.value as Detail)}
        >
          <option value="full">Full detail</option>
          <option value="simple">Simple</option>
        </select>
        <select
          className={inputClass}
          value={nutri}
          onChange={(e) => setNutri(e.target.value as NutriLevel)}
        >
          <option value="day">Nutrition / day</option>
          <option value="meal">Nutrition / meal</option>
          <option value="dish">Nutrition / dish</option>
        </select>
      </div>

      <p className="mb-4 text-sm text-ink-muted">
        Tap a day to serve dishes to its meals.
      </p>

      <ul className="space-y-4">
        {days.map((date) => {
          const daySessions = sessions.filter((s) => s.date === date)
          const dayServings = servings.filter((s) => s.date === date)
          const dayN = dayNutrition(date)
          const isToday = date === today
          const past = isPastDate(date)

          return (
            <li
              key={date}
              ref={isToday ? todayRef : undefined}
              id={isToday ? 'week-plan-today' : undefined}
              className={`rounded-[var(--radius-card)] border p-4 transition ${
                isToday
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/25'
                  : past
                    ? 'border-line/60 bg-paper-elevated/50 opacity-75'
                    : 'cursor-pointer border-line bg-paper-elevated/80 hover:border-accent/40'
              }`}
              onClick={() => {
                if (!past) navigate(`/serve?date=${date}`)
              }}
              onKeyDown={(e) => {
                if (past) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/serve?date=${date}`)
                }
              }}
              role={past ? undefined : 'button'}
              tabIndex={past ? undefined : 0}
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl text-accent-deep">
                    {format(parseISO(date), 'EEEE d MMM')}
                  </h2>
                  {isToday ? <Badge tone="accent">Today</Badge> : null}
                  {past ? <Badge>Past</Badge> : null}
                </div>
                {nutri === 'day' && dayServings.length > 0 ? (
                  <MacroInline nutrition={dayN} goals={goals} />
                ) : null}
              </div>

              {past ? (
                <p className="mb-3 text-xs text-ink-muted">Past days are locked — view only.</p>
              ) : null}

              {(show === 'both' || show === 'sessions') && (
                <div className="mb-3 space-y-2">
                  {daySessions.length === 0 && show === 'sessions' ? (
                    <p className="text-sm text-ink-muted">No sessions</p>
                  ) : null}
                  {daySessions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="accent">Session · {s.status}</Badge>
                        {detail === 'full'
                          ? s.dishes.map((d) => (
                              <span key={d.recipeId} className="text-sm">
                                {recipeById.get(d.recipeId)?.name} ×{d.portions}
                              </span>
                            ))
                          : (
                              <span className="text-sm">{s.dishes.length} dishes</span>
                            )}
                      </div>
                      {!past ? (
                        <div
                          className="mt-2 flex flex-wrap gap-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {s.status !== 'done' ? (
                            <Button
                              variant="primary"
                              className="!py-1 !text-xs"
                              onClick={() => void startSession(s.id!)}
                            >
                              {s.status === 'active' ? 'Resume' : 'Start'}
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            className="!py-1 !text-xs"
                            onClick={() => navigate(`/sessions/new?edit=${s.id}`)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="!py-1 !text-xs"
                            onClick={() => void deleteSession(s.id!)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {(show === 'both' || show === 'meals') && (
                <div className="space-y-2">
                  {MEAL_SLOTS.map((slot) => {
                    const m = dayServings.find((s) => s.meal === slot.id)
                    if (detail === 'simple') {
                      const broken = m?.items.some(itemBroken)
                      return (
                        <div key={slot.id} className="flex justify-between text-sm">
                          <span className="text-ink-muted">{slot.label}</span>
                          <span className={broken ? 'font-medium text-warn' : undefined}>
                            {m ? (broken ? 'Needs food' : 'Planned') : '—'}
                          </span>
                        </div>
                      )
                    }
                    if (!m) {
                      return (
                        <div key={slot.id} className="text-sm text-ink-muted">
                          {slot.label}: —
                        </div>
                      )
                    }
                    const mealN = mealNutritionFromItems(m.items, recipeById, ingById)
                    const mealBroken = m.items.some(itemBroken)
                    return (
                      <div
                        key={m.id}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          mealBroken ? 'border-warn bg-warn/10' : 'border-line'
                        }`}
                      >
                        <div className="font-medium">{slot.label}</div>
                        {m.items.map((item, idx) => (
                          <div key={idx} className="mt-1 flex justify-between gap-2">
                            <span>
                              {recipeById.get(item.recipeId)?.name ?? 'Dish'} ×{item.portions}
                              {itemBroken(item) ? <Badge tone="warn">needs food</Badge> : null}
                            </span>
                            {nutri === 'dish' ? (
                              <MacroInline
                                nutrition={scaleNutrition(
                                  resolveServingNutrition(item, recipeById, ingById),
                                  item.portions,
                                )}
                              />
                            ) : null}
                          </div>
                        ))}
                        {nutri === 'meal' ? (
                          <div className="mt-1">
                            <MacroInline nutrition={mealN} />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {sessions.length === 0 && servings.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="A quiet week"
            body="Plan a cooking session, then tap a day to serve portions."
          />
        </div>
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/notebook" className="underline">
          Open notebook
        </Link>
      </p>
    </div>
  )
}
