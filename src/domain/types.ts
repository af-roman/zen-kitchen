/** Domain types for Zen Kitchen */

export type Unit = 'g' | 'ml' | 'pcs'

/** How a recipe line is entered/shown; stock & nutrition stay in Unit. */
export type MeasureUnit = Unit | 'tsp' | 'tbsp'

export type IngredientCategory =
  | 'staples'
  | 'proteins'
  | 'vegetables'
  | 'fruit'
  | 'seaweed'
  | 'ferments'
  | 'oils'
  | 'pickles'
  | 'spices'
  | 'sweeteners'
  | 'snacks'

export const INGREDIENT_CATEGORIES: { id: IngredientCategory; label: string }[] = [
  { id: 'staples', label: 'Staples & grains' },
  { id: 'proteins', label: 'Proteins' },
  { id: 'vegetables', label: 'Vegetables' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'seaweed', label: 'Seaweed & umami' },
  { id: 'ferments', label: 'Ferments & condiments' },
  { id: 'oils', label: 'Oils & fats' },
  { id: 'pickles', label: 'Pickles & preserves' },
  { id: 'spices', label: 'Spices & toppings' },
  { id: 'sweeteners', label: 'Sweeteners' },
  { id: 'snacks', label: 'Snacks' },
]

export type DishCategory =
  | 'rice'
  | 'soup'
  | 'simmered'
  | 'grilled'
  | 'stirfry'
  | 'sides'
  | 'bowl'
  | 'other'

export const DISH_CATEGORIES: { id: DishCategory; label: string }[] = [
  { id: 'rice', label: 'Rice & grains' },
  { id: 'soup', label: 'Soup' },
  { id: 'simmered', label: 'Simmered' },
  { id: 'grilled', label: 'Grilled' },
  { id: 'stirfry', label: 'Stir-fry' },
  { id: 'sides', label: 'Pickles & sides' },
  { id: 'bowl', label: 'Bowl' },
  { id: 'other', label: 'Other' },
]

export type Effort = 'easy' | 'medium' | 'advanced'

export const EFFORT_LEVELS: { id: Effort; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'advanced', label: 'Advanced' },
]

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
]

export type StorageEnv = 'fridge' | 'freezer' | 'room'

export type TimeUnit = 'seconds' | 'minutes' | 'hours'

export interface Nutrition {
  energyKcal: number
  fatG: number
  carbsG: number
  proteinG: number
}

export interface Goals {
  id: number
  dailyKcal: number
  carbsPct: number
  proteinPct: number
  fatPct: number
}

export interface Ingredient {
  id?: number
  name: string
  category: IngredientCategory
  unit: Unit
  avgPieceGrams?: number
  /**
   * Density for solids (unit === 'g') measured by tsp/tbsp in recipes.
   * grams of ingredient per millilitre of volume.
   */
  gramsPerMl?: number
  nutritionPer100: Nutrition
  lowStockThreshold: number
  createdAt: string
}

export interface PantryItem {
  id?: number
  ingredientId: number
  brand: string
  amountLeft: number
  expiryDate?: string
  imageDataUrl?: string
  nutritionOverride?: Nutrition
  createdAt: string
  updatedAt: string
}

export interface RecipeIngredientLine {
  ingredientId: number
  /** Always in the ingredient’s stock unit (g / ml / pcs). */
  amount: number
  /** Preferred display/entry unit; defaults to ingredient.unit when omitted. */
  measureUnit?: MeasureUnit
  /** Stage that consumes this line; defaults to 0 (cook day). */
  daysAhead?: number
}

export interface RecipeStep {
  id: string
  description: string
  requiresTimer: boolean
  timerDuration?: number
  timerUnit?: TimeUnit
  /** Named subrecipe section, e.g. "Rice", "Sauce", "Garnish" */
  group?: string
  /** 0 = cook day (default), 1 = day before, 2 = two days before */
  daysAhead?: number
}

export type RecipeKind = 'dish' | 'prep'

