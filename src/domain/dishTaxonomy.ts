import {
  DISH_CATEGORIES,
  PREPARATION_TECHNIQUES,
  type DishCategory,
  type PreparationTechnique,
} from './types'

const DISH_CATEGORY_IDS = new Set<string>(DISH_CATEGORIES.map((c) => c.id))
const TECHNIQUE_IDS = new Set<string>(PREPARATION_TECHNIQUES.map((t) => t.id))

/** Legacy dish “types” that mixed role and method. */
type LegacyDishType =
  | 'rice'
  | 'soup'
  | 'simmered'
  | 'grilled'
  | 'stirfry'
  | 'sides'
  | 'bowl'
  | 'other'

const LEGACY_SPLIT: Record<
  LegacyDishType,
  { category: DishCategory; technique: PreparationTechnique }
> = {
  rice: { category: 'staple', technique: 'assembled' },
  soup: { category: 'soup', technique: 'simmered' },
  simmered: { category: 'main', technique: 'simmered' },
  grilled: { category: 'main', technique: 'grilled' },
  stirfry: { category: 'main', technique: 'stir_fried' },
  sides: { category: 'side', technique: 'pickled' },
  bowl: { category: 'main', technique: 'assembled' },
  other: { category: 'other', technique: 'other' },
}

function isDishCategory(value: string | undefined): value is DishCategory {
  return value != null && DISH_CATEGORY_IDS.has(value)
}

function isTechnique(value: string | undefined): value is PreparationTechnique {
  return value != null && TECHNIQUE_IDS.has(value)
}

/** Meal-role category, with legacy dish-type fallback. */
export function recipeCategory(recipe: {
  category?: string
}): DishCategory {
  if (isDishCategory(recipe.category)) return recipe.category
  if (recipe.category && recipe.category in LEGACY_SPLIT) {
    return LEGACY_SPLIT[recipe.category as LegacyDishType].category
  }
  return 'other'
}

/** Primary technique, preferring stored value then legacy dish-type inference. */
export function recipeTechnique(recipe: {
  category?: string
  technique?: string
}): PreparationTechnique {
  if (isTechnique(recipe.technique)) return recipe.technique
  if (recipe.category && recipe.category in LEGACY_SPLIT) {
    return LEGACY_SPLIT[recipe.category as LegacyDishType].technique
  }
  // New-style category without technique yet
  if (isDishCategory(recipe.category)) {
    if (recipe.category === 'soup') return 'simmered'
    if (recipe.category === 'sauce') return 'simmered'
    if (recipe.category === 'staple') return 'assembled'
    if (recipe.category === 'side') return 'other'
    return 'other'
  }
  return 'other'
}

export function dishCategoryLabel(category: DishCategory | string | undefined): string {
  const id = recipeCategory({ category })
  return DISH_CATEGORIES.find((c) => c.id === id)?.label ?? 'Other'
}

export function techniqueLabel(technique: PreparationTechnique | string | undefined): string {
  const id = isTechnique(technique) ? technique : 'other'
  return PREPARATION_TECHNIQUES.find((t) => t.id === id)?.label ?? 'Other'
}
