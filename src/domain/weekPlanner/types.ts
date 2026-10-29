import type { MealRole, MealSlot, Nutrition } from '@/domain/types'
import type { MealPatternId } from './patterns'

export type PlannerPrefs = {
  /** Inclusive week start (yyyy-MM-dd). */
  weekStartDate: string
  dayCount: number
  meals: MealSlot[]
  /** Target batch cook sessions in the week. */
  batchCookCount: number
  /** Allow staple category recipes to recur more often. */
  stapleExtraCadence: boolean
  /** Acceptable daily kcal / macro drift vs goals (±%). */
  macroTolerancePct: number
  /** Min calendar days between same non-staple recipe. */
  varietyGapDays: number
  /** Meal composition pattern per slot (lunch bento, dinner ichiju-sansai, …). */
  mealPatterns?: Partial<Record<MealSlot, MealPatternId>>
}

export type WeekDraftDish = {
  recipeId: number
  portions: number
}

export type WeekDraftSession = {
  date: string
  dishes: WeekDraftDish[]
}

export type WeekDraftServing = {
  date: string
  meal: MealSlot
  recipeId: number
  portions: number
  /** Cook date that supplies this serving. */
  cookDate: string
  /**
   * When set, this serving is a leftover repurpose of `fromRecipeId`
   * (cooked on `cookDate`); `recipeId` is the transform dish.
   */
  fromRecipeId?: number
  /** Pattern role this item fills (staple, soup, …). */
  role?: MealRole
  /** Soft label for draft UI (Rice, Soup, …). */
  roleLabel?: string
}

export type WeekDraftShopLine = {
  ingredientId: number
  need: number
  buy: number
  packs?: number
}

export type WeekDraftScore = {
  total: number
  macros: number
  variety: number
  waste: number
  cookLoad: number
  soonExpire: number
}

/** Per-day drift vs Kitchen goals (for review UI). */
export type DayGoalGap = {
  date: string
  /** Signed % vs daily kcal goal (e.g. -12 = 12% under). */
  kcalPct: number
  carbsPct: number
  proteinPct: number
  fatPct: number
  offGoal: boolean
  summary: string
}

export type WeekDraft = {
  prefs: PlannerPrefs
  sessions: WeekDraftSession[]
  servings: WeekDraftServing[]
  shopping: WeekDraftShopLine[]
  score: WeekDraftScore
  warnings: string[]
  /** Average daily nutrition across filled days. */
  avgNutrition: Nutrition
  /** Days outside macro tolerance (and notable drifts). */
  dayGoalGaps: DayGoalGap[]
}

export type RecipeCandidate = {
  recipeId: number
  name: string
  category: string
  isStaple: boolean
  mealRoles: MealRole[]
  portionsBase: number
  nutritionPerPortion: Nutrition
  /** Fridge keep days used for planning eat-by. */
  fridgeDays: number
  /** Ingredient amounts for one base recipe batch (recipe.portions). */
  ingredientNeeds: Map<number, number>
  /** Recipe ids whose leftovers this dish can use. */
  repurposesFromRecipeIds: number[]
}

export type PlannerCatalog = {
  candidates: RecipeCandidate[]
  goals: {
    dailyKcal: number
    carbsPct: number
    proteinPct: number
    fatPct: number
  }
  pantry: { ingredientId: number; amountLeft: number; expiryDate?: string }[]
  ingredients: Map<
    number,
    {
      packSize?: number
      alwaysAvailable?: boolean
      rawFridgeDays?: number
      name: string
      unit: string
    }
  >
  /** Optional ordered shortlist; empty = use full catalog. */
  shortlistIds?: number[]
  seed?: number
}
