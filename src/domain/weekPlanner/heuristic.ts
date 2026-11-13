import { addDays, format, parseISO } from 'date-fns'
import type { MealSlot, Nutrition } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { addNutrition, emptyNutrition, macroGramsFromGoals, scaleNutrition } from '@/domain/nutrition'
import { eatByDate, emptyDraft, scoreDraft } from './score'
import { draftShoppingLines } from './shopping'
import { loadRecipeTaste, tasteWeight } from './taste'
import type {
  DishRole,
  PlannerCatalog,
  PlannerPrefs,
  RecipeCandidate,
  WeekDraft,
  WeekDraftServing,
  WeekDraftSession,
} from './types'

const MEAL_WEIGHT: Record<MealSlot, number> = {
  breakfast: 0.55,
  snack: 0.3,
  lunch: 1,
  dinner: 1.05,
}

type CookSlot = 'center' | 'light' | 'soup' | 'side' | 'staple'

type Placement = {
  recipe: RecipeCandidate
  cookDate: string
  eatBy: string
  batchId?: number
  fromRecipeId?: number
  portionsLeft?: number
}

function daysApart(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000)
}

function roundPortion(n: number): number {
  return Math.round(n * 2) / 2
}

/** Mean absolute miss of a portion against a target, as a fraction of the daily goals. */
function macroMiss(actual: Nutrition, target: Nutrition, goals: Nutrition): number {
  const keys = ['energyKcal', 'proteinG', 'carbsG', 'fatG'] as const
  let total = 0
  let count = 0
  for (const key of keys) {
    const goal = goals[key]
    if (goal <= 0) continue
    total += Math.abs(actual[key] - target[key]) / goal
    count++
  }
  return count > 0 ? total / count : 0
}

function centerRoles(meal: MealSlot): DishRole[] {
  if (meal === 'breakfast') return ['complete', 'center', 'snack']
  if (meal === 'snack') return ['snack', 'complete', 'center', 'side']
  return ['complete', 'center']
}

function isLightMeal(meal: MealSlot): boolean {
  return meal === 'breakfast' || meal === 'snack'
}

function fitPortion(
  kcal: number,
  mealRoom: number,
  dayRoom: number,
  divisible: boolean,
  required: boolean,
): number | null {
  if (kcal <= 0) return required ? 1 : null
  if (kcal <= mealRoom && kcal <= dayRoom) return 1
  if (divisible && kcal * 0.5 <= mealRoom && kcal * 0.5 <= dayRoom) return 0.5
  if (!required) return null
  if (divisible && kcal * 0.5 <= dayRoom) return 0.5
  if (kcal <= dayRoom) return 1
  return divisible ? 0.5 : 1
}

function sessionsFromServings(servings: WeekDraftServing[]): WeekDraftSession[] {
  const byCook = new Map<string, Map<number, number>>()
  for (const serving of servings) {
    if (serving.batchId != null) continue
    const add = (recipeId: number) => {
      const dishes = byCook.get(serving.cookDate) ?? new Map<number, number>()
      dishes.set(recipeId, roundPortion((dishes.get(recipeId) ?? 0) + serving.portions))
      byCook.set(serving.cookDate, dishes)
    }
    add(serving.fromRecipeId ?? serving.recipeId)
    if (serving.fromRecipeId != null && serving.fromRecipeId !== serving.recipeId) {
      add(serving.recipeId)
    }
  }
  return [...byCook.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dishes]) => ({
      date,
      dishes: [...dishes.entries()].map(([recipeId, portions]) => ({ recipeId, portions })),
    }))
}

/**
 * Build one week from the cook evenings the user picked.
 * Each meal is chosen to land the day near the calorie, protein, carb, and fat targets.
 * Calories cannot be planned past the cap. Soup and sides are added only when they
 * move that day closer. Each dish is eaten from the morning after its cook through its keep-by date.
 */
