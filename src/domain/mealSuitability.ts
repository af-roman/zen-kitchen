import type { DishCategory, MealSlot, Recipe } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'

const LIGHT_MEALS: MealSlot[] = ['breakfast', 'snack']
const DAY_MEALS: MealSlot[] = ['lunch', 'dinner']

/** Meals a new dish of this category is for, before anyone changes the pills. */
export function defaultSuitableMeals(category: DishCategory): MealSlot[] {
  if (category === 'snack' || category === 'dessert') return [...LIGHT_MEALS]
  return [...DAY_MEALS]
}

/**
 * Meals the planner may use this dish for.
 * A saved list is kept as-is, including an empty list. A missing list uses the category default.
 */
export function suitableMealsFor(recipe: Pick<Recipe, 'category' | 'suitableMeals'>): MealSlot[] {
  if (recipe.suitableMeals) {
    return MEAL_SLOTS.map((slot) => slot.id).filter((id) => recipe.suitableMeals!.includes(id))
  }
  return defaultSuitableMeals(recipe.category)
}

export function recipeSuitsMeal(
  recipe: Pick<Recipe, 'category' | 'suitableMeals'>,
  meal: MealSlot,
): boolean {
  return suitableMealsFor(recipe).includes(meal)
}
