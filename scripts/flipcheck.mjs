// Page-turn check: steps a slowed-down page turn frame by frame and screenshots each step, so the
// bend, shading and timing can be looked at without a screen recorder.
// Run: node scripts/flipcheck.mjs [desktop|phone] [fromPath] [tabLabel] [outDir]   (against `vite preview`)
// The frames make a contact sheet or a GIF; `window.__flipSlow` is the dev hook in PageFlip.tsx.
import { chromium } from 'playwright'
import fs from 'node:fs'
const base='http://127.0.0.1:4173'
const mode = process.argv[2] || 'desktop'
const from = process.argv[3] || '/'
const clickLabel = process.argv[4] || 'Projects'
const out = process.argv[5] || 'qa-shots/flip'
fs.mkdirSync(out, { recursive: true })
const slow = 5
const vp = mode === 'phone' ? {width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1} : {width:1280,height:800}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, isMobile:vp.isMobile, hasTouch:vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor||1 })
await ctx.addInitScript((s) => { localStorage.setItem('hub-theme','light'); localStorage.setItem('hub-demo-user','u-russel'); localStorage.removeItem('hub-demo-state-v2'); window.__flipSlow = s }, slow)
const page = await ctx.newPage()
await page.goto(base+from, { waitUntil:'networkidle' }); await page.waitForTimeout(1200)
// pause all animations in lockstep and step through them for even frames
await page.getByRole('link', { name: clickLabel, exact: true }).first().click()
await page.waitForTimeout(80)
const total = await page.evaluate(() => { const a = document.getAnimations(); for (const x of a) x.pause(); return Math.max(...a.map(x => Number(x.effect.getComputedTiming().delay) + Number(x.effect.getComputedTiming().duration))) })
const frames = 36
for (let i = 0; i <= frames; i++) {
  const t = total * i / frames
  await page.evaluate((t) => { for (const a of document.getAnimations()) a.currentTime = t }, t)
  await page.waitForTimeout(30)
  await page.screenshot({ path: `${out}/${mode}-${String(i).padStart(3,'0')}.png` })
}
await page.evaluate(() => { for (const a of document.getAnimations()) a.finish() })
await browser.close()
console.log('frames', frames+1, 'total(ms)', total)
