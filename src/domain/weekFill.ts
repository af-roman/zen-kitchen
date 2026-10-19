import { addDays, format, parseISO } from 'date-fns'
import type { CookingSession, MealSlot, ReadyBatch, Recipe, SessionDishPlan } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { isDishRecipe, isPrepRecipe } from '@/domain/kitchen'
import { isPrepLeg } from '@/domain/stages'
import { plannedDishAvailable } from '@/domain/servings'

export type WeekFillSource =
  | {
      kind: 'planned'
      sessionId: number
      recipeId: number
      portions: number
      cookDate: string
    }
  | {
      kind: 'batch'
      batchId: number
      recipeId: number
      portions: number
      cookDate: string
    }

export type WeekFillAssignment = {
  date: string
  meal: MealSlot
  source: WeekFillSource
  portions: number
}

export type WeekFillOptions = {
  /** Inclusive start date (yyyy-MM-dd). */
  fromDate: string
  /** How many days to fill. Default 5. */
  dayCount?: number
  /** Meals to fill. Default lunch + dinner. */
  meals?: MealSlot[]
  /** Min days between same recipe on the grid. Default 1 (no consecutive days). */
  varietyGapDays?: number
}

type MutableSource = WeekFillSource & { left: number }

function toAssignment(date: string, meal: MealSlot, src: MutableSource, take: number): WeekFillAssignment {
  const source: WeekFillSource =
    src.kind === 'planned'
      ? {
          kind: 'planned',
          sessionId: src.sessionId,
          recipeId: src.recipeId,
          portions: src.portions,
          cookDate: src.cookDate,
        }
      : {
          kind: 'batch',
          batchId: src.batchId,
          recipeId: src.recipeId,
          portions: src.portions,
          cookDate: src.cookDate,
        }
  return { date, meal, source, portions: take }
}

function daysApart(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000)
}

/**
 * Distribute available portions across upcoming meal slots with a simple rotation.
 * Avoids placing the same recipeId on days closer than `varietyGapDays`.
 */
export function planWeekFill(
  sources: WeekFillSource[],
  options: WeekFillOptions,
): WeekFillAssignment[] {
  const dayCount = options.dayCount ?? 5
  const meals: MealSlot[] = options.meals?.length
    ? options.meals
    : ['lunch', 'dinner']
  const gap = options.varietyGapDays ?? 1

  const days = Array.from({ length: dayCount }, (_, i) =>
    format(addDays(parseISO(options.fromDate), i), 'yyyy-MM-dd'),
  )

  const remaining: MutableSource[] = sources
    .filter((s) => s.portions > 0)
    .map((s) => ({ ...s, left: s.portions }))

  const assignments: WeekFillAssignment[] = []
  const lastDateByRecipe = new Map<number, string>()

  function pickBest(date: string, respectGap: boolean): number {
    let bestIdx = -1
    let bestLeft = -1
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]
      if (s.left <= 0) continue
      if (respectGap) {
        const last = lastDateByRecipe.get(s.recipeId)
        if (last && daysApart(date, last) < gap) continue
      }
      if (s.left > bestLeft) {
        bestLeft = s.left
        bestIdx = i
      }
    }
    return bestIdx
  }

  for (const date of days) {
    for (const meal of meals) {
      let bestIdx = pickBest(date, true)
      if (bestIdx < 0) bestIdx = pickBest(date, false)
      if (bestIdx < 0) continue
      const src = remaining[bestIdx]
      const take = Math.min(1, src.left)
      src.left -= take
      lastDateByRecipe.set(src.recipeId, date)
      assignments.push(toAssignment(date, meal, src, take))
    }
  }

  // Leftover portions → extra dinner slots
  for (const src of remaining) {
    while (src.left > 0) {
      let placed = false
      for (const date of days) {
        const last = lastDateByRecipe.get(src.recipeId)
        if (last && daysApart(date, last) < gap) continue
        const take = Math.min(1, src.left)
        src.left -= take
        lastDateByRecipe.set(src.recipeId, date)
        assignments.push(toAssignment(date, 'dinner', src, take))
        placed = true
        break
      }
      if (!placed) {
        // Force-place ignoring gap
        for (const date of days) {
          const take = Math.min(1, src.left)
          src.left -= take
          lastDateByRecipe.set(src.recipeId, date)
          assignments.push(toAssignment(date, 'dinner', src, take))
          placed = true
          break
        }
      }
      if (!placed) break
    }
  }

  return mergeAssignments(assignments)
}

function mergeAssignments(list: WeekFillAssignment[]): WeekFillAssignment[] {
  const map = new Map<string, WeekFillAssignment>()
  for (const a of list) {
    const key =
      a.source.kind === 'planned'
        ? `${a.date}|${a.meal}|planned:${a.source.sessionId}:${a.source.recipeId}`
        : `${a.date}|${a.meal}|batch:${a.source.batchId}`
    const prev = map.get(key)
    if (prev) prev.portions += a.portions
    else map.set(key, { ...a, source: { ...a.source } })
  }
  return [...map.values()].sort((a, b) =>
    a.date === b.date
      ? MEAL_SLOTS.findIndex((s) => s.id === a.meal) -
        MEAL_SLOTS.findIndex((s) => s.id === b.meal)
      : a.date.localeCompare(b.date),
  )
}

export function sourcesFromSession(
  session: CookingSession,
  recipeById: Map<number, Recipe>,
): WeekFillSource[] {
  if (session.id == null) return []
  const out: WeekFillSource[] = []
  for (const dish of session.dishes) {
    if (isPrepLeg(dish)) continue
    const recipe = recipeById.get(dish.recipeId)
    if (!recipe || !isDishRecipe(recipe) || isPrepRecipe(recipe)) continue
    const available = plannedDishAvailable(dish.portions, dish.portionsPlanned ?? 0)
    if (available <= 0) continue
    out.push({
      kind: 'planned',
      sessionId: session.id,
      recipeId: dish.recipeId,
      portions: available,
      cookDate: session.date,
    })
  }
  return out
}

export function sourcesFromBatches(
  batches: ReadyBatch[],
  recipeById: Map<number, Recipe>,
): WeekFillSource[] {
  const out: WeekFillSource[] = []
  for (const b of batches) {
    if (b.id == null || b.portionsLeft <= 0) continue
    const recipe = recipeById.get(b.recipeId)
    if (!recipe || !isDishRecipe(recipe)) continue
    out.push({
      kind: 'batch',
      batchId: b.id,
      recipeId: b.recipeId,
      portions: b.portionsLeft,
      cookDate: b.cookedAt.slice(0, 10),
    })
  }
  return out
}

export function defaultFillFromDate(cookDate: string, today: string): string {
  if (cookDate >= today) {
    return format(addDays(parseISO(cookDate), 1), 'yyyy-MM-dd')
  }
  return today
}

export type DishLike = SessionDishPlan