export interface Recipe {
  id?: number
  name: string
  description: string
  /** Optional attribution: cookbook, friend, URL, etc. */
  source?: string
  /** Chef’s tips shown between ingredients and steps */
  tips: string[]
  /** @deprecated Prefer tips — kept for older saved recipes */
  tip?: string
  /** dish = Ready to eat / meals; prep = pantry yield. Default dish when missing. */
  recipeKind?: RecipeKind
  /** Prep only: ingredient this cook produces */
  yieldIngredientId?: number
  /** Prep only: amount yielded at the recipe’s base scale (ingredient unit) */
  yieldAmount?: number
  category: DishCategory
  effort: Effort
  /** Dish portions, or prep batch scale */
  portions: number
  imageDataUrl?: string
  ingredients: RecipeIngredientLine[]
  steps: RecipeStep[]
  /** Optional free-text storage notes (container, reheating, freezing tips, etc.). */
  storageInstructions?: string
  storageDays: number
  storageEnv: StorageEnv
  createdAt: string
  updatedAt: string
  seeded?: boolean
}

export type SessionStatus = 'planned' | 'active' | 'done'

export interface SessionDishPlan {
  recipeId: number
  portions: number
  /** Portions already assigned to meal plan before cooking */
  portionsPlanned?: number
  /** Set when finished cooking this dish in the session */
  completed?: boolean
  /** Which stage of the recipe this session cooks; absent/0 = cook day */
  stageDaysAhead?: number
  /** Shared uid linking every leg (stage) of one planned dish */
  chainId?: string
  notes?: string
  /** Ingredient usage chosen during cook */
  usage?: {
    ingredientId: number
    pantryItemId: number
    amountUsed: number
  }[]
  nutritionPerPortion?: Nutrition
  stepsDone?: string[]
}

export interface CookingSession {
  id?: number
  date: string
  status: SessionStatus
  dishes: SessionDishPlan[]
  notes: string
  startedAt?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ReadyBatch {
  id?: number
  recipeId: number
  sessionId?: number
  cookedAt: string
  expiresAt: string
  portionsLeft: number
  portionsPlanned: number
  nutritionPerPortion: Nutrition
  notes: string
}

export interface ServingItem {
  batchId?: number
  /** Omitted for ad-hoc / off-plan dishes */
  recipeId?: number
  portions: number
  /** Nutrition per portion at time of planning */
  nutrition: Nutrition
  /** When serving from a not-yet-cooked session dish */
  plannedSessionId?: number
  /** True when the backing session/batch was removed */
  needsFood?: boolean
  /** Display name when there is no recipe (eat-out / off-plan) */
  name?: string
  /**
   * Ad-hoc only: pantry amounts consumed for this dish.
   * Applied on save, restored when the meal is cleared/replaced.
   */
  usage?: {
    ingredientId: number
    pantryItemId: number
    amountUsed: number
  }[]
}

export interface Serving {
  id?: number
  date: string
  meal: MealSlot
  items: ServingItem[]
  sessionId?: number
  createdAt: string
}

export interface RestockLine {
  ingredientId: number
  brand: string
  amount: number
  cost: number
  expiryDate?: string
  imageDataUrl?: string
  nutritionOverride?: Nutrition
  /** Pantry row created from this line (for editing restocks) */
  pantryItemId?: number
}

export interface Restock {
  id?: number
  date: string
  lines: RestockLine[]
  totalCost: number
  notes: string
  createdAt: string
}

export interface ShoppingListItem {
  id: string
  ingredientId: number
  amount: number
  brand: string
  /** Planned / estimated price in Kč */
  cost: number
  store: string
  notes?: string
}

export interface ShoppingList {
  id?: number
  items: ShoppingListItem[]
  status: 'open' | 'purchased'
  createdAt: string
  updatedAt: string
  purchasedAt?: string
}

export interface CookLogEntry {
  id?: number
  sessionId: number
  date: string
  dishes: {
    recipeId: number
    recipeName: string
    portions: number
    nutritionPerPortion: Nutrition
    usage: { ingredientId: number; ingredientName: string; amountUsed: number; unit: Unit }[]
  }[]
  notes: string
  createdAt: string
}

export interface WasteEntry {
  id?: number
  batchId?: number
  recipeId?: number
  portions: number
  date: string
  reason: 'discarded'
  createdAt: string
}

export interface Meta {
  id: number
  schemaVersion: number
  seededAt?: string
}
