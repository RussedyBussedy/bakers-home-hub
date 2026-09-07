import type { BoardItem, ProductData } from '../data/types'

/**
 * Priced items and board pins are one list: a product pin carries a price, and anything with a price
 * is a product pin. `off_board` is how an item stays in the project's price list without being pinned
 * on the inspiration board — so a long shopping list doesn't wreck a carefully arranged board.
 */
export function onBoard(items: BoardItem[]): BoardItem[] {
  return items.filter((i) => !(i.type === 'product' && (i.data as ProductData).off_board))
}

/** Everything priced for this project, cheapest last so the dear ones are noticed first. */
export function priced(items: BoardItem[]): BoardItem[] {
  return items
    .filter((i) => i.type === 'product')
    .sort((a, b) => lineTotal(b.data as ProductData) - lineTotal(a.data as ProductData) || a.created_at.localeCompare(b.created_at))
}

/**
 * How many of a thing. Whole, at least one, and capped — a stray keypress that turns four handles
 * into forty thousand shouldn't quietly rewrite the shopping total.
 */
export function qtyOf(d: ProductData): number {
  const n = Math.floor(Number(d.qty ?? 1))
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 9999) : 1
}

/** What this line costs: the price times how many. */
export function lineTotal(d: ProductData): number {
  return (d.price ?? 0) * qtyOf(d)
}

export function pricedTotal(items: BoardItem[]): number {
  return items.reduce((sum, i) => (i.type === 'product' ? sum + lineTotal(i.data as ProductData) : sum), 0)
}

/** Everything counted individually — four handles are four things, not one line. */
export function pricedUnits(items: BoardItem[]): number {
  return items.reduce((sum, i) => (i.type === 'product' ? sum + qtyOf(i.data as ProductData) : sum), 0)
}

// ---------------------------------------------------------------------------
// Comparisons
//
// The price list is not a shopping list. Five dining tables from five shops are one decision, not
// five purchases, so they are never added together — they are compared, one is picked, and only
// the picks count. Items sharing a `group` are options for the same thing; an item with no group
// is a decision of one, which is why every price that existed before groups did still behaves
// exactly as it did.
// ---------------------------------------------------------------------------

export interface Comparison {
  /** What is being shopped for — "Dining table". Empty for the items that stand alone. */
  name: string
  /** The competing options, dearest line first (the order `priced` already puts them in). */
  options: BoardItem[]
  /** The one settled on, if any. */
  pick: BoardItem | null
  /** The cheapest option that has a price at all — what the group costs if you go by money alone. */
  cheapest: BoardItem | null
  /** The dearest priced option, for the top of the range. */
  dearest: BoardItem | null
  /** Already bought, so this decision is closed and its cost is real, not planned. */
  bought: BoardItem | null
}

export function groupOf(d: ProductData): string {
  return (d.group ?? '').trim()
}

/** Bought means an expense was created from it — the id is the link back to that expense. */
export function isBought(d: ProductData): boolean {
  return Boolean(d.expense_id)
}

const priceOf = (i: BoardItem) => (i.data as ProductData).price

/**
 * Split priced items into the decisions they represent.
 *
 * Grouped items gather under their name; ungrouped ones each become a decision of one, keyed so
 * they can never collide with a real group name. Order follows the incoming list, so the dearest
 * decision leads.
 */
export function comparisons(items: BoardItem[]): Comparison[] {
  const order: string[] = []
  const bins = new Map<string, BoardItem[]>()
  for (const item of items) {
    if (item.type !== 'product') continue
    const name = groupOf(item.data as ProductData)
    // A blank group is not a group: those items must not all pile into one bin together.
    const key = name || `\u0000alone:${item.id}`
    if (!bins.has(key)) { bins.set(key, []); order.push(key) }
    bins.get(key)!.push(item)
  }
  return order.map((key) => {
    const options = bins.get(key)!
    const withPrice = options.filter((i) => priceOf(i) != null)
    const byLine = [...withPrice].sort((a, b) => lineTotal(a.data as ProductData) - lineTotal(b.data as ProductData))
    return {
      name: key.startsWith('\u0000alone:') ? '' : key,
      options,
      pick: options.find((i) => (i.data as ProductData).chosen) ?? null,
      cheapest: byLine[0] ?? null,
      dearest: byLine[byLine.length - 1] ?? null,
      bought: options.find((i) => isBought(i.data as ProductData)) ?? null,
    }
  })
}

/**
 * What a decision costs. Once something is bought that is the answer; a pick is the answer next;
 * otherwise the group is still open and costs somewhere between its cheapest and its dearest.
 */
export function comparisonRange(c: Comparison): { low: number; high: number; settled: boolean } {
  const settled = c.bought ?? c.pick
  if (settled) {
    const n = lineTotal(settled.data as ProductData)
    return { low: n, high: n, settled: true }
  }
  return {
    low: c.cheapest ? lineTotal(c.cheapest.data as ProductData) : 0,
    high: c.dearest ? lineTotal(c.dearest.data as ProductData) : 0,
    settled: false,
  }
}

/**
 * What the whole project's shopping comes to: a range while options are still open, narrowing to a
 * single figure as each decision is settled. Items already bought are left out — their cost is real
 * now and the Money tab is counting it; adding it here as well would say it twice.
 */
export function pricedRange(items: BoardItem[]): { low: number; high: number; open: number; settled: number; bought: number } {
  let low = 0, high = 0, open = 0, settled = 0, bought = 0
  for (const c of comparisons(items)) {
    if (c.bought) { bought++; continue }
    const r = comparisonRange(c)
    low += r.low
    high += r.high
    if (r.settled) settled++
    else open++
  }
  return { low, high, open, settled, bought }
}

/** Every group name in use, for suggesting one as a new price is added. */
export function groupNames(items: BoardItem[]): string[] {
  const seen = new Set<string>()
  for (const i of items) {
    if (i.type !== 'product') continue
    const g = groupOf(i.data as ProductData)
    if (g) seen.add(g)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/**
 * Somewhere sensible to drop a pin that was created away from the board: below everything already
 * there, laid out left to right, so it never lands on top of existing work.
 */
export function nextSlot(items: BoardItem[], w: number, h: number): { x: number; y: number } {
  const visible = onBoard(items)
  if (visible.length === 0) return { x: 80, y: 80 }
  const left = Math.min(...visible.map((i) => i.x))
  const bottom = Math.max(...visible.map((i) => i.y + i.h))
  const row = visible.filter((i) => i.y + i.h > bottom - 8)
  const right = row.length ? Math.max(...row.map((i) => i.x + i.w)) : left
  const gutter = 32
  // Start a new row once this one runs about four pins wide.
  return right - left > (w + gutter) * 4 ? { x: left, y: bottom + gutter } : { x: right + gutter, y: bottom - h }
}
