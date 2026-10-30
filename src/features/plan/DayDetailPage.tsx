import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import {
  consolidateDuplicateMealSlots,
  deleteCookingSession,
  healOrphanedServingItems,
  setServingSkipped,
} from '@/db/servingOps'
import { AssignBatchSheet } from '@/features/plan/AssignBatchSheet'
import { MealSlotEditor } from '@/features/plan/MealSlotEditor'
import { planServePath } from '@/features/plan/servePath'
import { IconMeal } from '@/shared/icons'
import {
  MEAL_SLOTS,
  parseMealSlot,
  type Ingredient,
  type MealSlot,
  type Recipe,
  type Serving,
  type ServingItem,
} from '@/domain/types'
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
import { canRemovePlannedMeal, confirmRemovePlannedMeal } from '@/features/plan/removePlannedMeal'
import { appAlert } from '@/shared/dialog'
import { MacroBar, MacroInline } from '@/shared/MacroBar'
import { MealShareLegend, MealStack, dishColorClass } from '@/shared/MealShare'
import { SwipeReveal } from '@/shared/SwipeReveal'
import { Badge, Button, EmptyState, PageHeader, WarnBanner } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'

function MealShareGraph({
  items,
  recipeById,
  ingById,
  broken,
}: {
  items: ServingItem[]
  recipeById: Map<number, Recipe>
  ingById: Map<number, Ingredient>
  broken?: (item: ServingItem) => boolean
}) {
  if (items.length === 0) return null
  const segments = items.map((item, index) => ({
    key: `${index}-${servingItemLabel(item, recipeById)}`,
    label: `${servingItemLabel(item, recipeById)} × ${item.portions}`,
    kcal: scaleNutrition(resolveServingNutrition(item, recipeById, ingById), item.portions)
      .energyKcal,
    colorClass: dishColorClass(index),
  }))
  return (
    <div className="mt-2">
      <MealStack segments={segments} />
      <MealShareLegend
        segments={segments}
        note={(index) => {
          const item = items[index]
          if (!item) return null
          const needsFood = broken?.(item) ?? false
          const other = isAdhocServingItem(item)
          if (!needsFood && !other) return null
          return (
            <span className="inline-flex items-center gap-1">
              {other ? <Badge>Other</Badge> : null}
              {needsFood ? <Badge tone="warn">Needs food</Badge> : null}
            </span>
          )
        }}
      />
    </div>
  )
}

function sameDraft(a: ServingItem[], b: ServingItem[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, index) => {
    const other = b[index]
    return (
      item.portions === other?.portions &&
      item.batchId === other.batchId &&
      item.recipeId === other.recipeId &&
      item.plannedSessionId === other.plannedSessionId &&
      item.name === other.name &&
      item.nutrition.energyKcal === other.nutrition.energyKcal
    )
  })
}

function firstOpenMeal(servings: Serving[]): MealSlot {
  const missing = MEAL_SLOTS.find((slot) => {
    const meal = servings.find((serving) => serving.meal === slot.id)
    return meal == null || meal.items.length === 0
  })
  return missing?.id ?? 'lunch'
}

