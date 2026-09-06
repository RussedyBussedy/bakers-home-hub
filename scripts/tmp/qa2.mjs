import { chromium } from 'playwright'
const base='http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const cases = [
  { name:'desktop-dark-hub', vp:{width:1440,height:900}, theme:'dark', path:'/' },
  { name:'tablet-projects', vp:{width:820,height:1100}, theme:'light', path:'/projects' },
  { name:'landscape-hub', vp:{width:844,height:390, isMobile:true, hasTouch:true, deviceScaleFactor:2}, theme:'light', path:'/' },
  { name:'phone-settings', vp:{width:390,height:844, isMobile:true, hasTouch:true, deviceScaleFactor:2}, theme:'light', path:'/settings' },
  { name:'desktop-project', vp:{width:1440,height:900}, theme:'light', path:'/projects/p-kitchen' },
  { name:'small-desktop-insights', vp:{width:1180,height:700}, theme:'light', path:'/insights' },
]
for (const c of cases) {
  const ctx = await browser.newContext({ viewport:{width:c.vp.width,height:c.vp.height}, isMobile:c.vp.isMobile, hasTouch:c.vp.hasTouch, deviceScaleFactor:c.vp.deviceScaleFactor||1 })
  await ctx.addInitScript((t) => { localStorage.setItem('hub-theme',t); localStorage.setItem('hub-demo-user','u-russel'); localStorage.removeItem('hub-demo-state-v2') }, c.theme)
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR', c.name, e.message))
  await page.goto(base+c.path, { waitUntil:'networkidle' }); await page.waitForTimeout(1200)
  await page.screenshot({ path:`/tmp/qa2-${c.name}.png` })
  await ctx.close()
}
await browser.close()
