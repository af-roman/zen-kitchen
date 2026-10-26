import { useEffect } from 'react'

type SavedScroll = {
  htmlOverflow: string
  bodyOverflow: string
  bodyPosition: string
  bodyTop: string
  bodyWidth: string
  scrollY: number
}

let locks = 0
let saved: SavedScroll | null = null

/** Stop the page behind a modal from scrolling. Nested locks share one lock. */
export function lockBodyScroll(): () => void {
  if (locks === 0) {
    const html = document.documentElement
    const body = document.body
    saved = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      scrollY: window.scrollY,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${saved.scrollY}px`
    body.style.width = '100%'
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
    const scrollY = saved.scrollY
    html.style.overflow = saved.htmlOverflow
    body.style.overflow = saved.bodyOverflow
    body.style.position = saved.bodyPosition
    body.style.top = saved.bodyTop
    body.style.width = saved.bodyWidth
    saved = null
    window.scrollTo(0, scrollY)
  }
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    return lockBodyScroll()
  }, [active])
}
