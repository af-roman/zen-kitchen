import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { ModalOverlay } from './modalOverlay'
import { useBodyScrollLock } from './scrollLock'
import { Button } from './ui'

export function Sheet({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <ModalOverlay onDismiss={onClose}>
      <div
        data-scroll-lock-allow
        className={`pointer-events-auto relative z-10 max-h-[min(92dvh,calc(100dvh-2rem))] w-full overflow-y-auto overscroll-contain rounded-[1.75rem] bg-paper-elevated shadow-card ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 z-20 flex items-start justify-between gap-3 bg-paper-elevated px-5 pt-5 pb-3">
          <h2 className="min-w-0 flex-1 break-words text-xl font-semibold text-ink">{title}</h2>
          <Button variant="ghost" className="min-h-11 shrink-0" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </ModalOverlay>
  )
}
