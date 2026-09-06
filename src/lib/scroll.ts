/**
 * Inside the binder the page scrolls, not the window: the leather, rings and tabs stay put and the
 * ruled sheet moves under them. Everything that used to read or set `window.scrollY` goes through here,
 * so the same code works on the full-screen board (which has no binder and scrolls the document).
 */
export const PAGE_SCROLL_ID = 'page-scroll'

export function getScroller(): HTMLElement {
  return (document.getElementById(PAGE_SCROLL_ID) ?? document.scrollingElement ?? document.documentElement) as HTMLElement
}

export function getScrollTop(): number {
  return getScroller().scrollTop
}

export function scrollTo(top: number, behavior: ScrollBehavior = 'instant' as ScrollBehavior) {
  const el = getScroller()
  el.scrollTo({ top, behavior })
}

/** Distance from the top of the scrolled content to an element (what `rect.top + scrollY` used to give). */
export function offsetTop(el: Element): number {
  const scroller = getScroller()
  const rect = el.getBoundingClientRect()
  const base = scroller === document.scrollingElement || scroller === document.documentElement ? 0 : scroller.getBoundingClientRect().top
  return rect.top - base + scroller.scrollTop
}

export function onScroll(fn: () => void): () => void {
  const el = getScroller()
  const target: EventTarget = el === document.scrollingElement || el === document.documentElement ? window : el
  target.addEventListener('scroll', fn, { passive: true })
  return () => target.removeEventListener('scroll', fn)
}
