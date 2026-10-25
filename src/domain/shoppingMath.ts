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
 *
 * Covers the cook deficit (need − have). If a low-stock threshold is set and
 * stock after the cook would fall below it, also buys enough to land at that
 * threshold (then pack-rounded).
 */
export function buyAmountForShortfall(input: {
  need: number
  have: number
  lowStockThreshold?: number
  packSize?: number
}): number {
  const need = Math.max(0, input.need)
  const have = Math.max(0, input.have)
  const threshold =
    input.lowStockThreshold != null && input.lowStockThreshold > 0
      ? input.lowStockThreshold
      : 0
  const cookDeficit = Math.max(0, need - have)
  // After purchase and cook: have + buy - need >= threshold (when threshold > 0)
  const refillBuy = Math.max(0, need + threshold - have)
  const buyRaw = Math.max(cookDeficit, refillBuy)
  if (buyRaw <= 0.05) return 0
  return roundUpToPack(buyRaw, input.packSize)
}
