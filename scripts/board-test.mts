/**
 * Quantities on priced items, and what they add up to.
 *   npm run board-test
 *
 * The shopping total is the number Russel and Kay actually plan against, so the arithmetic behind it
 * gets pinned down: four handles cost four handles, an absent quantity means one, and a stray
 * keypress can't turn four into forty thousand.
 */
import { lineTotal, priced, pricedTotal, pricedUnits, qtyOf } from '../src/lib/board'
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

console.log(failed === 0 ? '\nAll good.' : `\n${failed} failed.`)
if (failed > 0) process.exit(1)
