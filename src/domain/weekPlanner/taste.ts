/** Soft taste memory for planner scoring (local only). */
export type RecipeTaste = 'liked' | 'skip'

const STORAGE_KEY = 'zen-kitchen.recipeTaste'

export function loadRecipeTaste(): Record<string, RecipeTaste> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, RecipeTaste>
  } catch {
    return {}
  }
}

export function saveRecipeTaste(map: Record<string, RecipeTaste>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function setRecipeTaste(recipeId: number, taste: RecipeTaste | null): Record<string, RecipeTaste> {
  const map = loadRecipeTaste()
  const key = String(recipeId)
  if (taste == null) delete map[key]
  else map[key] = taste
  saveRecipeTaste(map)
  return map
}

export function tasteWeight(recipeId: number, map: Record<string, RecipeTaste>): number {
  const t = map[String(recipeId)]
  if (t === 'liked') return 2.2
  if (t === 'skip') return 0.15
  return 1
}