export function generateWeekDraft(prefs: PlannerPrefs, catalog: PlannerCatalog): WeekDraft {
  const pool = catalog.candidates
  if (pool.length === 0) return emptyDraft(prefs)
  const byId = new Map(pool.map((candidate) => [candidate.recipeId, candidate]))
  const taste = loadRecipeTaste()
  const meals = (prefs.meals.length ? prefs.meals : (['lunch', 'dinner'] as MealSlot[])).slice()
  meals.sort((a, b) => MEAL_SLOTS.findIndex((slot) => slot.id === a) - MEAL_SLOTS.findIndex((slot) => slot.id === b))
  const days = Array.from({ length: prefs.dayCount }, (_, i) =>
    format(addDays(parseISO(prefs.weekStartDate), i), 'yyyy-MM-dd'),
  )
  const cookDates = [...new Set(prefs.cookDates)].sort()
  const firstCook = cookDates[0]
  const dailyKcal = catalog.goals.dailyKcal
  const dayCap = dailyKcal * (1 + prefs.macroTolerancePct / 100)
  const macroGrams = macroGramsFromGoals({
    id: 1,
    dailyKcal,
    carbsPct: catalog.goals.carbsPct,
    proteinPct: catalog.goals.proteinPct,
    fatPct: catalog.goals.fatPct,
  })
  const dayGoals: Nutrition = { energyKcal: dailyKcal, ...macroGrams }
  const day = { nutrition: emptyNutrition() }
  let mealNut = emptyNutrition()
  let activeGoal: Nutrition = dayGoals
  const warnings: string[] = []

  const urgent = new Map<number, string>()
  for (const item of catalog.pantry) {
    if (!item.expiryDate || item.amountLeft <= 0) continue
    if (daysApart(item.expiryDate, prefs.weekStartDate) <= 5) urgent.set(item.ingredientId, item.expiryDate)
  }

  const usedReady = new Map<number, number>()
  const centers = new Map<string, Set<number>>()
  const lights = new Map<string, number>()
  const soups = new Map<string, number>()
  const sides = new Map<string, number>()
  const staples = new Map<string, number>()
  const transforms = new Map<string, number>()
  const lastCenterSlot = new Map<number, { date: string; meal: MealSlot }>()
  const familiesByDate = new Map<string, Set<string>>()
  let repeatedCenter = false
  const rawSkipped = new Set<string>()

  function remember(map: Map<string, number>, cook: string, recipeId: number) {
    if (!map.has(cook)) map.set(cook, recipeId)
  }

  function rawTooLate(recipe: RecipeCandidate, cookDate: string): boolean {
    if (!firstCook) return false
    const gap = daysApart(cookDate, firstCook)
    if (gap <= 0) return false
    for (const ingredientId of recipe.ingredientNeeds.keys()) {
      const rawDays = catalog.ingredients.get(ingredientId)?.rawFridgeDays
      if (rawDays != null && rawDays > 0 && gap > rawDays) {
        const name = catalog.ingredients.get(ingredientId)?.name
        if (name) rawSkipped.add(`${name} may not keep raw until ${format(parseISO(cookDate), 'EEE d')}`)
        return true
      }
    }
    return false
  }

  function allowed(cook: string, recipe: RecipeCandidate, slot: CookSlot, relax: boolean): boolean {
    if (slot === 'soup') {
      const chosen = soups.get(cook)
      return chosen == null || chosen === recipe.recipeId
    }
    if (slot === 'side') {
      const chosen = sides.get(cook)
      return chosen == null || chosen === recipe.recipeId
    }
    if (slot === 'staple') {
      const chosen = staples.get(cook)
      return chosen == null || chosen === recipe.recipeId
    }
    if (slot === 'light') {
      const chosen = lights.get(cook)
      if (chosen == null || chosen === recipe.recipeId) return true
      return centers.get(cook)?.has(recipe.recipeId) === true
    }
    const chosen = centers.get(cook) ?? new Set<number>()
    if (chosen.has(recipe.recipeId)) return true
    return relax || chosen.size < 2
  }

  function placements(
    date: string,
    meal: MealSlot,
    roles: DishRole[],
    slot: CookSlot,
    relax: boolean,
  ): Placement[] {
    const found: Placement[] = []
    for (const batch of catalog.ready) {
      const recipe = byId.get(batch.recipeId)
      if (!recipe || !roles.includes(recipe.role) || !recipe.suitableMeals.includes(meal)) continue
      if (date <= batch.cookedOn || date > batch.expiresAt) continue
      const left = batch.portions - (usedReady.get(batch.batchId) ?? 0)
      if (left <= 0) continue
      found.push({
        recipe,
        cookDate: batch.cookedOn,
        eatBy: batch.expiresAt,
        batchId: batch.batchId,
        portionsLeft: left,
      })
    }
    for (const cookDate of cookDates) {
      if (date <= cookDate) continue
      for (const recipe of pool) {
        if (!roles.includes(recipe.role) || !recipe.suitableMeals.includes(meal)) continue
        if (!allowed(cookDate, recipe, slot, relax)) continue
        if (rawTooLate(recipe, cookDate)) continue
        const eatBy = eatByDate(cookDate, recipe.fridgeDays)
        if (date > eatBy) continue
        found.push({ recipe, cookDate, eatBy })
      }
    }
    return found
  }

  function scorePlacement(
    date: string,
    meal: MealSlot,
    placement: Placement,
    todayFamilies: Set<string>,
    todayCenters: Set<number>,
  ): number {
    const { recipe, cookDate, batchId, eatBy } = placement
    let score = tasteWeight(recipe.recipeId, taste) * 3
    score += ((recipe.recipeId * 13 + (catalog.seed ?? 0)) % 7) * 0.7
    const known =
      centers.get(cookDate)?.has(recipe.recipeId) ||
      lights.get(cookDate) === recipe.recipeId ||
      soups.get(cookDate) === recipe.recipeId ||
      sides.get(cookDate) === recipe.recipeId ||
      staples.get(cookDate) === recipe.recipeId
    if (known) score += 12
    if (batchId != null) score += 10
    if (prefs.preferExpiring) {
      for (const ingredientId of recipe.ingredientNeeds.keys()) {
        const expiry = urgent.get(ingredientId)
        if (expiry && cookDate <= expiry) score += 4
      }
    }
    score += Math.max(0, 5 - daysApart(eatBy, date))
    score -= macroMiss(scaleNutrition(recipe.nutritionPerPortion, 1), activeGoal, dayGoals) * 800
    if (!isLightMeal(meal) && recipe.role !== 'soup' && recipe.role !== 'side' && recipe.role !== 'staple') {
      if (todayCenters.has(recipe.recipeId)) score -= 40
      if (recipe.techniqueFamily && todayFamilies.has(recipe.techniqueFamily)) score -= 25
      const yesterday = format(addDays(parseISO(date), -1), 'yyyy-MM-dd')
      const previous = familiesByDate.get(yesterday)
      if (recipe.techniqueFamily && previous?.has(recipe.techniqueFamily)) score -= 8
      const last = lastCenterSlot.get(recipe.recipeId)
      if (
        last &&
        prefs.varietyGapDays > 0 &&
        daysApart(date, last.date) > 0 &&
        daysApart(date, last.date) <= prefs.varietyGapDays
      ) {
        score -= last.meal === meal ? 28 : 4
      }
    }
    return score
  }

  function pick(
    date: string,
    meal: MealSlot,
    roles: DishRole[],
    slot: CookSlot,
    todayFamilies: Set<string>,
    todayCenters: Set<number>,
    relax: boolean,
  ): Placement | undefined {
    const options = placements(date, meal, roles, slot, relax)
    let best: Placement | undefined
    let bestScore = -Infinity
    for (const option of options) {
      const score = scorePlacement(date, meal, option, todayFamilies, todayCenters)
      if (score > bestScore) {
        bestScore = score
        best = option
      }
    }
    return best
  }

  function register(placement: Placement, meal: MealSlot) {
    if (placement.batchId != null) return
    const { cookDate, recipe } = placement
    if (recipe.role === 'soup') remember(soups, cookDate, recipe.recipeId)
    else if (recipe.role === 'side') remember(sides, cookDate, recipe.recipeId)
    else if (recipe.role === 'staple') remember(staples, cookDate, recipe.recipeId)
    else if (isLightMeal(meal)) {
      remember(lights, cookDate, recipe.recipeId)
      if (recipe.role === 'center' || recipe.role === 'complete') {
        const set = centers.get(cookDate) ?? new Set<number>()
        set.add(recipe.recipeId)
        centers.set(cookDate, set)
      }
    } else {
      const set = centers.get(cookDate) ?? new Set<number>()
      set.add(recipe.recipeId)
      centers.set(cookDate, set)
    }
  }

  function pushServing(
    list: WeekDraftServing[],
    date: string,
    meal: MealSlot,
    placement: Placement,
    portions: number,
    label: string,
  ) {
    const taken = roundPortion(portions)
    if (taken <= 0) return 0
    if (placement.batchId != null) {
      const left = placement.portionsLeft ?? 0
      const use = Math.min(taken, left)
      if (use <= 0) return 0
      usedReady.set(placement.batchId, (usedReady.get(placement.batchId) ?? 0) + use)
      list.push({
        date,
        meal,
        recipeId: placement.recipe.recipeId,
        portions: use,
        cookDate: placement.cookDate,
        batchId: placement.batchId,
        fromRecipeId: placement.fromRecipeId,
        role: placement.recipe.category,
        roleLabel: label,
      })
      return use
    }
    list.push({
      date,
      meal,
      recipeId: placement.recipe.recipeId,
      portions: taken,
      cookDate: placement.cookDate,
      fromRecipeId: placement.fromRecipeId,
      role: placement.recipe.category,
      roleLabel: label,
    })
    register(placement, meal)
    return taken
  }

  function findTransform(date: string, meal: MealSlot, dayRoom: number, baselineMiss: number): Placement | undefined {
    let best: Placement | undefined
    let bestMiss = baselineMiss
    for (const recipe of pool) {
      if (!recipe.suitableMeals.includes(meal)) continue
      if (recipe.repurposesFromRecipeIds.length === 0) continue
      if (recipe.role !== 'center' && recipe.role !== 'complete') continue
      for (const cookDate of cookDates) {
        if (date <= cookDate) continue
        if (transforms.get(cookDate) != null && transforms.get(cookDate) !== recipe.recipeId) continue
        for (const sourceId of recipe.repurposesFromRecipeIds) {
          if (!centers.get(cookDate)?.has(sourceId)) continue
          const source = byId.get(sourceId)
          if (!source) continue
          const eatBy = eatByDate(cookDate, source.fridgeDays)
          if (date !== eatBy) continue
          const nut = scaleNutrition(recipe.nutritionPerPortion, 1)
          if (nut.energyKcal > dayRoom + 1) continue
          const miss = macroMiss(nut, activeGoal, dayGoals)
          if (miss + 0.01 < bestMiss) {
            bestMiss = miss
            best = { recipe, cookDate, eatBy, fromRecipeId: sourceId }
          }
        }
      }
    }
    return best
  }

  const servings: WeekDraftServing[] = []

  if (cookDates.length === 0 && catalog.ready.length === 0) {
    warnings.push('Pick at least one cook evening.')
  }

  const unmarkedMeals = meals.filter((meal) => {
    const inPool = pool.some(
      (recipe) => recipe.suitableMeals.includes(meal) && centerRoles(meal).includes(recipe.role),
    )
    const inReady = catalog.ready.some((batch) => {
      const recipe = byId.get(batch.recipeId)
      return recipe != null && recipe.suitableMeals.includes(meal) && centerRoles(meal).includes(recipe.role)
    })
    return !inPool && !inReady
  })
  for (const meal of unmarkedMeals) {
    const label = MEAL_SLOTS.find((slot) => slot.id === meal)?.label ?? meal
    warnings.push(`No recipe is marked for ${label.toLowerCase()}, so those slots stay empty.`)
  }

  function beginMeal(meal: MealSlot) {
    const index = meals.indexOf(meal)
    const later = index >= 0 ? meals.slice(index) : [meal]
    const laterSum = later.reduce((total, id) => total + MEAL_WEIGHT[id], 0)
    const share = laterSum > 0 ? MEAL_WEIGHT[meal] / laterSum : 1
    activeGoal = {
      energyKcal: Math.max(0, (dayGoals.energyKcal - day.nutrition.energyKcal) * share),
      proteinG: Math.max(0, (dayGoals.proteinG - day.nutrition.proteinG) * share),
      carbsG: Math.max(0, (dayGoals.carbsG - day.nutrition.carbsG) * share),
      fatG: Math.max(0, (dayGoals.fatG - day.nutrition.fatG) * share),
    }
    mealNut = emptyNutrition()
  }

  function place(date: string, meal: MealSlot, placement: Placement, portions: number, label: string) {
    const used = pushServing(servings, date, meal, placement, portions, label)
    if (used <= 0) return
    const nut = scaleNutrition(placement.recipe.nutritionPerPortion, used)
    day.nutrition = addNutrition(day.nutrition, nut)
    mealNut = addNutrition(mealNut, nut)
  }

  function addBest(
    date: string,
    meal: MealSlot,
    courses: { role: 'soup' | 'side' | 'staple'; label: string }[],
    todayFamilies: Set<string>,
  ) {
    const baseline = macroMiss(mealNut, activeGoal, dayGoals)
    let best: { placement: Placement; portions: number; label: string; miss: number } | undefined
    for (const course of courses) {
      for (const option of placements(date, meal, [course.role], course.role, false)) {
        if (
          course.role === 'side' &&
          option.recipe.techniqueFamily &&
          todayFamilies.has(option.recipe.techniqueFamily)
        ) {
          continue
        }
        const sizes = option.recipe.divisible ? [1, 0.5] : [1]
        for (const size of sizes) {
          const nut = scaleNutrition(option.recipe.nutritionPerPortion, size)
          if (nut.energyKcal > dayCap - day.nutrition.energyKcal + 1) continue
          const miss = macroMiss(addNutrition(mealNut, nut), activeGoal, dayGoals)
          if (!best || miss < best.miss) best = { placement: option, portions: size, label: course.label, miss }
        }
      }
    }
    if (!best || best.miss > baseline - 0.004) return
    place(date, meal, best.placement, best.portions, best.label)
  }

  for (const date of days) {
    day.nutrition = emptyNutrition()
    const todayFamilies = new Set<string>()
    const todayCenters = new Set<number>()
    familiesByDate.set(date, todayFamilies)

    for (const meal of meals) {
      beginMeal(meal)
      const dayRoom = () => dayCap - day.nutrition.energyKcal
      const slot = isLightMeal(meal) ? 'light' : 'center'
      let center =
        pick(date, meal, centerRoles(meal), slot, todayFamilies, todayCenters, false) ??
        pick(date, meal, centerRoles(meal), slot, todayFamilies, todayCenters, true)
      if (!center && !isLightMeal(meal)) {
        center = pick(date, meal, ['complete', 'center', 'snack'], 'center', todayFamilies, todayCenters, true)
      }
      if (!center) continue

      const repeats =
        !isLightMeal(meal) &&
        prefs.varietyGapDays > 0 &&
        (() => {
          const last = lastCenterSlot.get(center!.recipe.recipeId)
          return (
            last != null &&
            last.meal === meal &&
            daysApart(date, last.date) > 0 &&
            daysApart(date, last.date) <= prefs.varietyGapDays
          )
        })()
      if (repeats) {
        const transform = findTransform(
          date,
          meal,
          dayRoom(),
          macroMiss(scaleNutrition(center.recipe.nutritionPerPortion, 1), activeGoal, dayGoals),
        )
        if (transform) {
          transforms.set(transform.cookDate, transform.recipe.recipeId)
          center = transform
        }
      }

      const centerPortions = fitPortion(
        center.recipe.nutritionPerPortion.energyKcal,
        dayRoom(),
        dayRoom(),
        center.recipe.divisible,
        true,
      )
      if (centerPortions == null) continue
      place(date, meal, center, centerPortions, 'Dish')
      if (!isLightMeal(meal)) {
        const last = lastCenterSlot.get(center.recipe.recipeId)
        if (
          !center.fromRecipeId &&
          last &&
          last.meal === meal &&
          daysApart(date, last.date) > 0 &&
          prefs.varietyGapDays > 0 &&
          daysApart(date, last.date) <= prefs.varietyGapDays
        ) {
          repeatedCenter = true
        }
        lastCenterSlot.set(center.recipe.recipeId, { date, meal })
        todayCenters.add(center.recipe.recipeId)
        if (center.recipe.techniqueFamily) todayFamilies.add(center.recipe.techniqueFamily)
      }

      if (isLightMeal(meal)) continue
      const blocksStaple = center.recipe.role === 'complete' || center.recipe.includesStaple
      if (!blocksStaple) addBest(date, meal, [{ role: 'staple', label: 'Rice' }], todayFamilies)
      if (meal === 'lunch') addBest(date, meal, [{ role: 'soup', label: 'Soup' }, { role: 'side', label: 'Side' }], todayFamilies)
      if (meal === 'dinner') {
        addBest(date, meal, [{ role: 'soup', label: 'Soup' }], todayFamilies)
        addBest(date, meal, [{ role: 'side', label: 'Side' }], todayFamilies)
      }
    }

    while (day.nutrition.energyKcal > dayCap + 1) {
      const extra = [...servings]
        .reverse()
        .find((serving) => serving.date === date && (serving.roleLabel === 'Side' || serving.roleLabel === 'Soup' || serving.roleLabel === 'Rice'))
      if (!extra) break
      const cand = byId.get(extra.recipeId)
      servings.splice(servings.lastIndexOf(extra), 1)
      if (extra.batchId != null) {
        usedReady.set(extra.batchId, Math.max(0, (usedReady.get(extra.batchId) ?? 0) - extra.portions))
      }
      if (cand) day.nutrition = addNutrition(day.nutrition, scaleNutrition(cand.nutritionPerPortion, -extra.portions))
    }

    const missing = meals.filter(
      (meal) =>
        !unmarkedMeals.includes(meal) &&
        !servings.some((serving) => serving.date === date && serving.meal === meal),
    )
    if (missing.length > 0 && missing.length < meals.length) {
      warnings.push(`${format(parseISO(date), 'EEE d')}: no ${missing.join(' or ')}`)
    }
  }

  if (repeatedCenter) {
    warnings.push('Some mains repeat on back-to-back days so the cook list stays short.')
  }
  for (const note of rawSkipped) warnings.push(note)

  const hadSoup = pool.some((candidate) => candidate.role === 'soup')
  const hadSide = pool.some((candidate) => candidate.role === 'side')
  const placedSoup = servings.some((serving) => serving.roleLabel === 'Soup')
  const placedSide = servings.some((serving) => serving.roleLabel === 'Side')
  if ((hadSoup || hadSide) && !placedSoup && !placedSide && meals.some((meal) => meal === 'lunch' || meal === 'dinner')) {
    warnings.push('No soup or side moved the day closer to the targets. Meals stay as a single dish.')
  }

  const sessions = sessionsFromServings(servings)
  const shopping = draftShoppingLines(sessions, catalog)
  const scored = scoreDraft(prefs, sessions, servings, shopping, catalog, warnings)
  return {
    prefs,
    sessions,
    servings,
    shopping,
    ...scored,
  }
}

/** Change one serving's portions and resize the cook batch to match. */
export function adjustServingPortions(
  draft: WeekDraft,
  serving: WeekDraftServing,
  portions: number,
  catalog: PlannerCatalog,
): WeekDraft {
  const nextPortions = roundPortion(portions)
  const same = (item: WeekDraftServing) =>
    item.date === serving.date &&
    item.meal === serving.meal &&
    item.recipeId === serving.recipeId &&
    item.cookDate === serving.cookDate &&
    item.fromRecipeId === serving.fromRecipeId &&
    item.batchId === serving.batchId &&
    item.roleLabel === serving.roleLabel
  const servings =
    nextPortions <= 0
      ? draft.servings.filter((item) => !same(item))
      : draft.servings.map((item) => (same(item) ? { ...item, portions: nextPortions } : item))
  const sessions = sessionsFromServings(servings)
  const shopping = draftShoppingLines(sessions, catalog)
  const scored = scoreDraft(draft.prefs, sessions, servings, shopping, catalog)
  return { ...draft, sessions, servings, shopping, ...scored }
}
