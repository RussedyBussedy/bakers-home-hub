import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, CheckCircle2, ExternalLink, ImageOff, Link2, Loader2, MoreHorizontal, Palette, Paperclip, Plus, Receipt, Search, ShoppingBag, Tag, Trash2, Wallet } from 'lucide-react'
import type { BoardItem, Contact, Expense, Project, ProductData } from '../../data/types'
import { EXPENSE_CATEGORIES } from '../../data/types'
import { DEFAULT_SIZES } from '../board/Pins'
import { useActions, useMediaUrl } from '../../data/hooks'
import { useDb } from '../../data/session'
import { useUi } from '../../store/ui'
import { comparisonRange, comparisons, groupNames, groupOf, isBought, lineTotal, nextSlot, priced, pricedRange, qtyOf, type Comparison } from '../../lib/board'
import { compressImage } from '../../lib/images'
import { openExternal } from '../../lib/share'
import { useCurrency } from '../../lib/currency'
import { cn, domainOf, money, normaliseUrl, pluralise, todayISO } from '../../lib/utils'
import { ContactPicker } from '../contacts/ContactPicker'
import { EmptyState, Money, Pill } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { DateInput, Field, Input, Segmented, Select } from '../ui/Field'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'
import { Sheet, useConfirm } from '../ui/Sheet'
import { ChosenLine, ProductSearch, type Found } from '../shop/ProductSearch'

/**
 * Prices: what things cost, gathered from links and searches — deliberately not quotes.
 *
 * The important idea here is that this is a comparison workspace, not a shopping list. Five dining
 * tables from five shops are ONE decision, so they are never added together: options sharing a
 * group are compared, one is picked, and only the picks count towards what the project will cost.
 * An item with no group is simply a decision of one.
 *
 * Nothing here touches the budget or the real cost — until something is actually bought, at which
 * point it becomes an ordinary expense in Money and leaves this plan entirely, so the same money is
 * never counted in both places.
 */
