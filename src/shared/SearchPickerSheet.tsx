import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Sheet } from './Sheet'
import { EmptyState, inputClass } from './ui'

export type SearchPickerItem<T extends string | number = number> = {
  id: T
  label: string
  /** Shown under the label */
  detail?: string
  /** Extra text included in search (defaults to label + detail) */
  searchText?: string
  /** Optional group key for filter chips */
  group?: string
}

export function SearchPickerSheet<T extends string | number = number>({
  open,
  title,
  items,
  groups,
  selectedId,
  emptyTitle = 'Nothing matches',
  emptyBody = 'Try another search.',
  onClose,
  onSelect,
}: {
  open: boolean
  title: string
  items: SearchPickerItem<T>[]
  /** Optional filter chips: { id, label }. id matches item.group */
  groups?: { id: string; label: string }[]
  selectedId?: T | null
  emptyTitle?: string
  emptyBody?: string
  onClose: () => void
  onSelect: (id: T) => void
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setGroup(null)
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (group && item.group !== group) return false
      if (!q) return true
      const hay = (item.searchText ?? `${item.label} ${item.detail ?? ''}`).toLowerCase()
      return hay.includes(q)
    })
  }, [items, query, group])

  return (
    <Sheet open={open} title={title} onClose={onClose} wide>
      <div className="space-y-3">
        <input
          ref={inputRef}
          className={inputClass}
          type="search"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />

        {groups && groups.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={group == null} onClick={() => setGroup(null)}>
              All
            </FilterChip>
            {groups.map((g) => (
              <FilterChip
                key={g.id}
                active={group === g.id}
                onClick={() => setGroup(group === g.id ? null : g.id)}
              >
                {g.label}
              </FilterChip>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-ink-muted">
          {filtered.length} of {items.length}
        </p>

        {filtered.length === 0 ? (
          <EmptyState title={emptyTitle} body={emptyBody} />
        ) : (
          <ul className="-mx-1 max-h-[55dvh] space-y-1 overflow-y-auto px-1">
            {filtered.map((item) => {
              const selected = selectedId != null && item.id === selectedId
              return (
                <li key={String(item.id)}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item.id)
                      onClose()
                    }}
                    className={`flex w-full flex-col rounded-lg border px-3 py-2.5 text-left transition ${
                      selected
                        ? 'border-accent bg-accent/10'
                        : 'border-line hover:border-accent/40'
                    }`}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.detail ? (
                      <span className="text-xs text-ink-muted">{item.detail}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'bg-accent/20 text-accent-deep'
          : 'bg-line/40 text-ink-muted hover:bg-line/70'
      }`}
    >
      {children}
    </button>
  )
}
