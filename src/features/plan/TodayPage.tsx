import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import { sessionShortfalls } from '@/db/shoppingOps'
import { consolidateDuplicateMealSlots, healOrphanedServingItems, setServingKept } from '@/db/servingOps'
import type { MealSlot, Serving } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'
import { addNutrition, emptyNutrition } from '@/domain/nutrition'
import { mealNutritionFromItems, servingItemNeedsFood } from '@/domain/servings'
import { deriveTodayAlerts } from '@/domain/todayAlerts'
import { deriveWeekJourney, type JourneyAction } from '@/domain/weekJourney'
import { assetUrl } from '@/shared/assetUrl'
import { useGoals } from '@/shared/hooks'
import {
  IconArrowRight,
  IconCook,
  IconKitchen,
  IconMeal,
  IconPlan,
  IconServe,
  IconShop,
} from '@/shared/icons'
import { MacroBar } from '@/shared/MacroBar'
import { Badge, Button } from '@/shared/ui'

function mealLabel(meal: MealSlot): string {
  return MEAL_SLOTS.find((m) => m.id === meal)?.label ?? meal
}

function JourneyIcon({ kind }: { kind: JourneyAction['kind'] }) {
  const className = 'h-6 w-6 shrink-0 text-lacquer'
  switch (kind) {
    case 'shop':
      return <IconShop className={className} />
    case 'cook':
      return <IconCook className={className} />
    case 'serve':
      return <IconServe className={className} />
    default:
      return <IconPlan className={className} />
  }
}

function MealIcon({ meal }: { meal: MealSlot }) {
  return <IconMeal meal={meal} className="h-3.5 w-3.5" />
}

export function TodayPage() {
  const navigate = useNavigate()
  const goals = useGoals()
  const today = todayISO()

  const sessions = useLiveQuery(() => db.cookingSessions.toArray(), []) ?? []
  const servings = useLiveQuery(() => db.servings.toArray(), []) ?? []
  const batches = useLiveQuery(() => db.readyBatches.toArray(), []) ?? []
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? []
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? []
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), []) ?? []
  const openLists =
    useLiveQuery(() => db.shoppingLists.where('status').equals('open').toArray(), []) ?? []

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id!, r])), [recipes])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id!, i])), [ingredients])
  const sessionById = useMemo(
    () => new Map(sessions.filter((s) => s.id != null).map((s) => [s.id!, s])),
    [sessions],
  )
  const batchIds = useMemo(
    () => new Set(batches.map((b) => b.id).filter((id): id is number => id != null)),
    [batches],
  )

  useEffect(() => {
    void (async () => {
      await consolidateDuplicateMealSlots()
      await healOrphanedServingItems()
    })()
  }, [])

  const hasPlannedContent =
    sessions.some((s) => s.status !== 'done' && s.date >= today) ||
    servings.some((s) => s.date >= today && s.items.length > 0) ||
    (openLists[0]?.items.length ?? 0) > 0

  const journey = useMemo(
    () =>
      deriveWeekJourney({
        sessions,
        shoppingList: openLists[0],
        hasWeekContent: hasPlannedContent,
        today,
      }),
    [sessions, openLists, hasPlannedContent, today],
  )

  const nextCook = useMemo(
    () =>
      sessions
        .filter((s) => s.id != null && s.status !== 'done' && s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0],
    [sessions, today],
  )

  const nextCookShort = useMemo(() => {
    if (!nextCook) return 0
    return sessionShortfalls(nextCook, sessions, recipeById, pantry, ingById, today).length
  }, [nextCook, sessions, recipeById, pantry, ingById, today])

  const alerts = useMemo(
    () =>
      deriveTodayAlerts({
        today,
        sessions,
        pantry,
        batches,
        servings,
        nextCookShort,
        nextCookDate: nextCook?.date,
      }),
    [today, sessions, pantry, batches, servings, nextCookShort, nextCook],
  )

  const todayNutrition = useMemo(
    () =>
      servings
        .filter((s) => s.date === today && !s.skipped)
        .reduce(
          (acc, s) => addNutrition(acc, mealNutritionFromItems(s.items, recipeById, ingById)),
          emptyNutrition(),
        ),
    [servings, today, recipeById, ingById],
  )

  function dishNames(serving: Serving | undefined): string {
    if (!serving || serving.items.length === 0) return 'Add dishes'
    return serving.items
      .map((item) => {
        if (item.name) return item.name
        if (item.recipeId != null) return recipeById.get(item.recipeId)?.name ?? 'Dish'
        return 'Dish'
      })
      .join(' · ')
  }

  function coverImage(serving: Serving | undefined): string | undefined {
    if (!serving) return undefined
    for (const item of serving.items) {
      if (item.recipeId == null) continue
      const img = recipeById.get(item.recipeId)?.imageDataUrl
      if (img) return img
    }
    return undefined
  }

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">
            {format(parseISO(today), 'EEEE d MMMM')}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Today</h1>
        </div>
        <Button variant="secondary" className="gap-1.5" onClick={() => navigate('/more')}>
          <IconKitchen className="h-4 w-4" />
          Kitchen
        </Button>
      </header>

      <button
        type="button"
        onClick={() => navigate(journey.primary.to)}
        className="cta-ink mb-4 flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
            <JourneyIcon kind={journey.primary.kind} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/55">Next up</p>
            <p className="mt-1 text-lg font-semibold text-white">{journey.primary.label}</p>
            <p className="mt-0.5 truncate text-sm text-white/65">{journey.chip}</p>
          </div>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lacquer text-white">
          <IconArrowRight className="h-5 w-5" />
        </span>
      </button>

      {alerts.length > 0 ? (
        <ul className="mb-6 space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <button
                type="button"
                onClick={() => navigate(alert.to)}
                className="w-full rounded-2xl bg-warn/10 px-4 py-3 text-left"
              >
                <p className="text-sm font-semibold text-warn">{alert.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{alert.detail}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="mb-6 card-elevated px-4 py-4">
        <MacroBar nutrition={todayNutrition} goals={goals} goalCaption="Today vs your daily targets" />
      </section>

      <ul className="space-y-3">
        {MEAL_SLOTS.map(({ id: meal }) => {
          const serving = servings.find((s) => s.date === today && s.meal === meal)
          const needsFood =
            serving?.items.some((item) => servingItemNeedsFood(item, sessionById, batchIds)) ??
            false
          const names = dishNames(serving)
          const image = coverImage(serving)
          const empty = !serving || serving.items.length === 0
          return (
            <li key={meal} className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  navigate(empty || needsFood ? `/serve?date=${today}` : `/plan/${today}`)
                }
                className="meal-tile flex w-full gap-0 text-left transition hover:scale-[1.01] active:scale-[0.99]"
              >
                <div className="h-24 w-24 shrink-0 bg-ink/5 sm:h-28 sm:w-28">
                  {image ? (
                    <img src={assetUrl(image)} alt="" className="h-full w-full object-cover" />
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
                    {serving?.kept ? <Badge tone="ok">Kept</Badge> : null}
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
              {serving?.id != null && !empty ? (
                <Button
                  variant={serving.kept ? 'secondary' : 'primary'}
                  className="w-full"
                  onClick={() => void setServingKept(serving.id!, !serving.kept)}
                >
                  {serving.kept ? 'Kept — counted in the logbook' : 'Mark kept'}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="mt-8">
        <Button variant="secondary" className="w-full" onClick={() => navigate('/week')}>
          Open the week
        </Button>
      </div>
    </div>
  )
}