export function PricesPanel({ project, items, expenses, contacts, onOpenMoney }: {
  project: Project
  items: BoardItem[]
  expenses: Expense[]
  contacts: Contact[]
  onOpenMoney?: () => void
}) {
  const [sheet, setSheet] = useState<{ open: boolean; item?: BoardItem | null }>({ open: false })
  const [buying, setBuying] = useState<BoardItem | null>(null)
  const list = useMemo(() => priced(items), [items])
  // An expense can be deleted from the Money tab. If that happens the card must stop claiming it was
  // bought rather than pointing at something that no longer exists, so the link is checked, not trusted.
  const live = useMemo(() => {
    const ids = new Set(expenses.map((e) => e.id))
    return list.map((i) => {
      const d = i.data as ProductData
      return d.expense_id && !ids.has(d.expense_id) ? { ...i, data: { ...d, expense_id: undefined } } : i
    })
  }, [list, expenses])

  const groups = useMemo(() => comparisons(live), [live])
  const range = useMemo(() => pricedRange(live), [live])
  const suggestions = useMemo(() => groupNames(live), [live])
  const spent = useMemo(() => {
    const byId = new Map(expenses.map((e) => [e.id, e]))
    return live.reduce((sum, i) => {
      const id = (i.data as ProductData).expense_id
      return sum + (id ? byId.get(id)?.amount ?? 0 : 0)
    }, 0)
  }, [live, expenses])

  const named = groups.filter((g) => g.name)
  const loose = groups.filter((g) => !g.name).flatMap((g) => g.options)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">Prices</h2>
          <p className="text-[13px] text-ink-3">Options you're weighing up, from links and searches. Not quotes — nothing counts against the budget until you buy it.</p>
        </div>
        <Button leading={<Plus className="size-4" />} onClick={() => setSheet({ open: true })}>Add a price</Button>
      </div>

      {live.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">
              {range.open > 0 ? 'Still to spend' : 'What you have settled on'}
            </p>
            <p className="font-display-tight text-2xl text-ink tabular">
              {range.low === range.high
                ? <Money value={range.low} />
                : <>{money(range.low)} <span className="text-ink-3">–</span> {money(range.high)}</>}
            </p>
          </div>
          <div className="text-right text-[13px] text-ink-2">
            <p>{pluralise(range.open + range.settled, 'thing')} to buy</p>
            {range.open > 0 && <p className="text-ink-3">{range.open} still to choose</p>}
            {range.bought > 0 && (
              <button onClick={onOpenMoney} className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary-text hover:underline">
                <Wallet className="size-3.5" /> {money(spent)} bought
              </button>
            )}
          </div>
        </div>
      )}

      {live.length === 0 ? (
        <EmptyState
          icon={<Tag />}
          title="Nothing priced yet"
          description="Search the shops or paste a link — a table, a tap, a light. Give a few of them the same name and you can compare them side by side."
          action={<Button leading={<Plus className="size-4" />} onClick={() => setSheet({ open: true })}>Add a price</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {named.map((g) => (
            <Group
              key={g.name}
              group={g}
              onEdit={(i) => setSheet({ open: true, item: i })}
              onBuy={setBuying}
              onAdd={() => setSheet({ open: true, item: null })}
            />
          ))}
          {loose.length > 0 && (
            <div className="flex flex-col gap-3">
              {named.length > 0 && <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-3">On their own</h3>}
              <Cards items={loose} group={null} onEdit={(i) => setSheet({ open: true, item: i })} onBuy={setBuying} />
            </div>
          )}
        </div>
      )}

      <PriceSheet
        key={sheet.item?.id ?? 'new'}
        open={sheet.open}
        item={sheet.item ?? null}
        project={project}
        items={items}
        suggestions={suggestions}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
      />
      <BoughtSheet
        key={buying?.id ?? 'none'}
        item={buying}
        project={project}
        contacts={contacts}
        onOpenChange={(o) => { if (!o) setBuying(null) }}
      />
    </div>
  )
}

/** One thing being shopped for, with its competing options underneath. */
function Group({ group, onEdit, onBuy, onAdd }: { group: Comparison; onEdit: (i: BoardItem) => void; onBuy: (i: BoardItem) => void; onAdd: () => void }) {
  const r = comparisonRange(group)
  const n = group.options.length
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[17px] font-medium text-ink">{group.name}</h3>
          <span className="text-[12px] text-ink-3">{pluralise(n, 'option')}</span>
        </div>
        <p className="text-[13px] tabular text-ink-2">
          {group.bought
            ? <span className="text-sage-text">Bought · {money(r.low)}</span>
            : r.settled ? <>Picked · <b className="text-ink">{money(r.low)}</b></>
              : r.low === r.high ? money(r.low)
                : <>{money(r.low)} <span className="text-ink-3">–</span> {money(r.high)}</>}
        </p>
      </div>
      <Cards items={group.options} group={group} onEdit={onEdit} onBuy={onBuy} />
      <button onClick={onAdd} className="self-start text-[13px] font-medium text-primary-text hover:underline">+ Another option</button>
    </section>
  )
}

function Cards({ items, group, onEdit, onBuy }: { items: BoardItem[]; group: Comparison | null; onEdit: (i: BoardItem) => void; onBuy: (i: BoardItem) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
      {items.map((item) => (
        <PriceCard
          key={item.id}
          item={item}
          group={group}
          onEdit={() => onEdit(item)}
          onBuy={() => onBuy(item)}
        />
      ))}
    </div>
  )
}

