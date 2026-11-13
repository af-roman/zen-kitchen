import type { DishCategory, MealSlot, Nutrition, PreparationTechnique } from '@/domain/types'

export type PlannerPrefs = {
  /** First day meals are eaten (yyyy-MM-dd). */
  weekStartDate: string
  dayCount: number
  meals: MealSlot[]
  /** Evenings the user can cook. Food from a cook is eaten on later days. */
  cookDates: string[]
  /**
   * How many days must pass before the same lunch or dinner center repeats.
   * 1 means it can return the day after tomorrow.
   */
  varietyGapDays: number
  /** Prefer recipes that use pantry food expiring soon. */
  preferExpiring: boolean
  /**
   * A day this far from any daily target is flagged.
   * Calories also cannot be planned more than this far over the goal.
   */
  macroTolerancePct: number
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
  /** Cook evening that supplies this serving. Ready batches use the evening they were cooked. */
  cookDate: string
  /** Leftover this serving uses up. The cooked batch is `fromRecipeId`. */
  fromRecipeId?: number
  /** Ready batch already in the fridge. No new cook session. */
  batchId?: number
  role?: DishCategory
  roleLabel?: string
}

export type WeekDraftShopLine = {
  ingredientId: number
  need: number
  buy: number
  packs?: number
}

export type WeekDraftScore = {
  dishes: number
  cooks: number
  daysOver: number
  daysUnder: number
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
  dayGoalGaps: DayGoalGap[]
}

export type DishRole = 'complete' | 'center' | 'soup' | 'side' | 'staple' | 'snack'

export type RecipeCandidate = {
  recipeId: number
  name: string
  category: DishCategory
  role: DishRole
  technique: PreparationTechnique
  /** Fried methods share a family. Unclassified techniques are null. */
  techniqueFamily: string | null
  isStaple: boolean
  /** Main or other dish that already contains rice or noodles. */
  includesStaple: boolean
  /** Soup, side, sauce, and staple can be served as half portions. */
  divisible: boolean
  portionsBase: number
  nutritionPerPortion: Nutrition
  /** Fridge keep days. The clock starts the morning after cooking. */
  fridgeDays: number
  /** Ingredient amounts for one base recipe batch (recipe.portions). */
  ingredientNeeds: Map<number, number>
  /** Recipe ids whose leftovers this dish can use. */
  repurposesFromRecipeIds: number[]
  /** Meals this dish may fill. Breakfast is not implied for a main. */
  suitableMeals: MealSlot[]
}

export type PlannerReadyBatch = {
  batchId: number
  recipeId: number
  portions: number
  cookedOn: string
  expiresAt: string
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
  ready: PlannerReadyBatch[]
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
  seed?: number
}
