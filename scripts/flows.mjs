// Functional smoke test of the main flows in demo mode.
import { chromium } from 'playwright'
import fs from 'node:fs'

const base = process.argv[2] || 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } })
await context.addInitScript(() => { localStorage.setItem('hub-demo-user', 'u-russel'); if (!sessionStorage.getItem('flows-init')) { localStorage.removeItem('hub-demo-state-v2'); sessionStorage.setItem('flows-init', '1') } localStorage.setItem('hub-theme', 'light') })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|favicon/.test(m.text())) errors.push(m.text()) })
fs.mkdirSync('qa-shots/flows', { recursive: true })
const shot = (n) => page.screenshot({ path: `qa-shots/flows/${n}.png` })

/** Reads text once the number has stopped counting up — figures animate on a fresh page load. */
const settledText = async (locator) => {
  let last = null
  for (let i = 0; i < 20; i++) {
    const now = (await locator.innerText()).trim()
    if (now === last) return now
    last = now
    await page.waitForTimeout(150)
  }
  return last
}

let failed = 0
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name) } catch (e) { failed++; console.log('✗', name, e.message.split('\n')[0]); await shot(`fail-${name.replace(/\W+/g, '-')}`) }
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

await step('nudge Kay from the project', async () => {
  await page.getByRole('button', { name: 'Nudge Kay' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Have a look at the board' }).click()
  await page.getByRole('button', { name: 'Send nudge' }).click()
  await page.waitForTimeout(600)
  await shot('02b-nudge')
  const t = await page.locator('text=Nudge sent to Kay').count()
  if (!t) throw new Error('no nudge toast')
})

await step('file quote + accept (with contact search)', async () => {
  await page.getByRole('tab', { name: /^Money/ }).click()
  await page.getByRole('button', { name: 'File a quote' }).click()
  await page.getByPlaceholder('Doors, paint & handles').fill('Pergola timber + build')
  await page.getByRole('button', { name: 'Supplier or contractor' }).click()
  await page.getByLabel('Search contacts').fill('joinery')
  await page.waitForTimeout(200)
  await page.getByRole('option', { name: /Joe Mahlangu/ }).click()
  await page.waitForTimeout(300)
  const picked = await page.locator('text=Joe Mahlangu · Joe\'s Joinery').count()
  if (!picked) throw new Error('contact not picked')
  await page.getByPlaceholder('0').first().fill('18500')
  await page.locator('select').filter({ hasText: 'Received' }).first().selectOption('accepted')
  await page.getByRole('button', { name: 'File quote' }).click()
  await page.waitForTimeout(800)
  await shot('03-quote')
  const q = await page.locator('text=Pergola timber + build').count()
  if (!q) throw new Error('quote missing')
})

await step('deposit on the accepted quote, then settle it', async () => {
  await page.getByRole('button', { name: 'Record a deposit' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^30% ·/ }).click()
  await page.getByRole('button', { name: 'Record payment' }).click()
  await page.waitForTimeout(800)
  await shot('03b-deposit')
  const partial = await page.locator('text=R 5 550 paid · R 12 950 to go').count()
  if (!partial) throw new Error('deposit not reflected on the quote')
  const inExpenses = await page.locator('text=Deposit — Pergola timber + build (30%)').count()
  if (!inExpenses) throw new Error('deposit missing from expenses')
  await page.getByRole('button', { name: 'Record another payment' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Balance ·/ }).click()
  await page.getByRole('button', { name: 'Record & mark paid' }).click()
  await page.waitForTimeout(900)
  await shot('03c-settled')
  const full = await page.locator('text=Paid in full').count()
  if (!full) throw new Error('quote not settled')
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

await step('board: open a link pin', async () => {
  await page.goto(base + '/projects/p-kitchen/board', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  // Record where the app would send the browser, rather than actually opening pinterest.com.
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return { closed: false, focus() {} } } })
  const opened = () => page.evaluate(() => window.__opened)

  // the arrow button on the pin itself
  await page.getByRole('button', { name: /^Open pinterest\.com$/ }).click()
  await page.waitForTimeout(200)
  let urls = await opened()
  if (urls.length !== 1 || !/pinterest\.com/.test(urls[0])) throw new Error(`icon opened ${JSON.stringify(urls)}`)

  // tapping the pin selects it (rather than navigating) and offers a big Open button
  await page.locator('text=Sage shaker kitchens').first().click()
  await page.waitForTimeout(400)
  await shot('04b-link-selected')
  await page.getByRole('button', { name: 'Open link', exact: true }).click()
  await page.waitForTimeout(200)
  urls = await opened()
  if (urls.length !== 2 || !/pinterest\.com/.test(urls[1])) throw new Error(`pill opened ${JSON.stringify(urls)}`)

  // and the same action from the selected-pin toolbar
  await page.getByRole('button', { name: 'Open the link' }).click()
  await page.waitForTimeout(200)
  urls = await opened()
  if (urls.length !== 3) throw new Error(`toolbar opened ${JSON.stringify(urls)}`)

  // opening must not have navigated the board away
  if (!/\/board$/.test(page.url())) throw new Error('board navigated away: ' + page.url())

  // ...and the arrow still works straight after dragging a pin (a stale "that was a drag" flag used to eat the click)
  const pin = page.locator('text=Sage shaker kitchens').first()
  const box = await pin.boundingBox()
  await page.mouse.move(box.x + 40, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 40 + 70, box.y + box.height / 2 + 50, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Open pinterest\.com$/ }).click()
  await page.waitForTimeout(200)
  urls = await opened()
  if (urls.length !== 4) throw new Error(`arrow after a drag opened ${JSON.stringify(urls)}`)
})

await step('prices: add one from a link, keep it out of the money figures', async () => {
  await page.goto(base + '/projects/p-kitchen?tab=money', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const realCost = await settledText(page.locator('text=Real cost so far').locator('xpath=following-sibling::*[1]').first())
  const pinsBefore = await page.locator('[role=tab]', { hasText: /^Board/ }).innerText()

  await page.getByRole('tab', { name: /^Prices/ }).click()
  await page.waitForTimeout(500)
  const before = await page.locator('.card', { hasText: 'If you bought the lot' }).innerText()
  await page.getByRole('button', { name: 'Add a price' }).first().click()
  await page.waitForTimeout(400)
  const sheet = page.locator('[role=dialog]')
  // A new price now opens on the search box, so pasting a link is a deliberate switch.
  await sheet.getByRole('tab', { name: /Paste a link/ }).click()
  await page.waitForTimeout(300)
  await sheet.getByLabel('Link', { exact: true }).fill('https://leroymerlin.co.za/tap/matte-black-mixer')
  await sheet.getByRole('button', { name: 'Fetch' }).click()
  await page.waitForTimeout(1400)
  const title = await sheet.getByLabel('What is it').inputValue()
  if (!title) throw new Error('the link reader filled in no name')
  const fetched = await sheet.getByLabel('Price', { exact: true }).inputValue()
  if (!Number(fetched)) throw new Error(`no price came back (${fetched})`)
  await sheet.getByLabel('Price', { exact: true }).fill('1450')
  await sheet.getByLabel('How many').fill('3')
  await sheet.getByRole('button', { name: 'Add it' }).click()
  await page.waitForTimeout(1200)
  await shot('06a-prices')
  if (!(await page.locator(`text=${title}`).count())) throw new Error('the new item is not in the list')
  const after = await page.locator('.card', { hasText: 'If you bought the lot' }).innerText()
  if (after === before) throw new Error('the shopping total did not move')
  // Three of them: the card shows the line total and the unit price, and the summary counts things.
  const card = page.locator('.card', { hasText: title }).first()
  if (!/×\s*3/.test(await card.innerText())) throw new Error(`no quantity on the card: ${(await card.innerText()).replace(/\n/g, ' | ')}`)
  if (!/4\u2009350/.test(await card.innerText())) throw new Error('the card is not showing 3 × 1 450')
  if (!/in all/.test(after)) throw new Error(`the summary does not count the extras: ${after.replace(/\n/g, ' | ')}`)

  // It was added off the board, so the board must not have grown...
  const pinsAfter = await page.locator('[role=tab]', { hasText: /^Board/ }).innerText()
  if (pinsAfter !== pinsBefore) throw new Error(`board count changed (${pinsBefore} -> ${pinsAfter})`)
  // ...and none of this may reach the budget figures.
  await page.getByRole('tab', { name: /^Money/ }).click()
  await page.waitForTimeout(600)
  const realCostAfter = await settledText(page.locator('text=Real cost so far').locator('xpath=following-sibling::*[1]').first())
  if (realCostAfter !== realCost) throw new Error(`real cost moved: ${realCost} -> ${realCostAfter}`)
  if (!(await page.getByRole('button', { name: /priced up/ }).count())) throw new Error('no price summary on the Money tab')
})

await step('prices: pinning one puts it on the board', async () => {
  await page.goto(base + '/projects/p-kitchen?tab=prices', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const boardTab = page.locator('[role=tab]', { hasText: /^Board/ })
  const n = Number((await boardTab.innerText()).replace(/\D+/g, '')) || 0
  await page.getByRole('button', { name: 'Item actions' }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('menuitem', { name: /Pin it on the board/ }).click()
  await page.waitForTimeout(900)
  const n2 = Number((await boardTab.innerText()).replace(/\D+/g, '')) || 0
  if (n2 !== n + 1) throw new Error(`board count ${n} -> ${n2}, expected ${n + 1}`)
  if (!(await page.locator('text=On the board').count())) throw new Error('no "On the board" badge on the card')
})

await step('prices: search the shops, pick one, and it fills the form', async () => {
  await page.goto(base + '/projects/p-kitchen?tab=prices', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Add a price' }).first().click()
  await page.waitForTimeout(400)
  const sheet = page.locator('[role=dialog]')

  await sheet.getByLabel('Search for a product').fill('brass cabinet handle')
  await sheet.getByRole('button', { name: 'Search', exact: true }).click()
  const cards = sheet.locator('ul.grid > li > button')
  await cards.first().waitFor({ timeout: 15000 })
  const n = await cards.count()
  if (n < 4) throw new Error(`only ${n} results came back`)

  // The shops we know sit above the rest, and the rest are marked as such.
  const first = await cards.first().innerText()
  if (!/builders\.co\.za/.test(first)) throw new Error(`a known shop should lead, got: ${first.replace(/\n/g, ' | ')}`)
  if (!(await sheet.locator('text=Elsewhere').count())) throw new Error('no divider before the shops we do not know')

  // Give the background page-reading a moment, then the cards should carry pictures and prices.
  await page.waitForTimeout(2500)
  const withPrice = await sheet.locator('ul.grid > li > button', { hasText: /R\s?\d/ }).count()
  if (withPrice < 3) throw new Error(`only ${withPrice} cards showed a price`)
  if (!(await sheet.locator('ul.grid img').first().isVisible())) throw new Error('no picture on the first card')
  await shot('06c-product-search')

  await cards.first().click()
  await page.waitForTimeout(900)
  if (!(await sheet.locator('text=Found at').count())) throw new Error('no "found at" line after picking')
  const title = await sheet.getByLabel('What is it').inputValue()
  if (!/handle/i.test(title)) throw new Error(`the name did not come across: "${title}"`)
  const price = await sheet.getByLabel('Price', { exact: true }).inputValue()
  if (!Number(price)) throw new Error(`the price did not come across: "${price}"`)

  await sheet.getByRole('button', { name: 'Add it' }).click()
  await page.waitForTimeout(1200)
  if (!(await page.locator(`text=${title}`).count())) throw new Error('the searched item is not in the list')
})

await step('contacts: add via paste details', async () => {
  await page.goto(base + '/contacts', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'New contact' }).click()
  await page.getByRole('button', { name: 'Paste details' }).click()
  await page.getByLabel('Pasted details').fill('Thabo Timber\nTimber City (Pty) Ltd\nCell: 082 555 0199\nthabo@timbercity.co.za\nhttps://timbercity.co.za')
  await page.getByRole('button', { name: 'Pull out the details' }).click()
  await page.waitForTimeout(300)
  await shot('05a-paste')
  const name = await page.getByPlaceholder('Joe Mahlangu').inputValue()
  const company = await page.getByPlaceholder("Joe's Joinery").inputValue()
  const wa = await page.getByPlaceholder('27…').inputValue()
  if (name !== 'Thabo Timber' || company !== 'Timber City (Pty) Ltd' || wa !== '27825550199') throw new Error(`parsed badly: ${name} / ${company} / ${wa}`)
  await page.getByRole('button', { name: 'Add contact' }).click()
  await page.waitForTimeout(600)
  const c = await page.locator('text=Thabo Timber').count()
  if (!c) throw new Error('contact missing')
  await shot('05-contacts')
})

await step('site days: no-show today + blocker', async () => {
  await page.goto(base + '/projects', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: /Kitchen cabinet refresh/ }).first().click()
  await page.waitForTimeout(700)
  const card = await page.locator('text=Site days').count()
  if (!card) throw new Error('site days card missing')
  await page.getByRole('button', { name: 'No-show today' }).click()
  await page.waitForTimeout(700)
  await shot('05c-site-days')
  const row = await page.locator('text=Today').count()
  if (!row) throw new Error('no-show not logged')
  const line = await page.locator('text=Last: no-show').count()
  if (!line) throw new Error('header last-visit line missing')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Mark as blocked…' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^Parts/ }).click()
  await page.getByPlaceholder('Waiting for Chris to confirm Monday').fill('Hinges on back-order until the 20th')
  await page.getByRole('button', { name: 'Mark blocked' }).click()
  await page.waitForTimeout(600)
  await shot('05d-blocked')
  const chip = await page.locator('text=Blocked · Parts').count()
  if (!chip) throw new Error('blocker chip missing')
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const first = await page.locator('a[href^="/projects/"]').filter({ hasText: 'Blocked · ' }).count()
  if (!first) throw new Error('blocked project not badged on the hub')
})

await step('quote expiry badge', async () => {
  await page.goto(base + '/projects', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: /Borehole pump replacement/ }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('tab', { name: /^Money/ }).click()
  await page.waitForTimeout(400)
  const expired = await page.locator('text=Expired').count()
  if (!expired) throw new Error('expired badge missing')
  await shot('05e-expired')
})

await step('hub: inbox shows a nudge from Kay', async () => {
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const inbox = await page.locator('text=waiting for you').count()
  if (!inbox) throw new Error('inbox not shown')
  await shot('05b-inbox')
  await page.getByRole('button', { name: 'Got it' }).first().click()
  await page.waitForTimeout(400)
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

await step('invite: make a link, see it pending, then cancel it', async () => {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Invite someone' }).click()
  await page.waitForTimeout(400)
  const sheet = page.locator('[role=dialog]')
  await sheet.getByLabel('Who is it for').fill('Gran')
  await sheet.getByRole('button', { name: 'Make the link' }).click()
  await page.waitForTimeout(800)
  const link = (await sheet.locator('text=/\\/join\\//').first().innerText()).trim()
  if (!/\/join\/[A-Z0-9]{6,}$/.test(link)) throw new Error(`the link looks wrong: ${link}`)
  await shot('07a-invite')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await page.waitForTimeout(500)
  if (!(await page.locator('text=Waiting to be accepted').count())) throw new Error('the invite is not listed as pending')

  // The rest is what the invited person sees, so it needs a browser that is NOT signed in —
  // carrying over the demo data, but none of the session.
  const demoState = await page.evaluate(() => localStorage.getItem('hub-demo-state-v2'))
  const guest = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await guest.addInitScript((st) => { localStorage.setItem('hub-demo-state-v2', st); localStorage.setItem('hub-theme', 'light') }, demoState)
  const visitor = await guest.newPage()
  try {
    const code = link.split('/join/')[1]
    await visitor.goto(base + '/join/' + code, { waitUntil: 'networkidle' })
    await visitor.waitForTimeout(1000)
    await visitor.screenshot({ path: 'qa-shots/flows/07b-join.png' })
    const body = await visitor.locator('body').innerText()
    if (!/invited you to join/i.test(body)) throw new Error('the join page does not name the invitation')
    if (!/The Bakers/.test(body)) throw new Error('the join page does not name the home')
    // The same form the login screen uses to start a home, so this covers both.
    for (const label of ['Your name', 'Email', 'Password']) {
      if (!(await visitor.getByLabel(label).count())) throw new Error(`the register form has no ${label} field`)
    }
    // ...except naming a home, which makes no sense when you are joining one that is already named.
    if (await visitor.getByLabel("What's your home called").count()) throw new Error('the join form asks you to name a home you are joining')
    if (!(await visitor.getByRole('button', { name: /Join The Bakers/ }).count())) throw new Error('no way to accept the invite')

    // A code that was never issued is turned away rather than offering a way in.
    await visitor.goto(base + '/join/NOTAREALCODE', { waitUntil: 'networkidle' })
    await visitor.waitForTimeout(900)
    const dead = await visitor.locator('body').innerText()
    if (!/won.t work/i.test(dead)) throw new Error('a bogus code was not refused')
    if (await visitor.getByRole('button', { name: /^Join /}).count()) throw new Error('a bogus code still offered a way in')
  } finally { await guest.close() }

  // Cancel it, and it stops being pending.
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: /Manage the invite for Gran/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('menuitem', { name: /Cancel the invite/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Cancel it' }).click()
  await page.waitForTimeout(700)
  if (await page.locator('text=Waiting to be accepted').count()) throw new Error('the invite is still pending after cancelling')
})

await step('login: signed out, the demo build offers its two people', async () => {
  // The real "Start your home" branch only exists when a backend is configured, and these flows
  // deliberately run against a demo-only build; registering itself is covered on the join page above.
  const guest = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await guest.addInitScript(() => localStorage.setItem('hub-theme', 'light'))
  const visitor = await guest.newPage()
  try {
    await visitor.goto(base + '/login', { waitUntil: 'networkidle' })
    await visitor.waitForTimeout(900)
    if (!/Who's home/i.test(await visitor.locator('body').innerText())) throw new Error('the signed-out login screen did not render')
    await visitor.screenshot({ path: 'qa-shots/flows/07c-login.png' })
  } finally { await guest.close() }
})

await step('settings: reachable on a phone, not just the desktop sidebar', async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await phone.addInitScript(() => { localStorage.setItem('hub-demo-user', 'u-russel'); localStorage.setItem('hub-theme', 'light') })
  const small = await phone.newPage()
  try {
    await small.goto(base + '/', { waitUntil: 'networkidle' })
    await small.waitForTimeout(900)
    // The sidebar that holds the Settings link is desktop-only, so there must be another way in.
    const sidebar = await small.locator('aside a[href="/settings"]').isVisible().catch(() => false)
    if (sidebar) throw new Error('the desktop sidebar is showing on a phone')
    const way = small.getByRole('link', { name: /settings/i })
    if (!(await way.count())) throw new Error('no way to reach Settings from a phone')
    await way.first().click()
    await small.waitForURL(/\/settings$/, { timeout: 5000 })
    await small.waitForTimeout(700)
    if (!/Who's in this home/.test(await small.locator('body').innerText())) throw new Error('Settings did not open')
    await small.screenshot({ path: 'qa-shots/flows/08-settings-phone.png' })
  } finally { await phone.close() }
})

await step('settings: theme toggle + rename', async () => {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Dark/ }).click()
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  if (theme !== 'dark') throw new Error('theme not applied')
  await page.getByRole('tab', { name: /Light/ }).click()
})

await step('settings: calm movement sticks and stops the entrance animation', async () => {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Calm/ }).click()
  await page.waitForTimeout(300)
  if (await page.evaluate(() => localStorage.getItem('hub-motion')) !== 'calm') throw new Error('the choice was not remembered')
  // With movement off, a page must be fully opaque on the very first frame after a route change.
  await page.goto(base + '/projects', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: 'Contacts' }).first().click()
  await page.waitForTimeout(60)
  const o = await page.evaluate(() => {
    const el = document.querySelector('main > div')
    return el ? Number(getComputedStyle(el).opacity) : null
  })
  if (o !== null && o < 0.99) throw new Error(`page still faded in at ${o}`)
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /Full/ }).click()
  await page.waitForTimeout(200)
  if (await page.evaluate(() => localStorage.getItem('hub-motion')) !== 'full') throw new Error('could not switch back')
})

await step('settings: the currency switches the whole app, and converts nothing', async () => {
  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  const picker = page.getByLabel('Currency')
  if (await picker.inputValue() !== 'ZAR') throw new Error('the demo home should start in rand')

  // A figure to watch: whatever the kitchen's budget reads in rand.
  await page.goto(base + '/projects/p-kitchen?tab=money', { waitUntil: 'networkidle' })
  const spent = page.locator('text=Real cost so far').locator('xpath=following-sibling::*[1]').first()
  const inRand = await settledText(spent)
  if (!inRand.startsWith('R')) throw new Error(`expected rand, got ${inRand}`)

  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.getByLabel('Currency').selectOption('USD')
  await page.waitForTimeout(900)
  if (!/\$1,234,567/.test(await page.locator('section', { hasText: 'How it reads' }).innerText())) throw new Error('the sample did not switch to dollars')

  await page.goto(base + '/projects/p-kitchen?tab=money', { waitUntil: 'networkidle' })
  const inDollars = await settledText(spent)
  if (!inDollars.startsWith('$')) throw new Error(`still not dollars: ${inDollars}`)
  // Same number, different symbol — nothing may be converted behind anyone's back.
  const digits = (t) => t.replace(/\D+/g, '')
  if (digits(inDollars) !== digits(inRand)) throw new Error(`the figure itself changed: ${inRand} -> ${inDollars}`)
  await shot('09-currency-usd')

  // And the input prefixes follow it.
  await page.getByRole('button', { name: 'Log', exact: true }).first().click()
  await page.waitForTimeout(500)
  const prefix = page.locator('[role=dialog] span', { hasText: /^\$$/ })
  if (!(await prefix.count())) throw new Error('the amount box still shows the old symbol')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  await page.goto(base + '/settings', { waitUntil: 'networkidle' })
  await page.getByLabel('Currency').selectOption('ZAR')
  await page.waitForTimeout(700)
  if (await page.getByLabel('Currency').inputValue() !== 'ZAR') throw new Error('could not switch back')
})

console.log(errors.length ? `\n${errors.length} errors:\n${errors.join('\n')}` : '\nNo console/page errors.')
await browser.close()
if (failed || errors.length) process.exit(1)
