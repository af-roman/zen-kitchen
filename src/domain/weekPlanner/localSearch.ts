import { draftShoppingLines } from './shopping'
import { eatByDate, scoreDraft, servingWithinEatBy } from './score'
import { mulberry32 } from './rng'
import type { PlannerCatalog, WeekDraft, WeekDraftServing } from './types'

function cloneDraft(draft: WeekDraft): WeekDraft {
  return {
    prefs: {
      ...draft.prefs,
      meals: [...draft.prefs.meals],
      mealPatterns: draft.prefs.mealPatterns ? { ...draft.prefs.mealPatterns } : undefined,
    },
    sessions: draft.sessions.map((s) => ({
      date: s.date,
      dishes: s.dishes.map((d) => ({ ...d })),
    })),
    servings: draft.servings.map((s) => ({ ...s })),
    shopping: draft.shopping.map((s) => ({ ...s })),
    score: { ...draft.score },
    warnings: [...draft.warnings],
    avgNutrition: { ...draft.avgNutrition },
    dayGoalGaps: draft.dayGoalGaps.map((g) => ({ ...g })),
  }
}

function rescore(draft: WeekDraft, catalog: PlannerCatalog): WeekDraft {
  const shopping = draftShoppingLines(draft.sessions, catalog)
  const { score, avgNutrition, warnings, dayGoalGaps } = scoreDraft(
    draft.prefs,
    draft.sessions,
    draft.servings,
    shopping,
    catalog,
  )
  return { ...draft, shopping, score, avgNutrition, warnings, dayGoalGaps }
}

function fridgeDaysFor(serving: WeekDraftServing, catalog: PlannerCatalog): number {
  const sourceId = serving.fromRecipeId ?? serving.recipeId
  return (
    catalog.candidates.find((c) => c.recipeId === sourceId)?.fridgeDays ??
    catalog.candidates.find((c) => c.recipeId === serving.recipeId)?.fridgeDays ??
    3
  )
}

/** Reject drafts that place any serving past cooked keep-by. */
function violatesEatBy(draft: WeekDraft, catalog: PlannerCatalog): boolean {
  return draft.servings.some((s) => !servingWithinEatBy(s, fridgeDaysFor(s, catalog)))
}

/** Swap two meal servings (same portions), including transform metadata. */
function swapMeals(draft: WeekDraft, i: number, j: number): WeekDraft | null {
  if (i === j || i < 0 || j < 0 || i >= draft.servings.length || j >= draft.servings.length) {
    return null
  }
  const next = cloneDraft(draft)
  const a = next.servings[i]
  const b = next.servings[j]
  const recipeId = a.recipeId
  const cookDate = a.cookDate
  const fromRecipeId = a.fromRecipeId
  a.recipeId = b.recipeId
  a.cookDate = b.cookDate
  a.fromRecipeId = b.fromRecipeId
  b.recipeId = recipeId
  b.cookDate = cookDate
  b.fromRecipeId = fromRecipeId
  return next
}

function nudgePortions(
  draft: WeekDraft,
  sessionIdx: number,
  from: number,
  to: number,
): WeekDraft | null {
  const session = draft.sessions[sessionIdx]
  if (!session || from === to) return null
  const a = session.dishes[from]
  const b = session.dishes[to]
  if (!a || !b || a.portions <= 1) return null
  const next = cloneDraft(draft)
  const s = next.sessions[sessionIdx]
  s.dishes[from].portions -= 1
  s.dishes[to].portions += 1
  const fromServing = next.servings.findIndex(
    (x) =>
      (x.fromRecipeId ?? x.recipeId) === a.recipeId &&
      x.cookDate === session.date &&
      x.portions >= 1,
  )
  const toServing = next.servings.find(
    (x) => (x.fromRecipeId ?? x.recipeId) === b.recipeId && x.cookDate === session.date,
  )
  if (fromServing >= 0 && toServing) {
    next.servings[fromServing].portions -= 1
    if (next.servings[fromServing].portions <= 0) next.servings.splice(fromServing, 1)
    toServing.portions += 1
  }
  return next
}

function swapCookDish(
  draft: WeekDraft,
  catalog: PlannerCatalog,
  sessionIdx: number,
  dishIdx: number,
  newRecipeId: number,
): WeekDraft | null {
  const session = draft.sessions[sessionIdx]
  const dish = session?.dishes[dishIdx]
  if (!dish) return null
  const cand = catalog.candidates.find((c) => c.recipeId === newRecipeId)
  if (!cand || dish.recipeId === newRecipeId) return null
  if (session.dishes.some((d, i) => i !== dishIdx && d.recipeId === newRecipeId)) return null

  const next = cloneDraft(draft)
  const oldId = dish.recipeId
  next.sessions[sessionIdx].dishes[dishIdx].recipeId = newRecipeId
  next.servings = next.servings.map((s) => {
    if (s.cookDate !== session.date) return s
    if (s.recipeId === oldId && !s.fromRecipeId) {
      return { ...s, recipeId: newRecipeId }
    }
    if (s.fromRecipeId === oldId) {
      return { ...s, fromRecipeId: newRecipeId }
    }
    return s
  })
  return next
}

