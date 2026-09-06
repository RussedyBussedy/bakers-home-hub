import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { getScrollTop, onScroll, scrollTo } from '../../lib/scroll'

/**
 * Keeps scrolling sane across route changes:
 * - opening a new page starts at the top (instead of inheriting wherever the last page was scrolled to),
 * - going back returns to where you were on that page,
 * - switching tabs on the same page (only the `?tab=` changes) leaves the scroll alone.
 * Inside the binder the page is what scrolls (see lib/scroll.ts); on the board it is the window.
 */
const positions = new Map<string, number>()

/** Where the page that is being left was scrolled to — the page flip reads this to redraw it faithfully. */
export function savedScroll(key: string): number | undefined {
  return positions.get(key)
}

export function ScrollManager() {
  const location = useLocation()
  const navType = useNavigationType()
  const keyRef = useRef(location.key)
  const pathRef = useRef(location.pathname)
  keyRef.current = location.key

  // Remember where each page was scrolled to, keyed by history entry.
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    const save = () => { positions.set(keyRef.current, getScrollTop()) }
    // Scroll events are throttled or skipped in background tabs, so also snapshot right before anything that can
    // navigate: a click (capture phase, before the router acts), back/forward, or the tab being hidden.
    // The scroller can change (binder page ↔ window) as routes come and go, so re-attach per location.
    const off = onScroll(save)
    document.addEventListener('click', save, true)
    window.addEventListener('popstate', save, true)
    document.addEventListener('visibilitychange', save)
    return () => {
      off()
      document.removeEventListener('click', save, true)
      window.removeEventListener('popstate', save, true)
      document.removeEventListener('visibilitychange', save)
    }
  }, [location.pathname])

  useLayoutEffect(() => {
    const samePage = pathRef.current === location.pathname
    pathRef.current = location.pathname
    // Jump now and re-assert on the next couple of frames: content can still be arriving, and a smooth
    // scroll that was already in flight (a fling, a scroll-into-view) would otherwise carry on past us.
    const jump = (top: number) => {
      const go = () => scrollTo(top)
      go()
      requestAnimationFrame(() => { go(); requestAnimationFrame(go) })
    }
    if (samePage) return // only the query or hash changed (a tab switch, say) — leave the scroll alone
    const saved = navType === 'POP' ? positions.get(location.key) : undefined
    jump(saved ?? 0)
  }, [location.key, location.pathname, navType])

  return null
}
