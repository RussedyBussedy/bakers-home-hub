import { differenceInCalendarDays } from 'date-fns'
import { UTILITIES, type MeterReading, type Utility, type UtilityPurchase } from '../data/types'
import { toDate } from './utils'

/**
 * What happened between two consecutive readings of the same meter.
 *
 * A period is the only thing a meter can actually tell you: a dial on its own is
 * a number, but two dials and the days between them are a rate — and a rate is
 * what a council dispute, or a suspicion about a leak, turns on.
 */
export interface MeterPeriod {
  from: MeterReading
  to: MeterReading
  days: number
  /** Consumed over the period, in the utility's usage unit (litres, kWh). */
  used: number
  /** Consumption per day, in the usage unit. */
  perDay: number
  /** Units topped up inside the period — prepaid only, and part of the sum. */
  toppedUp: number
  /** A reading that went the wrong way: a dial replaced, or a typo. Excluded from averages. */
  suspect: boolean
}

/** Readings for one meter, oldest first. */
export function readingsFor(readings: MeterReading[], utility: Utility): MeterReading[] {
  return readings
    .filter((r) => r.utility === utility)
    .sort((a, b) => a.read_on.localeCompare(b.read_on) || a.created_at.localeCompare(b.created_at))
}

export function purchasesFor(purchases: UtilityPurchase[], utility: Utility): UtilityPurchase[] {
  return purchases
    .filter((p) => p.utility === utility)
    .sort((a, b) => a.bought_on.localeCompare(b.bought_on) || a.created_at.localeCompare(b.created_at))
}

/**
 * Every gap between consecutive readings, turned into a daily rate.
 *
 * A rising meter (water) simply climbs. A prepaid meter falls as it is used and
 * jumps when a token is loaded, so anything bought inside the gap has to be added
 * back before the difference means anything. A top-up dated the same day as the
 * opening reading is taken to be already in that reading — which is what happens
 * when you glance at the meter right after loading a token.
 */
export function meterPeriods(readings: MeterReading[], purchases: UtilityPurchase[], utility: Utility): MeterPeriod[] {
  const meta = UTILITIES[utility]
  const rs = readingsFor(readings, utility)
  const ps = purchasesFor(purchases, utility)
  const out: MeterPeriod[] = []

  for (let i = 1; i < rs.length; i++) {
    const from = rs[i - 1]!
    const to = rs[i]!
    const a = toDate(from.read_on)
    const b = toDate(to.read_on)
    if (!a || !b) continue
    const days = differenceInCalendarDays(b, a)
    if (days <= 0) continue

    const toppedUp = meta.direction === 'falling'
      ? ps.filter((p) => p.bought_on > from.read_on && p.bought_on <= to.read_on).reduce((s, p) => s + Number(p.units || 0), 0)
      : 0

    const rawUsed = meta.direction === 'rising'
      ? Number(to.reading) - Number(from.reading)
      : Number(from.reading) + toppedUp - Number(to.reading)

    const used = rawUsed * meta.usageFactor
    out.push({ from, to, days, used, perDay: used / days, toppedUp, suspect: rawUsed < 0 })
  }
  return out
}

/** The most recent reading of a meter, or null. */
export function latestReading(readings: MeterReading[], utility: Utility): MeterReading | null {
  const rs = readingsFor(readings, utility)
  return rs.length ? rs[rs.length - 1]! : null
}

export type ReadingDueState = 'none' | 'fresh' | 'soon' | 'due' | 'overdue'

export interface ReadingDue {
  state: ReadingDueState
  /** Days since the last reading, or null if there has never been one. */
  daysSince: number | null
  last: MeterReading | null
}

/**
 * How overdue a reading is.
 *
 * The council reads monthly, so a month is the rhythm worth keeping: nothing is
 * said until three weeks have passed, a nudge at 25 days, and past 31 the record
 * has a hole in it exactly where a disputed statement would land.
 */
