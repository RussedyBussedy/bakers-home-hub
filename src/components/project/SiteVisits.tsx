import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, Check, CircleSlash, HardHat, MoreHorizontal, Plus, Trash2, UserRoundX } from 'lucide-react'
import type { Contact, NewSiteVisit, Project, SiteVisit, VisitOutcome } from '../../data/types'
import { VISIT_OUTCOMES } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { cn, fmtDate, todayISO } from '../../lib/utils'
import { Avatar, EmptyState, Pill } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { DateInput, Field, Segmented, Textarea } from '../ui/Field'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'
import { Sheet } from '../ui/Sheet'
import { ContactPicker } from '../contacts/ContactPicker'

const outcomeOf = (v: VisitOutcome) => VISIT_OUTCOMES.find((o) => o.value === v)!

/** "No-show 5 Sep · Chris" — the one-line summary for headers and cards. */
export function lastVisitLine(visits: SiteVisit[], contacts: Contact[]): string | null {
  const today = todayISO()
  const past = visits.filter((v) => v.visit_date <= today && v.outcome !== 'scheduled')
  const last = [...past].sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.created_at.localeCompare(a.created_at))[0]
  if (!last) {
    const next = [...visits].filter((v) => v.outcome === 'scheduled' && v.visit_date >= today).sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0]
    if (!next) return null
    const who = contacts.find((c) => c.id === next.contact_id)
    return `Next: ${fmtDate(next.visit_date, next.visit_date === today ? "'today'" : 'EEE d MMM')}${who ? ` · ${who.name}` : ''}`
  }
  const who = contacts.find((c) => c.id === last.contact_id)
  return `Last: ${outcomeOf(last.outcome).label.toLowerCase()} ${fmtDate(last.visit_date, 'd MMM')}${who ? ` · ${who.name}` : ''}`
}

/** The contractor most likely on this job — from the accepted quote, then any quote, then the last visit. */
function likelyContact(visits: SiteVisit[], contacts: Contact[], quoteContactIds: string[]): string | null {
  const fromVisit = visits.find((v) => v.contact_id)?.contact_id
  const id = quoteContactIds[0] ?? fromVisit ?? null
  return id && contacts.some((c) => c.id === id) ? id : null
}

