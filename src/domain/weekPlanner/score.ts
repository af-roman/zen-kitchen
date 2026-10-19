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

function daysApart(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000)
}

export function eatByDate(cookDate: string, fridgeDays: number): string {
  return format(addDays(parseISO(cookDate), Math.max(0, fridgeDays)), 'yyyy-MM-dd')
}

export function servingWithinEatBy(
  serving: WeekDraftServing,
  fridgeDays: number,
): boolean {
  if (serving.date < serving.cookDate) return false
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
 * Per-day nutrition vs goals. `offGoal` when any macro/kcal exceeds tolerance.
 */
export function computeDayGoalGaps(
  prefs: PlannerPrefs,
  servings: WeekDraftServing[],
  catalog: PlannerCatalog,
): { gaps: DayGoalGap[]; avgNutrition: Nutrition; macroPenalty: number; warnings: string[] } {
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
  const tol = prefs.macroTolerancePct / 100
  const tolPct = prefs.macroTolerancePct

  let macroPenalty = 0
  let filledDays = 0
  let totalNut = emptyNutrition()
  const warnings: string[] = []
  const gaps: DayGoalGap[] = []

  for (const date of days) {
    const dayItems = servings.filter((s) => s.date === date)
    if (dayItems.length === 0) {
      warnings.push(`${format(parseISO(date), 'EEE d')}: no meals assigned`)
      macroPenalty += 55
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

    const kcalErr = Math.abs(kcalPct) / 100
    const carbErr = Math.abs(carbsPct) / 100
    const protErr = Math.abs(proteinPct) / 100
    const fatErr = Math.abs(fatPct) / 100
    const over =
      Math.max(0, kcalErr - tol) +
      Math.max(0, carbErr - tol) +
      Math.max(0, protErr - tol) +
      Math.max(0, fatErr - tol)
    const offGoal = over > 0
    // Strong failure weight for days outside tolerance
    macroPenalty += over * 55 + (offGoal ? 18 : 0)

    const parts = [
      formatGapPart('kcal', kcalPct, tolPct),
      formatGapPart('protein', proteinPct, tolPct),
      formatGapPart('carbs', carbsPct, tolPct),
      formatGapPart('fat', fatPct, tolPct),
    ].filter(Boolean) as string[]

    const summary =
      parts.length > 0
        ? `${format(parseISO(date), 'EEE')}: ${parts.join(', ')}`
        : `${format(parseISO(date), 'EEE')}: on goal`

    if (offGoal) warnings.push(summary)

    gaps.push({
      date,
      kcalPct,
      carbsPct,
      proteinPct,
      fatPct,
      offGoal,
      summary,
    })
  }

  const avgNutrition =
    filledDays > 0 ? scaleNutrition(totalNut, 1 / filledDays) : emptyNutrition()

  return { gaps, avgNutrition, macroPenalty, warnings }
}

export function scoreDraft(
  prefs: PlannerPrefs,
  sessions: WeekDraftSession[],
  servings: WeekDraftServing[],
  shopping: WeekDraftShopLine[],
  catalog: PlannerCatalog,
): {
  score: WeekDraftScore
  avgNutrition: Nutrition
  warnings: string[]
  dayGoalGaps: DayGoalGap[]
} {
  const byId = new Map(catalog.candidates.map((c) => [c.recipeId, c]))
  const days = Array.from({ length: prefs.dayCount }, (_, i) =>
    format(addDays(parseISO(prefs.weekStartDate), i), 'yyyy-MM-dd'),
  )
  const weekEnd = days[days.length - 1]
  const warnings: string[] = []

  const {
    gaps: dayGoalGaps,
    avgNutrition,
    macroPenalty,
    warnings: goalWarnings,
  } = computeDayGoalGaps(prefs, servings, catalog)
  warnings.push(...goalWarnings)

  // Hard eat-by violations
  let eatByPenalty = 0
  for (const s of servings) {
    const sourceId = s.fromRecipeId ?? s.recipeId
    const cand = byId.get(sourceId) ?? byId.get(s.recipeId)
    const fridgeDays = cand?.fridgeDays ?? 3
    if (!servingWithinEatBy(s, fridgeDays)) {
      eatByPenalty += 80
      warnings.push(
        `${format(parseISO(s.date), 'EEE d')}: ${cand?.name ?? s.recipeId} past keep-by ${eatByDate(s.cookDate, fridgeDays)}`,
      )
    }
  }

  // Variety: same recipe on consecutive days (non-staples); transforms OK
  let varietyPenalty = 0
  const byDate = new Map<string, number[]>()
  for (const s of servings) {
    const list = byDate.get(s.date) ?? []
    list.push(s.recipeId)
    byDate.set(s.date, list)
  }
  for (let i = 1; i < days.length; i++) {
    const prev = new Set(byDate.get(days[i - 1]) ?? [])
    for (const id of byDate.get(days[i]) ?? []) {
      const cand = byId.get(id)
      if (cand?.isStaple && prefs.stapleExtraCadence) continue
      if (prev.has(id)) varietyPenalty += 12
    }
  }

  // Pack waste + unused cooked portions that expire in-week
  let wastePenalty = 0
  for (const line of shopping) {
    if (line.buy <= 0) continue
    const waste = Math.max(0, line.buy - line.need)
    wastePenalty += (waste / Math.max(1, line.need)) * 8
  }

  // Rebuild cooked supply leftovers
  const cookedLeft = new Map<string, { recipeId: number; left: number; cookDate: string; fridgeDays: number }>()
  for (const session of sessions) {
    for (const dish of session.dishes) {
      const cand = byId.get(dish.recipeId)
      const key = `${session.date}|${dish.recipeId}`
      cookedLeft.set(key, {
        recipeId: dish.recipeId,
        left: dish.portions,
        cookDate: session.date,
        fridgeDays: cand?.fridgeDays ?? 3,
      })
    }
  }
  for (const s of servings) {
    const sourceId = s.fromRecipeId ?? s.recipeId
    const key = `${s.cookDate}|${sourceId}`
    const row = cookedLeft.get(key)
    if (row) row.left = Math.max(0, row.left - s.portions)
  }
  for (const row of cookedLeft.values()) {
    if (row.left <= 0) continue
    const eatBy = eatByDate(row.cookDate, row.fridgeDays)
    if (eatBy <= weekEnd) {
      wastePenalty += row.left * 10
      const name = byId.get(row.recipeId)?.name ?? String(row.recipeId)
      warnings.push(
        `${row.left} portion${row.left === 1 ? '' : 's'} of ${name} unused before keep-by ${format(parseISO(eatBy), 'EEE d')}`,
      )
    }
  }

  // Cook load
  let cookLoadPenalty = 0
  for (const session of sessions) {
    const n = session.dishes.length
    if (n === 0) cookLoadPenalty += 30
    else if (n > 4) cookLoadPenalty += (n - 4) * 6
    else if (n === 1) cookLoadPenalty += 4
  }
  cookLoadPenalty += Math.abs(sessions.length - prefs.batchCookCount) * 10

  // Soon-to-expire pantry unused
  let soonExpirePenalty = 0
  const usedIng = new Set<number>()
  for (const session of sessions) {
    for (const dish of session.dishes) {
      const cand = byId.get(dish.recipeId)
      if (!cand) continue
      for (const id of cand.ingredientNeeds.keys()) usedIng.add(id)
    }
  }
  const today = prefs.weekStartDate
  for (const p of catalog.pantry) {
    if (!p.expiryDate || p.amountLeft <= 0) continue
    const daysLeft = daysApart(p.expiryDate, today)
    if (daysLeft < 0 || daysLeft > 5) continue
    if (!usedIng.has(p.ingredientId)) {
      soonExpirePenalty += Math.max(1, 6 - daysLeft) * 3
    }
  }

  soonExpirePenalty += eatByPenalty * 0.15

  const macros = Math.max(0, 100 - macroPenalty)
  const variety = Math.max(0, 100 - varietyPenalty)
  const waste = Math.max(0, 100 - wastePenalty)
  const cookLoad = Math.max(0, 100 - cookLoadPenalty)
  const soonExpire = Math.max(0, 100 - soonExpirePenalty - eatByPenalty * 0.5)
  const total =
    macros * 0.42 + variety * 0.18 + waste * 0.15 + cookLoad * 0.08 + soonExpire * 0.17

  if (shopping.length > 12) warnings.push(`Shopping list is long (${shopping.length} lines)`)
  if (sessions.length === 0) warnings.push('No cook sessions proposed')

  const offDays = dayGoalGaps.filter((g) => g.offGoal).length
  if (offDays > 0) {
    warnings.unshift(`${offDays} day${offDays === 1 ? '' : 's'} off kitchen goals (±${prefs.macroTolerancePct}%)`)
  }

  return {
    score: {
      total: Math.round(total * 10) / 10,
      macros: Math.round(macros * 10) / 10,
      variety: Math.round(variety * 10) / 10,
      waste: Math.round(waste * 10) / 10,
      cookLoad: Math.round(cookLoad * 10) / 10,
      soonExpire: Math.round(soonExpire * 10) / 10,
    },
    avgNutrition,
    warnings: [...new Set(warnings)],
    dayGoalGaps,
  }
}

export function emptyDraft(prefs: PlannerPrefs): WeekDraft {
  return {
    prefs,
    sessions: [],
    servings: [],
    shopping: [],
    score: { total: 0, macros: 0, variety: 0, waste: 0, cookLoad: 0, soonExpire: 0 },
    warnings: ['No recipes available to plan'],
    avgNutrition: emptyNutrition(),
    dayGoalGaps: [],
  }
}
