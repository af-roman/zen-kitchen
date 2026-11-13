import { addDays, format, parseISO } from 'date-fns'
import { addNutrition, emptyNutrition, macroGramsFromGoals, scaleNutrition } from '@/domain/nutrition'
import type { Nutrition } from '@/domain/types'
import type {
  DayGoalGap,
  PlannerCatalog,
  PlannerPrefs,
  WeekDraft,
  WeekDraftScore,
  WeekDraftServing,
  WeekDraftSession,
  WeekDraftShopLine,
} from './types'

export function eatByDate(cookDate: string, fridgeDays: number): string {
  return format(addDays(parseISO(cookDate), Math.max(0, fridgeDays)), 'yyyy-MM-dd')
}

/** A cook evening is not an eat day. The last eat day is cook date + keep days. */
export function servingWithinEatBy(serving: WeekDraftServing, fridgeDays: number): boolean {
  if (serving.date <= serving.cookDate) return false
  return serving.date <= eatByDate(serving.cookDate, fridgeDays)
}

function pctDrift(actual: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.round(((actual - goal) / goal) * 100)
}

function formatGapPart(label: string, pct: number, tolPct: number): string | null {
  if (Math.abs(pct) <= tolPct) return null
  const sign = pct > 0 ? '+' : ''
  return `${label} ${sign}${pct}%`
}

/**
 * Per-day nutrition vs goals. Overshoot and undershoot both show;
 * the generator treats overshoot as the limit to trim.
 */
export function computeDayGoalGaps(
  prefs: PlannerPrefs,
  servings: WeekDraftServing[],
  catalog: PlannerCatalog,
): { gaps: DayGoalGap[]; avgNutrition: Nutrition; warnings: string[] } {
  const byId = new Map(catalog.candidates.map((c) => [c.recipeId, c]))
  const days = Array.from({ length: prefs.dayCount }, (_, i) =>
    format(addDays(parseISO(prefs.weekStartDate), i), 'yyyy-MM-dd'),
  )
  const goals = catalog.goals
  const goalMacros = macroGramsFromGoals({
    id: 1,
    dailyKcal: goals.dailyKcal,
    carbsPct: goals.carbsPct,
    proteinPct: goals.proteinPct,
    fatPct: goals.fatPct,
  })
  const tolPct = prefs.macroTolerancePct

  let filledDays = 0
  let totalNut = emptyNutrition()
  const warnings: string[] = []
  const gaps: DayGoalGap[] = []

  for (const date of days) {
    const dayItems = servings.filter((s) => s.date === date)
    if (dayItems.length === 0) {
      warnings.push(`${format(parseISO(date), 'EEE d')}: no meals assigned`)
      gaps.push({
        date,
        kcalPct: -100,
        carbsPct: -100,
        proteinPct: -100,
        fatPct: -100,
        offGoal: true,
        summary: `${format(parseISO(date), 'EEE')}: empty day`,
      })
      continue
    }
    filledDays++
    let dayNut = emptyNutrition()
    for (const s of dayItems) {
      const cand = byId.get(s.recipeId)
      if (!cand) continue
      dayNut = addNutrition(dayNut, scaleNutrition(cand.nutritionPerPortion, s.portions))
    }
    totalNut = addNutrition(totalNut, dayNut)

    const kcalPct = pctDrift(dayNut.energyKcal, goals.dailyKcal)
    const carbsPct = pctDrift(dayNut.carbsG, goalMacros.carbsG)
    const proteinPct = pctDrift(dayNut.proteinG, goalMacros.proteinG)
    const fatPct = pctDrift(dayNut.fatG, goalMacros.fatG)
    const parts = [
      formatGapPart('kcal', kcalPct, tolPct),
      formatGapPart('protein', proteinPct, tolPct),
      formatGapPart('carbs', carbsPct, tolPct),
      formatGapPart('fat', fatPct, tolPct),
    ].filter((part) => part != null)
    const summary =
      parts.length > 0
        ? `${format(parseISO(date), 'EEE')}: ${parts.join(', ')}`
        : `${format(parseISO(date), 'EEE')}: on goal`

    if (parts.length > 0) warnings.push(summary)

    gaps.push({
      date,
      kcalPct,
      carbsPct,
      proteinPct,
      fatPct,
      offGoal: parts.length > 0,
      summary,
    })
  }

  const avgNutrition = filledDays > 0 ? scaleNutrition(totalNut, 1 / filledDays) : emptyNutrition()
  return { gaps, avgNutrition, warnings }
}

export function scoreDraft(
  prefs: PlannerPrefs,
  sessions: WeekDraftSession[],
  servings: WeekDraftServing[],
  shopping: WeekDraftShopLine[],
  catalog: PlannerCatalog,
  extraWarnings: string[] = [],
): {
  score: WeekDraftScore
  avgNutrition: Nutrition
  warnings: string[]
  dayGoalGaps: DayGoalGap[]
} {
  const { gaps, avgNutrition, warnings } = computeDayGoalGaps(prefs, servings, catalog)
  const dishIds = new Set<number>()
  for (const session of sessions) {
    for (const dish of session.dishes) dishIds.add(dish.recipeId)
  }
  const over = (gap: DayGoalGap) =>
    gap.kcalPct > prefs.macroTolerancePct ||
    gap.proteinPct > prefs.macroTolerancePct ||
    gap.carbsPct > prefs.macroTolerancePct ||
    gap.fatPct > prefs.macroTolerancePct
  const under = (gap: DayGoalGap) =>
    gap.kcalPct < -prefs.macroTolerancePct ||
    gap.proteinPct < -prefs.macroTolerancePct ||
    gap.carbsPct < -prefs.macroTolerancePct ||
    gap.fatPct < -prefs.macroTolerancePct
  const daysOver = gaps.filter(over).length
  const daysUnder = gaps.filter((gap) => under(gap) && !over(gap)).length
  const score: WeekDraftScore = {
    dishes: dishIds.size,
    cooks: sessions.filter((session) => session.dishes.length > 0).length,
    daysOver,
    daysUnder,
  }
  if (shopping.length > 12) warnings.push(`Shopping list is long (${shopping.length} lines)`)
  if (sessions.length === 0 && servings.every((serving) => serving.batchId == null)) {
    warnings.push('No cook sessions proposed')
  }
  if (daysOver > 0) {
    warnings.unshift(
      `${daysOver} day${daysOver === 1 ? '' : 's'} over a daily target (+${prefs.macroTolerancePct}%)`,
    )
  }
  return {
    score,
    avgNutrition,
    warnings: [...new Set([...extraWarnings, ...warnings])],
    dayGoalGaps: gaps,
  }
}

export function emptyDraft(prefs: PlannerPrefs, warning = 'No recipes available to plan'): WeekDraft {
  return {
    prefs,
    sessions: [],
    servings: [],
    shopping: [],
    score: { dishes: 0, cooks: 0, daysOver: 0, daysUnder: 0 },
    warnings: [warning],
    avgNutrition: emptyNutrition(),
    dayGoalGaps: [],
  }
}
