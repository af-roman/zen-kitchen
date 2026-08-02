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
  | 'staple'
  | 'soup'
  | 'main'
  | 'side'
  | 'sauce'
  | 'dessert'
  | 'snack'
  | 'other'

export const DISH_CATEGORIES: { id: DishCategory; label: string }[] = [
  { id: 'staple', label: 'Staple' },
  { id: 'soup', label: 'Soup' },
  { id: 'main', label: 'Main' },
  { id: 'side', label: 'Side' },
  { id: 'sauce', label: 'Sauce / condiment' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'snack', label: 'Snack' },
  { id: 'other', label: 'Other' },
]

/** Primary cooking method for a recipe. */
export type PreparationTechnique =
  | 'raw'
  | 'pickled'
  | 'steamed'
  | 'simmered'
  | 'stir_fried'
  | 'pan_fried'
  | 'deep_fried'
  | 'grilled'
  | 'baked'
  | 'assembled'
  | 'other'

export const PREPARATION_TECHNIQUES: { id: PreparationTechnique; label: string }[] = [
  { id: 'raw', label: 'Raw / no-cook' },
  { id: 'pickled', label: 'Pickled / cured' },
  { id: 'steamed', label: 'Steamed' },
  { id: 'simmered', label: 'Simmered / braised' },
  { id: 'stir_fried', label: 'Stir-fried' },
  { id: 'pan_fried', label: 'Pan-fried' },
  { id: 'deep_fried', label: 'Deep-fried' },
  { id: 'grilled', label: 'Grilled / broiled' },
  { id: 'baked', label: 'Baked / roasted' },
  { id: 'assembled', label: 'Assembled / mixed' },
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

/** Where a cooked dish batch is stored. */
export type BatchStorage = 'fridge' | 'freezer'

/** @deprecated Prefer BatchStorage — 'room' only appears on legacy recipes. */
export type StorageEnv = BatchStorage | 'room'

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
  /**
   * Always on hand (e.g. tap water) — never requires pantry stock,
   * never deducted, and never listed as low stock.
   */
  alwaysAvailable?: boolean
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
  /** Optional photo for this step (JPEG data URL or public path). */
  imageDataUrl?: string
  /** Named subrecipe this step belongs to (required; e.g. "Rice", "Sauce", "Main") */
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
  /** Primary cooking method; older recipes may omit this (inferred from legacy category). */
  technique?: PreparationTechnique
  effort: Effort
  /** Dish portions, or prep batch scale */
  portions: number
  imageDataUrl?: string
  /** Optional YouTube video URL (opens in browser or the YouTube app). */
  youtubeUrl?: string
  ingredients: RecipeIngredientLine[]
  steps: RecipeStep[]
  /** Optional free-text storage notes (container, reheating, freezing tips, etc.). */
  storageInstructions?: string
  /** Days the dish keeps in the fridge; omit or 0 if fridge storage is not offered. */
  fridgeDays?: number
  /** Days the dish keeps in the freezer; omit or 0 if freezer storage is not offered. */
  freezerDays?: number
  /**
   * @deprecated Prefer fridgeDays / freezerDays.
   * Still read for older saved recipes.
   */
  storageDays?: number
  /**
   * @deprecated Prefer fridgeDays / freezerDays.
   * Still read for older saved recipes.
   */
  storageEnv?: StorageEnv
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
  /** Fridge or freezer chosen when marking this dish cooked. */
  storagePlace?: BatchStorage
  /** Ingredient usage chosen during cook (amountUsed is always in stock unit). */
  usage?: {
    ingredientId: number
    pantryItemId: number
    /** Amount in the ingredient’s stock unit (g / ml / pcs). */
    amountUsed: number
    /** Display/entry unit while cooking; defaults to ingredient.unit. */
    measureUnit?: MeasureUnit
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
  /** Where this batch is stored; defaults to fridge for older batches. */
  storagePlace?: BatchStorage
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
  /** Bootstrapping completed (goals etc.). No longer means “catalog was seeded”. */
  seededAt?: string
  /** One-shot clean-slate wipe of the old auto-seed catalog. */
  catalogResetAt?: string
}
