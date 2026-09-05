import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

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

function group(n: number): string {
  return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009')
}

/** R 12 345 — whole rand, thin-spaced the way South Africans write it. */
export function money(n: number | null | undefined, opts: { cents?: boolean; compact?: boolean } = {}): string {
  const v = Number(n ?? 0)
  const sign = v < 0 ? '−' : ''
  if (opts.compact && Math.abs(v) >= 1_000_000) return `${sign}R${(Math.abs(v) / 1_000_000).toFixed(Math.abs(v) % 1_000_000 === 0 ? 0 : 1)}m`
  if (opts.compact && Math.abs(v) >= 10_000) return `${sign}R${Math.round(Math.abs(v) / 1000)}k`
  if (opts.cents) {
    const abs = Math.abs(v)
    const whole = Math.floor(abs)
    const cents = Math.round((abs - whole) * 100).toString().padStart(2, '0')
    return `${sign}R ${group(whole)}.${cents}`
  }
  return `${sign}R ${group(v)}`
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
