import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { Goals } from '@/domain/types'
import { appAlert } from '@/shared/dialog'
import { NumberField } from '@/shared/forms'
import { Button, Field, PageHeader } from '@/shared/ui'
import { MacroBar } from '@/shared/MacroBar'
import { emptyNutrition } from '@/domain/nutrition'

export function GoalsPage() {
  const navigate = useNavigate()
  const goals = useLiveQuery(() => db.goals.get(1))
  const [draft, setDraft] = useState<Goals | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (goals) setDraft(goals)
  }, [goals])

  if (!goals || !draft) return null

  async function save() {
    const next = draft!
    const total = next.carbsPct + next.proteinPct + next.fatPct
    if (total !== 100) {
      await appAlert('Macro percentages must add up to 100.', { title: 'Cannot save' })
      return
    }
    await db.goals.put(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div>
      <PageHeader
        title="Goals"
        subtitle="Daily energy and macro balance — every dish is compared to these."
        actions={
          <Button variant="secondary" onClick={() => navigate('/more')}>
            Back
          </Button>
        }
      />
      <div className="space-y-4">
        <Field label="Daily energy (kcal)">
          <NumberField
            value={draft.dailyKcal}
            min={800}
            max={6000}
            step={50}
            inputMode="numeric"
            onChange={(dailyKcal) => setDraft({ ...draft, dailyKcal })}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Carbs %">
            <NumberField
              value={draft.carbsPct}
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              onChange={(carbsPct) => setDraft({ ...draft, carbsPct })}
            />
          </Field>
          <Field label="Protein %">
            <NumberField
              value={draft.proteinPct}
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              onChange={(proteinPct) => setDraft({ ...draft, proteinPct })}
            />
          </Field>
          <Field label="Fat %">
            <NumberField
              value={draft.fatPct}
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              onChange={(fatPct) => setDraft({ ...draft, fatPct })}
            />
          </Field>
        </div>
        <div className="card-elevated p-4">
          <p className="mb-3 text-sm text-ink-muted">Preview vs a full day at goal</p>
          <MacroBar
            goals={draft}
            nutrition={{
              ...emptyNutrition(),
              energyKcal: draft.dailyKcal,
              carbsG: (draft.dailyKcal * draft.carbsPct) / 100 / 4,
              proteinG: (draft.dailyKcal * draft.proteinPct) / 100 / 4,
              fatG: (draft.dailyKcal * draft.fatPct) / 100 / 9,
            }}
          />
        </div>
        <Button onClick={() => void save()}>{saved ? 'Saved' : 'Save goals'}</Button>
      </div>
    </div>
  )
}
