import { addDays, format, parseISO } from 'date-fns'
import type { CookingSession, MealSlot, ReadyBatch, Recipe, SessionDishPlan } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { recipeCategory } from '@/domain/dishTaxonomy'
import { isDishRecipe, isPrepRecipe } from '@/domain/kitchen'
import { isPrepLeg } from '@/domain/stages'
import { plannedDishAvailable } from '@/domain/servings'
import { storageDaysFor } from '@/domain/storage'
import { suitableMealsFor } from '@/domain/mealSuitability'
import { dishRole } from '@/domain/weekPlanner/catalog'
import type { DishRole } from '@/domain/weekPlanner/types'

export type WeekFillSource =
  | {
      kind: 'planned'
      sessionId: number
      recipeId: number
      portions: number
      cookDate: string
      eatBy: string
      role: DishRole
      isStaple?: boolean
      includesStaple?: boolean
      suitableMeals: MealSlot[]
    }
  | {
      kind: 'batch'
      batchId: number
      recipeId: number
      portions: number
      cookDate: string
      eatBy: string
      role: DishRole
      isStaple?: boolean
      includesStaple?: boolean
      suitableMeals: MealSlot[]
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
  /** Min days between the same lunch or dinner center. Default 1. */
  varietyGapDays?: number
}

type MutableSource = WeekFillSource & { left: number }

function daysApart(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000)
}

function plateOf(recipe: Recipe): { role: DishRole; isStaple: boolean; includesStaple: boolean } {
  const category = recipeCategory(recipe)
  const includesStaple = recipe.includesStaple === true && category !== 'staple'
  return {
    role: dishRole(category, includesStaple),
    isStaple: category === 'staple',
    includesStaple,
  }
}

function edible(source: MutableSource, date: string): boolean {
  return date > source.cookDate && date <= source.eatBy && source.left > 0
}

function onMeal(assignments: WeekFillAssignment[], date: string, meal: MealSlot): WeekFillAssignment[] {
  return assignments.filter((assignment) => assignment.date === date && assignment.meal === meal)
}

/**
 * Place cooked portions onto upcoming meals.
 * A meal gets one center. Rice, soup, and a side are added only beside a center
 * that does not already include starch. Extra portions are left unassigned.
 */
export function planWeekFill(sources: WeekFillSource[], options: WeekFillOptions): WeekFillAssignment[] {
  const dayCount = options.dayCount ?? 5
  const meals: MealSlot[] = options.meals?.length ? options.meals : ['lunch', 'dinner']
  const gap = options.varietyGapDays ?? 1
  const days = Array.from({ length: dayCount }, (_, i) =>
    format(addDays(parseISO(options.fromDate), i), 'yyyy-MM-dd'),
  )
  const remaining: MutableSource[] = sources
    .filter((source) => source.portions > 0)
    .map((source) => ({ ...source, left: source.portions }))
  const assignments: WeekFillAssignment[] = []
  const lastCenterDate = new Map<number, string>()

  function take(date: string, meal: MealSlot, source: MutableSource, portions = 1) {
    const use = Math.min(portions, source.left)
    if (use <= 0) return
    source.left -= use
    assignments.push({
      date,
      meal,
      source: { ...source, portions: source.portions },
      portions: use,
    })
  }

  function pick(
    date: string,
    meal: MealSlot,
    roles: DishRole[],
    respectGap: boolean,
  ): MutableSource | undefined {
    let best: MutableSource | undefined
    let bestScore = -Infinity
    const used = new Set(onMeal(assignments, date, meal).map((item) => item.source.recipeId))
    for (const source of remaining) {
      if (!edible(source, date) || !roles.includes(source.role) || used.has(source.recipeId)) continue
      if (!source.suitableMeals.includes(meal)) continue
      if (respectGap && (meal === 'lunch' || meal === 'dinner') && roles.some((role) => role === 'center' || role === 'complete')) {
        const last = lastCenterDate.get(source.recipeId)
        if (last && daysApart(date, last) <= gap) continue
      }
      const score = source.left
      if (score > bestScore) {
        bestScore = score
        best = source
      }
    }
    return best
  }

  for (const date of days) {
    for (const meal of meals) {
      const light = meal === 'breakfast' || meal === 'snack'
      const centerRoles: DishRole[] = light
        ? ['complete', 'center', 'snack']
        : ['complete', 'center']
      const center = pick(date, meal, centerRoles, true) ?? pick(date, meal, centerRoles, false)
      if (!center) continue
      take(date, meal, center)
      if (!light && (center.role === 'center' || center.role === 'complete')) {
        lastCenterDate.set(center.recipeId, date)
      }
      if (light || center.role === 'complete' || center.includesStaple) continue

      const staple = pick(date, meal, ['staple'], false)
      if (staple) take(date, meal, staple)

      const soup = pick(date, meal, ['soup'], false)
      const side = pick(date, meal, ['side'], false)
      if (meal === 'lunch') {
        if (soup) take(date, meal, soup)
        else if (side) take(date, meal, side)
      } else if (meal === 'dinner') {
        if (soup) take(date, meal, soup)
        if (side) take(date, meal, side)
      }
    }
  }

  return mergeAssignments(assignments)
}

