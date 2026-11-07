import { addDays, format, parseISO } from 'date-fns'
import type { DishCategory, MealSlot } from '@/domain/types'
import { patternForMeal } from './patterns'
import { eatByDate, emptyDraft, scoreDraft } from './score'
import { draftShoppingLines } from './shopping'
import { loadRecipeTaste, tasteWeight } from './taste'
import { mulberry32, pickWeighted, shuffleInPlace } from './rng'
import type {
  PlannerCatalog,
  PlannerPrefs,
  RecipeCandidate,
  WeekDraft,
  WeekDraftDish,
  WeekDraftServing,
  WeekDraftSession,
} from './types'

function daysApart(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000)
}

function cookDatesForWeek(prefs: PlannerPrefs): string[] {
  const dates: string[] = []
  const n = Math.max(1, prefs.batchCookCount)
  for (let i = 0; i < n; i++) {
    const offset = Math.floor((i * prefs.dayCount) / n)
    dates.push(format(addDays(parseISO(prefs.weekStartDate), offset), 'yyyy-MM-dd'))
  }
  return [...new Set(dates)].sort()
}

function poolFromCatalog(catalog: PlannerCatalog): RecipeCandidate[] {
  if (catalog.shortlistIds?.length) {
    const allow = new Set(catalog.shortlistIds)
    const filtered = catalog.candidates.filter((c) => allow.has(c.recipeId))
    if (filtered.length > 0) return filtered
  }
  return catalog.candidates
}

function hasCategory(c: RecipeCandidate, category: DishCategory): boolean {
  return c.category === category
}

/** Nearby categories when the catalog has nothing in the requested one. */
function categoryFallback(category: DishCategory): DishCategory[] {
  switch (category) {
    case 'staple':
      return ['staple', 'main']
    case 'soup':
      return ['soup', 'main']
    case 'main':
      return ['main', 'side']
    case 'side':
      return ['side', 'sauce', 'snack', 'main']
    case 'sauce':
      return ['sauce', 'side', 'snack']
    case 'snack':
      return ['snack', 'side', 'dessert']
    case 'dessert':
      return ['dessert', 'snack', 'side']
    default:
      return ['other', 'main', 'side']
  }
}

type Supply = {
  recipeId: number
  left: number
  cookDate: string
  fridgeDays: number
  isStaple: boolean
  category: DishCategory
  eatBy: string
}

