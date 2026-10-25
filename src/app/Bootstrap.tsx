import { useEffect, useState, type ReactNode } from 'react'
import { ensureSeeded } from '@/db/seed'

export function Bootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureSeeded()
      .then(() => setReady(true))
      .catch((e: unknown) => {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to start')
      })
  }, [])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-danger">Could not open kitchen</h1>
          <p className="mt-2 text-sm text-ink-muted">{error}</p>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper p-6">
        <p className="text-xl font-semibold text-ink">Opening kitchen…</p>
      </div>
    )
  }

  return children
}
