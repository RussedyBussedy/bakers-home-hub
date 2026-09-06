import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import { activeCurrency, formatMoney } from './currency'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Money in the home's currency — "R 12 345" in South Africa, "$12,345" in the States.
 * The currency comes from `activeCurrency()`, which the session points at the household's.
 */
export function money(n: number | null | undefined, opts: { cents?: boolean; compact?: boolean } = {}): string {
  return formatMoney(n, activeCurrency(), opts)
}

/** A plain count — XP, points — grouped the way this device writes numbers. */
export function num(n: number | null | undefined): string {
  return Math.round(Number(n ?? 0)).toLocaleString()
}

export function pct(n: number, digits = 0): string {
  if (!isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

export function toDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = s.length <= 10 ? parseISO(s) : new Date(s)
  return isValid(d) ? d : null
}

export function fmtDate(s: string | null | undefined, f = 'd MMM yyyy'): string {
  const d = toDate(s)
  return d ? format(d, f) : '—'
}

export function fmtRelative(s: string | null | undefined): string {
  const d = toDate(s)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  if (Math.abs(diff) < 60_000) return 'just now'
  return `${formatDistanceToNowStrict(d)} ${diff > 0 ? 'ago' : 'from now'}`
}

export function daysUntil(s: string | null | undefined): number | null {
  const d = toDate(s)
  return d ? differenceInCalendarDays(d, new Date()) : null
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function sum<T>(arr: T[], pick: (t: T) => number): number {
  return arr.reduce((acc, t) => acc + (Number(pick(t)) || 0), 0)
}

export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {} as Record<K, T[]>)
}

export function domainOf(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function normaliseUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export function pluralise(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Burning the midnight oil'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function throttle<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  return (...args: A) => {
    const now = Date.now()
    const run = () => {
      last = Date.now()
      timer = null
      if (pending) {
        const p = pending
        pending = null
        fn(...p)
      }
    }
    if (now - last >= ms) {
      last = now
      fn(...args)
    } else {
      pending = args
      if (!timer) timer = setTimeout(run, ms - (now - last))
    }
  }
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/**
 * What to call a household on screen. Homes are named by their people — "The Bakers" wants "Hub"
 * after it, but a new account's home defaults to "Gran's Home", and "Gran's Home Hub" is clumsy.
 * So the word is only added when the name doesn't already end in one like it.
 */
export function homeTitle(name: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (!n) return 'Home Hub'
  return /\b(hub|home|house|place)$/i.test(n) ? n : `${n} Hub`
}
