// =====================================================================
//  search — finds things to buy, so a price doesn't have to start with
//  a link someone already had.
//
//  Type "brushed brass cabinet handle" and this comes back with the
//  shops that sell one. The Hub then runs `unfurl` over the results to
//  fill in the picture and the price, which is why this function stays
//  deliberately thin: it finds candidates, it does not read pages.
//
//  Search engines don't allow direct calls from a browser, and the key
//  would be handed to everyone who opened the app, so it runs here.
//
//  Deploy from the dashboard: Edge Functions -> Deploy a new function ->
//  name it "search" -> paste this file -> Deploy. Then add the secret
//  SERPER_API_KEY (serper.dev — 2,500 free searches, then $0.30 per
//  1,000). Without the key the Hub simply keeps its paste-a-link box.
// =====================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ENDPOINT = 'https://google.serper.dev/search'
const TIMEOUT = 12_000
const WANTED = 12

/**
 * Shops worth floating to the top of a home-improvement search in South Africa: the big DIY and
 * hardware chains, then the general marketplaces, then the trade suppliers. Nothing is excluded by
 * this list — a one-man welding shop with the right gate still shows, just below Builders.
 */
const FAVOURED: string[] = [
  'builders.co.za', 'leroymerlin.co.za', 'buco.co.za', 'cashbuild.co.za', 'brights.co.za',
  'chamberlains.co.za', 'gelmar.co.za', 'tileafrica.co.za', 'italtile.co.za', 'unioncorp.co.za',
  'takealot.com', 'makro.co.za', 'game.co.za', 'loot.co.za', 'bidorbuy.co.za',
  'plumblink.co.za', 'wurth.co.za', 'adendorff.co.za', 'toolshopsa.co.za', 'powermaniac.co.za',
  'homedepot.co.za', 'weylandts.co.za', 'coricraft.co.za', 'wetherlys.co.za', '@home.co.za',
  'plascon.com', 'duram.co.za', 'dulux.co.za', 'prominentpaints.co.za', 'midaspaint.co.za',
  'eurolux.co.za', 'lighting.co.za', 'hertex.co.za', 'blinddesigns.co.za',
]

/** Things that are never a product page, however well they rank. */
const NEVER = [
  'pinterest.', 'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'reddit.com',
  'wikipedia.org', 'gumtree.co.za/help', 'olx.co.za/help', 'quora.com', 'x.com', 'twitter.com',
]

export interface Hit {
  title: string
  url: string
  domain: string
  snippet: string
  /** Ranked above the plain results because it is a shop we know sells this sort of thing. */
  favoured: boolean
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** True when the host is one of the favoured shops, or a subdomain of one. */
export function isFavoured(domain: string, list: string[] = FAVOURED): boolean {
  const d = domain.toLowerCase().replace(/^www\./, '')
  return list.some((f) => d === f || d.endsWith(`.${f}`))
}

export function isJunk(domain: string): boolean {
  const d = domain.toLowerCase()
  return NEVER.some((n) => d.includes(n))
}

/**
 * Turn a raw Serper answer into the Hub's list: drop the pages that are never a product, then put
 * the shops we know first while keeping the engine's own order inside each group. A stable sort
 * matters — re-searching the same words shouldn't shuffle the grid under someone's thumb.
 */
export function rank(organic: unknown, limit = WANTED): Hit[] {
  if (!Array.isArray(organic)) return []
  const seen = new Set<string>()
  const hits: Hit[] = []
  for (const raw of organic) {
    const r = raw as { title?: unknown; link?: unknown; snippet?: unknown }
    const url = typeof r.link === 'string' ? r.link : ''
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    if (!url || !title) continue
    const domain = hostOf(url)
    if (!domain || isJunk(domain)) continue
    // One result per shop: ten colours of the same handle from one site isn't a choice.
    if (seen.has(domain)) continue
    seen.add(domain)
    hits.push({
      title: title.slice(0, 160),
      url,
      domain,
      snippet: (typeof r.snippet === 'string' ? r.snippet : '').slice(0, 220),
      favoured: isFavoured(domain),
    })
  }
  const favoured = hits.filter((h) => h.favoured)
  return [...favoured, ...hits.filter((h) => !h.favoured)].slice(0, limit)
}

declare const Deno: { serve: (h: (req: Request) => Promise<Response>) => void; env: { get: (k: string) => string | undefined } } | undefined

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const key = Deno?.env.get('SERPER_API_KEY')
  if (!key) {
    // Said plainly, because the Hub shows this to whoever typed the search.
    return json({ error: 'Product search is not switched on for this Hub yet. Paste a link instead.' })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const q = typeof body.q === 'string' ? body.q.trim() : ''
    if (q.length < 2) return json({ error: 'Type a couple of words to search for.' }, 400)
    // The home's country, so a Johannesburg search doesn't come back full of American shops.
    const country = typeof body.country === 'string' && /^[a-z]{2}$/i.test(body.country) ? body.country.toLowerCase() : 'za'

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT)
    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        // "buy" nudges the engine towards shops rather than how-to articles and forum threads.
        body: JSON.stringify({ q: `${q.slice(0, 120)} buy price`, gl: country, hl: 'en', num: 20 }),
      })
    } finally { clearTimeout(t) }

    if (res.status === 401 || res.status === 403) return json({ error: 'The search key was refused. Check SERPER_API_KEY.' })
    if (res.status === 429) return json({ error: 'Search has hit its limit for now — try again shortly, or paste a link.' })
    if (!res.ok) return json({ error: `Search answered ${res.status}.` })

    const data = await res.json()
    return json({ results: rank(data?.organic) })
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'Search took too long.' : 'Search could not be reached.'
    return json({ error: msg })
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handler)

export { handler, FAVOURED, NEVER }
