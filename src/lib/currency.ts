import { useSyncExternalStore } from 'react'

/**
 * Money in whatever the home actually spends.
 *
 * The app was born in rand and hard-coded to it. Now that anyone can register a home, the currency
 * is guessed once from where the browser thinks it is — the device's time zone first, because that
 * follows the person rather than the language they read in — and then stored on the household, so
 * everyone in the same home reads the same figures. Settings has the override for when the guess is
 * wrong, or for the people whose money and location differ.
 *
 * Deliberately no exchange rates: nothing here converts. A number typed as 1 200 stays 1 200; only
 * the symbol and the way it is grouped change.
 */

export interface Currency {
  /** ISO 4217, e.g. ZAR. */
  code: string
  symbol: string
  name: string
  /** Symbol sits after the number, the way Scandinavia and Vietnam write it. */
  after?: boolean
  /** A space between symbol and number. */
  space?: boolean
  /** Thousands separator — a thin space, a comma or a full stop. */
  group?: string
  /** Decimal separator. */
  decimal?: string
  /** Digits after the point: 0 for yen and won, 3 for the dinar. */
  decimals?: number
  /** South Asian grouping: 12,34,567 rather than 1,234,567. */
  lakh?: boolean
  /** ISO-3166 country codes that spend it. */
  regions?: string[]
  /** The principal one, when it isn't the first listed — used to aim a product search. */
  home?: string
  /** IANA time zones in those countries — the strongest hint about where a device is. */
  zones?: string[]
}

const THIN = ' '

