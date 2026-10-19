export type {
  PlannerPrefs,
  WeekDraft,
  WeekDraftDish,
  WeekDraftSession,
  WeekDraftServing,
  WeekDraftShopLine,
  WeekDraftScore,
  DayGoalGap,
  PlannerCatalog,
  RecipeCandidate,
} from './types'
export { defaultPlannerPrefs, loadPlannerPrefs, savePlannerPrefs } from './prefs'
export { buildPlannerCatalog } from './catalog'
export { generateWeekDraft } from './heuristic'
export { improveWeekDraft, swapServingRecipes, changeServingPortions } from './localSearch'
export {
  fetchAiRecipeShortlist,
  localRecipeShortlist,
  resolveRecipeShortlist,
} from './aiShortlist'
export { draftShoppingLines } from './shopping'
export { scoreDraft, emptyDraft, computeDayGoalGaps, eatByDate, servingWithinEatBy } from './score'
export {
  MEAL_PATTERNS,
  MEAL_PATTERN_OPTIONS,
  defaultMealPatterns,
  patternForMeal,
  type MealPatternId,
  type MealPattern,
} from './patterns'
export {
  loadRecipeTaste,
  setRecipeTaste,
  tasteWeight,
  type RecipeTaste,
} from './taste'
