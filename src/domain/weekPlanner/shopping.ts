import { isAlwaysAvailable } from '@/domain/kitchen'
import type { PlannerCatalog, WeekDraftSession, WeekDraftShopLine } from './types'

function roundUpToPack(need: number, packSize?: number): number {
  if (!(packSize != null && packSize > 0)) return Math.max(0, Math.round(need * 10) / 10)
  if (need <= 0) return 0
  return Math.ceil(need / packSize) * packSize
}

/**
 * Aggregate ingredient needs for draft cook sessions (scaled by portions / base).
 */
export function draftShoppingLines(
  sessions: WeekDraftSession[],
  catalog: PlannerCatalog,
): WeekDraftShopLine[] {
  const needByIng = new Map<number, number>()
  const byId = new Map(catalog.candidates.map((c) => [c.recipeId, c]))

  for (const session of sessions) {
    for (const dish of session.dishes) {
      const cand = byId.get(dish.recipeId)
      if (!cand) continue
      const scale = dish.portions / Math.max(1, cand.portionsBase)
      for (const [ingredientId, amount] of cand.ingredientNeeds) {
        needByIng.set(ingredientId, (needByIng.get(ingredientId) ?? 0) + amount * scale)
      }
    }
  }

  const stock = new Map<number, number>()
  for (const p of catalog.pantry) {
    stock.set(p.ingredientId, (stock.get(p.ingredientId) ?? 0) + p.amountLeft)
  }

  const lines: WeekDraftShopLine[] = []
  for (const [ingredientId, need] of needByIng) {
    const meta = catalog.ingredients.get(ingredientId)
    if (isAlwaysAvailable(meta)) continue
    const have = stock.get(ingredientId) ?? 0
    const deficit = need - have
    if (deficit <= 0.05) continue
    const buy = roundUpToPack(deficit, meta?.packSize)
    lines.push({
      ingredientId,
      need: Math.round(need * 10) / 10,
      buy,
      packs:
        meta?.packSize && meta.packSize > 0
          ? Math.round((buy / meta.packSize) * 10) / 10
          : undefined,
    })
  }
  return lines.sort((a, b) => a.ingredientId - b.ingredientId)
}
