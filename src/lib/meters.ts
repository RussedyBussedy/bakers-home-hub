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

// ---------------------------------------------------------------------------
// Reading the bank's SMS
// ---------------------------------------------------------------------------

/** What a prepaid-electricity payment message turned out to say. */
export interface TopUpSms {
  /** What actually left the bank: the electricity amount plus the service fee. */
  amount: number | null
  /** Units bought, in kWh. */
  units: number | null
  /** The 20-digit credit token, regrouped in fours. */
  token: string
  /** The meter the token was issued against. */
  meter: string
  /** The electricity portion on its own. */
  elec: number | null
  /** The monthly service fee, when the message shows one. */
  serviceFee: number | null
  /** VAT — already inside the amount, shown but never added to it. */
  vat: number | null
  /** A total the message stated itself, if it stated one. */
  stated: number | null
  /** The date the message names, as yyyy-mm-dd, if it names one. */
  boughtOn: string | null
  /** How many of the four fields that matter came back. */
  found: number
}

/** A number as a bank writes it: 2 904.54, 2,904.54, 95,46. */
const SMS_NUM = String.raw`\d[\d\s ,]*(?:\.\d+)?`

function smsNumber(raw: string | undefined | null): number | null {
  if (!raw) return null
  let s = String(raw).replace(/[\s ]/g, '')
  // A comma is a thousands separator here unless it is plainly the decimal one.
  if (s.includes('.')) s = s.replace(/,/g, '')
  else if (/,\d{1,2}$/.test(s)) s = s.replace(/,(?=\d{1,2}$)/, '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return isFinite(n) ? n : null
}

/** The number that follows a label, wherever in the message the label sits. */
function smsField(text: string, label: string): number | null {
  // Up to a dozen non-digits of "…: R" between the label and its number, so
  // "Elec Amt: R404.54", "Service Fee - R95.46" and "Vat Amt R65.22" all read.
  return smsNumber(new RegExp(`${label}[^\\d]{0,12}(${SMS_NUM})`, 'i').exec(text)?.[1])
}

const SMS_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * A date the message names, but only one that could plausibly be a purchase:
 * within the last three years and not in the future. South African order, so
 * 09/12 is the ninth of December.
 */
function smsDate(text: string, now: Date): string | null {
  const make = (y: number, m: number, d: number): string | null => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const year = y < 100 ? 2000 + y : y
    const dt = new Date(Date.UTC(year, m - 1, d))
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
    const ahead = differenceInCalendarDays(dt, now)
    if (ahead > 1 || ahead < -1095) return null
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  let m = /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(text)
  if (m) { const v = make(+m[1]!, +m[2]!, +m[3]!); if (v) return v }

  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text)
  if (m) { const v = make(+m[3]!, +m[2]!, +m[1]!); if (v) return v }

  const mon = `(${SMS_MONTHS.join('|')})[a-z]*\\.?`
  m = new RegExp(`\\b(\\d{1,2})\\s*${mon}\\s*(\\d{2,4})?`, 'i').exec(text)
  if (m) { const v = make(m[3] ? +m[3] : now.getUTCFullYear(), SMS_MONTHS.indexOf(m[2]!.toLowerCase()) + 1, +m[1]!); if (v) return v }

  m = new RegExp(`\\b${mon}\\s*(\\d{1,2})\\b[,]?\\s*(\\d{4})?`, 'i').exec(text)
  if (m) { const v = make(m[3] ? +m[3] : now.getUTCFullYear(), SMS_MONTHS.indexOf(m[1]!.toLowerCase()) + 1, +m[2]!); if (v) return v }

  return null
}

/**
 * Reads a prepaid-electricity payment SMS.
 *
 * The message is the only honest record of a top-up — it carries the token, the
 * units and, crucially, the split between the electricity and the monthly
 * service fee. That split matters: on a fee month "Elec Amt" is not what left
 * the bank. R2 904.54 of electricity plus a R95.46 fee is a R3 000 payment, and
 * pricing the units at R2 904.54 would quietly flatter the rand-per-unit of
 * every fee month. VAT is already inside that total and is never added to it.
 *
 * Nothing here assumes a layout: every field is found by its own label, in any
 * order, so a change of wording loses one field rather than the whole message.
 */
export function parseTopUpSms(text: string, now = new Date()): TopUpSms | null {
  const body = String(text ?? '')
  if (!body.trim()) return null

  const elec = smsField(body, String.raw`\bElec(?:tricity)?\s*(?:Amt|Amount)\b`)
  const serviceFee = smsField(body, String.raw`\b(?:Service|Svc|Monthly)\s*(?:Fee|Charge)\b`)
  const vat = smsField(body, String.raw`\b(?:Vat|V\.A\.T\.?)\s*(?:Amt|Amount)?\b`)

  const stated =
    smsField(body, String.raw`\b(?:Amount\s*Paid|Amt\s*Paid|Total(?:\s*Amount)?|You\s*Paid)\b`) ??
    smsNumber(new RegExp(String.raw`(?:purchase|purchased|bought|payment)\w*\s*(?:of|for)?\s*[:\s]*R\s*(${SMS_NUM})`, 'i').exec(body)?.[1]) ??
    smsNumber(new RegExp(String.raw`R\s*(${SMS_NUM})\s*(?:of\s*)?(?:prepaid|electricity|purchase)`, 'i').exec(body)?.[1])

  // The parts are definitional; a stated total is kept separately so a mismatch
  // can be shown rather than silently resolved.
  const amount = elec !== null
    ? Math.round((elec + (serviceFee ?? 0)) * 100) / 100
    : stated

  const units =
    smsNumber(new RegExp(String.raw`(${SMS_NUM})\s*k\.?\s*w\.?\s*h`, 'i').exec(body)?.[1]) ??
    smsField(body, String.raw`\bUnits?\b`)

  // An STS token is always twenty digits, however the message groups them.
  const tokenHit =
    /(?:token|credit)\b[^\d]{0,16}((?:\d[\s-]?){20})(?!\d)/i.exec(body) ??
    /\b((?:\d{4}[\s-]){4}\d{4})\b/.exec(body) ??
    /\b((?:\d{5}[\s-]){3}\d{5})\b/.exec(body) ??
    /\b(\d{20})\b/.exec(body)
  const tokenDigits = (tokenHit?.[1] ?? '').replace(/\D/g, '')
  const token = tokenDigits.length === 20 ? tokenDigits.replace(/(\d{4})(?=\d)/g, '$1 ') : ''

  const meterHit =
    /meter\s*(?:no\.?|number|nr\.?|#)?[^\d\n]{0,8}(\d{6,20})\b/i.exec(body) ??
    /meter\s*(?:no\.?|number|nr\.?|#)?[^\d\n]{0,8}(\d[\d\s-]{4,22})/i.exec(body)
  const meter = (meterHit?.[1] ?? '').replace(/\D/g, '').slice(0, 20)

  // Hunt the date in what is left once the token is out of the way, so a
  // hyphen-grouped token can never be read as the ninth of December.
  const boughtOn = smsDate(tokenHit ? body.replace(tokenHit[1]!, ' ') : body, now)

  const found = [amount !== null, units !== null, !!token, !!meter].filter(Boolean).length
  if (!found) return null

  return { amount, units, token, meter, elec, serviceFee, vat, stated, boughtOn, found }
}
