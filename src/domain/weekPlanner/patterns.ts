import type { MealSlot } from '@/domain/types'
import type { MealRole } from '@/domain/types'

export type MealPatternId = 'simple' | 'ichiju_sansai' | 'bento'

export type PatternSlot = {
  role: MealRole
  /** Soft label for draft UI. */
  label: string
}

export type MealPattern = {
  id: MealPatternId
  label: string
  slots: PatternSlot[]
}

export const MEAL_PATTERNS: Record<MealPatternId, MealPattern> = {
  simple: {
    id: 'simple',
    label: 'Simple (one dish)',
    slots: [{ role: 'main', label: 'Dish' }],
  },
  ichiju_sansai: {
    id: 'ichiju_sansai',
    label: 'Ichiju-sansai',
    slots: [
      { role: 'staple', label: 'Rice' },
      { role: 'soup', label: 'Soup' },
      { role: 'main', label: 'Main' },
      { role: 'side', label: 'Side' },
      { role: 'side', label: 'Side' },
    ],
  },
  bento: {
    id: 'bento',
    label: 'Bento',
    slots: [
      { role: 'staple', label: 'Rice' },
      { role: 'main', label: 'Protein' },
      { role: 'side', label: 'Side' },
      { role: 'pickle', label: 'Pickle' },
    ],
  },
}

export const MEAL_PATTERN_OPTIONS: { id: MealPatternId; label: string }[] = [
  { id: 'simple', label: 'Simple' },
  { id: 'ichiju_sansai', label: 'Ichiju-sansai (一汁三菜)' },
  { id: 'bento', label: 'Bento' },
]

/** Default pattern per meal slot for autopilot. */
export function defaultMealPatterns(): Partial<Record<MealSlot, MealPatternId>> {
  return {
    lunch: 'bento',
    dinner: 'ichiju_sansai',
    breakfast: 'simple',
    snack: 'simple',
  }
}

export function patternForMeal(
  meal: MealSlot,
  map: Partial<Record<MealSlot, MealPatternId>> | undefined,
): MealPattern {
  const id = map?.[meal] ?? defaultMealPatterns()[meal] ?? 'simple'
  return MEAL_PATTERNS[id] ?? MEAL_PATTERNS.simple
}
