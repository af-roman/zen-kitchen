import { addDays, format, parseISO } from 'date-fns'
import type { CookingSession, PantryItem, ReadyBatch, Serving } from '@/domain/types'

export type TodayAlert = {
  id: 'shop' | 'expiry' | 'horizon'
  title: string
  detail: string
  to: string
}

/**
 * At most three warnings, ranked: missing cook ingredients, food expiring
 * today, then an empty horizon over the next two days.
 */
export function deriveTodayAlerts(input: {
  today: string
  sessions: CookingSession[]
  pantry: PantryItem[]
  batches: ReadyBatch[]
  servings: Serving[]
  /** Shortfall line count for the next unfinished cook, if any. */
  nextCookShort: number
  nextCookDate?: string
}): TodayAlert[] {
  const alerts: TodayAlert[] = []

  if (input.nextCookShort > 0 && input.nextCookDate) {
    const when =
      input.nextCookDate === input.today
        ? 'today'
        : format(parseISO(input.nextCookDate), 'EEE d MMM')
    alerts.push({
      id: 'shop',
      title: `Shop before the cook ${when}`,
      detail: `${input.nextCookShort} ingredient${input.nextCookShort === 1 ? '' : 's'} short for that session.`,
      to: '/shopping',
    })
  }

  const expiringBatches = input.batches.filter(
    (b) => b.portionsLeft > 0 && b.expiresAt <= input.today,
  )
  const expiringPantry = input.pantry.filter(
    (p) => p.amountLeft > 0 && p.expiryDate != null && p.expiryDate <= input.today,
  )
  if (expiringBatches.length > 0 || expiringPantry.length > 0) {
    const parts: string[] = []
    if (expiringBatches.length > 0) {
      parts.push(
        `${expiringBatches.length} dish${expiringBatches.length === 1 ? '' : 'es'}`,
      )
    }
    if (expiringPantry.length > 0) {
      parts.push(
        `${expiringPantry.length} pantry item${expiringPantry.length === 1 ? '' : 's'}`,
      )
    }
    alerts.push({
      id: 'expiry',
      title: 'Expiring today or already past',
      detail: `${parts.join(' and ')}.`,
      to: expiringBatches.length > 0 ? '/ready' : '/pantry',
    })
  }

  const tomorrow = format(addDays(parseISO(input.today), 1), 'yyyy-MM-dd')
  const dayAfter = format(addDays(parseISO(input.today), 2), 'yyyy-MM-dd')
  const hasPlan = (date: string) =>
    input.servings.some((s) => s.date === date && s.items.length > 0 && !s.skipped) ||
    input.sessions.some((s) => s.date === date && s.status !== 'done')
  if (!hasPlan(tomorrow) && !hasPlan(dayAfter)) {
    alerts.push({
      id: 'horizon',
      title: 'Nothing planned after today',
      detail: 'Tomorrow and the day after have no meals and no cook.',
      to: '/week',
    })
  }

  return alerts.slice(0, 3)
}
