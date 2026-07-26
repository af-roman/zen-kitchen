import type { Goals, Nutrition } from '@/domain/types'
import { macroGramsFromGoals, pctOf } from '@/domain/nutrition'

export function MacroBar({
  nutrition,
  goals,
  compact = false,
  /** Clarifies that bars are vs daily goals (e.g. on a single meal). */
  goalCaption = 'of daily target',
}: {
  nutrition: Nutrition
  goals: Goals
  compact?: boolean
  goalCaption?: string
}) {
  const macros = macroGramsFromGoals(goals)
  const rows = [
    { key: 'Energy', value: nutrition.energyKcal, goal: goals.dailyKcal, unit: 'kcal' },
    { key: 'Carbs', value: nutrition.carbsG, goal: macros.carbsG, unit: 'g' },
    { key: 'Protein', value: nutrition.proteinG, goal: macros.proteinG, unit: 'g' },
    { key: 'Fat', value: nutrition.fatG, goal: macros.fatG, unit: 'g' },
  ]

  return (
    <div className={`space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      {goalCaption ? (
        <p className="text-xs text-ink-muted">{goalCaption}</p>
      ) : null}
      {rows.map((row) => {
        const pct = pctOf(row.value, row.goal)
        const over = row.goal > 0 && row.value > row.goal
        const overBy = over ? Math.round(row.value - row.goal) : 0
        return (
          <div key={row.key}>
            <div
              className={`mb-1 flex justify-between gap-2 ${over ? 'font-medium text-warn' : 'text-ink-muted'}`}
            >
              <span className="flex items-center gap-1.5">
                {row.key}
                {over ? (
                  <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    over
                  </span>
                ) : null}
              </span>
              <span>
                {Math.round(row.value)}
                {row.unit} / {Math.round(row.goal)}
                {row.unit}
                {over ? ` (+${overBy})` : ''}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line/70">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  over ? 'bg-warn' : 'bg-accent'
                }`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MacroInlinePart({
  text,
  value,
  goal,
}: {
  text: string
  value: number
  goal?: number
}) {
  const over = goal != null && goal > 0 && value > goal
  return (
    <span className={over ? 'font-medium text-warn' : undefined}>
      {text}
      {over ? ` (+${Math.round(value - goal)})` : ''}
    </span>
  )
}

export function MacroInline({
  nutrition,
  goalKcal,
  goals,
}: {
  nutrition: Nutrition
  /** Prefer `goals` — still highlights energy when over */
  goalKcal?: number
  /** When set, each macro over its daily goal is highlighted */
  goals?: Goals
}) {
  const macros = goals ? macroGramsFromGoals(goals) : null
  const energyGoal = goals?.dailyKcal ?? goalKcal

  return (
    <span className="text-xs text-ink-muted">
      <MacroInlinePart
        text={`${Math.round(nutrition.energyKcal)} kcal`}
        value={nutrition.energyKcal}
        goal={energyGoal}
      />
      {' · '}
      <MacroInlinePart text={`C ${nutrition.carbsG}`} value={nutrition.carbsG} goal={macros?.carbsG} />
      {' · '}
      <MacroInlinePart
        text={`P ${nutrition.proteinG}`}
        value={nutrition.proteinG}
        goal={macros?.proteinG}
      />
      {' · '}
      <MacroInlinePart text={`F ${nutrition.fatG}`} value={nutrition.fatG} goal={macros?.fatG} />
    </span>
  )
}
