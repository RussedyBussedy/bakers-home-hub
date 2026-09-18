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
import { blendedRate, dialInWords, meterPeriods, parseDial, parseTopUpSms, prepaidOutlook, readingDue, readingLabel, recentPerDay } from '../src/lib/meters'

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

// --- reading the dial straight across --------------------------------------
{
  // The Bakers' meter: four black wheels, four red. 1046 | 6205.
  const r = parseDial('10466205', 4)!
  eq(r.value, 1046.6205, 'dial: four red wheels split off the end')
  eq(r.whole, 1046, 'dial: the black wheels')
  eq(r.fraction, '6205', 'dial: the red wheels, as written')
  eq(r.literal, false, 'dial: it was split, not taken at face value')
  eq(dialInWords(r, 'water'), '1,046 kl and 620.5 L', 'dial: said in plain words')

  // The two readings that started this: 1187.1 L over two days, not six million.
  const a = parseDial('10454334', 4)!, b = parseDial('10466205', 4)!
  near((b.value - a.value) * 1000, 1187.1, 'dial: two days of ordinary household use', 0.05)
}

{
  // Leading zeros on the red wheels have to survive — .0620 is not .620.
  const r = parseDial('10460620', 4)!
  eq(r.value, 1046.062, 'dial: a leading zero in the fraction')
  eq(r.fraction, '0620', 'dial: the zero is kept as written')
  eq(readingLabel(r.value, 'water', 4), '1,046.0620 kl', 'dial: printed back at the dial’s own precision')
}

{
  // A typed point means the person has already said where it goes.
  const r = parseDial('1046.6205', 4)!
  eq(r.value, 1046.6205, 'dial: a typed decimal point is obeyed')
  eq(r.literal, true, 'dial: and marked as taken literally')
  eq(parseDial('958', 3)!.value, 958, 'dial: fewer digits than red wheels is left alone')
  eq(parseDial('742', 0)!.value, 742, 'dial: a meter with no red wheels')
}

{
  // What people actually type.
  eq(parseDial('1 046 6205', 4)!.value, 1046.6205, 'dial: spaces ignored')
  eq(parseDial('10,466,205', 4)!.value, 1046.6205, 'dial: thousands separators ignored')
  eq(parseDial('', 4), null, 'dial: nothing typed, nothing read')
  eq(parseDial('   ', 4), null, 'dial: blank')
  eq(parseDial('abc', 4), null, 'dial: letters are not a reading')
  eq(parseDial('12ab34', 4), null, 'dial: half a number is not a reading')
}

{
  // The old three-wheel default still behaves.
  eq(parseDial('958205', 3)!.value, 958.205, 'dial: three red wheels')
  eq(parseDial('1012000', 3)!.value, 1012, 'dial: red wheels all at zero')
  eq(readingLabel(1012, 'water', 3), '1,012.000 kl', 'dial: trailing zeros are shown, not trimmed')
}

// --- reading the payment SMS ------------------------------------------------
{
  // The shape that started this: a fee month. R2 904.54 of electricity plus the
  // R95.46 service fee is the R3 000 that left the bank — and pricing 774.1 kWh
  // at R2 904.54 would make a fee month look like the cheapest of the year.
  const sms = [
    'FNB :-) Prepaid Electricity purchase of R3 000.00 from cheque acc..1234 on 03/09/2026.',
    'Meter: 14308043075',
    'Elec Amt: R2 904.54',
    'Service Fee: R95.46',
    'Vat Amt: R391.30',
    'Units: 774.1 kWh',
    'Token: 1234 5678 9012 3456 7890',
  ].join('\n')
  const r = parseTopUpSms(sms, NOW)!
  eq(r.amount, 3000, 'sms: electricity plus the service fee is what was paid')
  eq(r.elec, 2904.54, 'sms: the electricity portion on its own')
  eq(r.serviceFee, 95.46, 'sms: the service fee')
  eq(r.vat, 391.3, 'sms: VAT, which is already inside the total')
  eq(r.stated, 3000, 'sms: the total the message states itself')
  eq(r.units, 774.1, 'sms: units')
  eq(r.token, '1234 5678 9012 3456 7890', 'sms: the token, regrouped in fours')
  eq(r.meter, '14308043075', 'sms: the meter number')
  eq(r.boughtOn, '2026-09-03', 'sms: the date, read the South African way round')
  eq(r.found, 4, 'sms: all four fields that matter')
}

{
  // Adding the two halves in floating point gives 2999.9999999999995, which
  // would be stored, charted and printed on a dispute document as R2 999.9999…
  const r = parseTopUpSms('Elec Amt R2904.54 Service Fee R95.46', NOW)!
  eq(r.amount, 3000, 'sms: the two halves add to a round rand, not to 2999.9999…')
}

