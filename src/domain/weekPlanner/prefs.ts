import { addDays, format, parseISO } from 'date-fns'
import { MEAL_SLOTS, type MealSlot } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'
import type { PlannerPrefs } from './types'

const STORAGE_KEY = 'zen-kitchen.plannerPrefs'

/**
 * Cook the evening before each stretch of meals. A keep of `keepDays` covers that
 * many eat days, starting the morning after the cook.
 */
export function suggestCookDates(weekStartDate: string, dayCount: number, keepDays = 3): string[] {
  const cooks: string[] = []
  const lastEat = addDays(parseISO(weekStartDate), Math.max(0, dayCount - 1))
  let eat = parseISO(weekStartDate)
  while (eat <= lastEat) {
    cooks.push(format(addDays(eat, -1), 'yyyy-MM-dd'))
    eat = addDays(eat, Math.max(1, keepDays))
  }
  return cooks
}

/** Evenings that can feed at least one day of this plan. */
export function cookChoiceDates(weekStartDate: string, dayCount: number): string[] {
  const first = addDays(parseISO(weekStartDate), -1)
  const last = addDays(parseISO(weekStartDate), Math.max(0, dayCount - 2))
  if (last < first) return [format(first, 'yyyy-MM-dd')]
  const dates: string[] = []
  for (let day = first; day <= last; day = addDays(day, 1)) {
    dates.push(format(day, 'yyyy-MM-dd'))
  }
  return dates
}

export function defaultPlannerPrefs(today = todayISO()): PlannerPrefs {
  const start = format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
  return {
    weekStartDate: start,
    dayCount: 7,
    meals: ['lunch', 'dinner'],
    cookDates: suggestCookDates(start, 7),
    varietyGapDays: 1,
    preferExpiring: true,
    macroTolerancePct: 15,
  }
}

export function loadPlannerPrefs(): PlannerPrefs {
  const today = todayISO()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPlannerPrefs(today)
    const parsed = JSON.parse(raw) as Partial<PlannerPrefs>
    const base = defaultPlannerPrefs(today)
    const dayCount = clampInt(parsed.dayCount, 3, 14, base.dayCount)
    const weekStartDate =
      parsed.weekStartDate && parsed.weekStartDate >= today ? parsed.weekStartDate : base.weekStartDate
    const savedCooks = normalizeCookDates(parsed.cookDates).filter((date) => date >= today)
    const stale = (parsed.cookDates ?? []).some((date) => date < today)
    const cookDates =
      stale || savedCooks.length === 0
        ? suggestCookDates(weekStartDate, dayCount).filter((date) => date >= today)
        : savedCooks
    return {
      weekStartDate,
      dayCount,
      meals: normalizeMeals(parsed.meals) ?? base.meals,
      cookDates: cookDates.length ? cookDates : base.cookDates,
      varietyGapDays: clampInt(parsed.varietyGapDays, 0, 3, base.varietyGapDays),
      preferExpiring: parsed.preferExpiring ?? base.preferExpiring,
      macroTolerancePct: clampInt(parsed.macroTolerancePct, 5, 40, base.macroTolerancePct),
    }
  } catch {
    return defaultPlannerPrefs(today)
  }
}

export function savePlannerPrefs(prefs: PlannerPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

function normalizeMeals(meals: MealSlot[] | undefined): MealSlot[] | undefined {
  if (!meals?.length) return undefined
  const allowed = new Set(meals)
  const next = MEAL_SLOTS.map((slot) => slot.id).filter((id) => allowed.has(id))
  return next.length ? next : undefined
}

function normalizeCookDates(dates: string[] | undefined): string[] {
  if (!dates?.length) return []
  return [...new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}
