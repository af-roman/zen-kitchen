import type { MealSlot } from '@/domain/types'

/** Day page with the portion editor open. `open` picks the first empty meal. */
export function planServePath(
  date: string,
  meal: MealSlot | 'open' = 'open',
  sessionId?: number,
): string {
  const q = new URLSearchParams()
  q.set('serve', meal)
  if (sessionId != null) q.set('sessionId', String(sessionId))
  return `/plan/${date}?${q}`
}
