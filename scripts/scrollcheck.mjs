// Desktop + landscape checks (serve the demo build on :4173 first, e.g. `npx vite preview --port 4173`): scroll-to-top on navigation, restore on back, tab switches keep scroll,
// and a frame recorder across route changes looking for blank/splash frames and big luminance swings.
import { chromium } from 'playwright'

const base = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const fails = []
const ok = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? '  ok   ' : '  FAIL ') + msg) }

async function demo(page) {
  await page.goto(base + '/')
  await page.waitForURL(base + '/')
  await page.waitForTimeout(800)
}

for (const vp of [{ name: 'desktop', width: 1280, height: 720 }, { name: 'landscape', width: 844, height: 390 }]) {
  console.log(`\n${vp.name} ${vp.width}x${vp.height}`)
  const ctx = await browser.newContext({ viewport: vp })
  await ctx.addInitScript(() => { localStorage.setItem('hub-demo-user', 'u-russel'); localStorage.setItem('hub-theme', 'light') })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => fails.push(`pageerror: ${e.message}`))
  await demo(page)

  // 1. scroll down on the Hub, open Projects → top
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }))
  await page.waitForTimeout(150)
  const hubY = await page.evaluate(() => window.scrollY)
  ok(hubY > 100, `hub scrolled to ${hubY}`)
  await page.getByRole('link', { name: 'Projects' }).first().click()
  await page.waitForURL(base + '/projects')
  await page.waitForTimeout(120)
  ok((await page.evaluate(() => window.scrollY)) === 0, 'Projects opens at the top')

  // 2. back → Hub restores its old position
  await page.goBack()
  await page.waitForURL(base + '/')
  await page.waitForTimeout(250)
  const restored = await page.evaluate(() => window.scrollY)
  ok(Math.abs(restored - hubY) < 40, `back to Hub restores scroll (${restored} vs ${hubY})`)

  // 3. open a project, scroll, switch tab via ?tab= → scroll stays
  await page.goto(base + '/projects')
  await page.waitForTimeout(400)
  const card = page.locator('a[href^="/projects/"]').first()
  await card.click()
  await page.waitForURL(/\/projects\/[^/]+$/)
  await page.waitForTimeout(400)
  ok((await page.evaluate(() => window.scrollY)) === 0, 'Project opens at the top')
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  const target = Math.min(300, Math.max(0, max))
  await page.evaluate((t) => window.scrollTo({ top: t, behavior: 'instant' }), target)
  await page.waitForTimeout(150)
  const before = await page.evaluate(() => window.scrollY)
  // click the tab straight through the DOM (Playwright's own click would scroll it into view first)
  await page.evaluate(() => { for (const b of document.querySelectorAll('[role=tab]')) if (/tasks/i.test(b.textContent || '')) b.click() })
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => window.scrollY)
  const newMax = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  // the page may be shorter on the new tab, in which case the browser clamps — but it must not jump to the top
  ok(after >= Math.min(before, newMax) - 40, `tab change keeps scroll (${before} → ${after}, max ${newMax})`)

  // 3b. scrolled well past the tab bar, switching tabs brings the bar to the top (so the new tab starts in view)
  const barTop = await page.evaluate(() => { const bar = document.querySelector('[role=tablist]').parentElement; return Math.round(bar.previousElementSibling.getBoundingClientRect().top + window.scrollY) })
  await page.evaluate(() => { for (const b of document.querySelectorAll('[role=tab]')) if (/photos/i.test(b.textContent || '')) b.click() })
  await page.waitForTimeout(250)
  const maxP = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  if (maxP > barTop + 100) {
    await page.evaluate((t) => window.scrollTo({ top: t, behavior: 'instant' }), barTop + 100)
    await page.waitForTimeout(120)
    await page.evaluate(() => { for (const b of document.querySelectorAll('[role=tab]')) if (/money/i.test(b.textContent || '')) b.click() })
    await page.waitForTimeout(250)
    const y = await page.evaluate(() => window.scrollY)
    const maxM = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    ok(Math.abs(y - Math.min(barTop, maxM)) <= 4, `tab switch from below the bar lands on the bar (${y} vs ${barTop}, max ${maxM})`)
  } else console.log(`  skip  page too short to scroll past the tab bar (max ${maxP}, bar ${barTop})`)

  // 4. frame recorder over a few route changes: look for blank frames and the splash
  const routes = ['/', '/projects', '/insights', '/contacts', '/rewards', '/']
  await page.goto(base + '/')
  await page.waitForTimeout(900)
  let blank = 0, splash = 0, frames = 0, maxSwing = 0
  const lum = async () => {
    const buf = await page.screenshot({ type: 'jpeg', quality: 40, clip: { x: 0, y: 0, width: vp.width, height: vp.height } })
    // cheap luminance proxy: JPEG size (blank pages compress to almost nothing)
    return buf.length
  }
  let prev = await lum()
  for (const r of routes.slice(1)) {
    const link = page.getByRole('link', { name: r === '/' ? 'Hub' : r.slice(1)[0].toUpperCase() + r.slice(2) }).first()
    await link.click()
    const t0 = Date.now()
    while (Date.now() - t0 < 500) {
      const size = await lum()
      frames++
      if (size < 4000) blank++
      const text = await page.evaluate(() => document.body.innerText.includes('Opening the hub'))
      if (text) splash++
      maxSwing = Math.max(maxSwing, Math.abs(size - prev) / Math.max(prev, 1))
      prev = size
    }
  }
  ok(blank === 0, `no blank frames during ${frames} sampled frames (blank=${blank})`)
  ok(splash === 0, `splash never shown during navigation (splash=${splash})`)
  console.log(`  info  max frame-to-frame size swing ${(maxSwing * 100).toFixed(0)}%`)
  await ctx.close()
}

await browser.close()
if (fails.length) { console.log('\nFAILURES:\n' + fails.join('\n')); process.exit(1) }
console.log('\nAll scroll/transition checks passed.')
