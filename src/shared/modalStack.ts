import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

type Entry = {
  id: symbol
  dismiss: () => void
}

let nextZ = 40
const entries: Entry[] = []
const listeners = new Set<() => void>()

function allocZ(): number {
  nextZ += 10
  return nextZ
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function topId(): symbol | undefined {
  return entries[entries.length - 1]?.id
}

/**
 * Paint this overlay above every modal already open.
 * Escape dismisses only the top overlay. Sheets, dialogs, and the photo gallery share the stack.
 */
export function useModalStack(
  active: boolean,
  onDismiss: () => void,
): { zIndex: number; top: boolean } {
  const id = useRef(Symbol('modal'))
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  const [zIndex, setZIndex] = useState(0)

  useLayoutEffect(() => {
    if (!active) return
    const entry: Entry = {
      id: id.current,
      dismiss: () => dismissRef.current(),
    }
    entries.push(entry)
    setZIndex(allocZ())
    emit()

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (entries[entries.length - 1]?.id !== id.current) return
      event.preventDefault()
      entry.dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      const index = entries.findIndex((item) => item.id === id.current)
      if (index >= 0) entries.splice(index, 1)
      window.removeEventListener('keydown', onKey)
      emit()
    }
  }, [active])

  const currentTop = useSyncExternalStore(subscribe, topId, () => undefined)
  return { zIndex, top: active && currentTop === id.current }
}
