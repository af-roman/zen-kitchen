import { format, parseISO } from 'date-fns'
import { clearServingsForMeal } from '@/db/servingOps'
import { todayISO } from '@/domain/kitchen'
import type { MealSlot, Serving } from '@/domain/types'
import { MEAL_SLOTS } from '@/domain/types'
import { appConfirm } from '@/shared/dialog'

/** Today and future plates that have food and are not marked consumed. */
export function canRemovePlannedMeal(
  serving: Serving | undefined,
  date: string,
  today = todayISO(),
): boolean {
  if (!serving || serving.id == null || serving.items.length === 0) return false
  if (date < today) return false
  if (serving.kept) return false
  return true
}

export async function confirmRemovePlannedMeal(date: string, meal: MealSlot): Promise<boolean> {
  const label = MEAL_SLOTS.find((slot) => slot.id === meal)?.label ?? meal
  const when = date === todayISO() ? 'today' : format(parseISO(date), 'EEE d MMM')
  const ok = await appConfirm(
    `Remove ${label} on ${when}? The portions go back to Stock or to the cook they came from. The cook and the shopping list stay.`,
    { title: 'Remove meal', confirmLabel: 'Remove meal', danger: true },
  )
  if (!ok) return false
  await clearServingsForMeal(date, meal)
  return true
}
