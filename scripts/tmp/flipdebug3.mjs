import { chromium } from 'playwright'
const base='http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport:{width:1440,height:900} })
await ctx.addInitScript(() => { localStorage.setItem('hub-theme','light'); localStorage.setItem('hub-demo-user','u-russel'); localStorage.removeItem('hub-demo-state-v2'); window.__flipSlow = 1000 })
const page = await ctx.newPage()
await page.goto(base+'/projects', { waitUntil:'networkidle' }); await page.waitForTimeout(1000)
await page.getByRole('link', { name: 'Hub', exact: true }).first().click()
await page.waitForTimeout(300)
await page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 820*1000*0.35 } })
const clip = { x: 0, y: 0, width: 700, height: 450 }
let i = 0
const shot = async (label) => { await page.screenshot({ path:`/tmp/fe-${i++}-${label}.png`, clip }) }
await shot('as-is')
// (a) drop the sheet's own translateZ animation
await page.evaluate(() => { for (const a of document.getAnimations()) { if (a.effect.target.classList.contains('flip-sheet')) a.cancel() } })
await shot('no-sheet-anim')
// (b) drop overflow hidden on the layer
await page.evaluate(() => { document.querySelector('.flip-layer').style.overflow='visible' })
await shot('layer-overflow-visible')
// (c) remove will-change on hinges
await page.evaluate(() => { for (const h of document.querySelectorAll('.flip-hinge')) h.style.willChange='auto' })
await shot('no-willchange')
// (d) remove translateZ(0) from strips
await page.evaluate(() => { for (const h of document.querySelectorAll('.flip-strip')) h.style.transform='none' })
await shot('no-stripZ')
await browser.close()