export function DayDetailPage() {
  const { date: dateParam } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const goals = useGoals()
  const today = todayISO()
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today
  const past = isPastDate(date)
  const isToday = date === today
  const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [draft, setDraft] = useState<{ meal: MealSlot; items: ServingItem[] } | null>(null)
  const onDraftChange = useCallback((meal: MealSlot, items: ServingItem[]) => {
    setDraft((prev) => {
      if (prev?.meal === meal && sameDraft(prev.items, items)) return prev
      return { meal, items }
    })
  }, [])

  const sessions =
    useLiveQuery(() => db.cookingSessions.where('date').equals(date).toArray(), [date]) ?? []
  const servingsQuery = useLiveQuery(
    () => db.servings.where('date').equals(date).toArray(),
    [date],
  )
  const servings = servingsQuery ?? []
  const serveParam = params.get('serve')
  const sessionIdRaw = params.get('sessionId')
  const sessionId =
    sessionIdRaw != null && Number.isFinite(Number(sessionIdRaw)) ? Number(sessionIdRaw) : undefined
  const requestedMeal = parseMealSlot(serveParam)
  const editorMeal = requestedMeal ?? firstOpenMeal(servings)
  const editorOpen = !past && serveParam != null && serveParam !== '' && servingsQuery !== undefined
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

  const dayNutrition = useMemo(() => {
    return MEAL_SLOTS.reduce((acc, slot) => {
      const saved = servings.find((serving) => serving.meal === slot.id)
      const items =
        editorOpen && draft?.meal === slot.id ? draft.items : (saved?.items ?? [])
      if (items.length === 0) return acc
      return addNutrition(acc, mealNutritionFromItems(items, recipeById, ingById))
    }, emptyNutrition())
  }, [servings, recipeById, ingById, editorOpen, draft])

  const needsFoodCount = servings.filter((s) => s.items.some(itemBroken)).length

  async function confirmDeleteSession(mode: 'keep-meals' | 'remove-meals') {
    if (deleteSessionId == null) return
    await deleteCookingSession(deleteSessionId, mode)
    setDeleteSessionId(null)
  }

  async function startSession(sessionId: number) {
    const active = await db.cookingSessions.where('status').equals('active').first()
    if (active && active.id !== sessionId) {
      await appAlert('Finish or leave the current active session first.')
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

  function openMeal(meal: MealSlot) {
    if (past) return
    if (!editorOpen || meal !== editorMeal) setDraft(null)
    navigate(planServePath(date, meal, sessionId), { replace: true })
  }

  function closeServe() {
    setDraft(null)
    navigate(`/plan/${date}`, { replace: true })
  }

  function goToDate(next: string) {
    if (isPastDate(next) || !editorOpen) {
      navigate(`/plan/${next}`)
      return
    }
    navigate(planServePath(next, editorMeal, sessionId))
  }

  function shiftDay(direction: -1 | 1) {
    goToDate(format(addDays(parseISO(date), direction), 'yyyy-MM-dd'))
  }

  return (
    <div>
      <PageHeader
        title={format(parseISO(date), 'EEEE d MMMM')}
        subtitle={isToday ? 'Today' : past ? 'Past day — view only' : format(parseISO(date), 'yyyy')}
        actions={
          <Button variant="secondary" onClick={() => navigate('/week')}>
            Week
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => shiftDay(-1)}>
          ←
        </Button>
        <span className="min-w-0 flex-1 text-center text-sm font-medium sm:flex-none sm:text-left">
          {format(parseISO(date), 'd MMM yyyy')}
        </span>
        <Button variant="secondary" onClick={() => shiftDay(1)}>
          →
        </Button>
        {!isToday ? (
          <Button variant="secondary" onClick={() => goToDate(today)}>
            Today
          </Button>
        ) : null}
        {isToday ? <Badge tone="accent">Today</Badge> : null}
        {past ? <Badge>Past</Badge> : null}
      </div>

      {needsFoodCount > 0 ? (
        <div className="mb-4">
          <WarnBanner>
            {needsFoodCount} meal{needsFoodCount > 1 ? 's' : ''} need food after a session change.
          </WarnBanner>
        </div>
      ) : null}

      <section className="mb-5 card-elevated p-4">
        <h2 className="mb-2 text-lg">Day nutrition</h2>
        <MacroBar
          nutrition={dayNutrition}
          goals={goals}
          goalCaption={
            editorOpen
              ? 'This day vs your daily targets, with the meal you are editing'
              : 'This day vs your daily targets'
          }
        />
      </section>

      {!past ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <Button className="flex-1" onClick={() => navigate(`/sessions/new?date=${date}`)}>
            Plan session
          </Button>
          <Button className="flex-1" variant="secondary" onClick={() => openMeal(firstOpenMeal(servings))}>
            Serve
          </Button>
          <Button className="flex-1" variant="secondary" onClick={() => setAssignOpen(true)}>
            Assign from stock
          </Button>
        </div>
      ) : null}

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg">Cook</h2>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">No cooking sessions on this day.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const legDishes = s.dishes.filter(isPrepLeg)
              const legOnly = s.dishes.length > 0 && legDishes.length === s.dishes.length
              const card = (
                <div
                  className="rounded-lg border border-line bg-paper px-3 py-2"
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
                    <p className="mt-1 text-xs text-ink">
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
                    </div>
                  ) : null}
                </div>
              )
              return past ? (
                <div key={s.id}>{card}</div>
              ) : (
                <SwipeReveal
                  key={s.id}
                  actionLabel="Delete cooking session"
                  onAction={() => setDeleteSessionId(s.id!)}
                >
                  {card}
                </SwipeReveal>
              )
            })}
          </div>
        )}
      </section>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg">Meals</h2>
        </div>
        <div className="space-y-2">
          {MEAL_SLOTS.map((slot) => {
            const m = servings.find((s) => s.meal === slot.id)
            const selected = editorOpen && editorMeal === slot.id
            const showingDraft = editorOpen && draft?.meal === slot.id
            const displayItems = showingDraft ? draft.items : (m?.items ?? [])
            if (!m && displayItems.length === 0) {
              if (past) {
                return (
                  <div
                    key={slot.id}
                    className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-muted"
                  >
                    <span className="inline-flex items-center gap-2">
                      <IconMeal meal={slot.id} className="h-3.5 w-3.5" />
                      {slot.label}: —
                    </span>
                  </div>
                )
              }
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => openMeal(slot.id)}
                  className={`w-full rounded-lg border border-dashed px-3 py-2 text-left text-sm ${
                    selected
                      ? 'border-lacquer/50 bg-lacquer/5 text-ink'
                      : 'border-line text-ink-muted'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <IconMeal meal={slot.id} className="h-3.5 w-3.5" />
                    {slot.label}: Add dishes
                    {selected ? <Badge tone="ok">Editing</Badge> : null}
                  </span>
                </button>
              )
            }
            const mealN = mealNutritionFromItems(displayItems, recipeById, ingById)
            const mealBroken = !showingDraft && (m?.items.some(itemBroken) ?? false)
            const removable = canRemovePlannedMeal(m, date, today)
            const shellClass = `w-full rounded-lg border px-3 py-2 text-left text-sm ${
              selected
                ? 'border-lacquer/40 bg-lacquer/5'
                : mealBroken
                  ? 'border-warn bg-warn/10'
                  : 'border-line bg-paper'
            }`
            const body = (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <IconMeal meal={slot.id} className="h-3.5 w-3.5" />
                    {slot.label}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {selected ? <Badge tone="ok">Editing</Badge> : null}
                    {mealBroken ? <Badge tone="warn">Needs food</Badge> : null}
                    {m?.kept ? <Badge tone="ok">Consumed</Badge> : null}
                    {m?.skipped ? <Badge>Left out</Badge> : null}
                    {past && m?.id != null ? (
                      <Button
                        variant="ghost"
                        className="!py-1 !text-xs"
                        onClick={() => void setServingSkipped(m.id!, !m.skipped)}
                      >
                        {m.skipped ? 'Count in stats' : 'Leave out of stats'}
                      </Button>
                    ) : null}
                  </span>
                </div>
                <MealShareGraph
                  items={displayItems}
                  recipeById={recipeById}
                  ingById={ingById}
                  broken={showingDraft ? undefined : itemBroken}
                />
                <div className="mt-1.5 border-t border-line/60 pt-1.5">
                  <span className="text-xs font-medium text-ink">Meal · </span>
                  <MacroInline nutrition={mealN} goals={goals} />
                </div>
              </>
            )
            const card = past ? (
              <div className={shellClass}>{body}</div>
            ) : (
              <button type="button" onClick={() => openMeal(slot.id)} className={shellClass}>
                {body}
              </button>
            )
            return removable && m ? (
              <SwipeReveal
                key={m.id}
                actionLabel={`Remove ${slot.label}`}
                onAction={() => void confirmRemovePlannedMeal(date, slot.id)}
              >
                {card}
              </SwipeReveal>
            ) : (
              <div key={m?.id ?? slot.id}>{card}</div>
            )
          })}
        </div>
      </section>

      {editorOpen ? (
        <MealSlotEditor
          key={`${date}:${editorMeal}`}
          date={date}
          meal={editorMeal}
          sessionId={sessionId}
          initialItems={servings.find((serving) => serving.meal === editorMeal)?.items ?? []}
          onDraftChange={onDraftChange}
          onMealChange={openMeal}
          onClose={closeServe}
          onSaved={closeServe}
        />
      ) : null}

      {sessions.length === 0 && servings.length === 0 && !editorOpen ? (
        <EmptyState
          title="Nothing planned"
          body={
            past
              ? 'This day has no sessions or meals on record.'
              : 'Plan a cooking session or serve meals for this day.'
          }
          actions={
            past ? undefined : (
              <>
                <Button onClick={() => navigate(`/sessions/new?date=${date}`)}>Plan session</Button>
                <Button variant="secondary" onClick={() => openMeal(firstOpenMeal(servings))}>
                  Serve
                </Button>
              </>
            )
          }
        />
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/week" className="underline">
          Back to plan
        </Link>
      </p>

      <AssignBatchSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        batches={allBatches}
        recipes={recipes}
        initialDate={date}
        lockDate
      />

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
