import { useMemo, useState, type FormEvent } from 'react'
import { ExternalLink, ImageOff, Link2, Loader2, MoreHorizontal, Palette, Plus, Search, ShoppingBag, Tag, Trash2 } from 'lucide-react'
import type { BoardItem, Project, ProductData } from '../../data/types'
import { DEFAULT_SIZES } from '../board/Pins'
import { useActions, useMediaUrl } from '../../data/hooks'
import { useDb } from '../../data/session'
import { useUi } from '../../store/ui'
import { nextSlot, priced, pricedTotal } from '../../lib/board'
import { compressImage } from '../../lib/images'
import { openExternal } from '../../lib/share'
import { useCurrency } from '../../lib/currency'
import { cn, domainOf, money, normaliseUrl, pluralise } from '../../lib/utils'
import { EmptyState, Money, Pill } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { Field, Input, Segmented } from '../ui/Field'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'
import { Sheet, useConfirm } from '../ui/Sheet'
import { ChosenLine, ProductSearch, type Found } from '../shop/ProductSearch'

/**
 * Prices: what things cost, gathered from links — deliberately not quotes. Nothing here touches the
 * budget, the real cost or the headroom; those stay driven by real quotes and real expenses.
 */
export function PricesPanel({ project, items }: { project: Project; items: BoardItem[] }) {
  const [sheet, setSheet] = useState<{ open: boolean; item?: BoardItem | null }>({ open: false })
  const list = useMemo(() => priced(items), [items])
  const total = useMemo(() => pricedTotal(list), [list])
  const pinned = list.filter((i) => !(i.data as ProductData).off_board).length

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">Prices</h2>
          <p className="text-[13px] text-ink-3">What things cost, from links you've found. Not quotes — none of this counts against the budget.</p>
        </div>
        <Button leading={<Plus className="size-4" />} onClick={() => setSheet({ open: true })}>Add a price</Button>
      </div>

      {list.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">If you bought the lot</p>
            <p className="font-display-tight text-2xl text-ink tabular"><Money value={total} /></p>
          </div>
          <div className="text-right text-[13px] text-ink-2">
            <p>{pluralise(list.length, 'item')} priced</p>
            {pinned > 0 && <p className="text-ink-3">{pinned} also on the board</p>}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={<Tag />}
          title="Nothing priced yet"
          description="Paste a link to a paint tin, a tap, a light — anything you're pricing up. The picture and price come along with it."
          action={<Button leading={<Plus className="size-4" />} onClick={() => setSheet({ open: true })}>Add a price</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
          {list.map((item) => <PriceCard key={item.id} item={item} onEdit={() => setSheet({ open: true, item })} />)}
        </div>
      )}

      <PriceSheet
        key={sheet.item?.id ?? 'new'}
        open={sheet.open}
        item={sheet.item ?? null}
        project={project}
        items={items}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
      />
    </div>
  )
}

function PriceCard({ item, onEdit }: { item: BoardItem; onEdit: () => void }) {
  const data = item.data as ProductData
  const stored = useMediaUrl(data.image_path ?? null)
  const src = stored ?? data.image_url ?? null
  // No picture (the link reader isn't deployed, or the page had none): the shop's own icon still
  // tells you at a glance where it came from.
  const host = data.url ? domainOf(normaliseUrl(data.url)) : ''
  const favicon = host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : null
  const url = normaliseUrl(data.url ?? '')
  const { updateBoardItem, deleteBoardItem } = useActions()
  const confirm = useConfirm()
  const onTheBoard = !data.off_board

  const setOnBoard = (on: boolean) => updateBoardItem(item, { data: { ...data, off_board: !on } })

  return (
    <div className="card group flex min-w-0 flex-col overflow-hidden">
      <div className="relative aspect-[4/3] bg-surface-2">
        {src
          ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
          : favicon
            ? <div className="grid h-full place-items-center"><img src={favicon} alt="" className="size-8 opacity-80" /></div>
            : <div className="grid h-full place-items-center text-ink-3"><ImageOff className="size-7" /></div>}
        {onTheBoard && <span className="absolute left-2 top-2"><Pill tone="sage" size="sm">On the board</Pill></span>}
        <div className="absolute right-1.5 top-1.5">
          <Menu trigger={<IconButton label="Item actions" size="icon-sm" className="bg-surface/90 text-ink shadow-sm hover:bg-surface"><MoreHorizontal className="size-4" /></IconButton>}>
            <MenuItem icon={<Tag />} onSelect={onEdit}>Edit</MenuItem>
            {url && <MenuItem icon={<ExternalLink />} onSelect={() => openExternal(url)}>Open the shop page</MenuItem>}
            <MenuItem icon={<Palette />} onSelect={() => setOnBoard(!onTheBoard)}>{onTheBoard ? 'Take off the board' : 'Pin it on the board'}</MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 />} onSelect={async () => { if (await confirm({ title: 'Remove this price?', confirmLabel: 'Remove', danger: true })) void deleteBoardItem(item) }}>Remove</MenuItem>
          </Menu>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{data.title}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display-tight text-[17px] text-ink tabular">{data.price != null ? money(data.price) : '—'}</span>
          {data.supplier && <span className="truncate text-[11px] text-ink-3">{data.supplier}</span>}
        </div>
        {url && (
          <button onClick={() => openExternal(url)} className="mt-2 inline-flex items-center gap-1 self-start text-[12px] font-medium text-primary-text hover:underline">
            <ExternalLink className="size-3.5" /> {domainOf(url)}
          </button>
        )}
      </div>
    </div>
  )
}

