/**
 * Quantities on priced items, and what they add up to.
 *   npm run board-test
 *
 * The shopping total is the number Russel and Kay actually plan against, so the arithmetic behind it
 * gets pinned down: four handles cost four handles, an absent quantity means one, and a stray
 * keypress can't turn four into forty thousand.
 */
import { comparisonRange, comparisons, groupNames, isBought, lineTotal, priced, pricedRange, pricedTotal, pricedUnits, qtyOf } from '../src/lib/board'
import type { BoardItem, ProductData } from '../src/data/types'

let failed = 0
const eq = (got: unknown, want: unknown, label: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}

const d = (price: number | null, qty?: number): ProductData => ({ title: 'Thing', price, ...(qty === undefined ? {} : { qty }) })

// --- how many ---------------------------------------------------------------
eq(qtyOf(d(10)), 1, 'nothing said means one')
eq(qtyOf(d(10, 4)), 4, 'four is four')
eq(qtyOf(d(10, 0)), 1, 'nought would make a line free — it is one')
eq(qtyOf(d(10, -3)), 1, 'and so is a negative')
eq(qtyOf(d(10, 2.7)), 2, 'a fraction of a tap is not a thing; it rounds down')
eq(qtyOf(d(10, 99999)), 9999, 'a runaway number is capped')
eq(qtyOf(d(10, NaN)), 1, 'and nonsense falls back to one')
eq(qtyOf({ title: 'T', price: 5, qty: '3' as unknown as number }), 3, 'a number that arrived as text still counts')

// --- what a line costs ------------------------------------------------------
eq(lineTotal(d(250, 4)), 1000, 'four at 250')
eq(lineTotal(d(250)), 250, 'one at 250')
eq(lineTotal(d(null, 4)), 0, 'no price means nothing to add, however many')
eq(lineTotal(d(19.99, 3)), 59.97, 'cents survive the multiplication')

// --- the shopping total -----------------------------------------------------
const item = (data: ProductData, id: string, created = '2026-01-01'): BoardItem => ({
  id, project_id: 'p', type: 'product', x: 0, y: 0, w: 10, h: 10, rotation: 0, z: 1,
  data, created_by: 'u', created_at: created, updated_at: created,
})
const note = { ...item(d(9999), 'n'), type: 'note' as const, data: { text: 'not a price', tint: 'butter' as const } }

const list = [item(d(250, 4), 'a', '2026-01-01'), item(d(1200), 'b', '2026-01-02'), item(d(null, 2), 'c', '2026-01-03'), note]
eq(pricedTotal(list), 2200, 'lines are multiplied out before they are added')
eq(pricedUnits(list), 7, 'and things are counted individually')
eq(pricedTotal([note]), 0, 'a note is not a price')
eq(pricedTotal([]), 0, 'an empty project owes nothing')

// The list is ordered by what each line costs, not by unit price: four cheap handles can
// outweigh one dear tap, and that is the number worth noticing first.
eq(priced(list).map((i) => i.id), ['b', 'a', 'c'], 'dearest line first, then by age')
eq(priced([item(d(100, 20), 'many'), item(d(500), 'one')]).map((i) => i.id), ['many', 'one'],
  'twenty cheap ones outrank one dear one')


// ---------------------------------------------------------------------------
// Comparisons
//
// Five dining tables from five shops are one decision, not five purchases. Getting this wrong
// means the app confidently tells Russel his kitchen costs five times what it does.
// ---------------------------------------------------------------------------
const opt = (id: string, price: number | null, group?: string, extra: Partial<ProductData> = {}, qty?: number): BoardItem =>
  item({ title: id, price, ...(qty === undefined ? {} : { qty }), ...(group === undefined ? {} : { group }), ...extra }, id)

const tables = [
  opt('t-cheap', 8999, 'Dining table'),
  opt('t-mid', 14500, 'Dining table'),
  opt('t-dear', 24500, 'Dining table'),
]
const chairs = [opt('c-a', 1200, 'Chairs', {}, 6), opt('c-b', 1850, 'Chairs', {}, 6)]

