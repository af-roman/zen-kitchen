import { MEAL_SLOTS, type MealSlot } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'
import { format, parseISO, startOfWeek } from 'date-fns'
import { defaultMealPatterns, type MealPatternId } from './patterns'
import type { PlannerPrefs } from './types'

const STORAGE_KEY = 'zen-kitchen.plannerPrefs'

export function defaultPlannerPrefs(weekStartDate?: string): PlannerPrefs {
  const start =
    weekStartDate ??
    format(startOfWeek(parseISO(todayISO()), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  return {
    weekStartDate: start,
    dayCount: 7,
    meals: ['lunch', 'dinner'],
    batchCookCount: 2,
    stapleExtraCadence: true,
    macroTolerancePct: 15,
    varietyGapDays: 1,
    mealPatterns: defaultMealPatterns(),
  }
}

export function loadPlannerPrefs(): PlannerPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPlannerPrefs()
    const parsed = JSON.parse(raw) as Partial<PlannerPrefs>
    const base = defaultPlannerPrefs(parsed.weekStartDate)
    return {
      ...base,
      ...parsed,
      meals: normalizeMeals(parsed.meals) ?? base.meals,
      dayCount: clampInt(parsed.dayCount, 3, 14, base.dayCount),
      batchCookCount: clampInt(parsed.batchCookCount, 1, 4, base.batchCookCount),
      macroTolerancePct: clampInt(parsed.macroTolerancePct, 5, 40, base.macroTolerancePct),
      varietyGapDays: clampInt(parsed.varietyGapDays, 0, 3, base.varietyGapDays),
      stapleExtraCadence: parsed.stapleExtraCadence ?? base.stapleExtraCadence,
      mealPatterns: {
        ...base.mealPatterns,
        ...normalizePatterns(parsed.mealPatterns),
      },
    }
  } catch {
    return defaultPlannerPrefs()
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

function normalizePatterns(
  map: Partial<Record<MealSlot, MealPatternId>> | undefined,
): Partial<Record<MealSlot, MealPatternId>> {
  if (!map) return {}
  const allowed: MealPatternId[] = ['simple', 'ichiju_sansai', 'bento']
  const out: Partial<Record<MealSlot, MealPatternId>> = {}
  for (const [meal, id] of Object.entries(map) as [MealSlot, MealPatternId][]) {
    if (allowed.includes(id)) out[meal] = id
  }
  return out
}

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}