export function readingDue(readings: MeterReading[], utility: Utility, now = new Date()): ReadingDue {
  const last = latestReading(readings, utility)
  if (!last) return { state: 'none', daysSince: null, last: null }
  const d = toDate(last.read_on)
  if (!d) return { state: 'none', daysSince: null, last }
  const daysSince = Math.max(0, differenceInCalendarDays(now, d))
  const state: ReadingDueState =
    daysSince >= 31 ? 'overdue'
      : daysSince >= 28 ? 'due'
        : daysSince >= 21 ? 'soon'
          : 'fresh'
  return { state, daysSince, last }
}

/**
 * Rand per unit across a set of top-ups — the blended rate, which is the honest
 * one: a monthly service fee taken off the first token of the month makes a small
 * purchase look dearer per unit, and hiding that would flatter the average.
 */
export function blendedRate(purchases: UtilityPurchase[], utility: Utility = 'electricity'): number | null {
  const ps = purchasesFor(purchases, utility)
  const units = ps.reduce((s, p) => s + Number(p.units || 0), 0)
  const rand = ps.reduce((s, p) => s + Number(p.amount || 0), 0)
  return units > 0 ? rand / units : null
}

/** Rand per unit for a single top-up. */
export function purchaseRate(p: UtilityPurchase): number | null {
  return Number(p.units) > 0 ? Number(p.amount) / Number(p.units) : null
}

/**
 * The average daily burn over recent periods, ignoring readings that went
 * backwards. Recency matters more than history here — a household that has just
 * fixed a leak should not be told it is still leaking.
 */
export function recentPerDay(periods: MeterPeriod[], take = 3): number | null {
  const good = periods.filter((p) => !p.suspect).slice(-take)
  if (!good.length) return null
  const days = good.reduce((s, p) => s + p.days, 0)
  const used = good.reduce((s, p) => s + p.used, 0)
  return days > 0 ? used / days : null
}

export interface PrepaidOutlook {
  /** Units left on the meter at the last reading. */
  balance: number
  /** As at this date. */
  asAt: string
  /** Burn used for the forecast, units/day. */
  perDay: number | null
  /** Units left now, allowing for the days that have passed and anything bought since. */
  estimatedNow: number | null
  /** Days from today until it runs out, or null if the burn isn't known yet. */
  daysLeft: number | null
  /** What a day costs at the blended rate. */
  costPerDay: number | null
}

/**
 * What the prepaid meter is probably sitting on right now.
 *
 * The last reading is only true for the moment it was taken, so the days since
 * are burned off it and anything topped up since is added back. It is an
 * estimate and says so — the point is to catch "we're about to run out on a
 * Sunday night", not to be exact.
 */
export function prepaidOutlook(
  readings: MeterReading[],
  purchases: UtilityPurchase[],
  utility: Utility = 'electricity',
  now = new Date(),
): PrepaidOutlook | null {
  const last = latestReading(readings, utility)
  if (!last) return null
  const d = toDate(last.read_on)
  if (!d) return null
  const perDay = recentPerDay(meterPeriods(readings, purchases, utility))
  const rate = blendedRate(purchases, utility)
  const sinceDays = Math.max(0, differenceInCalendarDays(now, d))
  const boughtSince = purchasesFor(purchases, utility)
    .filter((p) => p.bought_on > last.read_on)
    .reduce((s, p) => s + Number(p.units || 0), 0)

  const estimatedNow = perDay === null ? null : Math.max(0, Number(last.reading) + boughtSince - perDay * sinceDays)
  return {
    balance: Number(last.reading),
    asAt: last.read_on,
    perDay,
    estimatedNow,
    daysLeft: perDay && perDay > 0 && estimatedNow !== null ? Math.floor(estimatedNow / perDay) : null,
    costPerDay: perDay !== null && rate !== null ? perDay * rate : null,
  }
}

