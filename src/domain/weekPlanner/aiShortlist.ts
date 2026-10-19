import type { PlannerCatalog, PlannerPrefs, RecipeCandidate } from './types'

export type ShortlistRequest = {
  prefs: PlannerPrefs
  goals: PlannerCatalog['goals']
  recipes: { id: number; name: string; category: string; kcal: number; proteinG: number }[]
}

/**
 * Optional AI shortlist: POST to `VITE_PLANNER_SHORTLIST_URL` when set.
 * Response shape: `{ recipeIds: number[] }`.
 * On any failure or when unset, returns null (caller uses full catalog / local rank).
 */
export async function fetchAiRecipeShortlist(
  request: ShortlistRequest,
): Promise<number[] | null> {
  const url = import.meta.env.VITE_PLANNER_SHORTLIST_URL as string | undefined
  if (!url) return null
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { recipeIds?: unknown }
    if (!Array.isArray(data.recipeIds)) return null
    return data.recipeIds.filter((id): id is number => typeof id === 'number')
  } catch {
    return null
  }
}

/**
 * Local deterministic shortlist: rank by macro proximity to goals + urgency.
 * Always available; used when AI is off or fails.
 */
export function localRecipeShortlist(
  candidates: RecipeCandidate[],
  goals: PlannerCatalog['goals'],
  limit = 12,
): number[] {
  if (candidates.length === 0) return []
  const targetProtein =
    (goals.dailyKcal * (goals.proteinPct / 100)) / 4 / 2 /* per meal-ish */
  const scored = candidates.map((c) => {
    const kcalErr = Math.abs(c.nutritionPerPortion.energyKcal - goals.dailyKcal / 2)
    const protErr = Math.abs(c.nutritionPerPortion.proteinG - targetProtein)
    const stapleBonus = c.isStaple ? 5 : 0
    const mainBonus = c.category === 'main' ? 8 : 0
    return {
      id: c.recipeId,
      score: stapleBonus + mainBonus - kcalErr / 40 - protErr / 5,
    }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.min(limit, scored.length)).map((s) => s.id)
}

/** Resolve shortlist: AI if configured, else local rank. */
export async function resolveRecipeShortlist(
  prefs: PlannerPrefs,
  catalog: PlannerCatalog,
  useAi: boolean,
): Promise<{ ids: number[]; source: 'ai' | 'local' | 'none' }> {
  if (!useAi) {
    return { ids: localRecipeShortlist(catalog.candidates, catalog.goals), source: 'local' }
  }
  const ai = await fetchAiRecipeShortlist({
    prefs,
    goals: catalog.goals,
    recipes: catalog.candidates.map((c) => ({
      id: c.recipeId,
      name: c.name,
      category: c.category,
      kcal: c.nutritionPerPortion.energyKcal,
      proteinG: c.nutritionPerPortion.proteinG,
    })),
  })
  if (ai?.length) return { ids: ai, source: 'ai' }
  return { ids: localRecipeShortlist(catalog.candidates, catalog.goals), source: 'local' }
}
