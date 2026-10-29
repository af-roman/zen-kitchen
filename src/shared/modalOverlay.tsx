import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Full-screen dim layer. The panel sits above the dismiss control so taps land on it. */
export function ModalOverlay({
  onDismiss,
  zClass = 'z-50',
  children,
}: {
  onDismiss: () => void
  zClass?: string
  children: ReactNode
}) {
  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] touch-manipulation`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-ink/40" />
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-pointer"
        onClick={onDismiss}
      />
      {children}
    </div>,
    document.body,
  )
}
