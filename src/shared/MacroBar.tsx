import type { ComponentType, SVGProps } from 'react'
import type { Goals, Nutrition } from '@/domain/types'
import { macroGramsFromGoals, pctOf } from '@/domain/nutrition'
import {
  IconMacroCarbs,
  IconMacroEnergy,
  IconMacroFat,
  IconMacroProtein,
} from '@/shared/icons'

export type MacroRingSize = 'xs' | 'sm' | 'md' | 'lg'

type MacroRow = {
  key: string
  short: string
  value: number
  goal: number
  unit: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

function macroRows(nutrition: Nutrition, goals: Goals): MacroRow[] {
  const macros = macroGramsFromGoals(goals)
  return [
    {
      key: 'Energy',
      short: 'E',
      value: nutrition.energyKcal,
      goal: goals.dailyKcal,
      unit: 'kcal',
      Icon: IconMacroEnergy,
    },
    {
      key: 'Carbs',
      short: 'C',
      value: nutrition.carbsG,
      goal: macros.carbsG,
      unit: 'g',
      Icon: IconMacroCarbs,
    },
    {
      key: 'Protein',
      short: 'P',
      value: nutrition.proteinG,
      goal: macros.proteinG,
      unit: 'g',
      Icon: IconMacroProtein,
    },
    {
      key: 'Fat',
      short: 'F',
      value: nutrition.fatG,
      goal: macros.fatG,
      unit: 'g',
      Icon: IconMacroFat,
    },
  ]
}

const SIZE = {
  xs: { px: 22, stroke: 2.5, label: 'text-[8px] font-bold leading-none', showIcon: true },
  sm: { px: 32, stroke: 3, label: 'text-[9px] font-bold leading-none', showIcon: true },
  md: { px: 48, stroke: 3.5, label: 'text-[10px] font-semibold', showIcon: false },
  lg: { px: 76, stroke: 5, label: 'text-xs font-semibold', showIcon: false },
} as const

function MacroRingGauge({
  row,
  size,
}: {
  row: MacroRow
  size: MacroRingSize
}) {
  const cfg = SIZE[size]
  const pct = pctOf(row.value, row.goal)
  const over = row.goal > 0 && row.value > row.goal
  const r = 15.5
  const c = 2 * Math.PI * r
  const fill = Math.min(1, pct / 100)
  const dash = `${fill * c} ${c}`
  const stroke = over ? 'var(--color-warn)' : 'var(--color-lacquer)'
  const pctLabel = `${Math.min(999, Math.round(pct))}`
  const Glyph = row.Icon

  const ring = (
    <div className="relative shrink-0" style={{ width: cfg.px, height: cfg.px }}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={cfg.stroke}
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={dash}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {size === 'xs' || size === 'sm' ? (
          <span className={`${cfg.label} tabular-nums ${over ? 'text-warn' : 'text-ink'}`}>
            {pctLabel}
          </span>
        ) : size === 'md' ? (
          <span className={`text-[10px] font-semibold tabular-nums ${over ? 'text-warn' : 'text-ink'}`}>
            {pctLabel}%
          </span>
        ) : (
          <span className={`text-sm font-semibold tabular-nums ${over ? 'text-warn' : 'text-ink'}`}>
            {Math.round(row.value)}
          </span>
        )}
      </div>
    </div>
  )

  return (
    <div
      className={
        cfg.showIcon
          ? 'flex items-center gap-0.5'
          : 'flex flex-col items-center gap-0.5'
      }
      title={`${row.key}: ${Math.round(row.value)}${row.unit} / ${Math.round(row.goal)}${row.unit}${
        over ? ` (+${Math.round(row.value - row.goal)})` : ''
      }`}
    >
      {cfg.showIcon ? (
        <Glyph
          className={`h-3 w-3 shrink-0 ${over ? 'text-warn' : 'text-ink-muted'}`}
          aria-hidden
        />
      ) : null}
      {ring}
      {size === 'lg' ? (
        <p className={`text-center text-[11px] tabular-nums ${over ? 'text-warn' : 'text-ink-muted'}`}>
          <span className="font-medium text-ink">{row.key}</span>
          <br />
          {Math.round(row.value)}/{Math.round(row.goal)}
          {over ? ` · over` : ''}
        </p>
      ) : size === 'md' ? (
        <p className={`text-[10px] ${over ? 'text-warn' : 'text-ink-muted'}`}>{row.short}</p>
      ) : null}
    </div>
  )
}

/**
 * Four circular gauges (Energy / Carbs / Protein / Fat) vs daily goals.
 * - `xs` — inline day header (icon + % in ring)
 * - `sm` — compact row
 * - `md` — section headers
 * - `lg` — planner / dashboard
 */
export function MacroRings({
  nutrition,
  goals,
  size = 'md',
  caption,
  className = '',
}: {
  nutrition: Nutrition
  goals: Goals
  size?: MacroRingSize
  caption?: string
  className?: string
}) {
  const rows = macroRows(nutrition, goals)
  const gap =
    size === 'lg' ? 'gap-4 sm:gap-6' : size === 'md' ? 'gap-3' : size === 'xs' ? 'gap-1.5' : 'gap-2'

  return (
    <div className={className}>
      {caption ? <p className="mb-2 text-xs text-ink-muted">{caption}</p> : null}
      <div
        className={`flex items-center ${size === 'xs' ? 'justify-end' : 'justify-between'} ${gap}`}
        role="group"
        aria-label="Macros vs goals"
      >
        {rows.map((row) => (
          <MacroRingGauge key={row.key} row={row} size={size} />
        ))}
      </div>
    </div>
  )
}

/** Thin alias — existing call sites get large rings. */
export function MacroBar({
  nutrition,
  goals,
  compact = false,
  goalCaption = 'of daily target',
}: {
  nutrition: Nutrition
  goals: Goals
  compact?: boolean
  goalCaption?: string
}) {
  return (
    <MacroRings
      nutrition={nutrition}
      goals={goals}
      size={compact ? 'md' : 'lg'}
      caption={goalCaption || undefined}
    />
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
  goalKcal?: number
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
