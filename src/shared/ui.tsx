import type { ReactNode, TextareaHTMLAttributes } from 'react'
import { useEffect, useRef } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** Accent glyph shown beside the title */
  icon?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          {icon ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lacquer/10 text-lacquer">
              {icon}
            </span>
          ) : null}
          <h1 className="min-w-0 break-words text-[1.75rem] leading-tight sm:text-3xl">{title}</h1>
        </div>
        {subtitle ? (
          <p className={`mt-1.5 break-words text-sm text-ink-muted ${icon ? 'pl-14' : ''}`}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
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
    primary:
      'bg-lacquer text-white hover:bg-lacquer-deep shadow-[0_6px_16px_rgba(228,87,46,0.28)]',
    secondary: 'bg-paper-elevated text-ink shadow-card hover:bg-white',
    ghost: 'bg-transparent text-ink-muted hover:bg-ink/5 hover:text-ink',
    danger: 'bg-danger/10 text-danger hover:bg-danger/15',
  }[variant]
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

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
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40 ${className}`}
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
  className = '',
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <label className={`block min-w-0 space-y-1.5 ${className}`}>
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-muted/80">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'box-border w-full min-w-0 max-w-full rounded-2xl border border-line bg-paper-elevated px-4 py-3 text-base text-ink outline-none transition hover:border-ink/20 focus:border-ink focus:ring-2 focus:ring-ink/10'

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
    neutral: 'bg-ink/5 text-ink-muted',
    warn: 'bg-warn/15 text-warn',
    ok: 'bg-ok/12 text-ok',
    accent: 'bg-lacquer/12 text-lacquer-deep',
  }[tone]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones}`}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  body,
  actions,
}: {
  title: string
  body?: string
  actions?: ReactNode
}) {
  return (
    <div className="card-elevated px-6 py-12 text-center">
      <p className="text-xl font-semibold text-ink">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{body}</p> : null}
      {actions ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

export function WarnBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-warn/10 px-4 py-3 text-sm text-warn">{children}</div>
  )
}

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
      className={`flex rounded-full bg-ink/5 p-1 ${className}`}
      role="group"
    >
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-paper-elevated text-ink shadow-sm'
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