// Ordered roughly by how many people are likely to reach for them, since this list is also the
// picker in Settings.
export const CURRENCIES: Currency[] = [
  { code: 'ZAR', symbol: 'R', name: 'South African rand', space: true, group: THIN, regions: ['ZA'], zones: ['Africa/Johannesburg'] },
  { code: 'USD', symbol: '$', name: 'US dollar', regions: ['US', 'EC', 'SV', 'PA', 'PR', 'TL', 'ZW', 'VG', 'TC', 'MH', 'FM', 'PW', 'GU'], zones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Detroit', 'America/Indiana/Indianapolis', 'Pacific/Honolulu', 'Africa/Harare', 'America/Panama', 'America/Guayaquil'] },
  { code: 'EUR', symbol: '€', name: 'Euro', group: THIN, home: 'DE', regions: ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK', 'MC', 'AD', 'SM', 'VA', 'ME', 'XK'], zones: ['Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Brussels', 'Europe/Vienna', 'Europe/Athens', 'Europe/Helsinki', 'Atlantic/Canary'] },
  { code: 'GBP', symbol: '£', name: 'Pound sterling', regions: ['GB', 'IM', 'JE', 'GG'], zones: ['Europe/London', 'Europe/Belfast'] },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar', regions: ['AU', 'NR', 'TV', 'KI', 'CX', 'CC'], zones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart'] },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand dollar', regions: ['NZ', 'CK', 'NU', 'PN'], zones: ['Pacific/Auckland', 'Pacific/Chatham'] },
  { code: 'CAD', symbol: 'C$', name: 'Canadian dollar', regions: ['CA'], zones: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Regina'] },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss franc', space: true, group: THIN, regions: ['CH', 'LI'], zones: ['Europe/Zurich', 'Europe/Vaduz'] },
  { code: 'SEK', symbol: 'kr', name: 'Swedish krona', after: true, space: true, group: THIN, decimal: ',', regions: ['SE'], zones: ['Europe/Stockholm'] },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian krone', after: true, space: true, group: THIN, decimal: ',', regions: ['NO', 'SJ'], zones: ['Europe/Oslo'] },
  { code: 'DKK', symbol: 'kr', name: 'Danish krone', after: true, space: true, group: THIN, decimal: ',', regions: ['DK', 'FO', 'GL'], zones: ['Europe/Copenhagen'] },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic króna', after: true, space: true, group: THIN, decimals: 0, regions: ['IS'], zones: ['Atlantic/Reykjavik'] },
  { code: 'PLN', symbol: 'zł', name: 'Polish złoty', after: true, space: true, group: THIN, decimal: ',', regions: ['PL'], zones: ['Europe/Warsaw'] },
  { code: 'CZK', symbol: 'Kč', name: 'Czech koruna', after: true, space: true, group: THIN, decimal: ',', regions: ['CZ'], zones: ['Europe/Prague'] },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian forint', after: true, space: true, group: THIN, decimals: 0, regions: ['HU'], zones: ['Europe/Budapest'] },
  { code: 'RON', symbol: 'lei', name: 'Romanian leu', after: true, space: true, group: THIN, decimal: ',', regions: ['RO'], zones: ['Europe/Bucharest'] },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian lev', after: true, space: true, group: THIN, decimal: ',', regions: ['BG'], zones: ['Europe/Sofia'] },
  { code: 'TRY', symbol: '₺', name: 'Turkish lira', group: THIN, decimal: ',', regions: ['TR'], zones: ['Europe/Istanbul'] },
  { code: 'RUB', symbol: '₽', name: 'Russian rouble', after: true, space: true, group: THIN, decimal: ',', regions: ['RU'], zones: ['Europe/Moscow', 'Europe/Kaliningrad', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Vladivostok'] },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian hryvnia', group: THIN, decimal: ',', regions: ['UA'], zones: ['Europe/Kyiv', 'Europe/Kiev'] },
  { code: 'ILS', symbol: '₪', name: 'Israeli shekel', regions: ['IL'], zones: ['Asia/Jerusalem', 'Asia/Tel_Aviv'] },
  { code: 'AED', symbol: 'AED', name: 'UAE dirham', space: true, regions: ['AE'], zones: ['Asia/Dubai'] },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi riyal', space: true, regions: ['SA'], zones: ['Asia/Riyadh'] },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari riyal', space: true, regions: ['QA'], zones: ['Asia/Qatar'] },
  { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti dinar', space: true, decimals: 3, regions: ['KW'], zones: ['Asia/Kuwait'] },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian pound', regions: ['EG'], zones: ['Africa/Cairo'] },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan dirham', space: true, regions: ['MA', 'EH'], zones: ['Africa/Casablanca', 'Africa/El_Aaiun'] },
  { code: 'NGN', symbol: '₦', name: 'Nigerian naira', regions: ['NG'], zones: ['Africa/Lagos'] },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan shilling', space: true, regions: ['KE'], zones: ['Africa/Nairobi'] },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian cedi', regions: ['GH'], zones: ['Africa/Accra'] },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian shilling', space: true, decimals: 0, regions: ['TZ'], zones: ['Africa/Dar_es_Salaam'] },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan shilling', space: true, decimals: 0, regions: ['UG'], zones: ['Africa/Kampala'] },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian kwacha', space: true, regions: ['ZM'], zones: ['Africa/Lusaka'] },
  { code: 'BWP', symbol: 'P', name: 'Botswana pula', space: true, regions: ['BW'], zones: ['Africa/Gaborone'] },
  { code: 'NAD', symbol: 'N$', name: 'Namibian dollar', space: true, group: THIN, regions: ['NA'], zones: ['Africa/Windhoek'] },
  { code: 'MZN', symbol: 'MT', name: 'Mozambican metical', space: true, regions: ['MZ'], zones: ['Africa/Maputo'] },
  { code: 'MUR', symbol: 'Rs', name: 'Mauritian rupee', space: true, regions: ['MU'], zones: ['Indian/Mauritius'] },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian birr', space: true, regions: ['ET'], zones: ['Africa/Addis_Ababa'] },
  { code: 'INR', symbol: '₹', name: 'Indian rupee', lakh: true, regions: ['IN'], zones: ['Asia/Kolkata', 'Asia/Calcutta'] },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani rupee', space: true, lakh: true, regions: ['PK'], zones: ['Asia/Karachi'] },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi taka', lakh: true, regions: ['BD'], zones: ['Asia/Dhaka'] },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan rupee', space: true, regions: ['LK'], zones: ['Asia/Colombo'] },
  { code: 'NPR', symbol: 'Rs', name: 'Nepalese rupee', space: true, lakh: true, regions: ['NP'], zones: ['Asia/Kathmandu'] },
  { code: 'CNY', symbol: '¥', name: 'Chinese yuan', regions: ['CN'], zones: ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Urumqi'] },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen', decimals: 0, regions: ['JP'], zones: ['Asia/Tokyo'] },
  { code: 'KRW', symbol: '₩', name: 'South Korean won', decimals: 0, regions: ['KR'], zones: ['Asia/Seoul'] },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong dollar', regions: ['HK'], zones: ['Asia/Hong_Kong'] },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan dollar', decimals: 0, regions: ['TW'], zones: ['Asia/Taipei'] },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar', regions: ['SG'], zones: ['Asia/Singapore'] },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit', regions: ['MY'], zones: ['Asia/Kuala_Lumpur', 'Asia/Kuching'] },
  { code: 'THB', symbol: '฿', name: 'Thai baht', regions: ['TH'], zones: ['Asia/Bangkok'] },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian rupiah', space: true, group: '.', decimals: 0, regions: ['ID'], zones: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] },
  { code: 'PHP', symbol: '₱', name: 'Philippine peso', regions: ['PH'], zones: ['Asia/Manila'] },
  { code: 'VND', symbol: '₫', name: 'Vietnamese dong', after: true, space: true, group: '.', decimals: 0, regions: ['VN'], zones: ['Asia/Ho_Chi_Minh', 'Asia/Saigon'] },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian real', space: true, group: '.', decimal: ',', regions: ['BR'], zones: ['America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Manaus', 'America/Recife'] },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican peso', regions: ['MX'], zones: ['America/Mexico_City', 'America/Monterrey', 'America/Tijuana', 'America/Cancun', 'America/Merida'] },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine peso', group: '.', decimal: ',', regions: ['AR'], zones: ['America/Argentina/Buenos_Aires', 'America/Buenos_Aires'] },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean peso', group: '.', decimals: 0, regions: ['CL'], zones: ['America/Santiago'] },
  { code: 'COP', symbol: 'COP$', name: 'Colombian peso', group: '.', decimals: 0, regions: ['CO'], zones: ['America/Bogota'] },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian sol', space: true, regions: ['PE'], zones: ['America/Lima'] },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan peso', space: true, group: '.', decimal: ',', regions: ['UY'], zones: ['America/Montevideo'] },
]