type Draft = { url: string; title: string; price: string; supplier: string; image: string | null; image_path?: string; image_url?: string; onBoard: boolean }

function PriceSheet({ open, onOpenChange, item, project, items }: { open: boolean; onOpenChange: (o: boolean) => void; item: BoardItem | null; project: Project; items: BoardItem[] }) {
  const existing = item ? (item.data as ProductData) : null
  const cur = useCurrency()
  const { db } = useDb()
  const { addBoardItem, updateBoardItem, uploadFile } = useActions()
  const toast = useUi((s) => s.toast)
  const [d, setD] = useState<Draft>(() => ({
    url: existing?.url ?? '',
    title: existing?.title ?? '',
    price: existing?.price != null ? String(existing.price) : '',
    supplier: existing?.supplier ?? '',
    image: null,
    image_path: existing?.image_path,
    image_url: existing?.image_url,
    onBoard: existing ? !existing.off_board : false,
  }))
  const [looking, setLooking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Searching is the way in for something new; editing an existing card starts on its link.
  const [how, setHow] = useState<'search' | 'link'>(item ? 'link' : 'search')
  const [chosen, setChosen] = useState<Found | null>(null)
  const storedPreview = useMediaUrl(d.image_path ?? null)
  const preview = d.image ?? storedPreview ?? d.image_url ?? null

  const look = async (raw?: string) => {
    const url = normaliseUrl((raw ?? d.url).trim())
    if (!url) return
    setLooking(true); setNote(null); setErr(null)
    try {
      const got = await db.unfurl(url)
      setD((s) => ({
        ...s,
        url: got.url || url,
        title: s.title.trim() || got.title,
        price: s.price.trim() || (got.price != null ? String(got.price) : ''),
        supplier: s.supplier.trim() || got.supplier,
        image: got.image ?? s.image,
        image_url: got.image ? undefined : (got.imageUrl ?? s.image_url),
      }))
      if (got.price == null) setNote("Couldn't find a price on that page — pop it in yourself.")
      else if (got.currency && got.currency.toUpperCase() !== cur.code) {
        // Nothing converts anywhere in the app, so say it plainly rather than quietly adding a
        // foreign number to the totals.
        setNote(`That page prices in ${got.currency.toUpperCase()}, not ${cur.code}. The number came across as it was — convert it yourself if it matters.`)
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not read that page. You can still fill it in by hand.')
    } finally { setLooking(false) }
  }

  /**
   * A search result was chosen. Whatever its card already knows goes straight into the form; if its
   * page hadn't been read yet (the slow shops, or one further down the grid) it gets read now, so
   * nobody is left staring at an empty price.
   */
  const pick = (f: Found) => {
    setChosen(f)
    setErr(null); setNote(null)
    setD((s) => ({
      ...s,
      url: f.url,
      title: f.title,
      price: f.price != null ? String(f.price) : '',
      supplier: f.supplier,
      image: f.image ?? null,
      image_url: f.image ? undefined : (f.imageUrl ?? undefined),
      image_path: undefined,
    }))
    if (f.price == null || !f.image) void look(f.url)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const url = normaliseUrl(d.url.trim())
    const title = d.title.trim() || (url ? domainOf(url) : '')
    if (!title) { setErr('Give it a name.'); return }
    const price = d.price.trim() ? Number(d.price.replace(/[^\d.]/g, '')) : null
    if (d.price.trim() && !Number.isFinite(price)) { setErr('That price does not look like a number.'); return }
    setBusy(true)
    try {
      let image_path = d.image_path
      if (d.image) {
        // The picture arrives as a data URL from the page; squeeze it and keep our own copy so the
        // card still works if the shop changes its site.
        const blob = await (await fetch(d.image)).blob()
        image_path = await uploadFile(await compressImage(blob, { maxSize: 900 }), `${project.id}/prices`)
      }
      const data: ProductData = {
        title, price, url: url || undefined, supplier: d.supplier.trim() || undefined,
        image_path, image_url: image_path ? undefined : d.image_url, off_board: !d.onBoard,
      }
      if (item) await updateBoardItem(item, { data })
      else {
        const size = DEFAULT_SIZES.product
        const at = nextSlot(items, size.w, size.h)
        await addBoardItem({ project_id: project.id, type: 'product', x: at.x, y: at.y, w: size.w, h: size.h, rotation: 0, z: items.length + 1, data })
      }
      toast({ title: item ? 'Price updated' : 'Price added', description: d.onBoard ? 'It is on the board too.' : undefined, tone: 'success' })
      onOpenChange(false)
    } catch { /* the action layer toasts */ } finally { setBusy(false) }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? 'Edit this price' : 'Add a price'}
      description="Search the shops, or paste a link — the name, picture and price come with it."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>{item ? 'Save' : 'Add it'}</Button></>}
    >
      <form onSubmit={save} className="flex flex-col gap-4 pt-1">
        <Segmented<'search' | 'link'>
          value={how}
          onChange={(v) => { setHow(v); setNote(null) }}
          options={[
            { value: 'search', label: <span className="inline-flex items-center gap-1.5"><Search className="size-4" /> Search shops</span> },
            { value: 'link', label: <span className="inline-flex items-center gap-1.5"><Link2 className="size-4" /> Paste a link</span> },
          ]}
        />

        {how === 'search' && (chosen
          ? <ChosenLine found={chosen} onClear={() => setChosen(null)} />
          : <ProductSearch onPick={pick} autoFocus={!item} />)}

        {how === 'link' && (
          <Field label="Link" hint="A shop page, a marketplace listing — anything with a price on it.">
            {(id) => (
              <div className="flex gap-2">
                <Input
                  id={id} type="url" inputMode="url" value={d.url} autoFocus={!item}
                  onChange={(e) => setD((s) => ({ ...s, url: e.target.value }))}
                  onBlur={(e) => { if (!item && e.target.value.trim() && !d.title.trim()) void look(e.target.value) }}
                  placeholder="https://"
                  className="flex-1"
                />
                <Button variant="secondary" onClick={() => look()} loading={looking} disabled={!d.url.trim()} leading={looking ? undefined : <Search className="size-4" />}>Fetch</Button>
              </div>
            )}
          </Field>
        )}

        {(preview || looking) && (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface">
              {looking ? <Loader2 className="size-5 animate-spin text-ink-3" />
                : preview ? <img src={preview} alt="" className="h-full w-full object-cover" />
                  : <ShoppingBag className="size-6 text-ink-3" />}
            </div>
            <p className="min-w-0 flex-1 text-[13px] text-ink-2">
              {looking ? 'Reading the page…' : 'This picture gets saved with the item, so it stays put even if the shop changes its site.'}
            </p>
          </div>
        )}

        {note && <p className="-mt-1 text-[13px] text-ochre-text">{note}</p>}

        <Field label="What is it" required error={err ?? undefined}>
          {(id) => <Input id={id} value={d.title} onChange={(e) => setD((s) => ({ ...s, title: e.target.value }))} placeholder="Sage enamel 5 L" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price">
            {(id) => <Input id={id} inputMode="decimal" prefix={cur.symbol} value={d.price} onChange={(e) => setD((s) => ({ ...s, price: e.target.value }))} placeholder="0" />}
          </Field>
          <Field label="Where from">
            {(id) => <Input id={id} value={d.supplier} onChange={(e) => setD((s) => ({ ...s, supplier: e.target.value }))} placeholder="Builders Warehouse" />}
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setD((s) => ({ ...s, onBoard: !s.onBoard }))}
          aria-pressed={d.onBoard}
          className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors', d.onBoard ? 'border-sage bg-sage-soft' : 'border-line bg-surface hover:border-line-strong')}
        >
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', d.onBoard ? 'bg-sage text-on-dark' : 'bg-surface-2 text-ink-3')}><Palette className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-ink">Pin it on the inspiration board too</span>
            <span className="block text-[12px] text-ink-3">{d.onBoard ? 'It will show as a card on the board.' : 'Off — it stays in this list only.'}</span>
          </span>
        </button>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Sheet>
  )
}
