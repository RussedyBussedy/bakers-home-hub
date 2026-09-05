import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Keeps scrolling sane across route changes:
 * - opening a new page starts at the top (instead of inheriting wherever the last page was scrolled to),
 * - going back returns to where you were on that page,
 * - switching tabs on the same page (only the `?tab=` changes) leaves the scroll alone.
 */
const positions = new Map<string, number>()

export function ScrollManager() {
  const location = useLocation()
  const navType = useNavigationType()
  const keyRef = useRef(location.key)
  const pathRef = useRef(location.pathname)
  keyRef.current = location.key

  // Remember where each page was scrolled to, keyed by history entry.
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    const onScroll = () => { positions.set(keyRef.current, window.scrollY) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const samePage = pathRef.current === location.pathname
    pathRef.current = location.pathname
    // Jump now and re-assert on the next couple of frames: content can still be arriving, and a smooth
    // scroll that was already in flight (a fling, a scroll-into-view) would otherwise carry on past us.
    const jump = (top: number) => {
      const go = () => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
      go()
      requestAnimationFrame(() => { go(); requestAnimationFrame(go) })
    }
    if (samePage) return // only the query or hash changed (a tab switch, say) — leave the scroll alone
    const saved = navType === 'POP' ? positions.get(location.key) : undefined
    jump(saved ?? 0)
  }, [location.key, location.pathname, navType])

  return null
}
