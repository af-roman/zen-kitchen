import { format, parseISO } from 'date-fns'
import type { CookingSession, ShoppingList } from '@/domain/types'
import { todayISO } from '@/domain/kitchen'

export type JourneyAction =
  | { kind: 'plan'; label: string; to: string }
  | { kind: 'shop'; label: string; to: string; count: number }
  | { kind: 'cook'; label: string; to: string; sessionId: number }
  | { kind: 'serve'; label: string; to: string }
  | { kind: 'replan'; label: string; to: string }

export type WeekJourney = {
  /** Primary next step for the user. */
  primary: JourneyAction
  /** Short chip text on Plan home. */
  chip: string
  hasPlannedWeek: boolean
}

function openShopCount(list: ShoppingList | null | undefined): number {
  if (!list || list.status !== 'open') return 0
  return list.items.length
}

/**
 * Derive the next action in the weekly autopilot loop from live kitchen state.
 */
export function deriveWeekJourney(input: {
  sessions: CookingSession[]
  shoppingList: ShoppingList | null | undefined
  /** True when the visible week already has meals or sessions. */
  hasWeekContent: boolean
  today?: string
}): WeekJourney {
  const today = input.today ?? todayISO()
  const shopLeft = openShopCount(input.shoppingList)

  const upcoming = input.sessions
    .filter((s) => s.id != null && s.status !== 'done' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const nextSession = upcoming[0]
  const hasPlannedWeek = input.hasWeekContent || shopLeft > 0 || upcoming.length > 0

  if (!hasPlannedWeek) {
    return {
      hasPlannedWeek: false,
      chip: 'No week planned yet',
      primary: {
        kind: 'plan',
        label: 'Plan my week',
        to: '/plan-week?autogen=1',
      },
    }
  }

  if (shopLeft > 0) {
    return {
      hasPlannedWeek: true,
      chip: `Shopping · ${shopLeft} left`,
      primary: {
        kind: 'shop',
        label: `Shop (${shopLeft})`,
        to: '/shopping',
        count: shopLeft,
      },
    }
  }

  if (nextSession?.id != null) {
    const when =
      nextSession.date === today
        ? 'today'
        : format(parseISO(nextSession.date), 'EEE d')
    return {
      hasPlannedWeek: true,
      chip: `Cook ${when}`,
      primary: {
        kind: 'cook',
        label: `Cook ${when}`,
        to: `/cook/${nextSession.id}`,
        sessionId: nextSession.id,
      },
    }
  }

  // Week content exists but nothing left to shop/cook — eat or replan.
  const hasActiveSessions = input.sessions.some(
    (s) => s.status === 'active' || (s.status === 'planned' && s.date >= today),
  )
  if (!hasActiveSessions && input.hasWeekContent) {
    return {
      hasPlannedWeek: true,
      chip: 'Week underway — serve or replan',
      primary: {
        kind: 'serve',
        label: 'Serve today',
        to: `/plan/${today}?serve=open`,
      },
    }
  }

  return {
    hasPlannedWeek: true,
    chip: 'Ready to plan next week',
    primary: {
      kind: 'replan',
      label: 'Plan my week',
      to: '/plan-week?autogen=1',
    },
  }
}
