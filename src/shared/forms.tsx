import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import { Sheet } from '@/shared/Sheet'
import { Button, inputClass } from '@/shared/ui'
import { formatAmount, isPartialAmount, parseAmountInput } from '@/domain/amountInput'

export type SelectOption<T extends string | number = string> = {
  id: T
  label: string
  detail?: string
  disabled?: boolean
}

/** Native `<select>` replacement — opens a sheet of options. */
export function SelectField<T extends string | number = string>({
  value,
  options,
  onChange,
  title = 'Choose',
  placeholder = 'Choose…',
  className = '',
  disabled,
  compact,
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  title?: string
  placeholder?: string
  className?: string
  disabled?: boolean
  /** Smaller trigger for dense rows */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left disabled:opacity-40 ${
          compact ? 'px-2.5 py-1.5 text-sm' : ''
        } ${className}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${selected ? 'text-ink' : 'text-ink-muted'}`}>
            {selected?.label ?? placeholder}
          </span>
          {selected?.detail ? (
            <span className="block truncate text-xs font-normal text-ink-muted">{selected.detail}</span>
          ) : null}
        </span>
        <ChevronDown className="shrink-0 text-ink-muted" />
      </button>
      <Sheet open={open} title={title} onClose={() => setOpen(false)}>
        <ul className="space-y-1">
          {options.map((opt) => {
            const active = opt.id === value
            return (
              <li key={String(opt.id)}>
                <button
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onChange(opt.id)
                    setOpen(false)
                  }}
                  className={`flex w-full flex-col rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-40 ${
                    active
                      ? 'border-ink/40 bg-ink/5 text-ink'
                      : 'border-line bg-paper hover:border-ink/30'
                  }`}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  {opt.detail ? (
                    <span className="text-xs text-ink-muted">{opt.detail}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>
    </>
  )
}

/** Custom checkbox matching paper / accent styling. */
export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  className = '',
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  hint?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group flex items-start gap-2.5 text-left disabled:opacity-40 ${className}`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          checked
            ? 'border-ink bg-ink text-paper-elevated'
            : 'border-line bg-paper-elevated group-hover:border-ink/40'
        }`}
        aria-hidden
      >
        {checked ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {label != null || hint ? (
        <span className="min-w-0">
          {label != null ? (
            <span className="block text-sm font-medium text-ink">{label}</span>
          ) : null}
          {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
        </span>
      ) : null}
    </button>
  )
}

function decimalPlaces(step: number): number {
  if (!(step > 0) || step >= 1) return 0
  const text = step.toString()
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : Math.min(3, text.length - dot - 1)
}

/** Allow a decimal, or a fraction such as 1/2 and 1 1/2, while it is being typed. */
function amountDraftOk(raw: string, decimals: number, fractions: boolean): boolean {
  const text = raw.trim()
  if (text === '') return true
  const decimal = decimals > 0 ? `^\\d*\\.?\\d{0,${decimals}}$` : '^\\d*$'
  if (new RegExp(decimal).test(text)) return true
  if (!fractions) return false
  return (
    /^\d+\/$/.test(text) ||
    /^\d+\/\d+$/.test(text) ||
    /^\d+\s+\d*$/.test(text) ||
    /^\d+\s+\d+\/$/.test(text) ||
    /^\d+\s+\d+\/\d+$/.test(text) ||
    /^[⅛¼⅓⅜½⅝⅔¾⅞]$/.test(text) ||
    /^\d+\s*[⅛¼⅓⅜½⅝⅔¾⅞]$/.test(text)
  )
}

/** Number field with − / + steppers (no native spinner). */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  fractions = false,
  className = '',
  disabled,
  inputMode = 'decimal',
  compact = false,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Accept 1/2, 1 1/4, and show values that way. For spoons and pieces. */
  fractions?: boolean
  className?: string
  disabled?: boolean
  inputMode?: 'decimal' | 'numeric'
  /** Narrow control: the value box fits a short number, not a full-width field. */
  compact?: boolean
}) {
  const decimals = decimalPlaces(step)
  const [draft, setDraft] = useState<string | null>(null)
  const focused = useRef(false)

  function clamp(n: number) {
    let next = n
    if (min != null && next < min) next = min
    if (max != null && next > max) next = max
    return next
  }

  function roundToStep(n: number) {
    const factor = 10 ** decimals
    return Math.round(n * factor) / factor
  }

  function formatValue(n: number) {
    if (!Number.isFinite(n)) return ''
    return formatAmount(roundToStep(n), fractions, decimals)
  }

  useEffect(() => {
    if (!focused.current) setDraft(null)
  }, [value])

  function commit(raw: string) {
    const trimmed = raw.trim()
    if (trimmed === '') {
      onChange(clamp(min ?? 0))
      return
    }
    if (isPartialAmount(trimmed)) return
    const n = parseAmountInput(trimmed)
    if (n == null) return
    onChange(clamp(roundToStep(n)))
  }

  function bump(delta: number) {
    const raw = Number.isFinite(value) ? value : 0
    const next = clamp(Math.round((raw + delta) / step) * step)
    const rounded = roundToStep(next)
    setDraft(null)
    onChange(rounded)
  }

  const shown = draft ?? (Number.isFinite(value) ? formatValue(value) : '')

  const buttonClass = compact
    ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-paper text-base text-ink transition hover:border-ink/40 disabled:opacity-40'
    : 'inline-flex w-12 shrink-0 items-center justify-center self-stretch rounded-2xl border border-line bg-paper text-lg text-ink transition hover:border-ink/40 disabled:opacity-40'

  return (
    <div
      className={`flex items-stretch ${compact ? 'w-auto shrink-0 gap-1' : 'w-full min-w-0 gap-1.5'} ${className}`}
    >
      <button
        type="button"
        aria-label="Decrease"
        disabled={disabled || (min != null && value <= min)}
        onClick={() => bump(-step)}
        className={buttonClass}
      >
        −
      </button>
      <input
        className={
          compact
            ? `${inputClass} h-8 !w-10 shrink-0 !px-0 text-center text-sm tabular-nums`
            : `${inputClass} min-w-[4.5rem] flex-1 basis-[4.5rem] px-2 text-center tabular-nums`
        }
        size={compact ? 3 : 8}
        type="text"
        inputMode={fractions ? 'text' : inputMode}
        disabled={disabled}
        value={shown}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          setDraft(null)
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/,/g, '.')
          if (raw !== '' && !amountDraftOk(raw, decimals, fractions)) return
          setDraft(raw)
          commit(raw)
        }}
      />
      <button
        type="button"
        aria-label="Increase"
        disabled={disabled || (max != null && value >= max)}
        onClick={() => bump(step)}
        className={buttonClass}
      >
        +
      </button>
    </div>
  )
}

/** Date field — button + calendar sheet (no native date picker chrome). */
export function DateField({
  value,
  onChange,
  min,
  max,
  className = '',
  disabled,
  title = 'Pick a date',
  allowEmpty = false,
  emptyLabel = 'No date',
}: {
  /** `yyyy-MM-dd`, or empty string when `allowEmpty` */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  className?: string
  disabled?: boolean
  title?: string
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => {
    if (!value) return null
    try {
      return parseISO(value)
    } catch {
      return null
    }
  }, [value])
  const [month, setMonth] = useState(startOfMonth(selected ?? new Date()))

  useEffect(() => {
    if (open) setMonth(startOfMonth(selected ?? new Date()))
  }, [open, selected])

  const minDate = min ? parseISO(min) : null
  const maxDate = max ? parseISO(max) : null

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start, end })
    const rows: Date[][] = []
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))
    return rows
  }, [month])

  const label = selected ? format(selected, 'EEE d MMM yyyy') : emptyLabel

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`${inputClass} flex items-center justify-between gap-2 text-left disabled:opacity-40 ${className}`}
      >
        <span className={selected ? 'text-ink' : 'text-ink-muted'}>{label}</span>
        <ChevronDown className="shrink-0 text-ink-muted" />
      </button>
      <Sheet open={open} title={title} onClose={() => setOpen(false)}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            className="!px-2.5"
            onClick={() => setMonth(startOfMonth(addDays(month, -15)))}
          >
            ←
          </Button>
          <span className="font-display text-lg text-ink">
            {format(month, 'MMMM yyyy')}
          </span>
          <Button
            variant="secondary"
            className="!px-2.5"
            onClick={() => setMonth(startOfMonth(addDays(endOfMonth(month), 1)))}
          >
            →
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="!py-1.5 !text-xs"
            onClick={() => {
              onChange(format(new Date(), 'yyyy-MM-dd'))
              setOpen(false)
            }}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            className="!py-1.5 !text-xs"
            onClick={() => {
              onChange(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
              setOpen(false)
            }}
          >
            Tomorrow
          </Button>
          {allowEmpty ? (
            <Button
              variant="ghost"
              className="!py-1.5 !text-xs"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-muted">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <div key={d} className="py-1 font-medium">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const iso = format(day, 'yyyy-MM-dd')
                const inMonth = isSameMonth(day, month)
                const isSelected = selected ? isSameDay(day, selected) : false
                const tooEarly = minDate ? day < minDate && !isSameDay(day, minDate) : false
                const tooLate = maxDate ? day > maxDate && !isSameDay(day, maxDate) : false
                const disabledDay = tooEarly || tooLate
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabledDay}
                    onClick={() => {
                      onChange(iso)
                      setOpen(false)
                    }}
                    className={`rounded-lg py-2 text-sm transition disabled:opacity-30 ${
                      isSelected
                        ? 'bg-ink text-paper-elevated'
                        : inMonth
                          ? 'text-ink hover:bg-ink/10'
                          : 'text-ink-muted/50 hover:bg-line/40'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </Sheet>
    </>
  )
}

function ChevronDown({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-4 w-4 ${className}`} fill="none" aria-hidden>
      <path
        d="M5 8l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
