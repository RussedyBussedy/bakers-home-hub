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
const shot = async (label) => { await page.screenshot({ path:`/tmp/fd-${i++}-${label}.png`, clip }) }
await shot('as-is')
await page.evaluate(() => { for (const e of document.querySelectorAll('.flip-strip')) e.style.visibility='hidden' }); await shot('no-strips')
await page.evaluate(() => { for (const e of document.querySelectorAll('.flip-strip')) e.style.visibility=''; for (const e of document.querySelectorAll('.flip-back')) e.style.visibility='hidden' }); await shot('no-back')
await page.evaluate(() => { for (const e of document.querySelectorAll('.flip-back')) e.style.visibility=''; for (const e of document.querySelectorAll('.flip-shade')) e.style.visibility='hidden' }); await shot('no-shade')
await page.evaluate(() => { for (const e of document.querySelectorAll('.flip-shade')) e.style.visibility=''; const s=document.querySelectorAll('.flip-sheet'); s[s.length-1].style.visibility='hidden' }); await shot('no-last-sheet')
const dbg = await page.evaluate(() => {
  const s=document.querySelectorAll('.flip-sheet'); const last=s[s.length-1]
  const paper=last.querySelector('.flip-paper'); const strip=last.querySelector('.flip-strip')
  return { sheets: s.length, lastHasHinges: last.querySelectorAll('.flip-hinge').length, paperOpacity: getComputedStyle(paper).opacity, stripOverflow: getComputedStyle(strip).overflow, sheetTransform: getComputedStyle(last).transform, sheetPersp: getComputedStyle(last).perspective, sheetTS: getComputedStyle(last).transformStyle, layerZ: getComputedStyle(document.querySelector('.flip-layer')).zIndex, pageContentInPaper: !!paper.querySelector('.page-content'), pcTransform: paper.querySelector('.page-content') && getComputedStyle(paper.querySelector('.page-content')).transform }
})
console.log(dbg)
await browser.close()