function mergeAssignments(list: WeekFillAssignment[]): WeekFillAssignment[] {
  const map = new Map<string, WeekFillAssignment>()
  for (const assignment of list) {
    const key =
      assignment.source.kind === 'planned'
        ? `${assignment.date}|${assignment.meal}|planned:${assignment.source.sessionId}:${assignment.source.recipeId}`
        : `${assignment.date}|${assignment.meal}|batch:${assignment.source.batchId}`
    const prev = map.get(key)
    if (prev) prev.portions += assignment.portions
    else map.set(key, { ...assignment, source: { ...assignment.source } })
  }
  return [...map.values()].sort((a, b) =>
    a.date === b.date
      ? MEAL_SLOTS.findIndex((slot) => slot.id === a.meal) - MEAL_SLOTS.findIndex((slot) => slot.id === b.meal)
      : a.date.localeCompare(b.date),
  )
}

function sourceMeta(recipe: Recipe, cookDate: string, expiresAt?: string) {
  const plate = plateOf(recipe)
  const keep = storageDaysFor(recipe, 'fridge')
  const eatBy = expiresAt ?? format(addDays(parseISO(cookDate), Math.max(keep, 1)), 'yyyy-MM-dd')
  return { ...plate, eatBy, suitableMeals: suitableMealsFor(recipe) }
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
    const meta = sourceMeta(recipe, session.date)
    out.push({
      kind: 'planned',
      sessionId: session.id,
      recipeId: dish.recipeId,
      portions: available,
      cookDate: session.date,
      ...meta,
    })
  }
  return out
}

export function sourcesFromBatches(batches: ReadyBatch[], recipeById: Map<number, Recipe>): WeekFillSource[] {
  const out: WeekFillSource[] = []
  for (const batch of batches) {
    if (batch.id == null || batch.portionsLeft <= 0) continue
    const recipe = recipeById.get(batch.recipeId)
    if (!recipe || !isDishRecipe(recipe)) continue
    const cookDate = batch.cookedAt.slice(0, 10)
    const meta = sourceMeta(recipe, cookDate, batch.expiresAt.slice(0, 10))
    out.push({
      kind: 'batch',
      batchId: batch.id,
      recipeId: batch.recipeId,
      portions: batch.portionsLeft,
      cookDate,
      ...meta,
    })
  }
  return out
}

export function defaultFillFromDate(cookDate: string, today: string): string {
  if (cookDate >= today) return format(addDays(parseISO(cookDate), 1), 'yyyy-MM-dd')
  return today
}

export type DishLike = SessionDishPlan
