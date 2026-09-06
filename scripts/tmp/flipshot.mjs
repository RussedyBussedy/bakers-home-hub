import { chromium } from 'playwright'
const base='http://127.0.0.1:4173'
const mode = process.argv[2] || 'desktop'
const from = process.argv[3] || '/'
const clickLabel = process.argv[4] || 'Projects'
const vp = mode === 'phone' ? {width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2} : {width:1440,height:900}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, isMobile:vp.isMobile, hasTouch:vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor||1 })
await ctx.addInitScript(() => { localStorage.setItem('hub-theme','light'); localStorage.setItem('hub-demo-user','u-russel'); localStorage.removeItem('hub-demo-state-v2'); window.__flipSlow = 10 })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto(base+from, { waitUntil:'networkidle' }); await page.waitForTimeout(1000)
await page.getByRole('link', { name: clickLabel, exact: true }).first().click()
const t0 = Date.now()
for (const at of [600, 1800, 3000, 4200, 5400, 6600]) {
  const wait = at - (Date.now()-t0); if (wait > 0) await page.waitForTimeout(wait)
  await page.screenshot({ path:`/tmp/flip-${mode}-${at}.png` })
}
await page.waitForTimeout(3000)
await page.screenshot({ path:`/tmp/flip-${mode}-end.png` })
const stale = await page.evaluate(() => document.querySelectorAll('.flip-layer').length)
console.log('stale layers:', stale)
await browser.close()
