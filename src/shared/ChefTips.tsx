import { recipeTips } from '@/domain/recipeMath'

export function ChefTipsPanel({
  recipe,
  className = 'mb-5',
}: {
  recipe: { tips?: string[]; tip?: string }
  className?: string
}) {
  const tips = recipeTips(recipe)
  if (tips.length === 0) return null

  const label =
    tips.length === 1 ? 'Chef’s tip' : `Chef’s tips (${tips.length})`

  return (
    <details
      className={`group rounded-[var(--radius-card)] border border-accent/25 bg-accent/5 ${className}`}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-accent-deep marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>{label}</span>
          <span className="text-xs font-normal text-ink-muted group-open:hidden">Show</span>
          <span className="hidden text-xs font-normal text-ink-muted group-open:inline">
            Hide
          </span>
        </span>
      </summary>
      <ul className="space-y-2 border-t border-accent/15 px-3 py-3">
        {tips.map((tip, idx) => (
          <li key={idx} className="text-sm italic text-accent-deep">
            {tips.length > 1 ? (
              <span className="mr-1.5 not-italic text-ink-muted">{idx + 1}.</span>
            ) : null}
            {tip}
          </li>
        ))}
      </ul>
    </details>
  )
}
