import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, parseISO } from 'date-fns'
import { db } from '@/db/database'
import { Badge, Button, Field, AutoTextarea } from '@/shared/ui'
import { Sheet } from '@/shared/Sheet'
import { MacroInline } from '@/shared/MacroBar'

/** Past cooking sessions, filtered to the logbook window when dates are passed. */
export function CookLogList({ from, to }: { from?: string; to?: string }) {
  const logs =
    (useLiveQuery(() => db.cookLog.orderBy('date').reverse().toArray(), []) ?? []).filter(
      (log) => (from == null || log.date >= from) && (to == null || log.date <= to),
    )
  const [openId, setOpenId] = useState<number | null>(null)
  const entry = logs.find((l) => l.id === openId)
  const [notes, setNotes] = useState('')

  return (
    <div>
      {logs.length === 0 ? (
        <p className="text-sm text-ink-muted">No finished cooks in this window.</p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li key={log.id}>
              <button
                type="button"
                className="w-full card-elevated px-3 py-3 text-left"
                onClick={() => {
                  setOpenId(log.id!)
                  setNotes(log.notes)
                }}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {format(parseISO(log.date), 'd MMM yyyy')}
                  </span>
                  <Badge>{log.dishes.length} dishes</Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {log.dishes.map((d) => d.recipeName).join(' · ')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={openId !== null}
        title="Session detail"
        onClose={() => setOpenId(null)}
        wide
      >
        {entry ? (
          <div className="space-y-4">
            {entry.dishes.map((d, idx) => (
              <div key={idx} className="rounded-lg border border-line p-3">
                <div className="font-medium">
                  {d.recipeName} · ×{d.portions}
                </div>
                <div className="mt-1">
                  <MacroInline nutrition={d.nutritionPerPortion} />
                  <span className="text-xs text-ink-muted"> / unit</span>
                </div>
                <ul className="mt-2 text-sm text-ink-muted">
                  {d.usage.map((u, i) => (
                    <li key={i}>
                      {u.ingredientName}: {u.amountUsed} {u.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <Field label="Notes (editable)">
              <AutoTextarea minRows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Button
              className="w-full"
              onClick={async () => {
                await db.cookLog.update(entry.id!, { notes })
                const session = await db.cookingSessions.get(entry.sessionId)
                if (session) await db.cookingSessions.update(session.id!, { notes })
                setOpenId(null)
              }}
            >
              Save notes
            </Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
