import type { DishCategory, MealRole, Recipe } from '@/domain/types'

/** Infer meal-pattern roles from dish category when `mealRoles` is unset. */
export function mealRolesFromCategory(category: DishCategory): MealRole[] {
  switch (category) {
    case 'staple':
      return ['staple']
    case 'soup':
      return ['soup']
    case 'main':
      return ['main']
    case 'side':
      return ['side']
    case 'sauce':
      return ['side', 'pickle']
    case 'snack':
      return ['side']
    case 'dessert':
      return ['side']
    default:
      return ['main', 'side']
  }
}

export function recipeMealRoles(recipe: Pick<Recipe, 'category' | 'mealRoles'>): MealRole[] {
  if (recipe.mealRoles?.length) return [...new Set(recipe.mealRoles)]
  return mealRolesFromCategory(recipe.category)
}

export function recipeHasRole(
  recipe: Pick<Recipe, 'category' | 'mealRoles'>,
  role: MealRole,
): boolean {
  return recipeMealRoles(recipe).includes(role)
}
