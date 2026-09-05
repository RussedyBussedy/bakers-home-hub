// Sharing helpers: WhatsApp deep links, the native share sheet, phone
// normalisation and in-app navigation from outside the router.

/** Digits only, with a South African leading 0 swapped for the 27 country code. */
export function normalisePhone(raw: string | null | undefined): string {
  let d = (raw ?? '').replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10 && d.startsWith('0')) d = `27${d.slice(1)}`
  return d.replace(/\D/g, '')
}

/** 082 555 0141 → the way people read it out. */
export function prettyPhone(raw: string | null | undefined): string {
  const d = normalisePhone(raw)
  if (!d) return ''
  if (d.startsWith('27') && d.length === 11) return `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return `+${d}`
}

export function absoluteUrl(path: string): string {
  if (/^https?:/i.test(path)) return path
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`
}

/** WhatsApp link — with no number WhatsApp asks who to send it to. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const d = normalisePhone(phone)
  const q = `text=${encodeURIComponent(text)}`
  return d ? `https://wa.me/${d}?${q}` : `https://wa.me/?${q}`
}

export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** Opens the native share sheet. Resolves true when shared, false when unsupported or cancelled. */
export async function webShare(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (!canWebShare()) return false
  try {
    await navigator.share(data)
    return true
  } catch {
    return false
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Open an external link from a click handler — synchronous, so mobile browsers allow it. */
export function openExternal(url: string) {
  const w = window.open(url, '_blank', 'noopener')
  if (!w) window.location.href = url
}

/** Client-side navigation from code that lives outside the router (toasts, listeners). */
export function softNavigate(path: string) {
  if (/^https?:/i.test(path)) { window.location.assign(path); return }
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const isAndroid = (): boolean => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
