const STORAGE_KEY = 'zen-kitchen:recipe-import-synonyms'

export function loadImportSynonyms(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function rememberImportSynonym(
  map: Record<string, string>,
  fromName: string,
  toIngredientName: string,
): Record<string, string> {
  const next = {
    ...map,
    [fromName.trim().toLowerCase()]: toIngredientName.trim().toLowerCase(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
