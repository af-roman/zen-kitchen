import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { Goals } from '@/domain/types'
import { Button, Field, PageHeader, inputClass } from '@/shared/ui'
import { MacroBar } from '@/shared/MacroBar'
import { emptyNutrition } from '@/domain/nutrition'

export function GoalsPage() {
  const goals = useLiveQuery(() => db.goals.get(1))
  const [saved, setSaved] = useState(false)

  if (!goals) return null

  async function save(next: Goals) {
    const total = next.carbsPct + next.proteinPct + next.fatPct
    if (total !== 100) {
      alert('Macro percentages must add up to 100.')
      return
    }
    await db.goals.put(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div>
      <PageHeader
        title="Kitchen goals"
        subtitle="Daily energy and macro balance — every dish is compared to these."
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          void save({
            id: 1,
            dailyKcal: Number(fd.get('dailyKcal')),
            carbsPct: Number(fd.get('carbsPct')),
            proteinPct: Number(fd.get('proteinPct')),
            fatPct: Number(fd.get('fatPct')),
          })
        }}
      >
        <Field label="Daily energy (kcal)">
          <input
            className={inputClass}
            name="dailyKcal"
            type="number"
            min={800}
            max={6000}
            defaultValue={goals.dailyKcal}
            required
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Carbs %">
            <input
              className={inputClass}
              name="carbsPct"
              type="number"
              min={0}
              max={100}
              defaultValue={goals.carbsPct}
              required
            />
          </Field>
          <Field label="Protein %">
            <input
              className={inputClass}
              name="proteinPct"
              type="number"
              min={0}
              max={100}
              defaultValue={goals.proteinPct}
              required
            />
          </Field>
          <Field label="Fat %">
            <input
              className={inputClass}
              name="fatPct"
              type="number"
              min={0}
              max={100}
              defaultValue={goals.fatPct}
              required
            />
          </Field>
        </div>
        <div className="rounded-[var(--radius-card)] border border-line bg-paper-elevated p-4">
          <p className="mb-3 text-sm text-ink-muted">Preview vs a full day at goal</p>
          <MacroBar
            goals={goals}
            nutrition={{
              ...emptyNutrition(),
              energyKcal: goals.dailyKcal,
              carbsG: (goals.dailyKcal * goals.carbsPct) / 100 / 4,
              proteinG: (goals.dailyKcal * goals.proteinPct) / 100 / 4,
              fatG: (goals.dailyKcal * goals.fatPct) / 100 / 9,
            }}
          />
        </div>
        <Button type="submit">{saved ? 'Saved' : 'Save goals'}</Button>
      </form>
    </div>
  )
}