function PriceCard({ item, group, onEdit, onBuy }: { item: BoardItem; group: Comparison | null; onEdit: () => void; onBuy: () => void }) {
  const data = item.data as ProductData
  const stored = useMediaUrl(data.image_path ?? null)
  const src = stored ?? data.image_url ?? null
  // No picture (the page had none, or wouldn't be read): the shop's own icon still tells you at a
  // glance where it came from.
  const host = data.url ? domainOf(normaliseUrl(data.url)) : ''
  const favicon = host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : null
  const url = normaliseUrl(data.url ?? '')
  const qty = qtyOf(data)
  const { updateBoardItem, deleteBoardItem } = useActions()
  const confirm = useConfirm()
  const onTheBoard = !data.off_board
  const bought = isBought(data)
  const picked = Boolean(data.chosen)
  // Only worth pointing out the cheapest when there is actually something to be cheaper than.
  const cheapest = group && group.options.length > 1 && group.cheapest?.id === item.id && !picked && !bought

  const setOnBoard = (on: boolean) => updateBoardItem(item, { data: { ...data, off_board: !on } })
  /** Picking is exclusive: choosing one option must unpick whatever was chosen before. */
  const choose = async () => {
    if (group?.pick && group.pick.id !== item.id) {
      const prev = group.pick.data as ProductData
      await updateBoardItem(group.pick, { data: { ...prev, chosen: false } })
    }
    await updateBoardItem(item, { data: { ...data, chosen: !picked } })
  }

  return (
    <div className={cn('card group flex min-w-0 flex-col overflow-hidden transition-shadow',
      picked && !bought && 'ring-2 ring-primary', bought && 'ring-2 ring-sage')}>
      <div className="relative aspect-[4/3] bg-surface-2">
        {src
          ? <img src={src} alt="" loading="lazy" className={cn('h-full w-full object-cover', bought && 'opacity-70')} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
          : favicon
            ? <div className="grid h-full place-items-center"><img src={favicon} alt="" className="size-8 opacity-80" /></div>
            : <div className="grid h-full place-items-center text-ink-3"><ImageOff className="size-7" /></div>}
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
          {bought && <Pill tone="sage" size="sm"><CheckCircle2 className="size-3" /> Bought</Pill>}
          {picked && !bought && <Pill tone="primary" size="sm"><Check className="size-3" /> Picked</Pill>}
          {cheapest && <Pill tone="sky" size="sm">Cheapest</Pill>}
          {onTheBoard && !bought && !picked && !cheapest && <Pill tone="sage" size="sm">On the board</Pill>}
        </span>
        {qty > 1 && <span className="absolute bottom-2 left-2"><Pill size="sm" className="bg-ink/85 text-bg tabular">× {qty}</Pill></span>}
        <div className="absolute right-1.5 top-1.5">
          <Menu trigger={<IconButton label="Item actions" size="icon-sm" className="bg-surface/90 text-ink shadow-sm hover:bg-surface"><MoreHorizontal className="size-4" /></IconButton>}>
            {group && !bought && <MenuItem icon={<Check />} onSelect={() => void choose()}>{picked ? 'Unpick it' : 'Pick this one'}</MenuItem>}
            {!bought && <MenuItem icon={<Receipt />} onSelect={onBuy}>I bought this</MenuItem>}
            <MenuItem icon={<Tag />} onSelect={onEdit}>Edit</MenuItem>
            {url && <MenuItem icon={<ExternalLink />} onSelect={() => openExternal(url)}>Open the shop page</MenuItem>}
            <MenuItem icon={<Palette />} onSelect={() => setOnBoard(!onTheBoard)}>{onTheBoard ? 'Take off the board' : 'Pin it on the board'}</MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 />} onSelect={async () => { if (await confirm({ title: 'Remove this price?', description: bought ? 'The expense in Money stays — only this card goes.' : undefined, confirmLabel: 'Remove', danger: true })) void deleteBoardItem(item) }}>Remove</MenuItem>
          </Menu>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{data.title}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display-tight text-[17px] text-ink tabular">{data.price != null ? money(lineTotal(data)) : '—'}</span>
          {data.supplier && <span className="truncate text-[11px] text-ink-3">{data.supplier}</span>}
        </div>
        {qty > 1 && data.price != null && <p className="text-[11px] text-ink-3 tabular">{qty} × {money(data.price)} each</p>}
        {url && (
          <button onClick={() => openExternal(url)} className="mt-2 inline-flex items-center gap-1 self-start text-[12px] font-medium text-primary-text hover:underline">
            <ExternalLink className="size-3.5" /> {domainOf(url)}
          </button>
        )}
      </div>
    </div>
  )
}

