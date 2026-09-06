import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport:{width:600,height:400}, deviceScaleFactor:2 })).newPage()
await p.goto('file:///tmp/ringtest/index.html'); await p.waitForTimeout(300)
await p.screenshot({ path:'/tmp/ringtest/shot.png' }); await b.close()
