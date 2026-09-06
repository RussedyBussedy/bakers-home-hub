import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useUi } from '../../store/ui'
import { PAGE_SCROLL_ID } from '../../lib/scroll'

/**
 * Turns a route change into a page turn.
 *
 * The page being left is cloned the instant before React tears it down (a keyed wrapper's layout-effect
 * cleanup runs while its DOM is still attached), then re-drawn on a sheet of paper in a fixed layer above
 * the binder and swung over the rings — split into strips on nested hinges so the sheet bends like paper
 * instead of turning like cardboard. Going forward in the binder the old page flips away and the new page
 * is already underneath; going back, the new page flips in from the stack on the other side and lands on
 * top of a still copy of the old one. Jumping several tabs riffles a couple of blank pages in between.
 *
 * Desktop: rings on the left, so the hinge is the left edge (rotateY). Phone: rings on top (rotateX).
 */

/** Where each route sits in the binder; a bigger number is further in. */
export function pageOrdinal(pathname: string): number {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/') return 0
  if (p === '/projects') return 10
  if (p === '/projects/new') return 12
  if (p.startsWith('/projects/')) return 11
  if (p.startsWith('/contacts')) return 20
  if (p.startsWith('/insights')) return 30
  if (p.startsWith('/rewards')) return 40
  if (p.startsWith('/settings')) return 50
  return 60
}

interface Snap {
  clone: HTMLElement
  scrollTop: number
}

/**
 * A copy of the page content, with the parts that are scrolled out of view swapped for empty boxes of the
 * same height. The bend needs several copies of the sheet, and a long Hub page cloned eight times over is
 * the difference between a flip that starts at once and one that stutters first.
 */
function snapshotPage(scroller: HTMLElement): Snap | null {
  const content = scroller.firstElementChild as HTMLElement | null
  if (!content) return null
  const view = scroller.getBoundingClientRect()
  return { clone: pruneClone(content, view.top - 60, view.bottom + 60, 0), scrollTop: scroller.scrollTop }
}

function pruneClone(el: HTMLElement, minY: number, maxY: number, depth: number): HTMLElement {
  const out = settle(el.cloneNode(false) as HTMLElement)
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) { out.appendChild(child.cloneNode(true)); continue }
    const c = child as HTMLElement
    const r = c.getBoundingClientRect()
    const positioned = getComputedStyle(c).position
    if (r.height > 0 && (r.bottom < minY || r.top > maxY) && positioned !== 'absolute' && positioned !== 'fixed') {
      const ph = document.createElement(c.tagName === 'LI' ? 'li' : 'div')
      ph.className = c.className
      ph.style.cssText = `height:${r.height}px;box-sizing:border-box;visibility:hidden;padding:0;border:0;overflow:hidden;background:none;box-shadow:none`
      out.appendChild(ph)
    } else if (depth < 2 && r.height > 700 && c.childElementCount > 1) {
      out.appendChild(pruneClone(c, minY, maxY, depth + 1))
    } else {
      const full = c.cloneNode(true) as HTMLElement
      settle(full)
      for (const d of Array.from(full.querySelectorAll<HTMLElement>('[style*="opacity"]'))) settle(d)
      out.appendChild(full)
    }
  }
  return out
}

/**
 * An element caught mid-entrance (framer-motion's inline opacity + translate) is drawn as it will end up.
 * A translucent, transformed descendant would otherwise get its own layer and show its backface through
 * the sheet — and a half-arrived page makes a poor copy.
 */
function settle(el: HTMLElement): HTMLElement {
  const st = el.style
  if (st.opacity !== '' && st.opacity !== '1') {
    st.opacity = '1'
    if (/translate/.test(st.transform)) st.transform = 'none'
  }
  return el
}

function div(className: string, css?: string): HTMLDivElement {
  const d = document.createElement('div')
  d.className = className
  if (css) d.style.cssText = css
  return d
}

interface Sheet {
  snap: Snap | null // null = a blank page from the middle of the binder
}

interface FlipJob {
  layer: HTMLDivElement
  done: Promise<void>
  finish: () => void
}

let current: FlipJob | null = null