function buildOneDraft(
  prefs: PlannerPrefs,
  catalog: PlannerCatalog,
  seed: number,
): WeekDraft {
  const rand = mulberry32(seed)
  const taste = loadRecipeTaste()
  const pool = poolFromCatalog(catalog)
  if (pool.length === 0) return emptyDraft(prefs)

  const cookDates = cookDatesForWeek(prefs)
  const meals = prefs.meals.length ? prefs.meals : (['lunch', 'dinner'] as MealSlot[])
  const days = Array.from({ length: prefs.dayCount }, (_, i) =>
    format(addDays(parseISO(prefs.weekStartDate), i), 'yyyy-MM-dd'),
  )
  const urgentIng = new Set<number>()
  for (const p of catalog.pantry) {
    if (!p.expiryDate || p.amountLeft <= 0) continue
    const daysLeft = daysApart(p.expiryDate, prefs.weekStartDate)
    if (daysLeft >= 0 && daysLeft <= 5) urgentIng.add(p.ingredientId)
  }

  function urgencyBoost(c: RecipeCandidate): number {
    let b = tasteWeight(c.recipeId, taste)
    for (const id of c.ingredientNeeds.keys()) {
      if (urgentIng.has(id)) b += 2
    }
    return b
  }

  /** Count pattern slots by dish category for a cook window. */
  function roleDemand(windowDays: string[]): Map<DishCategory, number> {
    const demand = new Map<DishCategory, number>()
    for (const _date of windowDays) {
      for (const meal of meals) {
        const pattern = patternForMeal(meal, prefs.mealPatterns)
        for (const slot of pattern.slots) {
          demand.set(slot.role, (demand.get(slot.role) ?? 0) + 1)
        }
      }
    }
    return demand
  }

  const sessions: WeekDraftSession[] = []
  const supplies: Supply[] = []
  const servedOnce = new Set<number>()
  const warnings: string[] = []

  for (let ci = 0; ci < cookDates.length; ci++) {
    const cookDate = cookDates[ci]!
    const nextCook = cookDates[ci + 1]
    const windowEnd = nextCook
      ? format(addDays(parseISO(nextCook), -1), 'yyyy-MM-dd')
      : days[days.length - 1]!
    const windowDays = days.filter((d) => d >= cookDate && d <= windowEnd)
    const demand = roleDemand(windowDays)

    const dishes: WeekDraftDish[] = []
    const picked = new Set<number>()

    const pickForRole = (role: DishCategory, portions: number) => {
      if (portions <= 0) return
      const order = categoryFallback(role)
      let from: RecipeCandidate[] = []
      for (const r of order) {
        from = pool.filter((c) => hasCategory(c, r) && !picked.has(c.recipeId))
        if (from.length) break
      }
      if (!from.length) {
        from = pool.filter((c) => !picked.has(c.recipeId))
      }
      if (!from.length) from = [...pool]
      const choice =
        pickWeighted(shuffleInPlace([...from], rand), (c) => urgencyBoost(c) * (1 + rand()), rand) ??
        from[0]
      if (!choice) return
      picked.add(choice.recipeId)
      const existing = dishes.find((d) => d.recipeId === choice.recipeId)
      if (existing) existing.portions += portions
      else dishes.push({ recipeId: choice.recipeId, portions })
      supplies.push({
        recipeId: choice.recipeId,
        left: portions,
        cookDate,
        fridgeDays: choice.fridgeDays,
        isStaple: choice.isStaple,
        category: choice.category,
        eatBy: eatByDate(cookDate, choice.fridgeDays),
      })
    }

    // Staples are shared across many plate slots — cook a larger batch once.
    const stapleNeed = demand.get('staple') ?? 0
    const soupNeed = demand.get('soup') ?? 0
    const mainNeed = demand.get('main') ?? 0
    const sideNeed = demand.get('side') ?? 0
    const sauceNeed = demand.get('sauce') ?? 0

    if (stapleNeed > 0) pickForRole('staple', Math.max(stapleNeed, Math.ceil(stapleNeed * 0.5) + 1))
    if (soupNeed > 0) pickForRole('soup', Math.max(2, soupNeed))
    if (mainNeed > 0) {
      pickForRole('main', Math.max(2, Math.ceil(mainNeed * 0.7)))
      if (mainNeed > 3) pickForRole('main', Math.max(2, Math.ceil(mainNeed * 0.4)))
    }
    if (sideNeed > 0) {
      pickForRole('side', Math.max(2, Math.ceil(sideNeed * 0.55)))
      pickForRole('side', Math.max(1, Math.ceil(sideNeed * 0.45)))
    }
    if (sauceNeed > 0) pickForRole('sauce', Math.max(1, sauceNeed))
    for (const [category, count] of demand) {
      if (count <= 0) continue
      if (
        category === 'staple' ||
        category === 'soup' ||
        category === 'main' ||
        category === 'side' ||
        category === 'sauce'
      ) {
        continue
      }
      pickForRole(category, Math.max(1, count))
    }

    // Ensure at least one dish if patterns asked for nothing weird
    if (dishes.length === 0) {
      pickForRole('main', Math.max(2, windowDays.length * meals.length))
    }

    sessions.push({ date: cookDate, dishes })
  }

  const lastDateByRecipe = new Map<number, string>()
  const servings: WeekDraftServing[] = []
  const candidateById = new Map(pool.map((c) => [c.recipeId, c]))

  function canEat(supply: Supply, date: string): boolean {
    return date >= supply.cookDate && date <= supply.eatBy
  }

  function pickSupplyForRole(
    date: string,
    role: DishCategory,
    respectGap: boolean,
  ): Supply | undefined {
    let best: Supply | undefined
    let bestScore = -Infinity
    const fallbacks = categoryFallback(role)
    for (const s of supplies) {
      if (s.left <= 0 || !canEat(s, date)) continue
      const roleOk = fallbacks.some((r) => s.category === r)
      if (!roleOk && role !== 'main') continue
      if (respectGap) {
        const last = lastDateByRecipe.get(s.recipeId)
        if (last && daysApart(date, last) < prefs.varietyGapDays) {
          if (!(s.isStaple && prefs.stapleExtraCadence)) continue
        }
      }
      const urgency = 10 - Math.min(10, daysApart(s.eatBy, date))
      const taste = tasteWeight(s.recipeId, loadRecipeTaste())
      const roleMatch = s.category === role ? 3 : 0
      const score = s.left + urgency * 2 + roleMatch + taste
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
    // Last resort: any edible supply
    if (!best) {
      for (const s of supplies) {
        if (s.left <= 0 || !canEat(s, date)) continue
        return s
      }
    }
    return best
  }

  function pickTransformForRole(
    date: string,
    role: DishCategory,
  ): { supply: Supply; transform: RecipeCandidate } | undefined {
    const transforms = catalog.candidates.filter(
      (c) => c.repurposesFromRecipeIds.length > 0 && hasCategory(c, role),
    )
    if (transforms.length === 0) return undefined

    const options: { supply: Supply; transform: RecipeCandidate; score: number }[] = []
    for (const supply of supplies) {
      if (supply.left <= 0 || !canEat(supply, date)) continue
      if (!servedOnce.has(supply.recipeId)) continue
      for (const t of transforms) {
        if (!t.repurposesFromRecipeIds.includes(supply.recipeId)) continue
        const lastT = lastDateByRecipe.get(t.recipeId)
        if (lastT && daysApart(date, lastT) < prefs.varietyGapDays) continue
        const urgency = 10 - Math.min(10, daysApart(supply.eatBy, date))
        options.push({
          supply,
          transform: t,
          score: urgency + supply.left + tasteWeight(t.recipeId, taste) + rand(),
        })
      }
    }
    if (options.length === 0) return undefined
    options.sort((a, b) => b.score - a.score)
    // Prefer transforms when leftovers are urgent; otherwise ~40%
    const top = options[0]!
    const urgent = daysApart(top.supply.eatBy, date) <= 1
    if (!urgent && rand() > 0.4) return undefined
    return { supply: top.supply, transform: top.transform }
  }

  for (const date of days) {
    for (const meal of meals) {
      const pattern = patternForMeal(meal, prefs.mealPatterns)
      const usedInMeal = new Set<number>()

      for (const slot of pattern.slots) {
        // Leftover transforms fill the plate around rice and soup.
        if (slot.role !== 'staple' && slot.role !== 'soup') {
          const tr = pickTransformForRole(date, slot.role)
          if (tr && !usedInMeal.has(tr.transform.recipeId)) {
            tr.supply.left -= 1
            servedOnce.add(tr.supply.recipeId)
            lastDateByRecipe.set(tr.transform.recipeId, date)
            usedInMeal.add(tr.transform.recipeId)
            servings.push({
              date,
              meal,
              recipeId: tr.transform.recipeId,
              portions: 1,
              cookDate: tr.supply.cookDate,
              fromRecipeId: tr.supply.recipeId,
              role: slot.role,
              roleLabel: slot.label,
            })
            continue
          }
        }

        let supply = pickSupplyForRole(date, slot.role, true)
        if (!supply) supply = pickSupplyForRole(date, slot.role, false)
        if (!supply) {
          warnings.push(
            `${format(parseISO(date), 'EEE d')} ${meal}: missing ${slot.label.toLowerCase()}`,
          )
          continue
        }
        // Prefer not repeating same dish twice in one plate when alternatives exist
        if (usedInMeal.has(supply.recipeId)) {
          const alt = pickSupplyForRole(date, slot.role, false)
          if (alt && alt.recipeId !== supply.recipeId) supply = alt
        }

        supply.left -= 1
        servedOnce.add(supply.recipeId)
        lastDateByRecipe.set(supply.recipeId, date)
        usedInMeal.add(supply.recipeId)
        servings.push({
          date,
          meal,
          recipeId: supply.recipeId,
          portions: 1,
          cookDate: supply.cookDate,
          role: slot.role,
          roleLabel: slot.label,
        })
      }
    }
  }

  void candidateById

  const merged = mergeServings(servings)
  const shopping = draftShoppingLines(sessions, catalog)
  const { score, avgNutrition, warnings: scoreWarnings, dayGoalGaps } = scoreDraft(
    prefs,
    sessions,
    merged,
    shopping,
    catalog,
  )
  return {
    prefs,
    sessions,
    servings: merged,
    shopping,
    score,
    avgNutrition,
    dayGoalGaps,
    warnings: [...new Set([...scoreWarnings, ...warnings])],
  }
}

function mergeServings(list: WeekDraftServing[]): WeekDraftServing[] {
  const map = new Map<string, WeekDraftServing>()
  for (const s of list) {
    const key = `${s.date}|${s.meal}|${s.recipeId}|${s.cookDate}|${s.fromRecipeId ?? ''}|${s.role ?? ''}`
    const prev = map.get(key)
    if (prev) prev.portions += s.portions
    else map.set(key, { ...s })
  }
  return [...map.values()].sort((a, b) =>
    a.date === b.date ? a.meal.localeCompare(b.meal) : a.date.localeCompare(b.date),
  )
}

/**
 * Generate several seeded heuristics and return the best-scoring draft.
 * Prefers drafts with fewer off-goal days when scores are close.
 */
export function generateWeekDraft(
  prefs: PlannerPrefs,
  catalog: PlannerCatalog,
  attempts = 12,
): WeekDraft {
  const baseSeed = catalog.seed ?? Date.now() % 1_000_000
  let best = emptyDraft(prefs)
  for (let i = 0; i < attempts; i++) {
    const draft = buildOneDraft(prefs, catalog, baseSeed + i * 9973)
    const bestOff = best.dayGoalGaps.filter((g) => g.offGoal).length
    const draftOff = draft.dayGoalGaps.filter((g) => g.offGoal).length
    const better =
      draft.score.total > best.score.total + 0.5 ||
      (Math.abs(draft.score.total - best.score.total) <= 0.5 && draftOff < bestOff)
    if (better) best = draft
  }
  return best
}
