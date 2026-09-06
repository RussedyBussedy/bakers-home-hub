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
