import type { ReactNode } from 'react'

const DISH_COLOR_CLASS = [
  'bg-lacquer',
  'bg-ok',
  'bg-warn',
  'bg-ink',
  'bg-lacquer-deep',
] as const

export function dishColorClass(index: number): string {
  return DISH_COLOR_CLASS[index % DISH_COLOR_CLASS.length]
}

export type MealSegment = {
  key: string
  label: string
  kcal: number
  colorClass: string
}

/** One meal as a single bar, each dish a segment sized by calories. */
export function MealStack({
  segments,
  className = '',
}: {
  segments: MealSegment[]
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.kcal), 0)
  const label =
    total <= 0
      ? 'No calories in this meal'
      : segments
          .filter((segment) => segment.kcal > 0)
          .map((segment) => `${segment.label} ${Math.round(segment.kcal)} kcal`)
          .join(', ')
  return (
    <div
      className={`flex h-2 overflow-hidden rounded-full bg-line ${className}`}
      role="img"
      aria-label={label}
    >
      {total > 0
        ? segments.map((segment) =>
            segment.kcal > 0 ? (
              <div
                key={segment.key}
                className={`h-full ${segment.colorClass}`}
                style={{ width: `${(segment.kcal / total) * 100}%` }}
                title={`${segment.label}: ${Math.round(segment.kcal)} kcal`}
              />
            ) : null,
          )
        : null}
    </div>
  )
}

/** Names the colors in a MealStack. `note` sits beside the dish name (badges). */
export function MealShareLegend({
  segments,
  note,
}: {
  segments: MealSegment[]
  note?: (index: number) => ReactNode
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.kcal), 0)
  if (segments.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {segments.map((segment, index) => {
        const kcal = Math.max(0, segment.kcal)
        const share = total > 0 ? Math.round((kcal / total) * 100) : 0
        return (
          <li key={segment.key} className="flex items-center gap-2 text-xs">
            <i className={`h-2 w-2 shrink-0 rounded-full ${segment.colorClass}`} aria-hidden />
            <span className="min-w-0 flex-1 text-ink">{segment.label}</span>
            {note ? <span className="shrink-0">{note(index)}</span> : null}
            <span className="shrink-0 tabular-nums text-ink-muted">
              {Math.round(kcal)} kcal{total > 0 ? ` · ${share}%` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
