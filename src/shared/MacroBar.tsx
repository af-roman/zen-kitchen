import type { ComponentType, SVGProps } from 'react'
import type { Goals, Nutrition } from '@/domain/types'
import { macroGramsFromGoals, pctOf } from '@/domain/nutrition'
import {
  IconMacroCarbs,
  IconMacroEnergy,
  IconMacroFat,
  IconMacroProtein,
  IconWarn,
} from '@/shared/icons'

export type MacroRingSize = 'xs' | 'sm' | 'lg'

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
  xs: { px: 32, stroke: 3, label: 'text-[10px] font-bold leading-none', showIcon: true },
  sm: { px: 32, stroke: 3, label: 'text-[9px] font-bold leading-none', showIcon: true },
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
  // Up to one full ring of the normal color, then a second arc for the amount past the target.
  const baseFill = over ? 1 : Math.min(1, Math.max(0, pct / 100))
  const overFill = over ? Math.min(1, (pct - 100) / 100) : 0
  const baseDash = `${baseFill * c} ${c}`
  // Inner arc so the full target ring stays visible and the overflow sits on a second layer.
  const overR = r - cfg.stroke * 0.9
  const overC = 2 * Math.PI * overR
  const overDash = `${overFill * overC} ${overC}`
  const pctLabel = `${Math.min(999, Math.round(pct))}`
  const Glyph = row.Icon

  const fluid = size === 'lg'
  const ring = (
    <div
      className={fluid ? 'relative aspect-square w-full' : 'relative shrink-0'}
      style={fluid ? { maxWidth: cfg.px } : { width: cfg.px, height: cfg.px }}
    >
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
          stroke="var(--color-lacquer)"
          strokeWidth={cfg.stroke}
          strokeLinecap="round"
          strokeDasharray={baseDash}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
        {overFill > 0 ? (
          <circle
            cx="18"
            cy="18"
            r={overR}
            fill="none"
            stroke="var(--color-warn)"
            strokeWidth={Math.max(2, cfg.stroke * 0.72)}
            strokeLinecap="round"
            strokeDasharray={overDash}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`tabular-nums ${over ? 'text-warn' : 'text-ink'} ${
            size === 'lg' ? 'text-sm font-semibold' : cfg.label
          }`}
        >
          {pctLabel}
        </span>
      </div>
    </div>
  )

  return (
    <div
      className={
        cfg.showIcon
          ? 'flex min-w-0 items-center gap-1'
          : 'flex min-w-0 w-full flex-col items-center gap-0.5'
      }
      title={`${row.key}: ${Math.round(row.value)}${row.unit} / ${Math.round(row.goal)}${row.unit}${
        over ? ` (+${Math.round(row.value - row.goal)})` : ''
      }`}
    >
      {cfg.showIcon ? (
        <Glyph
          className={`h-4 w-4 shrink-0 ${over ? 'text-warn' : 'text-ink-muted'}`}
          strokeWidth={2.25}
          aria-hidden
        />
      ) : null}
      {ring}
      {size === 'lg' ? (
        <p className="max-w-full text-center text-[11px] leading-tight tabular-nums text-ink-muted">
          <span className="font-medium text-ink">{row.key}</span>
          <br />
          <span className="inline-flex items-center justify-center gap-1">
            {Math.round(row.value)}/{Math.round(row.goal)}
            {over ? <IconWarn className="h-3 w-3 text-warn" title="Over target" /> : null}
          </span>
        </p>
      ) : null}
    </div>
  )
}

/**
 * Four circular gauges (Energy / Carbs / Protein / Fat) vs daily goals.
 * - `xs` — inline day header (icon + number in ring)
 * - `sm` — compact row
 * - `lg` — planner / dashboard
 */
export function MacroRings({
  nutrition,
  goals,
  size = 'lg',
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
  const gap = size === 'lg' ? 'gap-4 sm:gap-6' : size === 'xs' ? 'gap-1.5' : 'gap-2'

  return (
    <div className={className}>
      {caption ? <p className="mb-2 text-xs text-ink-muted">{caption}</p> : null}
      <div
        className={
          size === 'lg'
            ? 'grid w-full grid-cols-4 gap-2 sm:gap-4'
            : `flex w-full min-w-0 flex-nowrap items-center ${size === 'xs' ? 'justify-end' : 'justify-between'} ${gap}`
        }
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
  goalCaption = 'of daily target',
}: {
  nutrition: Nutrition
  goals: Goals
  goalCaption?: string
}) {
  return (
    <MacroRings
      nutrition={nutrition}
      goals={goals}
      size="lg"
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
