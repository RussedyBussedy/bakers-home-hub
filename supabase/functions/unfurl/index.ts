// =====================================================================
//  unfurl — reads a pasted product page and hands back what the Hub
//  needs to show a price card: title, price, supplier and a picture.
//
//  A browser can't read another site directly (CORS), so this runs on
//  Supabase. Deploy from the dashboard: Edge Functions -> Deploy a new
//  function -> name it "unfurl" -> paste this file -> Deploy.
// =====================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PAGE_LIMIT = 1_500_000 // stop reading a page after ~1.5MB of HTML
const IMAGE_LIMIT = 3_000_000 // and skip images bigger than ~3MB
const TIMEOUT = 12_000
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

/** Only ordinary public web addresses — never the machine this runs on, or anything on a private network. */
export function assertPublicHttpUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('That does not look like a web address.') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https links can be read.')
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host === '::1') throw new Error('That address is not reachable.')
  // IPv4 literals: block loopback, private, link-local and carrier-grade NAT ranges.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    const blocked = a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    if (blocked) throw new Error('That address is not reachable.')
  }
  if (host.includes(':')) throw new Error('That address is not reachable.') // bare IPv6 literal
  return u
}

async function get(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-ZA,en;q=0.9' },
    })
  } finally { clearTimeout(t) }
}

async function readCapped(res: Response, limit: number): Promise<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  void reader.cancel().catch(() => {})
  const out = new Uint8Array(Math.min(size, limit))
  let at = 0
  for (const c of chunks) {
    if (at >= out.length) break
    out.set(c.subarray(0, out.length - at), at)
    at += c.length
  }
  return out
}

function decode(bytes: Uint8Array, contentType: string): string {
  const m = /charset=([\w-]+)/i.exec(contentType)
  const label = (m?.[1] ?? 'utf-8').toLowerCase()
  try { return new TextDecoder(label).decode(bytes) } catch { return new TextDecoder('utf-8').decode(bytes) }
}

export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', hellip: '…' }
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z0-9#]+);/gi, (whole, name) => named[String(name).toLowerCase()] ?? whole)
    .trim()
}

/** Pull a <meta> value, trying og:/twitter:/itemprop and both attribute orders. */
export function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name|itemprop)\\s*=\\s*["']${k}["']`, 'i'),
    ]
    for (const re of patterns) {
      const m = re.exec(html)
      if (m?.[1]?.trim()) return decodeEntities(m[1])
    }
  }
  return null
}

/** JSON-LD Product blocks carry the cleanest price on most shops. */
export function fromJsonLd(html: string): { price?: number; currency?: string; title?: string; image?: string } {
  const out: { price?: number; currency?: string; title?: string; image?: string } = {}
  const blocks = html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const b of blocks) {
    let parsed: unknown
    try { parsed = JSON.parse(decodeEntities(b[1])) } catch { continue }
    const stack = [parsed]
    while (stack.length) {
      const node = stack.pop()
      if (Array.isArray(node)) { stack.push(...node); continue }
      if (!node || typeof node !== 'object') continue
      const o = node as Record<string, unknown>
      for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v)
      const type = String(o['@type'] ?? '').toLowerCase()
      if (type.includes('product')) {
        if (!out.title && typeof o.name === 'string') out.title = decodeEntities(o.name)
        const img = Array.isArray(o.image) ? o.image[0] : o.image
        if (!out.image && typeof img === 'string') out.image = img
      }
      if (type.includes('offer') || o.price !== undefined) {
        const p = o.price ?? o.lowPrice ?? o.highPrice
        const n = typeof p === 'string' ? Number(p.replace(/[^\d.]/g, '')) : typeof p === 'number' ? p : NaN
        if (out.price === undefined && Number.isFinite(n) && n > 0) out.price = n
        if (!out.currency && typeof o.priceCurrency === 'string') out.currency = o.priceCurrency
      }
    }
  }
  return out
}

/** "R 1 299,00" / "R1,299.00" / "1299.00" -> 1299. South African formatting first. */
export function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null
  const cleaned = String(raw).replace(/[  ]/g, ' ')
  const m = /(\d[\d\s.,]*)/.exec(cleaned)
  if (!m) return null
  let s = m[1].replace(/\s/g, '')
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // whichever comes last is the decimal separator
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma > -1) {
    s = s.length - lastComma === 3 ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Last resort: the first money-looking string on the page. */
export function priceFromBody(html: string): number | null {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const m = /(?:R|ZAR|\$|£|€)\s?(\d[\d\s.,]{1,12})/.exec(text)
  return m ? parsePrice(m[1]) : null
}

async function imageAsDataUrl(src: string, base: URL): Promise<string | null> {
  let abs: URL
  try { abs = assertPublicHttpUrl(new URL(src, base).toString()) } catch { return null }
  try {
    const res = await get(abs.toString(), 'image/*')
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!type.startsWith('image/') || type === 'image/svg+xml') return null
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > IMAGE_LIMIT) return null
    const bytes = await readCapped(res, IMAGE_LIMIT)
    if (bytes.length === 0 || bytes.length >= IMAGE_LIMIT) return null
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:${type};base64,${btoa(binary)}`
  } catch { return null }
}

declare const Deno: { serve: (h: (req: Request) => Promise<Response>) => void } | undefined

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const { url: raw } = await req.json().catch(() => ({ url: '' }))
    if (!raw || typeof raw !== 'string') return json({ error: 'No link given.' }, 400)
    const target = assertPublicHttpUrl(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)

    const res = await get(target.toString(), 'text/html,application/xhtml+xml')
    if (!res.ok) return json({ error: `The site answered ${res.status}.` }, 200)
    const html = decode(await readCapped(res, PAGE_LIMIT), res.headers.get('content-type') ?? '')
    const finalUrl = new URL(res.url || target.toString())

    const ld = fromJsonLd(html)
    const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
    const title = meta(html, ['og:title', 'twitter:title']) ?? ld.title ?? (titleTag ? decodeEntities(titleTag) : '')
    const price =
      ld.price ??
      parsePrice(meta(html, ['product:price:amount', 'og:price:amount', 'twitter:data1', 'price'])) ??
      priceFromBody(html)
    const currency = ld.currency ?? meta(html, ['product:price:currency', 'og:price:currency']) ?? null
    const supplier = meta(html, ['og:site_name']) ?? finalUrl.hostname.replace(/^www\./, '')
    const imageSrc = meta(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'image']) ?? ld.image ?? null
    const image = imageSrc ? await imageAsDataUrl(imageSrc, finalUrl) : null

    return json({
      url: finalUrl.toString(),
      domain: finalUrl.hostname.replace(/^www\./, ''),
      title: (title || '').slice(0, 200),
      price: price ?? null,
      currency,
      supplier: (supplier || '').slice(0, 80),
      image,
      imageUrl: imageSrc ? new URL(imageSrc, finalUrl).toString() : null,
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not read that page.' }, 200)
  }
}

// Importing this file from Node (scripts/unfurl-test.mts) only exercises the parsing above.
if (typeof Deno !== 'undefined') Deno.serve(handler)
