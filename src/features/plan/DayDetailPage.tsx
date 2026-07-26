import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import {
  consolidateDuplicateMealSlots,
  deleteCookingSession,
  healOrphanedServingItems,
} from '@/db/servingOps'
import { MEAL_SLOTS } from '@/domain/types'
import { addNutrition, emptyNutrition, scaleNutrition } from '@/domain/nutrition'
import { formatQuantity, isPrepRecipe, todayISO } from '@/domain/kitchen'
import { cookDateFromStage, dishStage, isPrepLeg, stageLabel } from '@/domain/stages'
import {
  isAdhocServingItem,
  isPastDate,
  mealNutritionFromItems,
  resolveServingNutrition,
  servingItemLabel,
  servingItemNeedsFood,
} from '@/domain/servings'
import { useGoals } from '@/shared/hooks'
import { MacroBar, MacroInline } from '@/shared/MacroBar'
import { Badge, Button, EmptyState, PageHeader, WarnBanner } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

export function DayDetailPage() {
  const { date: dateParam } = useParams()
  const navigate = useNavigate()
  const goals = useGoals()
  const today = todayISO()
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today
  const past = isPastDate(date)
  const isToday = date === today
  const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null)

  const sessions =
    useLiveQuery(() => db.cookingSessions.where('date').equals(date).toArray(), [date]) ?? []
  const servings =
    useLiveQuery(() => db.servings.where('date').equals(date).toArray(), [date]) ?? []
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

  const itemBroken = (item: Parameters<typeof servingItemNeedsFood>[0]) =>
    servingItemNeedsFood(item, sessionById, batchIds)

  useEffect(() => {
    void (async () => {
      await consolidateDuplicateMealSlots()
      await healOrphanedServingItems()
    })()
  }, [])

  const dayNutrition = useMemo(
    () =>
      servings.reduce(
        (acc, s) => addNutrition(acc, mealNutritionFromItems(s.items, recipeById, ingById)),
        emptyNutrition(),
      ),
    [servings, recipeById, ingById],
  )

  const dishRows = useMemo(() => {
    const rows: {
      key: string
      mealLabel: string
      label: string
      portions: number
      nutrition: ReturnType<typeof emptyNutrition>
      adhoc: boolean
      broken: boolean
    }[] = []
    for (const slot of MEAL_SLOTS) {
      const serving = servings.find((s) => s.meal === slot.id)
      if (!serving) continue
      for (const [idx, item] of serving.items.entries()) {
        rows.push({
          key: `${slot.id}-${idx}`,
          mealLabel: slot.label,
          label: servingItemLabel(item, recipeById),
          portions: item.portions,
          nutrition: scaleNutrition(
            resolveServingNutrition(item, recipeById, ingById),
            item.portions,
          ),
          adhoc: isAdhocServingItem(item),
          broken: itemBroken(item),
        })
      }
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servings, recipeById, ingById, sessionById, batchIds])

  const needsFoodCount = servings.filter((s) => s.items.some(itemBroken)).length

  async function confirmDeleteSession(mode: 'keep-meals' | 'remove-meals') {
    if (deleteSessionId == null) return
    await deleteCookingSession(deleteSessionId, mode)
    setDeleteSessionId(null)
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
        title={format(parseISO(date), 'EEEE d MMMM')}
        subtitle={isToday ? 'Today' : past ? 'Past day — view only' : format(parseISO(date), 'yyyy')}
        actions={
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {isToday ? <Badge tone="accent">Today</Badge> : null}
        {past ? <Badge>Past</Badge> : null}
        {!past ? (
          <>
            <Button variant="primary" onClick={() => navigate(`/serve?date=${date}`)}>
              Serve meals
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(`/sessions/new?date=${date}`)}
            >
              Plan session
            </Button>
          </>
        ) : null}
      </div>

      {needsFoodCount > 0 ? (
        <div className="mb-4">
          <WarnBanner>
            {needsFoodCount} meal{needsFoodCount > 1 ? 's' : ''} need food after a session change.
          </WarnBanner>
        </div>
      ) : null}

      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-2 text-lg">Day nutrition</h2>
        <MacroBar
          nutrition={dayNutrition}
          goals={goals}
          goalCaption="This day vs your daily targets"
        />
      </section>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg">Cook</h2>
          {!past ? (
            <Button
              variant="secondary"
              className="!py-1 !text-xs"
              onClick={() => navigate(`/sessions/new?date=${date}`)}
            >
              Plan session
            </Button>
          ) : null}
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">No cooking sessions on this day.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const legDishes = s.dishes.filter(isPrepLeg)
              const legOnly = s.dishes.length > 0 && legDishes.length === s.dishes.length
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">
                      {legOnly ? 'Prep stage' : 'Session'} · {s.status}
                    </Badge>
                    {s.dishes.map((d) => {
                      const r = recipeById.get(d.recipeId)
                      return (
                        <span key={`${d.recipeId}-${dishStage(d)}`} className="text-sm">
                          {r?.name}
                          {r && isPrepRecipe(r) && !isPrepLeg(d) ? ' · prep' : ''} ·{' '}
                          {formatQuantity(r, d.portions)}
                        </span>
                      )
                    })}
                  </div>
                  {legDishes.length > 0 ? (
                    <p className="mt-1 text-xs text-accent-deep">
                      {legDishes
                        .map(
                          (d) =>
                            `${stageLabel(dishStage(d))} for ${
                              recipeById.get(d.recipeId)?.name ?? 'a recipe'
                            } — cooked ${cookDateFromStage(s.date, dishStage(d))}`,
                        )
                        .join(' · ')}
                    </p>
                  ) : null}
                  {!past ? (
                    <div className="mt-2 flex flex-wrap gap-2">
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
                        onClick={() => setDeleteSessionId(s.id!)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg">Eat</h2>
          {!past ? (
            <Button
              variant="secondary"
              className="!py-1 !text-xs"
              onClick={() => navigate(`/serve?date=${date}`)}
            >
              Serve
            </Button>
          ) : null}
        </div>
        <div className="space-y-2">
          {MEAL_SLOTS.map((slot) => {
            const m = servings.find((s) => s.meal === slot.id)
            if (!m) {
              return (
                <div
                  key={slot.id}
                  className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-muted"
                >
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{slot.label}</span>
                  {mealBroken ? <Badge tone="warn">Needs food</Badge> : null}
                </div>
                {m.items.map((item, idx) => (
                  <div key={idx} className="mt-1.5 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>
                        {servingItemLabel(item, recipeById)} ×{item.portions}
                      </span>
                      {isAdhocServingItem(item) ? <Badge>Other</Badge> : null}
                      {itemBroken(item) ? <Badge tone="warn">Needs food</Badge> : null}
                    </div>
                    <MacroInline
                      nutrition={scaleNutrition(
                        resolveServingNutrition(item, recipeById, ingById),
                        item.portions,
                      )}
                    />
                  </div>
                ))}
                <div className="mt-1.5 border-t border-line/60 pt-1.5">
                  <span className="text-xs font-medium text-ink">Meal · </span>
                  <MacroInline nutrition={mealN} goals={goals} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
        <h2 className="mb-1 text-lg">Nutrition</h2>
        <p className="mb-4 text-xs text-ink-muted">
          Dishes, meals, and the day — so you can see the balance at a glance.
        </p>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Dishes</h3>
            {dishRows.length === 0 ? (
              <p className="text-sm text-ink-muted">No dishes served yet.</p>
            ) : (
              <ul className="space-y-2">
                {dishRows.map((row) => (
                  <li
                    key={row.key}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line px-3 py-2"
                  >
                    <span className="text-sm">
                      <span className="text-ink-muted">{row.mealLabel} · </span>
                      {row.label} ×{row.portions}
                      {row.adhoc ? (
                        <span className="ml-1.5 align-middle">
                          <Badge>Other</Badge>
                        </span>
                      ) : null}
                      {row.broken ? (
                        <span className="ml-1.5 align-middle">
                          <Badge tone="warn">Needs food</Badge>
                        </span>
                      ) : null}
                    </span>
                    <MacroInline nutrition={row.nutrition} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-medium text-ink">Meals</h3>
            <ul className="space-y-1.5">
              {MEAL_SLOTS.map((slot) => {
                const m = servings.find((s) => s.meal === slot.id)
                const slotN = m
                  ? mealNutritionFromItems(m.items, recipeById, ingById)
                  : emptyNutrition()
                return (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="text-ink-muted">{slot.label}</span>
                    {m ? (
                      <MacroInline nutrition={slotN} goals={goals} />
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-medium text-ink">Whole day</h3>
            <MacroBar
              nutrition={dayNutrition}
              goals={goals}
              goalCaption="Full day vs your daily targets"
            />
          </div>
        </div>
      </section>

      {sessions.length === 0 && servings.length === 0 ? (
        <EmptyState
          title="Nothing planned"
          body={
            past
              ? 'This day has no sessions or meals on record.'
              : 'Plan a cooking session or serve meals for this day.'
          }
        />
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/" className="underline">
          Back to plan
        </Link>
      </p>

      <Sheet
        open={deleteSessionId != null}
        title="Delete cooking session?"
        onClose={() => setDeleteSessionId(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Choose what happens to meals that used recipes from this session.
          </p>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => void confirmDeleteSession('keep-meals')}
          >
            Keep meals — mark as Needs food
          </Button>
          <Button
            className="w-full"
            variant="danger"
            onClick={() => void confirmDeleteSession('remove-meals')}
          >
            Remove linked meals too
          </Button>
          <Button className="w-full" variant="ghost" onClick={() => setDeleteSessionId(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
