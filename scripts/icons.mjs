import { chromium } from 'playwright'
import fs from 'node:fs'
const svg = fs.readFileSync('public/favicon.svg', 'utf8')
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
const render = async (size, pad, bg, file) => {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size - pad * 2}" height="${size - pad * 2}" `)}</body>`)
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' })
}
await render(192, 0, 'transparent', 'public/icons/icon-192.png')
await render(512, 0, 'transparent', 'public/icons/icon-512.png')
await render(512, 64, '#B84D24', 'public/icons/icon-512-maskable.png')
await render(180, 0, '#F6F1E9', 'public/icons/apple-touch-icon.png')
await browser.close()
console.log('icons done')
