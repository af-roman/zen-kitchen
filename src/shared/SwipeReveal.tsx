import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { IconTrash } from '@/shared/icons'

const ACTION_PX = 56

/**
 * Slides a row left to reveal a trailing action.
 * Touch: swipe left. Fine pointer: hover. A quiet control stays tappable
 * without either gesture, and the action stays in the tab order.
 */
export function SwipeReveal({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode
  actionLabel: string
  onAction: () => void
}) {
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [fineHover, setFineHover] = useState(false)
  const drag = useRef<{
    id: number
    x: number
    y: number
    start: number
    axis: 'x' | 'y' | null
  } | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setFineHover(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const revealed = open || focused || (fineHover && hovering)
  const translate = dragging ? offset : revealed ? -ACTION_PX : 0

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('[data-reveal-action]')) return
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: revealed ? -ACTION_PX : 0,
      axis: null,
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (current.axis === 'y') {
        drag.current = null
        return
      }
      setDragging(true)
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // A pointer that is already gone should not cancel the swipe.
      }
    }
    if (current.axis !== 'x') return
    const next = Math.min(0, Math.max(-ACTION_PX - 24, current.start + dx))
    setOffset(next)
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    drag.current = null
    if (!current || current.axis !== 'x') {
      setDragging(false)
      return
    }
    const dx = event.clientX - current.x
    const next = current.start + dx
    const shouldOpen = next < -ACTION_PX / 2
    suppressClick.current = Math.abs(dx) > 8
    setOpen(shouldOpen)
    setOffset(shouldOpen ? -ACTION_PX : 0)
    setDragging(false)
  }

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-card)] touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false)
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (open && !(event.target as HTMLElement).closest('[data-reveal-action]')) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          setOffset(0)
        }
      }}
    >
      <div
        className={`relative z-10 ${dragging ? '' : 'transition-transform duration-200 ease-out'}`}
        style={{ transform: `translateX(${translate}px)` }}
      >
        {children}
        <button
          type="button"
          data-reveal-action
          aria-label={actionLabel}
          title={actionLabel}
          tabIndex={revealed ? -1 : 0}
          className={`absolute top-1.5 right-1.5 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-muted/80 transition hover:bg-danger/10 hover:text-danger ${
            revealed ? 'pointer-events-none opacity-0' : ''
          }`}
          onClick={(event) => {
            event.stopPropagation()
            onAction()
          }}
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
      </div>
      <button
        type="button"
        data-reveal-action
        aria-label={actionLabel}
        title={actionLabel}
        className="absolute top-1/2 right-2 z-0 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-danger"
        onClick={onAction}
      >
        <IconTrash className="h-5 w-5" />
      </button>
    </div>
  )
}