function runFlip(opts: { axis: 'x' | 'y'; rect: DOMRect; forward: boolean; sheets: Sheet[]; still: Snap | null; strips: number }): FlipJob {
  const { axis, rect, forward, sheets, still } = opts
  const N = Math.max(2, opts.strips)
  const layer = div('flip-layer')
  layer.setAttribute('aria-hidden', 'true')
  const at = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`
  const W = rect.width
  const H = rect.height
  const anims: Animation[] = []

  // Going back, the page we are leaving stays put underneath while the new one lands on it.
  if (still) {
    const base = div('flip-sheet', at)
    const paper = div('flip-paper', `width:${W}px;height:${H}px;`)
    const c = still.clone.cloneNode(true) as HTMLElement
    c.style.marginTop = `${-still.scrollTop}px`
    paper.appendChild(c)
    base.appendChild(paper)
    layer.appendChild(base)
  }

  // The shadow a lifting page throws on the one beneath.
  const cast = div('flip-cast' + (axis === 'x' ? ' is-x' : ''), at)
  layer.appendChild(cast)

  // `window.__flipSlow = 8` stretches the turn for a screenshot check (dev only).
  const slow = Number((window as unknown as { __flipSlow?: number }).__flipSlow) || 1
  const D = (axis === 'x' ? 640 : 820) * slow
  const stagger = 130 * slow
  const total = D + (sheets.length - 1) * stagger
  const easing = 'cubic-bezier(0.42, 0.04, 0.3, 1)'
  // Forward: the sheet on top flips first, so the last to flip is lowest in the stack (drawn first).
  // Back: each arriving sheet lands on the previous one, so time order is draw order.
  const drawOrder = forward ? [...sheets.keys()].reverse() : [...sheets.keys()]

  for (const k of drawOrder) {
    const sheet = sheets[k]
    const delay = k * stagger
    const el = div('flip-sheet', at)
    el.style.perspective = `${Math.max(2400, (axis === 'y' ? W : H) * 3.2)}px`
    el.style.perspectiveOrigin = axis === 'y' ? '35% 50%' : '50% 35%'
    const stripW = axis === 'y' ? Math.ceil(W / N) : W
    const stripH = axis === 'y' ? H : Math.ceil(H / N)
    let parent: HTMLElement = el
    let root: HTMLElement | null = null
    const hinges: HTMLElement[] = []
    const shades: HTMLElement[] = []
    for (let i = 0; i < N; i++) {
      const hinge = div('flip-hinge', `width:${stripW}px;height:${stripH}px;transform-origin:${axis === 'y' ? '0 50%' : '50% 0'};`)
      if (i > 0) hinge.style[axis === 'y' ? 'left' : 'top'] = `${axis === 'y' ? stripW : stripH}px`
      const strip = div('flip-strip', `width:${stripW + (axis === 'y' ? 1 : 0)}px;height:${stripH + (axis === 'x' ? 1 : 0)}px;`)
      const paper = div('flip-paper', `width:${W}px;height:${H}px;${axis === 'y' ? `left:${-i * stripW}px` : `top:${-i * stripH}px`};`)
      if (sheet.snap) {
        // (a margin, not a transform: a transformed descendant would show its own backface through the strip)
        const c = sheet.snap.clone.cloneNode(true) as HTMLElement
        c.style.marginTop = `${-sheet.snap.scrollTop}px`
        paper.appendChild(c)
      } else {
        paper.classList.add('is-blank')
      }
      const shade = div('flip-shade')
      strip.append(paper, shade)
      const back = div('flip-back' + (axis === 'x' ? ' is-x' : ''), `width:${stripW + 1}px;height:${stripH + 1}px;transform:${axis === 'y' ? 'rotateY(180deg)' : 'rotateX(180deg)'};background-position:0 0,${axis === 'y' ? -i * stripW : 0}px ${axis === 'x' ? -i * stripH : 0}px;`)
      hinge.append(strip, back)
      parent.appendChild(hinge)
      parent = hinge
      hinges.push(hinge)
      shades.push(shade)
      if (i === 0) root = hinge
    }
    layer.appendChild(el)

    // The whole sheet swings on the root hinge; the others only bend, and settle flat again.
    const rot = axis === 'y' ? 'rotateY' : 'rotateX'
    const sign = axis === 'y' ? -1 : 1 // which way "toward the viewer and over" is, per axis
    const a0 = forward ? 0 : sign * 180
    const a1 = forward ? sign * 180 : 0
    const bendSign = Math.sign(a1 - a0)
    const BEND = 70
    anims.push(root!.animate([{ transform: `${rot}(${a0}deg)` }, { transform: `${rot}(${a1}deg)` }], { duration: D, delay, easing, fill: 'both' }))
    for (let i = 1; i < N; i++) {
      // the free edge leads, so the bend travels from the tip back to the spine
      const peak = 0.3 + 0.12 * (i / (N - 1))
      const b = (bendSign * BEND) / (N - 1)
      anims.push(hinges[i].animate(
        [{ transform: `${rot}(0deg)`, offset: 0 }, { transform: `${rot}(${b}deg)`, offset: peak, easing: 'ease-out' }, { transform: `${rot}(0deg)`, offset: 1 }],
        { duration: D, delay, easing: 'ease-in-out', fill: 'both' },
      ))
    }
    // Lambert-ish: the face darkens as it turns edge-on to the light.
    const shadeFrames = forward
      ? [{ opacity: 0, offset: 0 }, { opacity: 0.08, offset: 0.3 }, { opacity: 0.3, offset: 0.5 }, { opacity: 0.4, offset: 0.6 }, { opacity: 0.4, offset: 1 }]
      : [{ opacity: 0.4, offset: 0 }, { opacity: 0.4, offset: 0.4 }, { opacity: 0.3, offset: 0.5 }, { opacity: 0.08, offset: 0.7 }, { opacity: 0, offset: 1 }]
    for (const s of shades) anims.push(s.animate(shadeFrames, { duration: D, delay, fill: 'both' }))
    // A little lift off the page as it starts to move (and a settle when it lands).
    anims.push(el.animate(
      forward
        ? [{ transform: 'translateZ(0)' }, { transform: 'translateZ(6px)', offset: 0.15 }, { transform: 'translateZ(6px)' }]
        : [{ transform: 'translateZ(6px)' }, { transform: 'translateZ(6px)', offset: 0.85 }, { transform: 'translateZ(0)' }],
      { duration: D, delay, fill: 'both' },
    ))
  }

  const castFrames = forward
    ? [{ opacity: 0, offset: 0 }, { opacity: 0.85, offset: 0.42 }, { opacity: 0.4, offset: 0.62 }, { opacity: 0, offset: 0.85 }, { opacity: 0, offset: 1 }]
    : [{ opacity: 0, offset: 0 }, { opacity: 0.4, offset: 0.3 }, { opacity: 0.85, offset: 0.58 }, { opacity: 0, offset: 1 }]
  anims.push(cast.animate(castFrames, { duration: total, fill: 'both' }))

  document.body.appendChild(layer)

  let finished = false
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((r) => { resolveDone = r })
  const finish = () => {
    if (finished) return
    finished = true
    for (const a of anims) { try { a.cancel() } catch { /* already gone */ } }
    layer.remove()
    resolveDone()
  }
  Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(finish, finish)
  window.setTimeout(finish, total + 400) // belt and braces: never leave a stale sheet lying about
  return { layer, done, finish }
}

/** Wraps the routed page; flips when the pathname changes. */
export function PageFlip({ children }: { children: ReactNode }) {
  const location = useLocation()
  const reduceMotion = useUi((s) => s.reduceMotion)
  const enabled = useUi((s) => s.pageFlip)
  const leaving = useRef<{ path: string; snap: Snap | null } | null>(null)
  const prevPath = useRef(location.pathname)

  const onLeave = useCallback((path: string) => {
    const scroller = document.getElementById(PAGE_SCROLL_ID)
    leaving.current = { path, snap: scroller ? snapshotPage(scroller) : null }
  }, [])

  useLayoutEffect(() => {
    const from = prevPath.current
    prevPath.current = location.pathname
    if (from === location.pathname) return
    const left = leaving.current
    leaving.current = null
    if (!left || !enabled || reduceMotion) return
    const scroller = document.getElementById(PAGE_SCROLL_ID)
    const page = scroller?.parentElement
    if (!scroller || !page) return
    current?.finish()

    const fromOrd = pageOrdinal(left.path)
    const toOrd = pageOrdinal(location.pathname)
    const forward = toOrd >= fromOrd
    const jump = Math.min(3, Math.max(1, Math.abs(Math.floor(toOrd / 10) - Math.floor(fromOrd / 10))))
    const phone = window.matchMedia('(max-width: 639px)').matches
    const axis: 'x' | 'y' = phone ? 'x' : 'y'
    const rect = page.getBoundingClientRect()
    const strips = phone ? 6 : 8

    let sheets: Sheet[]
    let still: Snap | null = null
    if (forward) {
      // the old page goes first, then blank pages until we reach the new one (already underneath)
      sheets = [{ snap: left.snap }, ...Array.from({ length: jump - 1 }, () => ({ snap: null }))]
    } else {
      // blank pages come back over first, then the new page lands on the old one
      const incoming = snapshotPage(scroller)
      still = left.snap
      sheets = [...Array.from({ length: jump - 1 }, () => ({ snap: null })), { snap: incoming }]
    }
    current = runFlip({ axis, rect, forward, sheets, still, strips })
    void current.done.then(() => { current = null })
  }, [location.pathname, enabled, reduceMotion])

  return <Capture key={location.pathname} path={location.pathname} onLeave={onLeave}>{children}</Capture>
}

function Capture({ children, path, onLeave }: { children: ReactNode; path: string; onLeave: (path: string) => void }) {
  // The cleanup runs during the commit that removes this page, while its DOM is still in the document.
  useLayoutEffect(() => () => onLeave(path), [path, onLeave])
  return <>{children}</>
}