type Draft = { url: string; title: string; price: string; qty: string; group: string; supplier: string; image: string | null; image_path?: string; image_url?: string; onBoard: boolean }

function PriceSheet({ open, onOpenChange, item, project, items, suggestions }: { open: boolean; onOpenChange: (o: boolean) => void; item: BoardItem | null; project: Project; items: BoardItem[]; suggestions: string[] }) {
  const existing = item ? (item.data as ProductData) : null
  const cur = useCurrency()
  const { db } = useDb()
  const { addBoardItem, updateBoardItem, uploadFile } = useActions()
  const toast = useUi((s) => s.toast)
  const [d, setD] = useState<Draft>(() => ({
    url: existing?.url ?? '',
    title: existing?.title ?? '',
    price: existing?.price != null ? String(existing.price) : '',
    qty: String(existing ? qtyOf(existing) : 1),
    group: existing ? groupOf(existing) : '',
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

  // Every opening starts clean. The sheet stays mounted between uses, so without this the second
  // price you add arrives wearing the first one's name, price and group — which is exactly the sort
  // of thing that quietly puts a wrong number in the plan.
  useEffect(() => {
    if (!open) return
    const e = item ? (item.data as ProductData) : null
    setD({
      url: e?.url ?? '',
      title: e?.title ?? '',
      price: e?.price != null ? String(e.price) : '',
      qty: String(e ? qtyOf(e) : 1),
      group: e ? groupOf(e) : '',
      supplier: e?.supplier ?? '',
      image: null,
      image_path: e?.image_path,
      image_url: e?.image_url,
      onBoard: e ? !e.off_board : false,
    })
    setHow(item ? 'link' : 'search')
    setChosen(null); setNote(null); setErr(null); setLooking(false); setBusy(false)
  }, [open, item])
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
      const qty = qtyOf({ title: '', price: null, qty: Number(d.qty) })
      const group = d.group.trim().slice(0, 60)
      const data: ProductData = {
        title, price, url: url || undefined, supplier: d.supplier.trim() || undefined,
        ...(qty > 1 ? { qty } : {}),
        ...(group ? { group } : {}),
        // A pick and a purchase belong to the item, not to this form — never clobber them on an edit.
        ...(existing?.chosen ? { chosen: true } : {}),
        ...(existing?.expense_id ? { expense_id: existing.expense_id } : {}),
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

        <Field
          label="What's it for"
          hint={d.group.trim()
            ? `Compared against the other options for "${d.group.trim()}".`
            : 'Give a few options the same name — "Dining table" — and they get compared instead of added up. Leave it blank if it stands alone.'}
        >
          {(id) => (
            <>
              <Input id={id} list="price-groups" value={d.group} maxLength={60} onChange={(e) => setD((s) => ({ ...s, group: e.target.value }))} placeholder="Dining table" />
              <datalist id="price-groups">{suggestions.map((g) => <option key={g} value={g} />)}</datalist>
            </>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3">
            <Field label="Price" className="flex-1">
              {(id) => <Input id={id} inputMode="decimal" prefix={cur.symbol} value={d.price} onChange={(e) => setD((s) => ({ ...s, price: e.target.value }))} placeholder="0" />}
            </Field>
            <Field label="How many" className="w-24 shrink-0">
              {(id) => <Input id={id} inputMode="numeric" value={d.qty} onChange={(e) => setD((s) => ({ ...s, qty: e.target.value.replace(/[^\d]/g, '') }))} onBlur={() => setD((s) => ({ ...s, qty: String(qtyOf({ title: '', price: null, qty: Number(s.qty) })) }))} placeholder="1" />}
            </Field>
          </div>
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

// ---------------------------------------------------------------------------
// Buying one
//
// The moment a priced option is actually bought it stops being a plan and becomes real money, so
// it is written into Money as an ordinary expense — invoice and all — and the card keeps only a
// link to it. That link is what stops the same spend being counted twice: `pricedRange` drops a
// bought decision from the plan, because the Money tab is now the one counting it.
// ---------------------------------------------------------------------------
function BoughtSheet({ item, project, contacts, onOpenChange }: {
  item: BoardItem | null
  project: Project
  contacts: Contact[]
  onOpenChange: (o: boolean) => void
}) {
  const data = item ? (item.data as ProductData) : null
  const cur = useCurrency()
  const { createExpense, updateBoardItem } = useActions()
  const toast = useUi((s) => s.toast)
  const [amount, setAmount] = useState(() => (data ? lineTotal(data) : 0))
  const [date, setDate] = useState(todayISO())
  const [category, setCategory] = useState('Materials')
  const [contactId, setContactId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!item || !data) return null
  const qty = qtyOf(data)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!(amount > 0)) { setErr('What did it come to?'); return }
    setBusy(true); setErr(null)
    try {
      const expense = await createExpense({
        project_id: project.id,
        // The quantity belongs in the line, so the expense reads the way a receipt does.
        title: qty > 1 ? `${data.title} × ${qty}` : data.title,
        amount,
        date,
        category,
        contact_id: contactId,
        quote_id: null,
        receipt_path: null,
        file,
      })
      if (!expense) return
      // Bought settles the decision, so it is picked as well — otherwise a group could show a
      // purchase and a different pick at the same time.
      await updateBoardItem(item, { data: { ...data, expense_id: expense.id, chosen: true } })
      toast({ title: 'Added to Money', description: `${money(amount)} — it has left the shopping plan.`, tone: 'success' })
      onOpenChange(false)
    } catch { /* the action layer toasts */ } finally { setBusy(false) }
  }

  return (
    <Sheet
      open={Boolean(item)}
      onOpenChange={onOpenChange}
      title="You bought it"
      description="This becomes a real expense in Money, and drops out of what is still to spend."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy} leading={<Receipt className="size-4" />}>Add to Money</Button></>}
    >
      <form onSubmit={save} className="flex flex-col gap-4 pt-1">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-ink-3"><ShoppingBag className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-ink">{data.title}</p>
            <p className="truncate text-[12px] text-ink-3">
              {data.price != null ? <>Priced at {money(lineTotal(data))}{qty > 1 ? ` (${qty} × ${money(data.price)})` : ''}</> : 'No price was recorded'}
              {groupOf(data) ? ` · ${groupOf(data)}` : ''}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What you actually paid" required error={err ?? undefined} hint={data.price != null && amount !== lineTotal(data) ? 'Different to the price you had — that is fine, this is the real one.' : undefined}>
            {(id) => <Input id={id} prefix={cur.symbol} inputMode="decimal" autoFocus value={amount || ''} onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} placeholder="0" invalid={Boolean(err)} />}
          </Field>
          <Field label="When">{(id) => <DateInput id={id} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            {(id) => <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}
          </Field>
          <Field label="Bought from" hint={data.supplier ? `The card says ${data.supplier}.` : undefined}>
            {(id) => <ContactPicker id={id} value={contactId} onChange={setContactId} contacts={contacts} placeholder={data.supplier || 'Search contacts'} compact />}
          </Field>
        </div>

        <Field label="Invoice or receipt" hint="A photo or a PDF — it stays with the expense.">
          {(id) => (
            <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3.5 text-sm text-ink-2 hover:text-ink">
              <Paperclip className="size-4" /> {file ? file.name : 'Attach the invoice'}
              <input id={id} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Sheet>
  )
}
