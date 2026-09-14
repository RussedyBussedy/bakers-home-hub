/**
 * The meter arithmetic.
 *   npm run meters-test
 *
 * This is the part that has to be right. A council dispute rests on the daily
 * rate between two readings, and a prepaid forecast rests on adding topped-up
 * units back before the difference is taken. Both are easy to get subtly wrong
 * and impossible to spot by eye once a chart is drawn over them.
 */
import { addDays, format, subDays } from 'date-fns'
import type { MeterReading, UtilityPurchase } from '../src/data/types'
import { blendedRate, meterPeriods, prepaidOutlook, readingDue, recentPerDay } from '../src/lib/meters'

let failed = 0
function eq(got: unknown, want: unknown, label: string) {
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}
function near(got: number | null, want: number, label: string, tol = 0.05) {
  const ok = got !== null && Math.abs(got - want) <= tol
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${got}\n    want ≈${want}`}`)
}

const NOW = new Date('2026-09-14T12:00:00Z')
const day = (before: number) => format(subDays(NOW, before), 'yyyy-MM-dd')

let seq = 0
const water = (reading: number, daysAgo: number): MeterReading => ({
  id: `w${++seq}`, household_id: 'h', utility: 'water', reading, read_on: day(daysAgo),
  photo_path: null, source: 'self', notes: '', created_by: 'u', created_at: `${day(daysAgo)}T08:00:00Z`,
})
const elec = (reading: number, daysAgo: number): MeterReading => ({
  id: `e${++seq}`, household_id: 'h', utility: 'electricity', reading, read_on: day(daysAgo),
  photo_path: null, source: 'self', notes: '', created_by: 'u', created_at: `${day(daysAgo)}T18:00:00Z`,
})
const buy = (amount: number, units: number, daysAgo: number): UtilityPurchase => ({
  id: `p${++seq}`, household_id: 'h', utility: 'electricity', bought_on: day(daysAgo), amount, units,
  token: '', notes: '', receipt_path: null, created_by: 'u', created_at: `${day(daysAgo)}T18:00:00Z`,
})

// --- water: a rising dial --------------------------------------------------
{
  // 900 → 910 kl over 10 days = 10 000 L / 10 days = 1 000 L a day.
  const rs = [water(900, 20), water(910, 10)]
  const ps: UtilityPurchase[] = []
  const periods = meterPeriods(rs, ps, 'water')
  eq(periods.length, 1, 'water: two readings make one period')
  eq(periods[0]!.days, 10, 'water: days between readings')
  near(periods[0]!.used, 10000, 'water: kilolitres become litres')
  near(periods[0]!.perDay, 1000, 'water: litres a day')
  eq(periods[0]!.suspect, false, 'water: a climbing dial is not suspect')
}

{
  // A dial that goes backwards is a replaced meter or a typo, never consumption.
  const rs = [water(910, 20), water(900, 10)]
  const periods = meterPeriods(rs, [], 'water')
  eq(periods[0]!.suspect, true, 'water: a falling dial is flagged')
  eq(recentPerDay(periods), null, 'water: a suspect period never reaches an average')
}

{
  // Two readings on the same day tell you nothing; dividing by zero days would
  // hand back Infinity and draw a spike that never happened.
  const rs = [water(900, 10), water(902, 10)]
  eq(meterPeriods(rs, [], 'water').length, 0, 'water: same-day readings make no period')
}

// --- electricity: a falling meter that gets topped up ----------------------
{
  // 600 left, buy 200, end at 500 → used 600 + 200 − 500 = 300 over 10 days.
  const rs = [elec(600, 20), elec(500, 10)]
  const ps = [buy(700, 200, 15)]
  const periods = meterPeriods(rs, ps, 'electricity')
  eq(periods.length, 1, 'prepaid: one period')
  near(periods[0]!.toppedUp, 200, 'prepaid: the top-up inside the period is counted')
  near(periods[0]!.used, 300, 'prepaid: units bought are added back before the difference')
  near(periods[0]!.perDay, 30, 'prepaid: kWh a day')
}

{
  // A token loaded on the same day as the opening reading is already in it —
  // counting it again would double the month's consumption.
  const rs = [elec(600, 20), elec(500, 10)]
  const ps = [buy(700, 200, 20)]
  near(meterPeriods(rs, ps, 'electricity')[0]!.used, 100, 'prepaid: a top-up dated with the opening reading is not re-counted')
}

{
  // One on the closing day, though, has landed within the period.
  const rs = [elec(600, 20), elec(700, 10)]
  const ps = [buy(700, 200, 10)]
  near(meterPeriods(rs, ps, 'electricity')[0]!.used, 100, 'prepaid: a top-up on the closing day counts')
}

// --- the blended rate ------------------------------------------------------
{
  // R500 → 96.4 kWh (service fee month) and R3 000 → 774.1 kWh, blended.
  const ps = [buy(500, 96.4, 40), buy(3000, 774.1, 10)]
  near(blendedRate(ps), 3500 / 870.5, 'rate: rand over units, fee and all', 0.001)
  eq(blendedRate([]), null, 'rate: nothing bought, nothing to say')
  eq(blendedRate([buy(500, 0, 5)]), null, 'rate: a top-up with no units cannot price anything')
}

// --- the forecast ----------------------------------------------------------
{
  // 300 kWh left five days ago, burning 30 a day → about 150 left, five days to go.
  const rs = [elec(600, 15), elec(300, 5)]
  const ps = [buy(1200, 300, 20)]
  const o = prepaidOutlook(rs, ps, 'electricity', NOW)!
  near(o.perDay, 30, 'forecast: the recent burn')
  near(o.estimatedNow!, 150, 'forecast: the days since the reading are burned off it')
  eq(o.daysLeft, 5, 'forecast: days left at that burn')
}

{
  // Buying after the last reading has to show up, or the app tells you you are
  // about to run out on the evening you just spent R3 000.
  const rs = [elec(600, 15), elec(300, 5)]
  const ps = [buy(1200, 300, 20), buy(3000, 774, 1)]
  const o = prepaidOutlook(rs, ps, 'electricity', NOW)!
  near(o.estimatedNow!, 924, 'forecast: a top-up since the reading is added back')
}

eq(prepaidOutlook([], [], 'electricity', NOW), null, 'forecast: no readings, no forecast')

// --- when a reading is due -------------------------------------------------
{
  const at = (daysAgo: number) => readingDue([water(900, daysAgo)], 'water', NOW).state
  eq(readingDue([], 'water', NOW).state, 'none', 'due: nothing logged')
  eq(at(3), 'fresh', 'due: a few days ago is fine')
  eq(at(20), 'fresh', 'due: three weeks is still fine')
  eq(at(21), 'soon', 'due: at three weeks it starts mentioning it')
  eq(at(27), 'soon', 'due: still just a mention')
  eq(at(28), 'due', 'due: four weeks and it asks')
  eq(at(30), 'due', 'due: a month and it asks')
  eq(at(31), 'overdue', 'due: past a month it warns')
  eq(at(90), 'overdue', 'due: long past is still overdue')
  eq(readingDue([water(900, 40), water(910, 2)], 'water', NOW).state, 'fresh', 'due: the newest reading is what counts')
}

// --- a future reading shouldn't read as overdue ----------------------------
{
  const future: MeterReading = { ...water(900, 0), read_on: format(addDays(NOW, 2), 'yyyy-MM-dd') }
  eq(readingDue([future], 'water', NOW).daysSince, 0, 'due: a date in the future is not negative days')
}

console.log(failed ? `\n${failed} failed` : '\nAll good.')
process.exit(failed ? 1 : 0)
