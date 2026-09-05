// Finds layout "funnies" at phone, landscape, tablet and desktop sizes: anything wider than the viewport,
// text spilling out of its box, pages that scroll sideways, and buttons covered by something else. Runs against
// the demo build with deliberately long titles injected.
import { chromium } from 'playwright'

const base = process.argv[2] || 'http://127.0.0.1:4173'
// Portrait phones, landscape phones, a tablet and two desktop sizes.
const viewports = [
  { name: 'phone-360', width: 360, height: 800, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-430', width: 430, height: 932, mobile: true },
  { name: 'landscape-844', width: 844, height: 390, mobile: true },
  { name: 'landscape-736', width: 736, height: 414, mobile: true },
  { name: 'tablet-1024', width: 1024, height: 768, mobile: true },
  { name: 'desktop-1280', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1536', width: 1536, height: 900, mobile: false },
]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

const LONG = {
  task: 'check with Kevin on Monday if the guys are coming to do the pump before the long weekend or not',
  quote: 'Supply and fit of 40 m seamless aluminium guttering with downpipes and brackets',
  contact: 'Ockert van der Westhuizen — Ockert’s Topsoil, Compost and Garden Supplies (Pty) Ltd',
  project: 'Sort out the lumpy lawn behind the lapa and level the whole back garden',
}

const PAGES = (pid) => [
  ['hub', '/'],
  ['projects', '/projects'],
  ['project-overview', `/projects/${pid}`],
  ['project-money', `/projects/${pid}?tab=money`],
  ['project-tasks', `/projects/${pid}?tab=tasks`],
  ['project-photos', `/projects/${pid}?tab=photos`],
  ['contacts', '/contacts'],
  ['insights', '/insights'],
  ['rewards', '/rewards'],
  ['settings', '/settings'],
  ['board', `/projects/${pid}/board`],
]

let problems = 0
for (const { name: vpName, width, height, mobile } of viewports) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 })
  await context.addInitScript(() => { localStorage.setItem('hub-demo-user', 'u-russel'); localStorage.setItem('hub-theme', 'light') })
  const page = await context.newPage()
  // Seed, then lengthen some titles directly in the demo state.
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  const pid = await page.evaluate((LONG) => {
    const key = 'hub-demo-state-v2'
    const s = JSON.parse(localStorage.getItem(key))
    const p = s.projects.find((x) => x.status === 'in_progress')
    p.title = LONG.project
    s.tasks.filter((t) => t.project_id === p.id && !t.done).slice(0, 2).forEach((t) => { t.title = LONG.task })
    s.quotes.filter((q) => q.project_id === p.id).slice(0, 1).forEach((q) => { q.title = LONG.quote })
    s.contacts.slice(0, 1).forEach((c) => { c.name = LONG.contact; c.company = 'Ockert’s Topsoil, Compost and Garden Supplies (Pty) Ltd' })
    localStorage.setItem(key, JSON.stringify(s))
    return p.id
  }, LONG)

  for (const [name, path] of PAGES(pid)) {
    await page.goto(base + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    const report = await page.evaluate(() => {
      const vw = window.innerWidth
      const scroll = document.documentElement.scrollWidth
      const inScroller = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true } return false }
      const wide = []
      const clipped = []
      for (const el of document.querySelectorAll('body *')) {
        if (!(el instanceof HTMLElement)) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const cs = getComputedStyle(el)
        if (cs.position === 'fixed') continue
        if (r.right > vw + 1 && !inScroller(el)) wide.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} right=${Math.round(r.right)} “${(el.innerText || '').trim().slice(0, 40)}”`)
        // Text wider than its box without an ellipsis/scroll (clipped or spilling).
        if (el.children.length === 0 && (el.innerText || '').trim() && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap') clipped.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} “${(el.innerText || '').trim().slice(0, 40)}”`)
      }
      // Dead controls: a visible button or link whose centre is covered by something else (a text block sitting over
      // the header buttons, say) — taps on it go nowhere. Skip the bits under the fixed bottom bar / FAB.
      const dead = []
      for (const el of document.querySelectorAll('button, a[href], [role=button], [role=tab]')) {
        if (!(el instanceof HTMLElement)) continue
        if (el.matches(':disabled, [aria-disabled=true]')) continue
        // Use the visible part of the control: clip its box by every scrolling/clipping ancestor.
        let box = el.getBoundingClientRect()
        let x1 = box.left, y1 = box.top, x2 = box.right, y2 = box.bottom
        for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
          const o = getComputedStyle(e)
          if (['auto', 'scroll', 'hidden', 'clip'].includes(o.overflowX) || ['auto', 'scroll', 'hidden', 'clip'].includes(o.overflowY)) {
            const c = e.getBoundingClientRect(); x1 = Math.max(x1, c.left); y1 = Math.max(y1, c.top); x2 = Math.min(x2, c.right); y2 = Math.min(y2, c.bottom)
          }
        }
        if (x2 - x1 < 8 || y2 - y1 < 8) continue
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
        if (cx < 0 || cy < 0 || cx > vw || cy > window.innerHeight) continue
        const hit = document.elementFromPoint(cx, cy)
        if (!hit || el === hit || el.contains(hit)) continue
        let h = hit, coveredByFixed = false
        for (; h && h !== document.body; h = h.parentElement) if (getComputedStyle(h).position === 'fixed') { coveredByFixed = true; break }
        if (coveredByFixed) continue
        dead.push(`${el.tagName.toLowerCase()} “${(el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 30)}” under ${hit.tagName.toLowerCase()}.${[...hit.classList].slice(0, 3).join('.')}`)
      }
      return { vw, scroll, wide: wide.slice(0, 6), clipped: clipped.slice(0, 6), dead: dead.slice(0, 6) }
    })
    const bad = report.scroll > report.vw + 1 || report.wide.length || report.clipped.length || report.dead.length
    if (bad) problems++
    console.log(`${bad ? '✗' : '✓'} ${vpName} ${name}${report.scroll > report.vw + 1 ? ` — page scrolls sideways (${report.scroll} > ${report.vw})` : ''}`)
    for (const w of report.wide) console.log('    wide:', w)
    for (const c of report.clipped) console.log('    clipped:', c)
    for (const d of report.dead) console.log('    dead control:', d)
    if (bad) await page.screenshot({ path: `qa-shots/overflow-${vpName}-${name}.png`, fullPage: true })
  }
  await context.close()
}
await browser.close()
console.log(problems ? `\n${problems} page/width combinations need attention` : '\nNo overflow problems found.')