function offGoalCount(draft: WeekDraft): number {
  return draft.dayGoalGaps.filter((g) => g.offGoal).length
}

/**
 * Local search: iterate swaps to improve score.
 * Rejects eat-by violations; prefers fewer off-goal days when close.
 */
export function improveWeekDraft(
  draft: WeekDraft,
  catalog: PlannerCatalog,
  iterations = 80,
): WeekDraft {
  if (draft.sessions.length === 0 || draft.servings.length < 2) return draft
  const rand = mulberry32((catalog.seed ?? 1) + 42)
  let current = rescore(cloneDraft(draft), catalog)
  let best = current

  for (let i = 0; i < iterations; i++) {
    const roll = rand()
    let neighbor: WeekDraft | null = null

    if (roll < 0.55 && current.servings.length >= 2) {
      const a = Math.floor(rand() * current.servings.length)
      const b = Math.floor(rand() * current.servings.length)
      neighbor = swapMeals(current, a, b)
    } else if (roll < 0.8 && current.sessions.length > 0) {
      const si = Math.floor(rand() * current.sessions.length)
      const dishes = current.sessions[si].dishes
      if (dishes.length >= 2) {
        neighbor = nudgePortions(
          current,
          si,
          Math.floor(rand() * dishes.length),
          Math.floor(rand() * dishes.length),
        )
      }
    } else if (catalog.candidates.length > 1 && current.sessions.length > 0) {
      const si = Math.floor(rand() * current.sessions.length)
      const di = Math.floor(rand() * current.sessions[si].dishes.length)
      const cand = catalog.candidates[Math.floor(rand() * catalog.candidates.length)]
      neighbor = swapCookDish(current, catalog, si, di, cand.recipeId)
    }

    if (!neighbor) continue
    if (violatesEatBy(neighbor, catalog)) continue
    neighbor = rescore(neighbor, catalog)

    const betterScore = neighbor.score.total > current.score.total
    const betterGoals =
      Math.abs(neighbor.score.total - current.score.total) <= 1 &&
      offGoalCount(neighbor) < offGoalCount(current)
    const accept =
      betterScore ||
      betterGoals ||
      (i < iterations / 3 && neighbor.score.total > current.score.total - 2 && rand() < 0.15)
    if (accept) {
      current = neighbor
      if (
        current.score.total > best.score.total ||
        (Math.abs(current.score.total - best.score.total) <= 0.5 &&
          offGoalCount(current) < offGoalCount(best))
      ) {
        best = current
      }
    }
  }

  return best
}

export function swapServingRecipes(
  draft: WeekDraft,
  a: WeekDraftServing,
  b: WeekDraftServing,
  catalog: PlannerCatalog,
): WeekDraft {
  const next = cloneDraft(draft)
  const ia = next.servings.findIndex(
    (s) =>
      s.date === a.date &&
      s.meal === a.meal &&
      s.recipeId === a.recipeId &&
      s.cookDate === a.cookDate &&
      s.fromRecipeId === a.fromRecipeId,
  )
  const ib = next.servings.findIndex(
    (s) =>
      s.date === b.date &&
      s.meal === b.meal &&
      s.recipeId === b.recipeId &&
      s.cookDate === b.cookDate &&
      s.fromRecipeId === b.fromRecipeId,
  )
  if (ia < 0 || ib < 0) return draft
  const swapped = swapMeals(next, ia, ib)
  if (!swapped || violatesEatBy(swapped, catalog)) return draft
  return rescore(swapped, catalog)
}

export function changeServingPortions(
  draft: WeekDraft,
  target: WeekDraftServing,
  portions: number,
  catalog: PlannerCatalog,
): WeekDraft {
  if (portions <= 0) return draft
  const next = cloneDraft(draft)
  const idx = next.servings.findIndex(
    (s) =>
      s.date === target.date &&
      s.meal === target.meal &&
      s.recipeId === target.recipeId &&
      s.cookDate === target.cookDate &&
      s.fromRecipeId === target.fromRecipeId,
  )
  if (idx < 0) return draft
  next.servings[idx].portions = portions
  return rescore(next, catalog)
}

// Re-export for callers that want keep-by labels
export { eatByDate }
