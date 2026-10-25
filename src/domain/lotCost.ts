import type { PantryItem, Recipe, Restock } from '@/domain/types'

/** Latest paid price per stock unit for an ingredient. */
export function lastUnitCost(restocks: Restock[], ingredientId: number): number | undefined {
  const sorted = [...restocks].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date)
    if (byDate !== 0) return byDate
    return b.createdAt.localeCompare(a.createdAt)
  })
  for (const restock of sorted) {
    for (const line of restock.lines) {
      if (line.ingredientId !== ingredientId) continue
      if (line.amount > 0 && line.cost > 0) return line.cost / line.amount
    }
  }
  return undefined
}

/** Weighted lot price, falling back to the last restock. */
export function unitCostForIngredient(
  ingredientId: number,
  pantry: Pick<PantryItem, 'ingredientId' | 'amountLeft' | 'unitCost'>[],
  restocks: Restock[],
): number | undefined {
  const lots = pantry.filter(
    (p) =>
      p.ingredientId === ingredientId &&
      p.amountLeft > 0 &&
      p.unitCost != null &&
      p.unitCost > 0,
  )
  const qty = lots.reduce((sum, p) => sum + p.amountLeft, 0)
  if (qty > 0) {
    const cost = lots.reduce((sum, p) => sum + p.amountLeft * (p.unitCost ?? 0), 0)
    return cost / qty
  }
  return lastUnitCost(restocks, ingredientId)
}

/** Ingredient cost for `portions` of a dish, using known lot or restock prices. */
export function portionIngredientCost(
  recipe: Recipe | undefined,
  portions: number,
  pantry: Pick<PantryItem, 'ingredientId' | 'amountLeft' | 'unitCost'>[],
  restocks: Restock[],
): number {
  if (!recipe || recipe.portions <= 0 || portions <= 0) return 0
  let total = 0
  for (const line of recipe.ingredients) {
    const unit = unitCostForIngredient(line.ingredientId, pantry, restocks)
    if (unit == null) continue
    total += (line.amount / recipe.portions) * portions * unit
  }
  return Math.round(total * 100) / 100
}

export function money(n: number): number {
  return Math.round(n * 100) / 100
}
