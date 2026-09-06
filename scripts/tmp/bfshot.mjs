import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport:{width:800,height:400} })).newPage()
await p.goto('file:///tmp/ringtest/bf2.html'); await p.waitForTimeout(300)
await p.screenshot({ path:'/tmp/ringtest/bf2.png' }); await b.close()