export const FALLBACK: Currency = CURRENCIES.find((c) => c.code === 'USD')!

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))
const BY_ZONE = new Map<string, Currency>()
const BY_REGION = new Map<string, Currency>()
for (const c of CURRENCIES) {
  for (const z of c.zones ?? []) if (!BY_ZONE.has(z)) BY_ZONE.set(z, c)
  for (const r of c.regions ?? []) if (!BY_REGION.has(r)) BY_REGION.set(r, c)
}

/** A whole-continent guess for the zones not worth listing one by one. */
const ZONE_PREFIX: [string, string][] = [
  ['Europe/', 'EUR'],
  ['Australia/', 'AUD'],
  ['America/Argentina/', 'ARS'],
  ['America/Indiana/', 'USD'],
  ['America/Kentucky/', 'USD'],
  ['America/North_Dakota/', 'USD'],
  ['US/', 'USD'],
  ['Canada/', 'CAD'],
]

export function currencyByCode(code: string | null | undefined): Currency | undefined {
  return code ? BY_CODE.get(code.trim().toUpperCase()) : undefined
}

/** The currency, or a plausible stand-in for a code we don't carry, so an odd code still prints. */
export function resolveCurrency(code: string | null | undefined): Currency {
  const known = currencyByCode(code)
  if (known) return known
  const raw = (code ?? '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(raw)) return { code: raw, symbol: raw, name: raw, space: true }
  return FALLBACK
}

function regionOf(tag: string): string | null {
  // en-ZA, en_ZA, en-Latn-ZA — the two-letter subtag is the country.
  const parts = tag.replace(/_/g, '-').split('-')
  for (const p of parts.slice(1)) if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase()
  return null
}

/**
 * Where this device thinks it is, in currency terms.
 * Time zone first (it follows the person), then an explicit country in the language tag, then the
 * country the language implies. Nothing here touches the network or asks for a location permission.
 */
export function guessCurrencyCode(hint?: { timeZone?: string | null; locales?: readonly string[] }): string {
  let timeZone = hint?.timeZone
  let locales = hint?.locales
  if (timeZone === undefined) {
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { timeZone = null }
  }
  if (locales === undefined) {
    locales = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
  }

  if (timeZone) {
    const exact = BY_ZONE.get(timeZone)
    if (exact) return exact.code
    for (const [prefix, code] of ZONE_PREFIX) if (timeZone.startsWith(prefix)) return code
  }

  for (const tag of locales ?? []) {
    const region = regionOf(tag)
    const found = region ? BY_REGION.get(region) : undefined
    if (found) return found.code
  }

  // "en" or "de" with no country attached: let the browser fill in the one it assumes.
  for (const tag of locales ?? []) {
    try {
      const max = new Intl.Locale(tag).maximize().region
      const found = max ? BY_REGION.get(max) : undefined
      if (found) return found.code
    } catch { /* older engine, or a tag it won't parse */ }
  }

  return FALLBACK.code
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
function digits(whole: string, sep: string, lakh?: boolean): string {
  if (!lakh || whole.length <= 3) return whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
  // 1234567 reads as 12,34,567 across South Asia: the last three, then pairs.
  return whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, sep) + sep + whole.slice(-3)
}

export function formatMoney(n: number | null | undefined, cur: Currency, opts: { cents?: boolean; compact?: boolean } = {}): string {
  const v = Number(n ?? 0)
  const sign = v < 0 ? '−' : ''
  const abs = Math.abs(v)
  const group = cur.group ?? ','
  const dp = cur.decimals ?? 2
  const wrap = (body: string, tight = false) => {
    const gap = cur.space && !tight ? ' ' : ''
    return cur.after ? `${sign}${body}${gap}${cur.symbol}` : `${sign}${cur.symbol}${gap}${body}`
  }

  if (opts.compact && abs >= 1_000_000) return wrap(`${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}m`, true)
  if (opts.compact && abs >= 10_000) return wrap(`${Math.round(abs / 1000)}k`, true)
  if (opts.cents && dp > 0) {
    const scale = 10 ** dp
    const cents = Math.round(abs * scale)
    const whole = Math.floor(cents / scale)
    return wrap(`${digits(String(whole), group, cur.lakh)}${cur.decimal ?? '.'}${String(cents % scale).padStart(dp, '0')}`)
  }
  return wrap(digits(String(Math.round(abs)), group, cur.lakh))
}

// ---------------------------------------------------------------------------
// The currency the app is showing right now
// ---------------------------------------------------------------------------
const CACHE_KEY = 'hub-currency'
const listeners = new Set<() => void>()

function cached(): string | null {
  try { return localStorage.getItem(CACHE_KEY) } catch { return null }
}

// Remembered from last time so a reload doesn't flash the wrong symbol before the home loads;
// on a first visit, the guess from this device.
let active: Currency = resolveCurrency(cached() ?? guessCurrencyCode())

export function activeCurrency(): Currency {
  return active
}

/** Point the whole app at a currency. Called with the household's, so everyone in a home agrees. */
export function setActiveCurrency(code: string | null | undefined): void {
  if (!code || !code.trim()) return
  const next = resolveCurrency(code)
  if (next.code === active.code) return
  active = next
  try { localStorage.setItem(CACHE_KEY, next.code) } catch { /* private mode */ }
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * The country to aim a product search at. It follows the home's currency rather than the device,
 * for the same reason the prices do: someone searching from a hotel in Dubai is still shopping for
 * a house in Johannesburg.
 */
export function searchCountry(cur: Currency = active): string | null {
  return (cur.home ?? cur.regions?.[0])?.toLowerCase() ?? null
}

/** Re-renders when the home's currency changes — for the symbol inside an input, and the picker. */
export function useCurrency(): Currency {
  return useSyncExternalStore(subscribe, activeCurrency, activeCurrency)
}
