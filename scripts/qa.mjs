// Visual QA: opens the demo build in Chromium and screenshots every screen at
// phone and desktop sizes, in both themes. Run: node scripts/qa.mjs [baseUrl]
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const base = process.argv[2] || 'http://localhost:4173'
const outDir = path.resolve('qa-shots')
fs.mkdirSync(outDir, { recursive: true })

const screens = [
  { name: 'login', path: '/login', auth: false },
  { name: 'hub', path: '/' },
  { name: 'projects', path: '/projects' },
  { name: 'project-overview', path: '/projects/p-kitchen' },
  { name: 'project-money', path: '/projects/p-kitchen', tab: 'Money' },
  { name: 'project-photos', path: '/projects/p-kitchen', tab: 'Photos' },
  { name: 'project-tasks', path: '/projects/p-kitchen', tab: 'Tasks' },
  { name: 'board', path: '/projects/p-kitchen/board', full: false },
  { name: 'contacts', path: '/contacts' },
  { name: 'insights', path: '/insights' },
  { name: 'rewards', path: '/rewards' },
  { name: 'settings', path: '/settings' },
  { name: 'new-project', path: '/projects/new' },
]

const viewports = {
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const errors = []

for (const theme of ['light', 'dark']) {
  for (const [vpName, vp] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch, reducedMotion: 'no-preference' })
    await context.addInitScript((t) => {
      localStorage.setItem('hub-theme', t)
      localStorage.setItem('hub-demo-user', 'u-russel')
      localStorage.removeItem('hub-demo-state-v2')
    }, theme)
    const page = await context.newPage()
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${theme}/${vpName}] ${page.url()} :: ${m.text()}`) })
    page.on('pageerror', (e) => errors.push(`[${theme}/${vpName}] ${page.url()} :: PAGEERROR ${e.message}`))

    for (const s of screens) {
      if (s.auth === false) {
        const ctx2 = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch })
        await ctx2.addInitScript((t) => { localStorage.setItem('hub-theme', t); localStorage.removeItem('hub-demo-user') }, theme)
        const p2 = await ctx2.newPage()
        await p2.goto(base + s.path, { waitUntil: 'networkidle' })
        await p2.waitForTimeout(900)
        await p2.screenshot({ path: path.join(outDir, `${theme}-${vpName}-${s.name}.png`), fullPage: true })
        await ctx2.close()
        continue
      }
      await page.goto(base + s.path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(700)
      if (s.tab) {
        await page.getByRole('tab', { name: new RegExp(`^${s.tab}`) }).first().click()
        await page.waitForTimeout(600)
      }
      await page.waitForTimeout(900)
      await page.screenshot({ path: path.join(outDir, `${theme}-${vpName}-${s.name}.png`), fullPage: s.full !== false })
    }
    await context.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'console-errors.txt'), errors.join('\n'))
console.log(`Done. ${errors.length} console errors.`)
if (errors.length) console.log(errors.slice(0, 30).join('\n'))
