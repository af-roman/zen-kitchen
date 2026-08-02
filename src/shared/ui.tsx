import type { ReactNode, TextareaHTMLAttributes } from 'react'
import { useEffect, useRef } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl text-accent-deep sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  className = '',
  disabled,
  onClick,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
  onClick?: () => void
}) {
  const styles = {
    primary: 'bg-accent-deep text-paper-elevated hover:bg-ink',
    secondary: 'bg-paper border border-line text-ink hover:border-accent',
    ghost: 'bg-transparent text-ink-muted hover:text-ink',
    danger: 'bg-danger/10 text-danger hover:bg-danger/15',
  }[variant]
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Consistent remove control.
 * - `icon`: trailing control on a list row (stretch with `h-full` next to inputs).
 * - text (default): labeled control at the foot of a card/section.
 */
export function RemoveButton({
  onClick,
  label = 'Remove',
  icon = false,
  disabled,
  className = '',
}: {
  onClick?: () => void
  label?: string
  icon?: boolean
  disabled?: boolean
  className?: string
}) {
  if (icon) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40 ${className}`}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    )
  }
  return (
    <Button
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className={`text-danger hover:bg-danger/10 hover:text-danger ${className}`}
    >
      {label}
    </Button>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-muted/80">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-line bg-paper-elevated px-3 py-2 text-base text-ink outline-none transition focus:border-accent'

/** Textarea that grows with its content. */
export function AutoTextarea({
  className = '',
  value,
  onChange,
  minRows = 2,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function resize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = 24
    const min = minRows * line + 16
    el.style.height = `${Math.max(min, el.scrollHeight)}px`
  }

  useEffect(() => {
    resize()
  }, [value, minRows])

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        requestAnimationFrame(resize)
      }}
      className={`${inputClass} resize-none overflow-hidden ${className}`}
    />
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'warn' | 'ok' | 'accent'
}) {
  const tones = {
    neutral: 'bg-line/50 text-ink-muted',
    warn: 'bg-warn/15 text-warn',
    ok: 'bg-ok/15 text-ok',
    accent: 'bg-accent/15 text-accent-deep',
  }[tone]
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones}`}>
      {children}
    </span>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-lg text-accent-deep">{title}</p>
      {body ? <p className="mt-2 text-sm text-ink-muted">{body}</p> : null}
    </div>
  )
}

export function WarnBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
      {children}
    </div>
  )
}

/** Segmented filter control (e.g. All / Dishes / Prep). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={`flex rounded-lg border border-line bg-paper-elevated p-0.5 ${className}`}
      role="group"
    >
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-accent-deep text-paper-elevated shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