export function SiteVisitsCard({ project, visits, contacts, quoteContactIds, className }: { project: Project; visits: SiteVisit[]; contacts: Contact[]; quoteContactIds: string[]; className?: string }) {
  const { logVisit, updateVisit, deleteVisit } = useActions()
  const { profileById } = useAuth()
  const [sheet, setSheet] = useState<{ open: boolean; visit?: SiteVisit | null; preset?: VisitOutcome }>({ open: false })
  const today = todayISO()
  const defaultContact = likelyContact(visits, contacts, quoteContactIds)

  const sorted = useMemo(() => [...visits].sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.created_at.localeCompare(a.created_at)), [visits])
  const todays = sorted.find((v) => v.visit_date === today)

  // Quick actions for today: update today's scheduled visit if there is one, otherwise log a new one.
  const quick = async (outcome: VisitOutcome) => {
    if (todays && todays.outcome === 'scheduled') {
      if (outcome === 'no_show') { await logNoShow(todays); return }
      await updateVisit(todays.id, { outcome }); return
    }
    await logVisit({ project_id: project.id, contact_id: defaultContact, visit_date: today, outcome, notes: '' })
  }

  // A scheduled visit that became a no-show: replace it rather than log a second row, so the no-show nudge still goes out.
  const logNoShow = async (v: SiteVisit) => {
    await deleteVisit(v.id)
    await logVisit({ project_id: v.project_id, contact_id: v.contact_id, visit_date: v.visit_date, outcome: 'no_show', notes: v.notes })
  }

  return (
    <div className={cn('card p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl">Site days</h2>
          <p className="text-[13px] text-ink-3">{visits.length ? `${visits.length} logged` : 'Who came, who didn’t'}</p>
        </div>
        <Button size="sm" variant="secondary" leading={<Plus className="size-4" />} onClick={() => setSheet({ open: true, visit: null })}>Log visit</Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <QuickButton tone="sage" icon={<Check className="size-4" />} label="Arrived today" onClick={() => quick('arrived')} />
        <QuickButton tone="danger" icon={<UserRoundX className="size-4" />} label="No-show today" onClick={() => quick('no_show')} />
        <QuickButton tone="ochre" icon={<HardHat className="size-4" />} label="Partial today" onClick={() => quick('partial')} />
      </div>

      {sorted.length === 0 ? (
        <EmptyState compact icon={<CalendarClock />} title="No site days yet" description="Log when the contractor is due, then whether they turned up. A no-show tells the other one of you automatically." />
      ) : (
        <ul className="mt-4 flex flex-col">
          <AnimatePresence initial={false}>
            {sorted.map((v) => {
              const o = outcomeOf(v.outcome)
              const who = contacts.find((c) => c.id === v.contact_id)
              const by = profileById(v.logged_by)
              const upcoming = v.outcome === 'scheduled' && v.visit_date >= today
              return (
                <motion.li key={v.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
                  <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl', v.outcome === 'arrived' ? 'bg-sage-soft text-sage-text' : v.outcome === 'no_show' ? 'bg-danger-soft text-danger' : v.outcome === 'partial' ? 'bg-ochre-soft text-ochre-text' : v.outcome === 'cancelled' ? 'bg-surface-3 text-ink-3' : 'bg-sky-soft text-sky-text')}>
                    {v.outcome === 'arrived' ? <Check className="size-4" /> : v.outcome === 'no_show' ? <UserRoundX className="size-4" /> : v.outcome === 'cancelled' ? <CircleSlash className="size-4" /> : v.outcome === 'partial' ? <HardHat className="size-4" /> : <CalendarClock className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] text-ink">{fmtDate(v.visit_date, v.visit_date === today ? "'Today'" : 'EEE d MMM')}</span>
                      <Pill tone={o.tone} size="sm">{o.label}</Pill>
                      {upcoming && v.visit_date !== today && <span className="text-xs text-ink-3">upcoming</span>}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">{who ? `${who.name}${who.company ? ` · ${who.company}` : ''}` : 'Contractor not set'}{v.notes ? ` — ${v.notes}` : ''}</p>
                    {by && <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3"><Avatar name={by.display_name} color={by.color} size="xs" /> logged by {by.display_name}</p>}
                  </div>
                  <Menu trigger={<IconButton label="Visit actions" size="icon-sm"><MoreHorizontal className="size-5" /></IconButton>}>
                    {v.outcome === 'scheduled' && (
                      <>
                        <MenuItem icon={<Check />} onSelect={() => updateVisit(v.id, { outcome: 'arrived' })}>They arrived</MenuItem>
                        <MenuItem icon={<HardHat />} onSelect={() => updateVisit(v.id, { outcome: 'partial' })}>Partial</MenuItem>
                        <MenuItem icon={<UserRoundX />} onSelect={() => logNoShow(v)}>No-show</MenuItem>
                        <MenuItem icon={<CircleSlash />} onSelect={() => updateVisit(v.id, { outcome: 'cancelled' })}>Cancelled</MenuItem>
                        <MenuSeparator />
                      </>
                    )}
                    <MenuItem onSelect={() => setSheet({ open: true, visit: v })}>Edit</MenuItem>
                    <MenuItem danger icon={<Trash2 />} onSelect={() => deleteVisit(v.id)}>Remove</MenuItem>
                  </Menu>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}

      <VisitSheet open={sheet.open} visit={sheet.visit ?? null} preset={sheet.preset} project={project} contacts={contacts} defaultContact={defaultContact} onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))} />
    </div>
  )
}

function QuickButton({ tone, icon, label, onClick }: { tone: 'sage' | 'danger' | 'ochre'; icon: ReactNode; label: string; onClick: () => void }) {
  const cls = { sage: 'border-sage/40 text-sage-text hover:bg-sage-soft', danger: 'border-danger/40 text-danger hover:bg-danger-soft', ochre: 'border-ochre/50 text-ochre-text hover:bg-ochre-soft' }[tone]
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border bg-surface px-3.5 text-[13px] font-medium transition-colors', cls)}>
      {icon} {label}
    </button>
  )
}

function VisitSheet({ open, onOpenChange, visit, preset, project, contacts, defaultContact }: { open: boolean; onOpenChange: (o: boolean) => void; visit: SiteVisit | null; preset?: VisitOutcome; project: Project; contacts: Contact[]; defaultContact: string | null }) {
  const { logVisit, updateVisit } = useActions()
  const [v, setV] = useState<NewSiteVisit>(() => blank(project.id, defaultContact))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setV(visit ? { project_id: visit.project_id, contact_id: visit.contact_id, visit_date: visit.visit_date, outcome: visit.outcome, notes: visit.notes } : { ...blank(project.id, defaultContact), outcome: preset ?? 'scheduled' })
  }, [open, visit, preset, project.id, defaultContact])

  const set = <K extends keyof NewSiteVisit>(k: K, val: NewSiteVisit[K]) => setV((s) => ({ ...s, [k]: val }))

  const save = async () => {
    setBusy(true)
    try {
      if (visit) await updateVisit(visit.id, v)
      else await logVisit(v)
      onOpenChange(false)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} size="sm" title={visit ? 'Edit site day' : 'Log a site day'} description={project.title}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>{visit ? 'Save' : 'Log it'}</Button></>}>
      <div className="flex flex-col gap-4 pt-2">
        <Field label="What happened">
          {() => (
            <Segmented<VisitOutcome> value={v.outcome} onChange={(o) => set('outcome', o)} size="sm" className="w-full flex-wrap [&>button]:flex-1" options={VISIT_OUTCOMES.map((o) => ({ value: o.value, label: o.label }))} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">{(id) => <DateInput id={id} value={v.visit_date} onChange={(e) => set('visit_date', e.target.value || todayISO())} />}</Field>
          <Field label="Who">{(id) => <ContactPicker id={id} value={v.contact_id} onChange={(cid) => set('contact_id', cid)} contacts={contacts} placeholder="Contractor" compact />}</Field>
        </div>
        <Field label="Notes" hint="Short — “two guys, started the fascia” is plenty.">
          {(id) => <Textarea id={id} value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Two guys, started the fascia" />}
        </Field>
        {v.outcome === 'no_show' && !visit && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">Logging a no-show sends the other one of you an FYI nudge.</p>}
      </div>
    </Sheet>
  )
}

function blank(project_id: string, contact_id: string | null): NewSiteVisit {
  return { project_id, contact_id, visit_date: todayISO(), outcome: 'scheduled', notes: '' }
}
