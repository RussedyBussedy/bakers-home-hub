import { chromium } from 'playwright'
const base='http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [name, vp] of Object.entries({desktop:{width:1440,height:900}, phone:{width:390,height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2}})) {
  const ctx = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, isMobile:vp.isMobile, hasTouch:vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor||1 })
  await ctx.addInitScript(() => { localStorage.setItem('hub-theme','light'); localStorage.setItem('hub-demo-user','u-russel'); localStorage.removeItem('hub-demo-state-v2') })
  const page = await ctx.newPage()
  for (const p of (process.argv[2]||'/').split(',')) {
    await page.goto(base+p, { waitUntil:'networkidle' }); await page.waitForTimeout(1200)
    await page.screenshot({ path:`/tmp/shot-${name}-${p.replace(/\W+/g,'_')||'root'}.png` })
  }
  await ctx.close()
}
await browser.close()
