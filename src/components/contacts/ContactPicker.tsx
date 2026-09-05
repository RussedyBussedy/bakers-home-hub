import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Plus, Search, Star, UserRound, X } from 'lucide-react'
import type { Contact, ContactRole } from '../../data/types'
import { cn } from '../../lib/utils'
import { Pill } from '../ui/Bits'
import { Sheet } from '../ui/Sheet'
import { ContactSheet } from './ContactForm'

const ROLE_LABEL: Record<ContactRole, string> = { contractor: 'Contractor', supplier: 'Supplier', designer: 'Designer', other: 'Other' }
const ROLE_TONE: Record<ContactRole, 'primary' | 'sky' | 'plum' | 'neutral'> = { contractor: 'primary', supplier: 'sky', designer: 'plum', other: 'neutral' }

export function matchContacts(contacts: Contact[], query: string): Contact[] {
  const q = query.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  const scored = contacts
    .map((c) => {
      const hay = `${c.name} ${c.company} ${c.phone} ${c.whatsapp} ${c.email} ${c.notes} ${ROLE_LABEL[c.role]}`.toLowerCase()
      if (!words.length) return { c, score: 1 }
      if (!words.every((w) => hay.includes(w))) return { c, score: 0 }
      const name = c.name.toLowerCase(), company = c.company.toLowerCase()
      let score = 1
      if (name.startsWith(q) || company.startsWith(q)) score += 3
      else if (name.includes(q) || company.includes(q)) score += 2
      return { c, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
  return scored.map((x) => x.c)
}

/**
 * A searchable contact field: looks like an input, opens a picker sheet with
 * search, and can create a new contact straight from the search text.
 */
export function ContactPicker({ id, value, onChange, contacts, placeholder = 'Search contacts', compact, className }: {
  id?: string
  value: string | null
  onChange: (id: string | null) => void
  contacts: Contact[]
  placeholder?: string
  /** Single-line label (company or name) for narrow fields. */
  compact?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = contacts.find((c) => c.id === value) ?? null
  const label = selected ? (compact ? selected.company || selected.name : `${selected.name}${selected.company ? ` · ${selected.company}` : ''}`) : ''

  return (
    <>
      <div className={cn('relative', className)}>
        <button
          id={id}
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-left text-base transition-[border-color,box-shadow] duration-200 hover:border-line-strong',
            'focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15',
            selected ? 'pr-10 text-ink' : 'text-ink-3',
          )}
          aria-haspopup="dialog"
        >
          {selected ? <UserRound className="size-4 shrink-0 text-ink-3" /> : <Search className="size-4 shrink-0 text-ink-3" />}
          <span className="min-w-0 flex-1 truncate">{selected ? label : placeholder}</span>
          {!selected && <ChevronDown className="size-4 shrink-0 text-ink-3" />}
        </button>
        {selected && (
          <button type="button" onClick={() => onChange(null)} aria-label="Clear" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
        )}
      </div>
      <ContactPickerSheet open={open} onOpenChange={setOpen} contacts={contacts} value={value} onPick={(cid) => { onChange(cid); setOpen(false) }} />
    </>
  )
}

export function ContactPickerSheet({ open, onOpenChange, contacts, value, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; contacts: Contact[]; value: string | null; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const [newOpen, setNewOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const list = useMemo(() => matchContacts(contacts, q), [contacts, q])

  useEffect(() => { if (open) { setQ(''); setCursor(0) } }, [open])
  useEffect(() => { setCursor(0) }, [q])
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const rows = list.length + 1 // + "new contact"
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(rows - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (cursor < list.length) onPick(list[cursor]!.id)
      else setNewOpen(true)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="Who was it?" size="sm" className="sm:max-h-[80dvh]">
        <div className="sticky top-0 z-10 -mx-1 bg-surface px-1 pb-2 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Name, company, number…"
              aria-label="Search contacts"
              className="min-h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3.5 text-base text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
            />
          </div>
        </div>
        <div ref={listRef} role="listbox" aria-label="Contacts" className="flex flex-col gap-0.5 pb-2">
          {value && !q && (
            <button type="button" onClick={() => onPick(null)} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm text-ink-2 hover:bg-surface-2"><X className="size-4" /> Not linked to anyone</button>
          )}
          {list.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === value}
              data-index={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onPick(c.id)}
              className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', i === cursor ? 'bg-surface-2' : 'hover:bg-surface-2/60', c.id === value && 'ring-1 ring-primary')}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 font-display text-base text-ink">{c.name.trim()[0]?.toUpperCase() ?? '?'}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="truncate text-[15px] text-ink">{c.name}</span>{c.rating ? <span className="inline-flex items-center gap-0.5 text-[11px] text-ochre-text"><Star className="size-3 fill-current" />{c.rating}</span> : null}</span>
                <span className="block truncate text-xs text-ink-3">{[c.company, c.phone].filter(Boolean).join(' · ') || ROLE_LABEL[c.role]}</span>
              </span>
              <Pill tone={ROLE_TONE[c.role]} size="sm">{ROLE_LABEL[c.role]}</Pill>
            </button>
          ))}
          {list.length === 0 && q && <p className="px-3 py-3 text-sm text-ink-3">No one called “{q}” yet.</p>}
          <button
            type="button"
            data-index={list.length}
            onMouseEnter={() => setCursor(list.length)}
            onClick={() => setNewOpen(true)}
            className={cn('mt-1 flex h-11 items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 text-sm font-medium text-primary-text', cursor === list.length ? 'bg-primary-soft' : 'hover:bg-surface-2')}
          >
            <Plus className="size-4" /> New contact{q.trim() ? ` “${q.trim()}”` : ''}
          </button>
        </div>
      </Sheet>
      <ContactSheet open={newOpen} onOpenChange={setNewOpen} initial={q.trim() ? { name: q.trim() } : undefined} onSaved={(c) => { setNewOpen(false); onPick(c.id) }} />
    </>
  )
}
