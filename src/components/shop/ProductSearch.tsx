import { useRef, useState, type FormEvent } from 'react'
import { Loader2, Search, ShoppingBag, Store } from 'lucide-react'
import type { ProductHit } from '../../data/types'
import { useDb } from '../../data/session'
import { useCurrency } from '../../lib/currency'
import { cn, money } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Field'

/** A search result once the Hub has (or hasn't yet) read the page behind it. */
export interface Found {
  url: string
  domain: string
  title: string
  price: number | null
  currency: string | null
  supplier: string
  /** The picture as a data URL, ready to store — the shop's own copy can vanish. */
  image: string | null
  imageUrl: string | null
}

interface Card extends Found {
  hit: ProductHit
  reading: boolean
}

/** How many of the results get their page read straight away, and how many at a time. */
const ENRICH = 8
const AT_ONCE = 3

function cardFor(hit: ProductHit): Card {
  return {
    hit,
    reading: false,
    url: hit.url,
    domain: hit.domain,
    title: hit.title,
    price: null,
    currency: null,
    supplier: hit.domain.split('.')[0]!.replace(/\b\w/g, (c) => c.toUpperCase()),
    image: null,
    imageUrl: null,
  }
}

/**
 * Find something to buy without having a link for it first.
 *
 * The search itself only comes back with names and addresses, so each result's page is then read in
 * the background — that is where the picture and the real price live. The grid fills in as they
 * land rather than making anyone wait for the slowest shop, and a card can be picked before its
 * page has been read: the sheet finishes the reading afterwards.
 */
export function ProductSearch({ onPick, className, autoFocus, placeholder = 'Brushed brass cabinet handle' }: {
  onPick: (found: Found) => void
  className?: string
  autoFocus?: boolean
  placeholder?: string
}) {
  const { db } = useDb()
  const cur = useCurrency()
  const [q, setQ] = useState('')
  const [cards, setCards] = useState<Card[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState('')
  // Results that arrive after someone has searched again must not overwrite the newer ones.
  const run = useRef(0)

  const search = async (e?: FormEvent) => {
    e?.preventDefault()
    const term = q.trim()
    if (term.length < 2 || busy) return
    const mine = ++run.current
    setBusy(true); setError(null); setCards(null)
    try {
      const hits = await db.searchProducts(term)
      if (run.current !== mine) return
      setSearched(term)
      setCards(hits.map(cardFor))
      setBusy(false)
      if (hits.length) void enrich(hits, mine)
    } catch (err) {
      if (run.current !== mine) return
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Search did not work.')
    }
  }

  /** Read the pages a few at a time, updating each card the moment its own page comes back. */
  const enrich = async (hits: ProductHit[], mine: number) => {
    const queue = hits.slice(0, ENRICH)
    const patch = (url: string, fn: (c: Card) => Card) => {
      if (run.current !== mine) return
      setCards((old) => old?.map((c) => (c.url === url ? fn(c) : c)) ?? old)
    }
    let next = 0
    const worker = async () => {
      while (next < queue.length && run.current === mine) {
        const hit = queue[next++]!
        patch(hit.url, (c) => ({ ...c, reading: true }))
        try {
          const got = await db.unfurl(hit.url)
          patch(hit.url, (c) => ({
            ...c,
            reading: false,
            // The page is the better source for all of it, but never trade something for nothing.
            title: got.title || c.title,
            price: got.price ?? c.price,
            currency: got.currency ?? c.currency,
            supplier: got.supplier || c.supplier,
            image: got.image ?? c.image,
            imageUrl: got.imageUrl ?? c.imageUrl,
          }))
        } catch {
          // A shop that won't be read is still worth showing — its name and link are right.
          patch(hit.url, (c) => ({ ...c, reading: false }))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker))
  }

  const favoured = cards?.filter((c) => c.hit.favoured) ?? []
  const rest = cards?.filter((c) => !c.hit.favoured) ?? []

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <form onSubmit={search} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search for a product"
          enterKeyHint="search"
          autoFocus={autoFocus}
          className="flex-1"
        />
        <Button variant="secondary" onClick={() => void search()} loading={busy} disabled={q.trim().length < 2} leading={busy ? undefined : <Search className="size-4" />}>
          Search
        </Button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-gold-soft px-3 py-2 text-[13px] text-ochre-text">{error}</p>}

      {busy && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[188px] animate-pulse rounded-2xl bg-surface-2" />)}
        </div>
      )}

      {!busy && cards?.length === 0 && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">Nothing came back for “{searched}”. Try fewer words, or paste a link.</p>
      )}

      {!busy && cards && cards.length > 0 && (
        <>
          <Grid cards={favoured} onPick={onPick} cur={cur.code} />
          {rest.length > 0 && (
            <>
              <p className="flex items-center gap-2 pt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
                <span className="h-px flex-1 bg-line" /> Elsewhere <span className="h-px flex-1 bg-line" />
              </p>
              <Grid cards={rest} onPick={onPick} cur={cur.code} />
            </>
          )}
          <p className="text-[12px] text-ink-3">Prices come off the shop's own page and aren't checked — treat them as a guide, not a quote.</p>
        </>
      )}
    </div>
  )
}

function Grid({ cards, onPick, cur }: { cards: Card[]; onPick: (f: Found) => void; cur: string }) {
  if (cards.length === 0) return null
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((c) => <li key={c.url}><ResultCard card={c} onPick={onPick} cur={cur} /></li>)}
    </ul>
  )
}

function ResultCard({ card, onPick, cur }: { card: Card; onPick: (f: Found) => void; cur: string }) {
  const { hit: _hit, reading, ...found } = card
  const picture = found.image ?? found.imageUrl
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(found.domain)}&sz=64`
  // A price read off a page in another currency would be a lie next to everything else, so it is
  // shown with its own code rather than the home's symbol.
  const foreign = found.currency && found.currency.toUpperCase() !== cur

  return (
    <button
      type="button"
      onClick={() => onPick(found)}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <span className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-surface-2">
        {picture
          ? <img src={picture} alt="" className="h-full w-full object-cover" loading="lazy" />
          : <ShoppingBag className="size-7 text-ink-3" />}
        {reading && (
          <span className="absolute inset-0 grid place-items-center bg-surface/60">
            <Loader2 className="size-4 animate-spin text-ink-3" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{found.title}</span>
        <span className="mt-auto flex items-baseline justify-between gap-1.5">
          <span className="font-display-tight text-[15px] text-ink tabular">
            {found.price == null ? <span className="text-ink-3">—</span>
              : foreign ? `${found.currency} ${Math.round(found.price).toLocaleString()}`
                : money(found.price)}
          </span>
        </span>
        <span className="flex items-center gap-1 truncate text-[11px] text-ink-3">
          <img src={favicon} alt="" className="size-3.5 shrink-0 rounded-[3px]" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
          <span className="truncate">{found.domain}</span>
        </span>
      </span>
    </button>
  )
}

/** The little "found at Builders" line shown once a result has been chosen. */
export function ChosenLine({ found, onClear }: { found: Found; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-sage/40 bg-sage-soft px-3 py-2.5">
      <Store className="size-4 shrink-0 text-sage-text" />
      <p className="min-w-0 flex-1 truncate text-[13px] text-ink-2">Found at <b className="text-ink">{found.domain}</b></p>
      <button type="button" onClick={onClear} className="shrink-0 text-[13px] font-medium text-primary-text hover:underline">Search again</button>
    </div>
  )
}
