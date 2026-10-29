/**
 * Shopping buy math shared by session shortfalls and week-planner shopping.
 */

/** Round a buy quantity up to whole packs when packSize is set. */
export function roundUpToPack(need: number, packSize?: number): number {
  if (!(packSize != null && packSize > 0)) return Math.max(0, Math.round(need * 10) / 10)
  if (need <= 0) return 0
  return Math.ceil(need / packSize) * packSize
}

/**
 * How much to buy for a planned cook (or week of cooks).
 * Covers the cook deficit (need − have), then rounds up to a whole pack.
 */
export function buyAmountForShortfall(input: {
  need: number
  have: number
  packSize?: number
}): number {
  const need = Math.max(0, input.need)
  const have = Math.max(0, input.have)
  const cookDeficit = Math.max(0, need - have)
  if (cookDeficit <= 0.05) return 0
  return roundUpToPack(cookDeficit, input.packSize)
}
