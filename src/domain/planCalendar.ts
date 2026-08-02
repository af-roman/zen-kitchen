import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import type { CookingSession, Serving } from './types'
import { MEAL_SLOTS } from './types'

export type PlanRange = 'day' | 'week' | 'month'

export function weekStartOf(date: string): string {
  return format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

/** Monday–Sunday for the week containing `anchor`. */
export function daysInWeek(anchor: string): string[] {
  const start = parseISO(weekStartOf(anchor))
  return eachDayOfInterval({ start, end: addDays(start, 6) }).map((d) =>
    format(d, 'yyyy-MM-dd'),
  )
}

/** Inclusive date range for the visible month grid (may include adjacent-month padding). */
export function daysInMonthGrid(anchor: string): string[] {
  const monthStart = startOfMonth(parseISO(anchor))
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 })
  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((d) =>
    format(d, 'yyyy-MM-dd'),
  )
}

/** Days that belong to the anchor month only (for nutrition averages). */
export function daysInMonth(anchor: string): string[] {
  const start = startOfMonth(parseISO(anchor))
  const end = endOfMonth(start)
  return eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'))
}

export function shiftAnchor(anchor: string, range: PlanRange, direction: -1 | 1): string {
  const d = parseISO(anchor)
  if (range === 'month') {
    return format(direction === 1 ? addMonths(d, 1) : subMonths(d, 1), 'yyyy-MM-dd')
  }
  // day and week both move by 7 when browsing week; day mode navigates away so this is for week
  const days = range === 'day' ? 1 : 7
  return format(addDays(d, direction * days), 'yyyy-MM-dd')
}

export function rangeLabel(anchor: string, range: PlanRange): string {
  const d = parseISO(anchor)
  if (range === 'month') return format(d, 'MMMM yyyy')
  if (range === 'day') return format(d, 'EEEE d MMM yyyy')
  const start = parseISO(weekStartOf(anchor))
  const end = addDays(start, 6)
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'd')}–${format(end, 'd MMM yyyy')}`
  }
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
}

export type DaySummary = {
  date: string
  sessionCount: number
  mealCount: number
  mealSlots: number
  hasSessions: boolean
  hasMeals: boolean
  needsFood: boolean
}

export function summarizeDay(
  date: string,
  sessions: CookingSession[],
  servings: Serving[],
  itemNeedsFood: (serving: Serving) => boolean,
): DaySummary {
  const daySessions = sessions.filter((s) => s.date === date)
  const dayServings = servings.filter((s) => s.date === date)
  const mealCount = MEAL_SLOTS.filter((slot) =>
    dayServings.some((s) => s.meal === slot.id),
  ).length
  return {
    date,
    sessionCount: daySessions.length,
    mealCount,
    mealSlots: MEAL_SLOTS.length,
    hasSessions: daySessions.length > 0,
    hasMeals: mealCount > 0,
    needsFood: dayServings.some(itemNeedsFood),
  }
}

export function isSameMonth(date: string, monthAnchor: string): boolean {
  return format(parseISO(date), 'yyyy-MM') === format(parseISO(monthAnchor), 'yyyy-MM')
}