/** A short, plain sentence for a daily rate — "1 240 L a day", "9.4 kWh a day". */
export function perDayLabel(perDay: number | null, utility: Utility): string {
  if (perDay === null || !isFinite(perDay)) return '—'
  const unit = UTILITIES[utility].usageUnit
  const n = perDay >= 100 ? Math.round(perDay) : Math.round(perDay * 10) / 10
  return `${n.toLocaleString()} ${unit}/day`
}

/** What typing a dial straight across turned out to mean. */
export interface DialReading {
  /** The value in the meter's own unit — 1046.6205 kl. */
  value: number
  /** The black wheels. */
  whole: number
  /** The red wheels, as written (so "0620" keeps its leading zero). */
  fraction: string
  /** True when the person typed a decimal point themselves and we took them at their word. */
  literal: boolean
}

/**
 * Reads the dial the way it is written on the meter.
 *
 * A domestic water meter puts whole kilolitres on black wheels and the
 * fraction on red ones, and the natural thing is to read straight across:
 * 1046 then 6205. Typed as one number that is ten million, which is how a
 * household came to look like it was using six million litres a day. So the
 * trailing `decimals` wheels are split back off — unless a decimal point was
 * typed, in which case the person has already said where it goes.
 */
export function parseDial(text: string, decimals: number): DialReading | null {
  const cleaned = String(text ?? '').trim().replace(/[\s,_]/g, '')
  if (!cleaned) return null

  // A typed point (or comma, handled above) means: this is the number, as written.
  if (cleaned.includes('.')) {
    const v = Number(cleaned)
    if (!isFinite(v)) return null
    const [w, f = ''] = cleaned.split('.')
    return { value: v, whole: Math.trunc(Number(w) || 0), fraction: f, literal: true }
  }

  if (!/^-?\d+$/.test(cleaned)) return null
  const negative = cleaned.startsWith('-')
  const digits = negative ? cleaned.slice(1) : cleaned
  const d = Math.max(0, Math.floor(decimals || 0))

  // Nothing to split: a meter with no red wheels, or fewer digits than it has.
  if (d === 0 || digits.length <= d) {
    const v = Number(cleaned)
    return isFinite(v) ? { value: v, whole: Math.trunc(v), fraction: '', literal: false } : null
  }

  const whole = digits.slice(0, digits.length - d)
  const fraction = digits.slice(digits.length - d)
  const value = Number(`${negative ? '-' : ''}${whole}.${fraction}`)
  return isFinite(value) ? { value, whole: Number(whole), fraction, literal: false } : null
}

/** A reading as it should be written down: the number, then the unit off the dial. */
export function readingLabel(value: number, utility: Utility, decimals = 3): string {
  const unit = UTILITIES[utility].unit
  const d = Math.max(0, Math.min(6, Math.floor(decimals || 0)))
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })} ${unit}`
}

/**
 * The same reading said in plain words — "1 046 kl and 620.5 L" — so a number
 * split off a dial can be checked against the dial at a glance.
 */
export function dialInWords(r: DialReading, utility: Utility): string {
  const meta = UTILITIES[utility]
  const whole = `${Math.trunc(r.value).toLocaleString()} ${meta.unit}`
  // Work from the digits as written, not from the float: 1046.6205 minus 1046 is
  // 0.62049999… in binary, which quietly loses the tenth of a litre the last red
  // wheel exists to show.
  const written = r.fraction || String(r.value).split('.')[1] || ''
  if (!written || !Number(written)) return whole
  const inUsage = Number(`0.${written}`) * meta.usageFactor
  const n = Math.round(inUsage * 10) / 10
  return `${whole} and ${n.toLocaleString()} ${meta.usageUnit}`
}

/** Litres or kWh, written the way a person would say them. */
export function usedLabel(used: number, utility: Utility): string {
  const unit = UTILITIES[utility].usageUnit
  const n = used >= 100 ? Math.round(used) : Math.round(used * 10) / 10
  return `${n.toLocaleString()} ${unit}`
}
