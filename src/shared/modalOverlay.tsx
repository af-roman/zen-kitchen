import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalStack } from './modalStack'

/** Full-screen dim layer. The panel sits above the dismiss control so taps land on it. */
export function ModalOverlay({
  onDismiss,
  children,
}: {
  onDismiss: () => void
  children: ReactNode
}) {
  const { zIndex } = useModalStack(true, onDismiss)
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] touch-manipulation"
      style={{ zIndex }}
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
