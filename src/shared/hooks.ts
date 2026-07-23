import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { Goals } from '@/domain/types'

const defaultGoals: Goals = {
  id: 1,
  dailyKcal: 2000,
  carbsPct: 40,
  proteinPct: 30,
  fatPct: 30,
}

export function useGoals(): Goals {
  return useLiveQuery(() => db.goals.get(1), []) ?? defaultGoals
}
