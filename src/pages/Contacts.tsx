import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, MessageCircle, MoreHorizontal, Pencil, Phone, Plus, Search, Star, Trash2, Users } from 'lucide-react'
import { Page } from '../components/layout/AppShell'
import { useActions, useEverything } from '../data/hooks'
import type { Contact, ContactRole } from '../data/types'
import { cn, money } from '../lib/utils'
import { ContactSheet } from '../components/contacts/ContactForm'
import { EmptyState, Pill, Skeleton } from '../components/ui/Bits'
import { Button, IconButton } from '../components/ui/Button'
import { Chip, Input } from '../components/ui/Field'
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu'
import { useConfirm } from '../components/ui/Sheet'

const ROLE_LABEL: Record<ContactRole, string> = { contractor: 'Contractor', supplier: 'Supplier', designer: 'Designer', other: 'Other' }
const ROLE_TONE: Record<ContactRole, 'primary' | 'sky' | 'plum' | 'neutral'> = { contractor: 'primary', supplier: 'sky', designer: 'plum', other: 'neutral' }

export default function ContactsPage() {
  const data = useEverything()
  const { deleteContact } = useActions()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [role, setRole] = useState<ContactRole | 'all'>('all')
  const [sheet, setSheet] = useState<{ open: boolean; contact?: Contact | null }>({ open: false })

  const enriched = useMemo(() => data.contacts.map((c) => {
    const quotes = data.quotes.filter((x) => x.contact_id === c.id)
    const spend = quotes.filter((x) => x.status === 'accepted' || x.status === 'paid').reduce((a, x) => a + x.amount, 0) + data.expenses.filter((e) => e.contact_id === c.id).reduce((a, e) => a + e.amount, 0)
    const projects = [...new Set([...quotes.map((x) => x.project_id), ...data.expenses.filter((e) => e.contact_id === c.id).map((e) => e.project_id)])].map((id) => data.projects.find((p) => p.id === id)).filter(Boolean)
    return { c, quotes: quotes.length, spend, projects }
  }), [data])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return enriched
      .filter((x) => role === 'all' || x.c.role === role)
      .filter((x) => !needle || `${x.c.name} ${x.c.company} ${x.c.notes}`.toLowerCase().includes(needle))
      .sort((a, b) => b.spend - a.spend || a.c.name.localeCompare(b.c.name))
  }, [enriched, q, role])

  return (
    <Page wide title="Contacts" actions={<Button leading={<Plus className="size-4" />} onClick={() => setSheet({ open: true, contact: null })}>New contact</Button>}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people & companies" className="pl-10" aria-label="Search contacts" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
          <Chip active={role === 'all'} onClick={() => setRole('all')}>All · {data.contacts.length}</Chip>
          {(Object.keys(ROLE_LABEL) as ContactRole[]).map((r) => <Chip key={r} active={role === r} onClick={() => setRole(r)}>{ROLE_LABEL[r]}s · {data.contacts.filter((c) => c.role === r).length}</Chip>)}
        </div>
      </div>

      {data.loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-3xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="card mt-6"><EmptyState icon={<Users />} title={q ? 'No one matches' : 'No contacts yet'} description={q ? 'Try another name.' : 'Save the people who quote, build and deliver — with your honest notes about them.'} action={!q && <Button leading={<Plus className="size-4" />} onClick={() => setSheet({ open: true, contact: null })}>Add a contact</Button>} /></div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(({ c, quotes, spend, projects }, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04, duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="card card-hover flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 font-display text-lg text-ink">{c.name.trim()[0]?.toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-medium text-ink">{c.name}</p>
                  <p className="truncate text-[13px] text-ink-2">{c.company || ROLE_LABEL[c.role]}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Pill tone={ROLE_TONE[c.role]} size="sm">{ROLE_LABEL[c.role]}</Pill>
                    {c.rating && <span className="inline-flex items-center gap-0.5 text-[12px] text-ochre-text">{Array.from({ length: c.rating }).map((_, k) => <Star key={k} className="size-3 fill-current" />)}</span>}
                  </div>
                </div>
                <Menu trigger={<IconButton label="Contact actions" size="icon-sm"><MoreHorizontal className="size-5" /></IconButton>}>
                  <MenuItem icon={<Pencil />} onSelect={() => setSheet({ open: true, contact: c })}>Edit</MenuItem>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 />} onSelect={async () => { if (await confirm({ title: `Remove ${c.name}?`, description: 'Quotes stay, but lose the link to this contact.', confirmLabel: 'Remove', danger: true })) deleteContact(c.id) }}>Remove</MenuItem>
                </Menu>
              </div>
              {c.notes && <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-ink-2">“{c.notes}”</p>}
              <div className="mt-3 flex flex-wrap gap-1.5 text-[12px] text-ink-3">
                {projects.slice(0, 3).map((p) => p && <Link key={p.id} to={`/projects/${p.id}`} className="rounded-full bg-surface-2 px-2 py-0.5 hover:text-ink">{p.title}</Link>)}
                {projects.length > 3 && <span className="px-1">+{projects.length - 3}</span>}
              </div>
              <div className="mt-auto flex items-center justify-between pt-4">
                <div className="text-[12px] text-ink-3">{quotes ? `${quotes} quote${quotes === 1 ? '' : 's'}` : 'No quotes yet'}{spend ? ` · ${money(spend)} spent` : ''}</div>
                <div className="flex gap-1">
                  {c.phone && <ActionIcon href={`tel:${c.phone.replace(/\s+/g, '')}`} label="Call"><Phone className="size-4" /></ActionIcon>}
                  {c.whatsapp && <ActionIcon href={`https://wa.me/${c.whatsapp}`} label="WhatsApp" tone="sage"><MessageCircle className="size-4" /></ActionIcon>}
                  {c.email && <ActionIcon href={`mailto:${c.email}`} label="Email"><Mail className="size-4" /></ActionIcon>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <ContactSheet open={sheet.open} contact={sheet.contact} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} />
    </Page>
  )
}

function ActionIcon({ href, label, children, tone }: { href: string; label: string; children: React.ReactNode; tone?: 'sage' }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" aria-label={label} title={label}
      className={cn('grid size-10 place-items-center rounded-xl transition-colors', tone === 'sage' ? 'bg-sage-soft text-sage-text hover:brightness-95' : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink')}>
      {children}
    </a>
  )
}
