import { useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Eraser, Plus, ShoppingBasket, Trash2, UserRound, Users } from 'lucide-react'
import { SHOPPING_CATEGORIES, type ShoppingItem } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { useUi } from '../../store/ui'
import { cn, money } from '../../lib/utils'
import { Avatar, EmptyState, Pill, Reveal } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Chip, Input, Select } from '../ui/Field'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu'
import { useConfirm, usePrompt } from '../ui/Sheet'

type Filter = 'all' | 'mine' | 'open'

export function ShoppingPanel({ items }: { items: ShoppingItem[] }) {
  const { addShoppingItem, updateShoppingItem, deleteShoppingItem, clearShoppingDone } = useActions()
  const { profiles, profileById, me } = useAuth()
  const toast = useUi((s) => s.toast)
  const confirm = useConfirm()
  const prompt = usePrompt()

  const [title, setTitle] = useState('')
  const [qty, setQty] = useState('')
  const [category, setCategory] = useState<string>('Groceries')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)

  const open = useMemo(() => items.filter((i) => !i.done), [items])
  const done = useMemo(() => items.filter((i) => i.done).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')), [items])

  const shown = useMemo(() => {
    if (filter === 'mine') return open.filter((i) => i.assigned_to === me?.id)
    if (filter === 'open') return open.filter((i) => !i.assigned_to)
    return open
  }, [open, filter, me])

  // Grouped by the aisle you'd find it in, so a list read in a shop reads in order.
  const groups = useMemo(() => {
    const order = [...SHOPPING_CATEGORIES] as string[]
    const m = new Map<string, ShoppingItem[]>()
    shown.forEach((i) => { const key = i.category || 'Other'; (m.get(key) ?? m.set(key, []).get(key)!).push(i) })
    return [...m.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]), bi = order.indexOf(b[0])
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    }).map(([name, list]) => [name, list.sort((a, b) => a.sort_order - b.sort_order)] as const)
  }, [shown])

  const estimate = useMemo(() => open.reduce((s, i) => s + (Number(i.est_price) || 0), 0), [open])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await addShoppingItem({ title: title.trim(), qty: qty.trim(), category, notes: '', est_price: null, done: false, assigned_to: assignee })
      setTitle(''); setQty('')
    } catch { /* toast */ } finally { setBusy(false) }
  }

  const clearDone = async () => {
    const ok = await confirm({
      title: `Clear ${done.length} ticked ${done.length === 1 ? 'item' : 'items'}?`,
      description: 'They come off the list for both of you. Anything still open stays put.',
      confirmLabel: 'Clear them',
    })
    if (!ok) return
    const n = await clearShoppingDone()
    if (n) toast({ title: `${n} ${n === 1 ? 'item' : 'items'} cleared`, tone: 'success' })
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        {/* Add */}
        <form onSubmit={add} className="card p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add to the list — e.g. Wood primer" aria-label="What to buy" className="flex-1" />
            <div className="flex min-w-0 gap-2">
              <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" aria-label="How many" className="w-16 shrink-0 sm:w-20" />
              {/* On a phone the category takes what's left; on a desktop it sits at its natural width. */}
              <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                {SHOPPING_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Menu trigger={<Button variant="secondary" size="icon" aria-label="Who buys it" className="shrink-0">{assignee ? <Avatar name={profileById(assignee)?.display_name ?? ''} color={profileById(assignee)?.color ?? '#999'} size="sm" /> : <Users className="size-5" />}</Button>}>
                <MenuLabel>Who buys it</MenuLabel>
                <MenuItem icon={<Users />} onSelect={() => setAssignee(null)}>Anyone{assignee === null ? ' ✓' : ''}</MenuItem>
                {profiles.map((p) => <MenuItem key={p.id} icon={<Avatar name={p.display_name} color={p.color} size="xs" />} onSelect={() => setAssignee(p.id)}>{p.display_name}{assignee === p.id ? ' ✓' : ''}</MenuItem>)}
              </Menu>
              <Button type="submit" leading={<Plus className="size-4" />} loading={busy} disabled={!title.trim()} className="shrink-0">Add</Button>
            </div>
          </div>
          {assignee && <p className="mt-2 text-xs text-ink-3">New items go to {profileById(assignee)?.display_name}. <button type="button" className="underline" onClick={() => setAssignee(null)}>Leave them open instead</button></p>}
        </form>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Everything <span className="tabular opacity-70">{open.length}</span></Chip>
          <Chip active={filter === 'mine'} onClick={() => setFilter('mine')}>Mine <span className="tabular opacity-70">{open.filter((i) => i.assigned_to === me?.id).length}</span></Chip>
          <Chip active={filter === 'open'} onClick={() => setFilter('open')}>Up for grabs <span className="tabular opacity-70">{open.filter((i) => !i.assigned_to).length}</span></Chip>
        </div>

        {/* The list */}
        <div className="mt-3 space-y-4">
          {shown.length === 0 && done.length === 0 ? (
            <div className="card"><EmptyState icon={<ShoppingBasket />} title="Nothing on the list" description="Add what the house needs. Tick something off and it disappears on the other phone too." /></div>
          ) : shown.length === 0 ? (
            <div className="card"><EmptyState compact icon={<Check />} title="All clear" description={filter === 'all' ? 'Everything is ticked off.' : 'Nothing here under this filter.'} /></div>
          ) : (
            groups.map(([name, list]) => (
              <Reveal key={name} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">{name}</p>
                  <span className="text-xs tabular text-ink-3">{list.length}</span>
                </div>
                <div className="divide-y divide-line">
                  <AnimatePresence initial={false}>
                    {list.map((i) => <Row key={i.id} item={i} onToggle={(v) => updateShoppingItem(i.id, { done: v })} onAssign={(id) => updateShoppingItem(i.id, { assigned_to: id })} onDelete={() => deleteShoppingItem(i.id)} onPrice={async () => {
                      const v = await prompt({ title: 'Roughly what does it cost?', description: 'Only for the running total — never a commitment.', type: 'number', initial: i.est_price ? String(i.est_price) : '', confirmLabel: 'Save' })
                      if (v !== null) updateShoppingItem(i.id, { est_price: v.trim() ? Number(v) : null })
                    }} />)}
                  </AnimatePresence>
                </div>
              </Reveal>
            ))
          )}

          {/* Ticked off */}
          {done.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">In the trolley</p>
                <Button variant="ghost" size="sm" leading={<Eraser className="size-4" />} onClick={clearDone}>Clear {done.length}</Button>
              </div>
              <div className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {done.map((i) => <Row key={i.id} item={i} onToggle={(v) => updateShoppingItem(i.id, { done: v })} onAssign={(id) => updateShoppingItem(i.id, { assigned_to: id })} onDelete={() => deleteShoppingItem(i.id)} />)}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Who's carrying what */}
      <aside className="card h-fit p-5 lg:sticky lg:top-6">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">On the list</p>
        <p className="mt-1 font-display-tight text-[32px] leading-none text-ink tabular">{open.length}</p>
        {estimate > 0 && <p className="mt-1 text-sm text-ink-2">About {money(estimate)} estimated</p>}
        <div className="mt-5 space-y-2">
          {profiles.map((p) => {
            const mine = open.filter((i) => i.assigned_to === p.id)
            return (
              <div key={p.id} className="flex items-center gap-2.5 text-sm">
                <Avatar name={p.display_name} color={p.color} size="xs" />
                <span className="flex-1 truncate text-ink-2">{p.display_name}</span>
                <span className="tabular text-ink">{mine.length}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-2.5 text-sm">
            <span className="grid size-6 place-items-center rounded-full bg-surface-3 text-ink-3"><Users className="size-3.5" /></span>
            <span className="flex-1 truncate text-ink-2">Anyone</span>
            <span className="tabular text-ink">{open.filter((i) => !i.assigned_to).length}</span>
          </div>
        </div>
        <p className="mt-5 text-[13px] leading-relaxed text-ink-3">Ticking an item off takes it off the list on every phone in the house, the moment you do it.</p>
      </aside>
    </div>
  )
}

function Row({ item, onToggle, onAssign, onDelete, onPrice }: {
  item: ShoppingItem
  onToggle: (v: boolean) => void
  onAssign: (id: string | null) => void
  onDelete: () => void
  onPrice?: () => void
}) {
  const { profiles, profileById } = useAuth()
  const who = profileById(item.assigned_to)
  const by = profileById(item.done_by)
  return (
    <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={cn('flex items-center gap-3 px-4 py-2.5', item.done && 'opacity-60')}>
      <Checkbox checked={item.done} onChange={onToggle} label={item.title} size="lg" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[15px] text-ink transition-colors', item.done && 'text-ink-3 line-through')}>
          {item.title}
          {item.qty && <span className="ml-2 text-[13px] text-ink-3">× {item.qty}</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-3">
          {item.est_price ? <span className="tabular">{money(item.est_price)}</span> : null}
          {item.done && by && <span>{by.display_name} got it</span>}
        </div>
      </div>
      {!item.done && !who && <Pill size="sm" tone="neutral">Anyone</Pill>}
      <Menu trigger={<button className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface-2" aria-label={who ? `For ${who.display_name}` : 'For anyone'}>{who ? <Avatar name={who.display_name} color={who.color} size="sm" /> : <UserRound className="size-4 text-ink-3" />}</button>}>
        <MenuLabel>Who buys it</MenuLabel>
        <MenuItem onSelect={() => onAssign(null)}>Anyone</MenuItem>
        {profiles.map((p) => <MenuItem key={p.id} icon={<Avatar name={p.display_name} color={p.color} size="xs" />} onSelect={() => onAssign(p.id)}>{p.display_name}</MenuItem>)}
        {onPrice && <><MenuSeparator /><MenuItem onSelect={onPrice}>Rough price</MenuItem></>}
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 />} onSelect={onDelete}>Remove</MenuItem>
      </Menu>
      <IconButton label="Remove" size="icon-sm" className="hidden sm:grid" onClick={onDelete}><Trash2 className="size-4" /></IconButton>
    </motion.div>
  )
}
