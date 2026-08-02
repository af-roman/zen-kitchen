import { useEffect, useRef, useState } from 'react'
import type { RecipeStep } from '@/domain/types'
import { assetUrl } from '@/shared/assetUrl'
import { Button } from '@/shared/ui'

export type StepGalleryItem = {
  id: string
  description: string
  imageDataUrl: string
}

export function galleryItemsFromSteps(steps: RecipeStep[]): StepGalleryItem[] {
  return steps
    .filter((s): s is RecipeStep & { imageDataUrl: string } => Boolean(s.imageDataUrl?.trim()))
    .map((s) => ({
      id: s.id,
      description: s.description,
      imageDataUrl: s.imageDataUrl,
    }))
}

export function StepImageThumb({
  src,
  onOpen,
  className = '',
}: {
  src: string
  onOpen: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen()
      }}
      className={`shrink-0 overflow-hidden rounded-lg border border-line bg-paper shadow-sm transition hover:border-accent/50 ${className}`}
      aria-label="View step photo"
    >
      <img src={assetUrl(src)} alt="" className="h-full w-full object-cover" />
    </button>
  )
}

export function StepImageGallery({
  items,
  startId,
  open,
  onClose,
}: {
  items: StepGalleryItem[]
  startId: string | null
  open: boolean
  onClose: () => void
}) {
  const startIndex = Math.max(
    0,
    items.findIndex((item) => item.id === startId),
  )
  const [index, setIndex] = useState(startIndex)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    setIndex(Math.max(0, items.findIndex((item) => item.id === startId)))
    // Reset only when opening or changing the starting step — not on every items identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startId])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(items.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, items.length])

  if (!open || items.length === 0) return null

  const item = items[Math.min(index, items.length - 1)]!
  const canPrev = index > 0
  const canNext = index < items.length - 1

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-ink/95 text-paper-elevated"
      role="dialog"
      aria-modal="true"
      aria-label="Step photo gallery"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current
        touchX.current = null
        if (dx > 56) setIndex((i) => Math.max(0, i - 1))
        else if (dx < -56) setIndex((i) => Math.min(items.length - 1, i + 1))
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-sm text-paper-elevated/70">
          {index + 1} / {items.length}
        </p>
        <Button
          variant="ghost"
          className="text-paper-elevated hover:text-white"
          onClick={onClose}
        >
          Close
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <button
          type="button"
          disabled={!canPrev}
          aria-label="Previous step photo"
          className="absolute left-2 z-10 rounded-full bg-paper-elevated/15 px-3 py-2 text-lg text-paper-elevated backdrop-blur-sm transition hover:bg-paper-elevated/25 disabled:opacity-25 sm:left-4"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          ‹
        </button>
        <img
          src={assetUrl(item.imageDataUrl)}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
        <button
          type="button"
          disabled={!canNext}
          aria-label="Next step photo"
          className="absolute right-2 z-10 rounded-full bg-paper-elevated/15 px-3 py-2 text-lg text-paper-elevated backdrop-blur-sm transition hover:bg-paper-elevated/25 disabled:opacity-25 sm:right-4"
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
        >
          ›
        </button>
      </div>

      <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <p className="mx-auto max-w-2xl text-center text-base leading-snug text-paper-elevated">
          {item.description}
        </p>
        <div className="mx-auto flex max-w-sm gap-2">
          <Button
            variant="secondary"
            className="flex-1 border-paper-elevated/20 bg-paper-elevated/10 text-paper-elevated hover:border-paper-elevated/40"
            disabled={!canPrev}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            className="flex-1 border-paper-elevated/20 bg-paper-elevated/10 text-paper-elevated hover:border-paper-elevated/40"
            disabled={!canNext}
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
