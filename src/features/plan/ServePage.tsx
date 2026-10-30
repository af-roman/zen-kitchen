import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { db } from '@/db/database'
import { todayISO } from '@/domain/kitchen'
import { isPastDate } from '@/domain/servings'
import { parseMealSlot } from '@/domain/types'
import { planServePath } from '@/features/plan/servePath'

/** Old Serve links open the day page with the portion editor already on. */
export function ServePage() {
  const [params] = useSearchParams()
  const today = todayISO()
  const sessionIdRaw = params.get('sessionId')
  const sessionId =
    sessionIdRaw != null && Number.isFinite(Number(sessionIdRaw)) ? Number(sessionIdRaw) : undefined
  const [sessionDate, setSessionDate] = useState<string | null | undefined>(
    sessionId == null ? null : undefined,
  )

  useEffect(() => {
    if (sessionId == null) return
    let cancelled = false
    void db.cookingSessions.get(sessionId).then((session) => {
      if (!cancelled) setSessionDate(session?.date ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (sessionDate === undefined) return null

  const fromUrl = params.get('date')
  const date =
    fromUrl && !isPastDate(fromUrl)
      ? fromUrl
      : sessionDate && !isPastDate(sessionDate)
        ? sessionDate
        : today
  const meal = parseMealSlot(params.get('meal')) ?? 'open'
  return <Navigate to={planServePath(date, meal, sessionId)} replace />
}
