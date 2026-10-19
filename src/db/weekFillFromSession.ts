import { db } from '@/db/database'
import { applyWeekFillAssignments } from '@/db/weekFillOps'
import { todayISO } from '@/domain/kitchen'
import {
  defaultFillFromDate,
  planWeekFill,
  sourcesFromBatches,
  sourcesFromSession,
} from '@/domain/weekFill'

/** Fill empty upcoming meal slots from a session (and optionally ready batches). */
export async function weekFillFromSessionId(
  sessionId: number,
  opts?: { includeReadyBatches?: boolean; dayCount?: number },
): Promise<{ mealsWritten: number; portionsAssigned: number; assignmentCount: number }> {
  const session = await db.cookingSessions.get(sessionId)
  if (!session) throw new Error('Session not found')
  const recipes = await db.recipes.toArray()
  const ingredients = await db.ingredients.toArray()
  const recipeById = new Map(recipes.map((r) => [r.id!, r]))
  const ingById = new Map(ingredients.map((i) => [i.id!, i]))

  let sources = sourcesFromSession(session, recipeById)
  if (opts?.includeReadyBatches) {
    const batches = await db.readyBatches.toArray()
    sources = [...sources, ...sourcesFromBatches(batches, recipeById)]
  }

  const today = todayISO()
  const fromDate = defaultFillFromDate(session.date, today)
  const assignments = planWeekFill(sources, {
    fromDate,
    dayCount: opts?.dayCount ?? 5,
    varietyGapDays: 1,
  })
  const result = await applyWeekFillAssignments(assignments, recipeById, ingById)
  return { ...result, assignmentCount: assignments.length }
}
