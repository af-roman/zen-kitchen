import { useEffect } from 'react'

const ALLOW = '[data-scroll-lock-allow]'

type SavedScroll = {
  htmlOverflow: string
  bodyOverflow: string
  htmlOverscroll: string
  bodyOverscroll: string
}

let locks = 0
let saved: SavedScroll | null = null

function onTouchMove(event: TouchEvent) {
  const target = event.target
  if (target instanceof Element && target.closest(ALLOW)) return
  if (event.cancelable) event.preventDefault()
}

/**
 * Stop the page behind a modal from scrolling. Nested locks share one lock.
 *
 * Do not set `position: fixed` on the body. On iOS that shifts the visual
 * viewport and the modal stops receiving taps, so Close never fires.
 */
export function lockBodyScroll(): () => void {
  if (locks === 0) {
    const html = document.documentElement
    const body = document.body
    saved = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'
    document.addEventListener('touchmove', onTouchMove, { passive: false })
  }
  locks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks > 0 || !saved) return
    const html = document.documentElement
    const body = document.body
    html.style.overflow = saved.htmlOverflow
    body.style.overflow = saved.bodyOverflow
    html.style.overscrollBehavior = saved.htmlOverscroll
    body.style.overscrollBehavior = saved.bodyOverscroll
    saved = null
    document.removeEventListener('touchmove', onTouchMove)
  }
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    return lockBodyScroll()
  }, [active])
}
