import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const base =
    'rounded-[var(--radius-card)] border border-line bg-paper-elevated/90 shadow-[0_1px_0_rgba(42,46,43,0.04)]'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} w-full text-left transition hover:border-accent/40 ${className}`}
      >
        {children}
      </button>
    )
  }
  return <div className={`${base} ${className}`}>{children}</div>
}

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
  'w-full rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent'

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
