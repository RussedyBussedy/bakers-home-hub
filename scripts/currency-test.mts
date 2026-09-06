/**
 * The currency guess and the way money is written.
 *   npm run currency-test
 *
 * Two things worth pinning down: rand must keep reading exactly as it always has (thin-spaced
 * groups, a plain space after the R) so nothing in the Bakers' home shifts, and the guess must
 * prefer the time zone over the browser's language — a South African reading an American-English
 * Chrome is still spending rand.
 */
import { CURRENCIES, currencyByCode, formatMoney, guessCurrencyCode, resolveCurrency } from '../src/lib/currency'

let failed = 0
function eq(got: unknown, want: unknown, label: string) {
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}

const cur = (code: string) => currencyByCode(code)!
const THIN = "\u2009"

// --- rand, unchanged -------------------------------------------------------
eq(formatMoney(12345, cur('ZAR')), `R 12${THIN}345`, 'ZAR whole')
eq(formatMoney(12345.67, cur('ZAR'), { cents: true }), `R 12${THIN}345.67`, 'ZAR with cents')
eq(formatMoney(-2400, cur('ZAR')), `−R 2${THIN}400`, 'ZAR negative uses a real minus')
eq(formatMoney(0, cur('ZAR')), 'R 0', 'ZAR zero')
eq(formatMoney(null, cur('ZAR')), 'R 0', 'ZAR nothing at all')
eq(formatMoney(2_400_000, cur('ZAR'), { compact: true }), 'R2.4m', 'ZAR compact millions, tight against the symbol')
eq(formatMoney(2_000_000, cur('ZAR'), { compact: true }), 'R2m', 'ZAR compact round millions')
eq(formatMoney(45_000, cur('ZAR'), { compact: true }), 'R45k', 'ZAR compact thousands')
eq(formatMoney(9_999, cur('ZAR'), { compact: true }), `R 9${THIN}999`, 'ZAR under the compact threshold stays long')

// --- the rest of the world -------------------------------------------------
eq(formatMoney(12345, cur('USD')), '$12,345', 'USD commas, no gap')
eq(formatMoney(12345.5, cur('USD'), { cents: true }), '$12,345.50', 'USD pads the cents')
eq(formatMoney(12345, cur('GBP')), '£12,345', 'GBP')
eq(formatMoney(12345, cur('EUR')), `€12${THIN}345`, 'EUR thin-spaced')
eq(formatMoney(12345, cur('SEK')), `12${THIN}345 kr`, 'SEK puts the symbol after')
eq(formatMoney(1234.5, cur('SEK'), { cents: true }), `1${THIN}234,50 kr`, 'SEK decimal comma')
eq(formatMoney(12345, cur('JPY')), '¥12,345', 'JPY')
eq(formatMoney(12345.67, cur('JPY'), { cents: true }), '¥12,346', 'JPY has no minor unit, so cents round away')
eq(formatMoney(1234.567, cur('KWD'), { cents: true }), 'KWD 1,234.567', 'KWD carries three decimals')
eq(formatMoney(1234567, cur('INR')), '₹12,34,567', 'INR groups in lakh')
eq(formatMoney(1234567, cur('PKR')), 'Rs 12,34,567', 'PKR groups in lakh, with a gap after Rs')
eq(formatMoney(999, cur('INR')), '₹999', 'INR under a thousand is untouched')
eq(formatMoney(12345, cur('BRL')), 'R$ 12.345', 'BRL full stops — and not mistaken for rand')
eq(formatMoney(12345, cur('VND')), '12.345 ₫', 'VND after, no minor unit')

// --- a code we do not carry ------------------------------------------------
eq(resolveCurrency('XPF').symbol, 'XPF', 'an unlisted ISO code prints as itself')
eq(formatMoney(1500, resolveCurrency('XPF')), 'XPF 1,500', 'and still formats')
eq(resolveCurrency('nonsense').code, 'USD', 'junk falls back to the dollar')
eq(resolveCurrency(null).code, 'USD', 'so does nothing at all')
eq(resolveCurrency('zar').code, 'ZAR', 'a lowercase code is still a code')

// --- the guess -------------------------------------------------------------
const guess = (timeZone: string | null, ...locales: string[]) => guessCurrencyCode({ timeZone, locales })

eq(guess('Africa/Johannesburg', 'en-US'), 'ZAR', 'the time zone beats an American browser')
eq(guess('Europe/London', 'en-GB'), 'GBP', 'London')
eq(guess('America/New_York', 'en-US'), 'USD', 'New York')
eq(guess('Europe/Berlin', 'de-DE'), 'EUR', 'Berlin')
eq(guess('Europe/Ljubljana', 'sl-SI'), 'EUR', 'an unlisted European zone is the euro')
eq(guess('Australia/Sydney', 'en-AU'), 'AUD', 'Sydney')
eq(guess('Asia/Calcutta', 'en-IN'), 'INR', 'the old spelling of the Kolkata zone still resolves')
eq(guess('America/Argentina/Buenos_Aires', 'es-AR'), 'ARS', 'a nested American zone')
eq(guess('US/Pacific', 'en-US'), 'USD', 'a legacy alias zone')
eq(guess('Africa/Windhoek', 'en-NA'), 'NAD', 'Namibia is not South Africa')

eq(guess(null, 'en-ZA'), 'ZAR', 'no time zone: the country in the language tag')
eq(guess(null, 'en-Latn-ZA'), 'ZAR', 'even with a script in the middle')
eq(guess(null, 'fr_CA'), 'CAD', 'an underscore tag')
eq(guess('Mars/Olympus_Mons', 'en-GB'), 'GBP', 'an unknown zone falls through to the language')
eq(guess('Mars/Olympus_Mons', 'xx', 'de-DE'), 'EUR', 'and past a tag it cannot place')
eq(guess(null, 'en-GB', 'en-US'), 'GBP', 'the first usable language wins')
eq(guess(null), 'USD', 'nothing to go on at all')
eq(guess(null, 'ja'), 'JPY', 'a bare language falls back to the country it implies')

// --- the table itself ------------------------------------------------------
const codes = CURRENCIES.map((c) => c.code)
eq(new Set(codes).size, codes.length, 'no currency listed twice')
eq(codes.every((c) => /^[A-Z]{3}$/.test(c)), true, 'every code is ISO-shaped')
eq(CURRENCIES.every((c) => c.symbol.length > 0 && c.name.length > 0), true, 'every one has a symbol and a name')
const zones = CURRENCIES.flatMap((c) => c.zones ?? [])
eq(new Set(zones).size, zones.length, 'no time zone claimed by two currencies')
const regions = CURRENCIES.flatMap((c) => c.regions ?? [])
eq(new Set(regions).size, regions.length, 'no country claimed by two currencies')

console.log(failed === 0 ? '\nAll good.' : `\n${failed} failed.`)
if (failed > 0) process.exit(1)
