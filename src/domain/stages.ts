import { addDays, format, parseISO, subDays } from 'date-fns'
import type {
  Recipe,
  RecipeIngredientLine,
  RecipeStep,
  SessionDishPlan,
} from './types'

export const MAX_DAYS_AHEAD = 3

export type RecipeStage = {
  /** 0 = cook day, 1 = day before, … */
  daysAhead: number
  steps: RecipeStep[]
  ingredients: RecipeIngredientLine[]
}

export function stageOfStep(step: Pick<RecipeStep, 'daysAhead'>): number {
  const raw = step.daysAhead ?? 0
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(MAX_DAYS_AHEAD, Math.round(raw))
}

export function stageOfLine(line: Pick<RecipeIngredientLine, 'daysAhead'>): number {
  const raw = line.daysAhead ?? 0
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(MAX_DAYS_AHEAD, Math.round(raw))
}

type StagedRecipe = Pick<Recipe, 'steps' | 'ingredients'>

/** Distinct stages present on a recipe, earliest (largest daysAhead) first. */
export function stageDaysAheadList(recipe: StagedRecipe): number[] {
  const set = new Set<number>([0])
  for (const step of recipe.steps ?? []) set.add(stageOfStep(step))
  for (const line of recipe.ingredients ?? []) set.add(stageOfLine(line))
  return [...set].sort((a, b) => b - a)
}

export function stageSteps(recipe: StagedRecipe, daysAhead: number): RecipeStep[] {
  return (recipe.steps ?? []).filter((s) => stageOfStep(s) === daysAhead)
}

export function stageIngredients(
  recipe: StagedRecipe,
  daysAhead: number,
): RecipeIngredientLine[] {
  return (recipe.ingredients ?? []).filter((l) => stageOfLine(l) === daysAhead)
}

/** Full stage breakdown, earliest first. */
export function recipeStages(recipe: StagedRecipe): RecipeStage[] {
  return stageDaysAheadList(recipe).map((daysAhead) => ({
    daysAhead,
    steps: stageSteps(recipe, daysAhead),
    ingredients: stageIngredients(recipe, daysAhead),
  }))
}

/** Stages that actually carry work (steps or ingredients), earliest first. */
export function activeRecipeStages(recipe: StagedRecipe): RecipeStage[] {
  return recipeStages(recipe).filter(
    (stage) => stage.daysAhead === 0 || stage.steps.length > 0 || stage.ingredients.length > 0,
  )
}

export function isStagedRecipe(recipe: StagedRecipe): boolean {
  return activeRecipeStages(recipe).length > 1
}

/** Earliest stage offset that carries work, e.g. 1 when prep starts the day before. */
export function leadDaysAhead(recipe: StagedRecipe): number {
  return activeRecipeStages(recipe)[0]?.daysAhead ?? 0
}

export function stageLabel(daysAhead: number): string {
  if (daysAhead <= 0) return 'Cook day'
  if (daysAhead === 1) return 'Day before'
  return `${daysAhead} days before`
}

/** Short form for badges / inline text. */
export function stageShortLabel(daysAhead: number): string {
  if (daysAhead <= 0) return 'Cook day'
  return `−${daysAhead}d`
}

export function leadTimeLabel(daysAhead: number): string {
  if (daysAhead <= 0) return 'Same day'
  if (daysAhead === 1) return 'Starts 1 day ahead'
  return `Starts ${daysAhead} days ahead`
}

/** Calendar date a stage happens on, given the cook day. */
export function stageDate(cookDate: string, daysAhead: number): string {
  if (daysAhead <= 0) return cookDate
  return format(subDays(parseISO(cookDate), daysAhead), 'yyyy-MM-dd')
}

/** Cook day implied by a stage that happens on `date`. */
export function cookDateFromStage(date: string, daysAhead: number): string {
  if (daysAhead <= 0) return date
  return format(addDays(parseISO(date), daysAhead), 'yyyy-MM-dd')
}

/** Stage a planned dish covers; 0 for the final cook. */
export function dishStage(dish: Pick<SessionDishPlan, 'stageDaysAhead'>): number {
  const raw = dish.stageDaysAhead ?? 0
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.round(raw)
}

/** True for prep legs — everything that is not the final cook day. */
export function isPrepLeg(dish: Pick<SessionDishPlan, 'stageDaysAhead'>): boolean {
  return dishStage(dish) > 0
}

export function stageOptions(): { value: number; label: string }[] {
  return Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, i) => ({
    value: i,
    label: stageLabel(i),
  }))
}
