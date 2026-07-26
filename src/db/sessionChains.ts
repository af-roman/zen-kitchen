import { db } from './database'
import { uid } from '@/domain/kitchen'
import { activeRecipeStages, dishStage, isPrepLeg, stageDate } from '@/domain/stages'
import type { CookingSession, Recipe, SessionDishPlan } from '@/domain/types'

export type StageLeg = {
  chainId: string
  recipeId: number
  portions: number
  /** 1 = day before the cook, 2 = two days before, … */
  daysAhead: number
  date: string
}

/** Give every dish a chain id so its prep legs can be found again later. */
export function withChainIds(dishes: SessionDishPlan[]): SessionDishPlan[] {
  return dishes.map((d) => (d.chainId ? d : { ...d, chainId: uid() }))
}

/** Prep legs the cook-day dishes require, earliest date first. */
export function stageLegsFor(
  dishes: SessionDishPlan[],
  recipeById: Map<number, Recipe>,
  cookDate: string,
): StageLeg[] {
  const legs: StageLeg[] = []
  for (const dish of dishes) {
    const recipe = recipeById.get(dish.recipeId)
    if (!recipe || isPrepLeg(dish)) continue
    for (const stage of activeRecipeStages(recipe)) {
      if (stage.daysAhead <= 0) continue
      legs.push({
        chainId: dish.chainId ?? uid(),
        recipeId: dish.recipeId,
        portions: dish.portions,
        daysAhead: stage.daysAhead,
        date: stageDate(cookDate, stage.daysAhead),
      })
    }
  }
  return legs.sort((a, b) => a.date.localeCompare(b.date) || b.daysAhead - a.daysAhead)
}

function legKey(dish: SessionDishPlan) {
  return `${dish.chainId ?? ''}|${dish.recipeId}|${dishStage(dish)}`
}

/**
 * Drop still-planned prep legs of these chains so they can be rebuilt.
 * Legs already being cooked or finished are left untouched.
 */
export async function removePlannedChainLegs(
  chainIds: string[],
  keepSessionId?: number,
): Promise<void> {
  if (chainIds.length === 0) return
  const chains = new Set(chainIds)
  const now = new Date().toISOString()
  const sessions = await db.cookingSessions.toArray()
  for (const session of sessions) {
    if (session.id == null || session.id === keepSessionId) continue
    if (session.status !== 'planned') continue
    const kept = session.dishes.filter(
      (d) => !(isPrepLeg(d) && d.chainId && chains.has(d.chainId)),
    )
    if (kept.length === session.dishes.length) continue
    if (kept.length === 0) await db.cookingSessions.delete(session.id)
    else await db.cookingSessions.update(session.id, { dishes: kept, updatedAt: now })
  }
}

/** Add legs to the planned session on their date, creating one when needed. */
export async function createStageLegSessions(legs: StageLeg[]): Promise<void> {
  const now = new Date().toISOString()
  const byDate = new Map<string, StageLeg[]>()
  for (const leg of legs) {
    const list = byDate.get(leg.date) ?? []
    list.push(leg)
    byDate.set(leg.date, list)
  }

  for (const [date, dayLegs] of byDate) {
    const dishes: SessionDishPlan[] = dayLegs.map((leg) => ({
      recipeId: leg.recipeId,
      portions: leg.portions,
      stageDaysAhead: leg.daysAhead,
      chainId: leg.chainId,
      stepsDone: [],
    }))
    const onDay = await db.cookingSessions.where('date').equals(date).toArray()
    const target = onDay.find((s) => s.status === 'planned')
    if (target?.id != null) {
      const present = new Set(target.dishes.map(legKey))
      const added = dishes.filter((d) => !present.has(legKey(d)))
      if (added.length === 0) continue
      await db.cookingSessions.update(target.id, {
        dishes: [...target.dishes, ...added],
        updatedAt: now,
      })
    } else {
      await db.cookingSessions.add({
        date,
        status: 'planned',
        dishes,
        notes: '',
        createdAt: now,
        updatedAt: now,
      })
    }
  }
}

/** Rebuild the prep legs belonging to a cook-day session. */
export async function syncStageLegs(
  cookSessionId: number,
  cookDate: string,
  dishes: SessionDishPlan[],
  recipeById: Map<number, Recipe>,
): Promise<void> {
  // Only chains this session finishes may be rebuilt; legs of other chains stay put.
  const chainIds = dishes
    .filter((d) => !isPrepLeg(d))
    .map((d) => d.chainId)
    .filter((id): id is string => Boolean(id))
  await removePlannedChainLegs(chainIds, cookSessionId)
  await createStageLegSessions(stageLegsFor(dishes, recipeById, cookDate))
}

/**
 * Remove the prep legs that fed a session's cook-day dishes.
 * Legs of chains this session did not finish are left alone.
 */
export async function removeSiblingLegsOf(session: CookingSession): Promise<void> {
  const chainIds = session.dishes
    .filter((d) => !isPrepLeg(d))
    .map((d) => d.chainId)
    .filter((id): id is string => Boolean(id))
  await removePlannedChainLegs(chainIds, session.id)
}

export type ChainLeg = { session: CookingSession; dish: SessionDishPlan }

/** Every leg of a chain across sessions, earliest stage first. */
export function chainLegs(sessions: CookingSession[], chainId: string): ChainLeg[] {
  const legs: ChainLeg[] = []
  for (const session of sessions) {
    for (const dish of session.dishes) {
      if (dish.chainId === chainId) legs.push({ session, dish })
    }
  }
  return legs.sort((a, b) => dishStage(b.dish) - dishStage(a.dish))
}

/** Prep legs of this dish's chain that still have not been cooked. */
export function unfinishedPrepLegs(
  sessions: CookingSession[],
  dish: SessionDishPlan,
): ChainLeg[] {
  if (!dish.chainId) return []
  return chainLegs(sessions, dish.chainId).filter(
    (leg) => isPrepLeg(leg.dish) && dishStage(leg.dish) > dishStage(dish) && !leg.dish.completed,
  )
}
