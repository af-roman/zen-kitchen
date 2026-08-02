import type { Goals, Nutrition, Unit } from './types'

export function emptyNutrition(): Nutrition {
  return { energyKcal: 0, fatG: 0, carbsG: 0, proteinG: 0 }
}

export function scaleNutrition(n: Nutrition, factor: number): Nutrition {
  return {
    energyKcal: round1(n.energyKcal * factor),
    fatG: round1(n.fatG * factor),
    carbsG: round1(n.carbsG * factor),
    proteinG: round1(n.proteinG * factor),
  }
}

export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return {
    energyKcal: round1(a.energyKcal + b.energyKcal),
    fatG: round1(a.fatG + b.fatG),
    carbsG: round1(a.carbsG + b.carbsG),
    proteinG: round1(a.proteinG + b.proteinG),
  }
}

/** Nutrition for an amount given per-100 values and unit. */
export function nutritionForAmount(
  per100: Nutrition,
  amount: number,
  unit: Unit,
  avgPieceGrams?: number,
): Nutrition {
  let gramsOrMl = amount
  if (unit === 'pcs') {
    gramsOrMl = amount * (avgPieceGrams ?? 0)
  }
  return scaleNutrition(per100, gramsOrMl / 100)
}

export function macroGramsFromGoals(goals: Goals): {
  carbsG: number
  proteinG: number
  fatG: number
} {
  return {
    carbsG: round1((goals.dailyKcal * (goals.carbsPct / 100)) / 4),
    proteinG: round1((goals.dailyKcal * (goals.proteinPct / 100)) / 4),
    fatG: round1((goals.dailyKcal * (goals.fatPct / 100)) / 9),
  }
}

export function pctOf(value: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(200, Math.round((value / goal) * 100))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function timerToSeconds(duration: number, unit: 'seconds' | 'minutes' | 'hours'): number {
  if (unit === 'minutes') return duration * 60
  if (unit === 'hours') return duration * 3600
  return duration
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}
