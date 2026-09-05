// Functional smoke test of the main flows in demo mode.
import { chromium } from 'playwright'
import fs from 'node:fs'

const base = process.argv[2] || 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
await context.addInitScript(() => { localStorage.setItem('hub-demo-user', 'u-russel'); if (!sessionStorage.getItem('flows-init')) { localStorage.removeItem('hub-demo-state-v1'); sessionStorage.setItem('flows-init', '1') } localStorage.setItem('hub-theme', 'light') })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|favicon/.test(m.text())) errors.push(m.text()) })
fs.mkdirSync('qa-shots/flows', { recursive: true })
const shot = (n) => page.screenshot({ path: `qa-shots/flows/${n}.png` })

const step = async (name, fn) => {
  try { await fn(); console.log('✓', name) } catch (e) { console.log('✗', name, e.message.split('\n')[0]); await shot(`fail-${name.replace(/\W+/g, '-')}`) }
}

await step('create project', async () => {
  await page.goto(base + '/projects/new', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('e.g. Kitchen cabinet refresh').fill('Patio pergola')
  await page.getByPlaceholder('Repaint the carcasses, new shaker doors, brass handles…').fill('A timber pergola over the braai area.')
  await page.getByPlaceholder('0').first().fill('22000')
  await page.getByRole('button', { name: 'Start the quest' }).click()
  await page.waitForURL(/\/projects\/(?!new)/, { timeout: 10000 })
  await page.waitForTimeout(800)
  await shot('01-project-created')
  const xp = await page.locator('text=+25 XP').count()
  if (!xp) throw new Error('no XP pop')
})

await step('add + complete task', async () => {
  await page.getByRole('tab', { name: /^Tasks/ }).click()
  await page.getByLabel('New task').fill('Order timber')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('checkbox', { name: 'Order timber' }).click()
  await page.waitForTimeout(600)
  await shot('02-task-done')
  const t = await page.locator('text=+10 XP').count()
  if (!t) throw new Error('no task XP')
})

await step('file quote + accept', async () => {
  await page.getByRole('tab', { name: /^Money/ }).click()
  await page.getByRole('button', { name: 'File a quote' }).click()
  await page.getByPlaceholder('Doors, paint & handles').fill('Pergola timber + build')
  await page.getByPlaceholder('0').first().fill('18500')
  await page.locator('select').filter({ hasText: 'Received' }).first().selectOption('accepted')
  await page.getByRole('button', { name: 'File quote' }).click()
  await page.waitForTimeout(800)
  await shot('03-quote')
  const q = await page.locator('text=Pergola timber + build').count()
  if (!q) throw new Error('quote missing')
})

await step('log expense', async () => {
  await page.getByRole('button', { name: 'Log' }).click()
  await page.getByPlaceholder('Soft-close hinges ×24').fill('Coach bolts')
  await page.getByPlaceholder('0').first().fill('340')
  await page.getByRole('button', { name: 'Log it' }).click()
  await page.waitForTimeout(600)
  const e = await page.locator('text=Coach bolts').count()
  if (!e) throw new Error('expense missing')
})

await step('board: add note, colour, drag', async () => {
  await page.getByRole('tab', { name: /^Board/ }).click()
  await page.getByRole('button', { name: 'Open board' }).click()
  await page.waitForURL(/\/board$/)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Note' }).click()
  await page.getByPlaceholder('Handles: brushed brass, 160mm centres…').fill('Stain: dark walnut')
  await page.getByRole('button', { name: 'Pin it' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Colour' }).click()
  await page.getByPlaceholder('#7A8F6E').fill('#5A4635')
  await page.getByRole('button', { name: 'Pin it' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Label' }).click()
  await page.getByPlaceholder('Wall run 3.6 m').fill('Span 4.5 m')
  await page.getByRole('button', { name: 'Pin it' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForTimeout(300)
  // drag the note
  const note = page.locator('text=Stain: dark walnut').first()
  const box = await note.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  await shot('04-board')
  const b2 = await note.boundingBox()
  if (Math.abs(b2.x - box.x) < 50) throw new Error('note did not move')
  // reload and confirm persisted
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const n = await page.locator('text=Stain: dark walnut').count()
  if (!n) throw new Error('note not persisted')
})

await step('contacts: add', async () => {
  await page.goto(base + '/contacts', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'New contact' }).click()
  await page.getByPlaceholder('Joe Mahlangu').fill('Thabo Timber')
  await page.getByPlaceholder("Joe's Joinery").fill('Timber City')
  await page.getByRole('button', { name: 'Add contact' }).click()
  await page.waitForTimeout(600)
  const c = await page.locator('text=Thabo Timber').count()
  if (!c) throw new Error('contact missing')
  await shot('05-contacts')
})

await step('complete project → celebration', async () => {
  await page.goto(base + '/projects', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: /Patio pergola/ }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()
  await page.waitForTimeout(1200)
  await shot('06-celebration')
  const c = await page.locator('text=Quest complete').count()
  if (!c) throw new Error('no celebration')
  await page.getByRole('button', { name: 'Onwards!' }).click()
})

await step('settings: theme toggle + rename', async () => {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Dark/ }).click()
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  if (theme !== 'dark') throw new Error('theme not applied')
  await page.getByRole('tab', { name: /Light/ }).click()
})

console.log(errors.length ? `\n${errors.length} errors:\n${errors.join('\n')}` : '\nNo console/page errors.')
await browser.close()