{
  // The small purchase from the same corpus: the fee is a fifth of it.
  const r = parseTopUpSms('Elec Amt: R404.54 Service Fee: R95.46 Units: 96.4kWh Token 0987-6543-2109-8765-4321 Meter 14308043075', NOW)!
  eq(r.amount, 500, 'sms: a small top-up in a fee month')
  eq(r.units, 96.4, 'sms: units written against kWh with no space')
  eq(r.token, '0987 6543 2109 8765 4321', 'sms: a hyphen-grouped token is regrouped')
  near(r.amount! / r.units!, 5.19, 'sms: which prices at R5.19 a unit, not R4.20', 0.01)
}

{
  // A month with no service fee at all.
  const r = parseTopUpSms('Elec Amt: R500.00 Units: 128.9 kWh Token: 11112222333344445555', NOW)!
  eq(r.amount, 500, 'sms: no fee, so the electricity amount is the whole of it')
  eq(r.serviceFee, null, 'sms: no fee to report')
  eq(r.token, '1111 2222 3333 4444 5555', 'sms: an ungrouped twenty-digit token')
  eq(r.meter, '', 'sms: no meter named')
  eq(r.found, 3, 'sms: three of the four')
}

{
  // Only a total, no breakdown — still worth filling the form in.
  const r = parseTopUpSms('Prepaid electricity purchase of R250.00 successful. 64.2 kWh. Token 1111 2222 3333 4444 5555', NOW)!
  eq(r.amount, 250, 'sms: a stated total stands in when there is no breakdown')
  eq(r.units, 64.2, 'sms: kWh found without a Units label')
}

{
  // What the bank's formatting throws at it.
  eq(parseTopUpSms('Elec Amt R95,46', NOW)!.amount, 95.46, 'sms: a decimal comma')
  eq(parseTopUpSms('Elec Amt R2,904.54', NOW)!.amount, 2904.54, 'sms: a thousands comma')
  eq(parseTopUpSms('Elec Amt: R404.54.', NOW)!.amount, 404.54, 'sms: a full stop ending the sentence')
  eq(parseTopUpSms('ELEC AMT R404.54 UNITS 96.4 KWH', NOW)!.units, 96.4, 'sms: shouted')
  eq(parseTopUpSms('elec amt r404.54', NOW)!.amount, 404.54, 'sms: whispered')
}

{
  // Nothing electrical about it.
  eq(parseTopUpSms('Morning! Are we still on for 7? Running about 20 minutes late.', NOW), null, 'sms: an ordinary message is not a top-up')
  eq(parseTopUpSms('', NOW), null, 'sms: nothing pasted')
  eq(parseTopUpSms('   \n  ', NOW), null, 'sms: whitespace')
  // "minutes" contains "unit", and an unanchored label would have read 20 kWh off it.
  eq(parseTopUpSms('Token 1111 2222 3333 4444 5555 in 20 minutes', NOW)!.units, null, 'sms: "minutes" is not a units label')
}

{
  // A token grouped with hyphens must never be read as a date.
  const r = parseTopUpSms('Token: 1234-5678-9012-3456-7890 Elec Amt R100.00', NOW)!
  eq(r.boughtOn, null, 'sms: no date in the message, so none is invented')
  eq(r.token, '1234 5678 9012 3456 7890', 'sms: the token survives')
}

{
  // Dates in the ways a bank writes them.
  eq(parseTopUpSms('Elec Amt R100.00 on 03/09/2026', NOW)!.boughtOn, '2026-09-03', 'sms: dd/mm/yyyy')
  eq(parseTopUpSms('Elec Amt R100.00 on 2026-09-03', NOW)!.boughtOn, '2026-09-03', 'sms: an ISO date')
  eq(parseTopUpSms('Elec Amt R100.00 on 3 Sep', NOW)!.boughtOn, '2026-09-03', 'sms: a bare day and month take this year')
  eq(parseTopUpSms('Elec Amt R100.00 on Sep 3 2026', NOW)!.boughtOn, '2026-09-03', 'sms: month first')
  eq(parseTopUpSms('Elec Amt R100.00 on 03/09/2031', NOW)!.boughtOn, null, 'sms: a date in the future is not a purchase date')
  eq(parseTopUpSms('Elec Amt R100.00 on 45/09/2026', NOW)!.boughtOn, null, 'sms: the forty-fifth of September is a reference number')
}

{
  // The meter in the message is what makes a mismatch catchable.
  eq(parseTopUpSms('Meter no. 14308043075 Elec Amt R100.00', NOW)!.meter, '14308043075', 'sms: "Meter no."')
  eq(parseTopUpSms('Meter#14308043075 Elec Amt R100.00', NOW)!.meter, '14308043075', 'sms: "Meter#"')
  eq(parseTopUpSms('Meter 1430 8043 075 Elec Amt R100.00', NOW)!.meter, '14308043075', 'sms: a meter written in groups')
}

console.log(failed ? `\n${failed} failed` : '\nAll good.')
process.exit(failed ? 1 : 0)
