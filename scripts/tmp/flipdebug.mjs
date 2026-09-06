import { chromium } from 'playwright'
const base='http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport:{width:1440,height:900} })
await ctx.addInitScript(() => { localStorage.setItem('hub-theme','light'); localStorage.setItem('hub-demo-user','u-russel'); localStorage.removeItem('hub-demo-state-v2'); window.__flipSlow = 1000 })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto(base+'/projects', { waitUntil:'networkidle' }); await page.waitForTimeout(1000)
await page.getByRole('link', { name: 'Hub', exact: true }).first().click()
await page.waitForTimeout(300)
// jump all animations to 35% of the sheet duration
const info = await page.evaluate(() => {
  const anims = document.getAnimations()
  const D = 820*1000
  for (const a of anims) { a.pause(); a.currentTime = D*0.35 }
  const sheets = document.querySelectorAll('.flip-sheet')
  const back = document.querySelector('.flip-back')
  const cs = getComputedStyle(back)
  return { anims: anims.length, sheets: sheets.length, backBg: cs.backgroundColor, backImg: cs.backgroundImage.slice(0,80), backTransform: cs.transform, backBfv: cs.backfaceVisibility, stripBfv: getComputedStyle(document.querySelector('.flip-strip')).backfaceVisibility, hingeTS: getComputedStyle(document.querySelector('.flip-hinge')).transformStyle, rootT: getComputedStyle(document.querySelector('.flip-sheet:last-of-type .flip-hinge')).transform }
})
console.log(info)
await page.screenshot({ path:'/tmp/flipdbg-1.png' })
await page.evaluate(() => { document.querySelector('.flip-cast').style.display='none' })
await page.screenshot({ path:'/tmp/flipdbg-2.png' })
await page.evaluate(() => { for (const b of document.querySelectorAll('.flip-back')) b.style.background='red' })
await page.screenshot({ path:'/tmp/flipdbg-3.png' })
await browser.close()