let cs = comparisons([...tables, ...chairs])
eq(cs.length, 2, 'two things being shopped for')
eq(cs.map((c) => c.name), ['Dining table', 'Chairs'], 'named, in the order they appear')
eq(cs[0]!.options.length, 3, 'three tables to choose between')
eq(cs[0]!.cheapest?.id, 't-cheap', 'the cheapest table')
eq(cs[0]!.dearest?.id, 't-dear', 'and the dearest')
eq(cs[1]!.cheapest?.id, 'c-a', 'chairs compare on the line, not the unit price')

// An open decision costs somewhere between its options; nothing is added to anything.
eq(comparisonRange(cs[0]!), { low: 8999, high: 24500, settled: false }, 'an open decision is a range')
eq(comparisonRange(cs[1]!), { low: 7200, high: 11100, settled: false }, 'six chairs each way')

let r = pricedRange([...tables, ...chairs])
eq({ low: r.low, high: r.high }, { low: 16199, high: 35600 }, 'the project range is the decisions summed, never the options')
eq({ open: r.open, settled: r.settled }, { open: 2, settled: 0 }, 'both still open')

// Picking one settles that decision and narrows the range from both ends.
const picked = [opt('t-cheap', 8999, 'Dining table'), opt('t-mid', 14500, 'Dining table', { chosen: true }), opt('t-dear', 24500, 'Dining table'), ...chairs]
cs = comparisons(picked)
eq(cs[0]!.pick?.id, 't-mid', 'the pick is remembered')
eq(comparisonRange(cs[0]!), { low: 14500, high: 14500, settled: true }, 'a settled decision is one figure, not the cheapest')
r = pricedRange(picked)
eq({ low: r.low, high: r.high, settled: r.settled, open: r.open }, { low: 21700, high: 25600, settled: 1, open: 1 }, 'the range narrows around the pick')

// Buying takes the decision out of the plan entirely: it is real cost now, and the Money tab is
// already counting it. Leaving it in would say the same money twice.
const bought = [opt('t-cheap', 8999, 'Dining table'), opt('t-mid', 14500, 'Dining table', { chosen: true, expense_id: 'e1' }), opt('t-dear', 24500, 'Dining table'), ...chairs]
r = pricedRange(bought)
eq({ low: r.low, high: r.high, bought: r.bought, open: r.open }, { low: 7200, high: 11100, bought: 1, open: 1 }, 'a bought decision leaves the plan')
eq(isBought({ title: 'x', price: 1, expense_id: 'e1' }), true, 'an expense id means bought')
eq(isBought({ title: 'x', price: 1 }), false, 'and nothing means not')

// Ungrouped items are decisions of one — every price that existed before groups did still behaves
// exactly as it always has.
const loose = [opt('a', 250), opt('b', 400)]
cs = comparisons(loose)
eq(cs.length, 2, 'two ungrouped items are two decisions, not one group of two')
eq(cs.map((c) => c.name), ['', ''], 'and they have no name')
r = pricedRange(loose)
eq({ low: r.low, high: r.high }, { low: 650, high: 650 }, 'so they simply add up, as before')
eq(pricedTotal(loose), 650, 'and the flat total still agrees')

// Odds and ends
eq(comparisons([]).length, 0, 'nothing to compare')
eq(pricedRange([]), { low: 0, high: 0, open: 0, settled: 0, bought: 0 }, 'an empty project')
const noPrice = [opt('np1', null, 'Rug'), opt('np2', null, 'Rug')]
eq(comparisons(noPrice)[0]!.cheapest, null, 'a group where nothing has a price yet has no cheapest')
eq(comparisonRange(comparisons(noPrice)[0]!), { low: 0, high: 0, settled: false }, 'and costs nothing so far')
eq(comparisons([opt('m1', 100, 'Mixed'), opt('m2', null, 'Mixed')])[0]!.cheapest?.id, 'm1', 'unpriced options are ignored when ranking')

eq(groupNames([...tables, ...chairs, opt('x', 5)]), ['Chairs', 'Dining table'], 'the groups in use, alphabetically, ignoring loose items')
eq(groupNames([opt('a', 1, '  Table  '), opt('b', 2, 'Table')]), ['Table'], 'and spacing around a name does not make a second group')

console.log(failed === 0 ? '\nAll good.' : `\n${failed} failed.`)
if (failed > 0) process.exit(1)
