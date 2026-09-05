import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Ban, BellRing, CircleDollarSign, FileText, HandCoins, MoreHorizontal, Paperclip, Plus, Receipt, Trash2, Wallet } from 'lucide-react'
import { useNudge } from '../nudges/NudgeSheet'
import { ContactPicker } from '../contacts/ContactPicker'
import type { Contact, Expense, NewExpense, NewQuote, Project, Quote, QuoteStatus } from '../../data/types'
import { EXPENSE_CATEGORIES, QUOTE_PAYMENT_CATEGORY } from '../../data/types'
import { useActions, useMediaUrl } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { projectCosts, quoteProgress } from '../../lib/xp'
import { cn, fmtDate, money, todayISO } from '../../lib/utils'
import { Avatar, BudgetBar, EmptyState, Money, Pill } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { DateInput, Field, Input, Select, Textarea } from '../ui/Field'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'
import { Sheet, useConfirm } from '../ui/Sheet'
import { ContactSheet } from '../contacts/ContactForm'

const quoteTone: Record<QuoteStatus, 'sky' | 'sage' | 'neutral' | 'gold'> = { received: 'sky', accepted: 'sage', paid: 'gold', rejected: 'neutral' }
const quoteLabel: Record<QuoteStatus, string> = { received: 'Received', accepted: 'Accepted', paid: 'Paid', rejected: 'Declined' }

export function MoneyPanel({ project, quotes, expenses, contacts }: { project: Project; quotes: Quote[]; expenses: Expense[]; contacts: Contact[] }) {
  const costs = projectCosts(project, quotes, expenses)
  const [quoteOpen, setQuoteOpen] = useState<{ open: boolean; quote?: Quote | null }>({ open: false })
  const [expenseOpen, setExpenseOpen] = useState<{ open: boolean; expense?: Expense | null }>({ open: false })
  const [payOpen, setPayOpen] = useState<{ open: boolean; quote?: Quote | null }>({ open: false })
  const { updateQuote, deleteQuote, deleteExpense } = useActions()
  const confirm = useConfirm()
  const { profileById, partner } = useAuth()
  const nudge = useNudge()

  const sorted = useMemo(() => {
    const order: Record<QuoteStatus, number> = { accepted: 0, paid: 0, received: 1, rejected: 2 }
    return [...quotes].sort((a, b) => order[a.status] - order[b.status] || a.amount - b.amount)
  }, [quotes])

  const setStatus = (q: Quote, status: QuoteStatus) => updateQuote(q.id, { status })
  const quoteById = (id: string | null) => quotes.find((q) => q.id === id)

  /** "Mark as paid" records the balance as a payment so the money shows in expenses; a settled quote just flips. */
  const markPaid = (q: Quote) => {
    const { owed } = quoteProgress(q, expenses)
    if (owed > 0) setPayOpen({ open: true, quote: q })
    else void setStatus(q, 'paid')
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        {/* Summary */}
        <div className="card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Real cost so far</p>
              <p className={cn('font-display-tight text-[34px] leading-none', costs.real > costs.budget && costs.budget > 0 ? 'text-danger' : 'text-ink')}><Money value={costs.real} /></p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Budget</p>
              <p className="font-display-tight text-2xl text-ink"><Money value={costs.budget} /></p>
            </div>
          </div>
          <BudgetBar budget={costs.budget} real={costs.real} className="mt-4" height={12} />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
            <span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-sage align-middle" />Committed quotes {money(costs.committed)}</span>
            <span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-line-strong align-middle" />Other expenses {money(costs.real - costs.committed)}</span>
            <span className={cn('font-medium', costs.variance < 0 ? 'text-danger' : 'text-sage-text')}>{costs.variance < 0 ? `${money(-costs.variance)} over` : `${money(costs.variance)} left`}</span>
          </div>
          {costs.committed > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-surface-2 p-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Paid out</p>
                <p className="mt-0.5 font-display-tight text-xl text-ink tabular">{money(costs.spent)}</p>
                <p className="text-[12px] text-ink-3">cash actually spent</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Still owed</p>
                <p className={cn('mt-0.5 font-display-tight text-xl tabular', costs.owed > 0 ? 'text-ochre-text' : 'text-sage-text')}>{money(costs.owed)}</p>
                <p className="text-[12px] text-ink-3">{costs.owed > 0 ? 'on accepted quotes' : 'all quotes settled'}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Deposits paid</p>
                <p className="mt-0.5 font-display-tight text-xl text-ink tabular">{money(costs.quotePaid)}</p>
                <p className="text-[12px] text-ink-3">{costs.committed ? `${Math.round((costs.quotePaid / costs.committed) * 100)}% of committed` : ''}</p>
              </div>
            </div>
          )}
          {costs.savedByChoosing > 0 && (
            <p className="mt-3 rounded-xl bg-gold-soft px-3 py-2 text-[13px] text-ochre-text">You saved <b>{money(costs.savedByChoosing)}</b> against the highest quote by choosing the one you accepted. Penny pinchers.</p>
          )}
        </div>

        {/* Quotes */}
        <section className="min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xl">Quotes <span className="text-ink-3">· {quotes.length}</span></h3>
            <Button size="sm" variant="secondary" leading={<Plus className="size-4" />} onClick={() => setQuoteOpen({ open: true, quote: null })}>File a quote</Button>
          </div>
          <div className="card mt-3 divide-y divide-line">
            {sorted.length === 0 ? (
              <EmptyState compact icon={<FileText />} title="No quotes filed" description="Get two or three — it's the cheapest way to save money. Each one earns 20 XP." />
            ) : (
              <AnimatePresence initial={false}>
                {sorted.map((q) => {
                  const c = contacts.find((x) => x.id === q.contact_id)
                  const by = profileById(q.created_by)
                  const lowest = costs.lowestQuote === q.amount && quotes.length > 1
                  const live = q.status === 'accepted' || q.status === 'paid'
                  const prog = quoteProgress(q, expenses)
                  return (
                    <motion.div key={q.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-3 p-4">
                      <span className={cn('mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl', live ? 'bg-sage-soft text-sage-text' : q.status === 'rejected' ? 'bg-surface-3 text-ink-3' : 'bg-sky-soft text-sky-text')}>
                        {live ? <BadgeCheck className="size-5" /> : q.status === 'rejected' ? <Ban className="size-5" /> : <FileText className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className={cn('font-medium text-ink', q.status === 'rejected' && 'text-ink-3 line-through')}>{q.title || 'Quote'}</p>
                          <Pill tone={quoteTone[q.status]} size="sm">{quoteLabel[q.status]}</Pill>
                          {lowest && q.status !== 'rejected' && <Pill tone="gold" size="sm">Lowest</Pill>}
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-ink-2">{c ? `${c.name}${c.company ? ` · ${c.company}` : ''}` : 'No contact'}{q.quote_date ? ` · ${fmtDate(q.quote_date)}` : ''}{q.valid_until && q.status === 'received' ? ` · valid until ${fmtDate(q.valid_until)}` : ''}</p>
                        {q.notes && <p className="mt-1 text-[13px] text-ink-3">{q.notes}</p>}
                        {(live || prog.payments.length > 0) && (
                          <div className="mt-2.5">
                            <div className="flex items-center justify-between gap-2 text-[12px]">
                              <span className={cn('font-medium', prog.settled ? 'text-sage-text' : 'text-ink-2')}>
                                {prog.settled ? 'Paid in full' : prog.paid > 0 ? `${money(prog.paid)} paid · ${money(prog.owed)} to go` : `Nothing paid yet · ${money(prog.owed)} to go`}
                              </span>
                              <span className="tabular text-ink-3">{Math.round(prog.pct * 100)}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
                              <motion.div className={cn('h-full rounded-full', prog.settled ? 'bg-sage' : 'bg-ochre')} initial={{ width: 0 }} animate={{ width: `${prog.pct * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
                            </div>
                            {prog.payments.length > 0 && (
                              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                {prog.payments.map((p) => (
                                  <li key={p.id}>
                                    <button onClick={() => setExpenseOpen({ open: true, expense: p })} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11px] text-ink-2 hover:bg-surface-3 hover:text-ink" title={p.title}>
                                      <HandCoins className="size-3" /> {fmtDate(p.date, 'd MMM')} · {money(p.amount)}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {!prog.settled && (
                              <button onClick={() => setPayOpen({ open: true, quote: q })} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-ink-2 hover:border-line-strong hover:text-ink">
                                <HandCoins className="size-3.5" /> {prog.paid > 0 ? 'Record another payment' : 'Record a deposit'}
                              </button>
                            )}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {q.file_path && <QuoteFileLink path={q.file_path} />}
                          {by && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Avatar name={by.display_name} color={by.color} size="xs" /> filed by {by.display_name}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className={cn('font-display-tight text-xl tabular', q.status === 'rejected' ? 'text-ink-3' : 'text-ink')}>{money(q.amount)}</p>
                        <p className="text-[11px] text-ink-3">{q.vat_included ? 'incl. VAT' : 'excl. VAT'}</p>
                        <Menu trigger={<IconButton label="Quote actions" size="icon-sm"><MoreHorizontal className="size-5" /></IconButton>}>
                          {q.status !== 'accepted' && q.status !== 'paid' && <MenuItem icon={<BadgeCheck />} onSelect={() => setStatus(q, 'accepted')}>Accept this quote</MenuItem>}
                          {q.status !== 'rejected' && !prog.settled && <MenuItem icon={<HandCoins />} onSelect={() => setPayOpen({ open: true, quote: q })}>{prog.paid > 0 ? 'Record a payment' : 'Record a deposit'}</MenuItem>}
                          {q.status === 'accepted' && <MenuItem icon={<CircleDollarSign />} onSelect={() => markPaid(q)}>Mark as paid</MenuItem>}
                          {q.status !== 'rejected' && <MenuItem icon={<Ban />} onSelect={() => setStatus(q, 'rejected')}>Decline</MenuItem>}
                          {q.status !== 'received' && <MenuItem icon={<FileText />} onSelect={() => setStatus(q, 'received')}>Back to received</MenuItem>}
                          <MenuSeparator />
                          <MenuItem icon={<BellRing />} onSelect={() => nudge({ project, quote: q, link: `/projects/${project.id}?tab=money` })}>Ask {partner?.display_name ?? 'partner'} about this</MenuItem>
                          <MenuItem onSelect={() => setQuoteOpen({ open: true, quote: q })}>Edit</MenuItem>
                          <MenuItem danger icon={<Trash2 />} onSelect={async () => { if (await confirm({ title: 'Delete this quote?', description: prog.payments.length ? 'Payments already recorded stay in your expenses.' : 'This can’t be undone.', confirmLabel: 'Delete', danger: true })) deleteQuote(q) }}>Delete</MenuItem>
                        </Menu>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </div>
        </section>
      </div>

      {/* Expenses */}
      <section className="min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xl">Expenses <span className="text-ink-3">· {money(expenses.reduce((a, e) => a + e.amount, 0))}</span></h3>
          <Button size="sm" variant="secondary" leading={<Plus className="size-4" />} onClick={() => setExpenseOpen({ open: true, expense: null })}>Log</Button>
        </div>
        <div className="card mt-3 divide-y divide-line">
          {expenses.length === 0 ? (
            <EmptyState compact icon={<Receipt />} title="No expenses yet" description="Paint, hinges, plants, the bakkie hire — and deposits paid on quotes land here too." />
          ) : (
            <AnimatePresence initial={false}>
              {[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((e) => {
                const c = contacts.find((x) => x.id === e.contact_id)
                const q = quoteById(e.quote_id)
                return (
                  <motion.div key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', q ? 'bg-gold-soft text-ochre-text' : 'bg-surface-2 text-ink-2')}>{q ? <HandCoins className="size-4" /> : <Wallet className="size-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] text-ink">{e.title}</p>
                      <p className="truncate text-xs text-ink-3">{fmtDate(e.date)} · {e.category}{c ? ` · ${c.company || c.name}` : ''}{q ? ` · toward “${q.title || 'quote'}”` : ''}</p>
                    </div>
                    {e.receipt_path && <QuoteFileLink path={e.receipt_path} label="Receipt" />}
                    <p className="font-medium tabular text-ink">{money(e.amount)}</p>
                    <Menu trigger={<IconButton label="Expense actions" size="icon-sm"><MoreHorizontal className="size-5" /></IconButton>}>
                      <MenuItem onSelect={() => setExpenseOpen({ open: true, expense: e })}>Edit</MenuItem>
                      <MenuItem danger icon={<Trash2 />} onSelect={async () => { if (await confirm({ title: 'Delete this expense?', description: q ? `It counts toward “${q.title || 'the quote'}” — the quote will show as less paid.` : undefined, confirmLabel: 'Delete', danger: true })) deleteExpense(e) }}>Delete</MenuItem>
                    </Menu>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </section>

      <QuoteSheet open={quoteOpen.open} quote={quoteOpen.quote ?? null} project={project} contacts={contacts} onOpenChange={(o) => setQuoteOpen((s) => ({ ...s, open: o }))} />
      <ExpenseSheet open={expenseOpen.open} expense={expenseOpen.expense ?? null} project={project} contacts={contacts} quotes={quotes} onOpenChange={(o) => setExpenseOpen((s) => ({ ...s, open: o }))} />
      <PaymentSheet open={payOpen.open} quote={payOpen.quote ?? null} project={project} contacts={contacts} expenses={expenses} onOpenChange={(o) => setPayOpen((s) => ({ ...s, open: o }))} />
    </div>
  )
}

function QuoteFileLink({ path, label = 'View quote' }: { path: string; label?: string }) {
  const url = useMediaUrl(path)
  return (
    <a href={url ?? '#'} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-xs font-medium text-ink-2 hover:text-ink">
      <Paperclip className="size-3.5" /> {label}
    </a>
  )
}

function AttachField({ id, file, existing, onFile, label }: { id: string; file: File | null; existing: string | null; onFile: (f: File | null) => void; label: string }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3.5 text-sm text-ink-2 hover:text-ink">
      <Paperclip className="size-4" /> {file ? file.name : existing ? 'Attached — tap to replace' : label}
      <input id={id} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Quote form
// ---------------------------------------------------------------------------
function QuoteSheet({ open, onOpenChange, quote, project, contacts }: { open: boolean; onOpenChange: (o: boolean) => void; quote: Quote | null; project: Project; contacts: Contact[] }) {
  const { createQuote, updateQuote } = useActions()
  const [v, setV] = useState<NewQuote>(() => blankQuote(project.id))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [contactOpen, setContactOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setErr(null); setFile(null)
    setV(quote ? { project_id: quote.project_id, contact_id: quote.contact_id, title: quote.title, amount: quote.amount, vat_included: quote.vat_included, status: quote.status, quote_date: quote.quote_date, valid_until: quote.valid_until, file_path: quote.file_path, notes: quote.notes } : blankQuote(project.id))
  }, [open, quote, project.id])

  const set = <K extends keyof NewQuote>(k: K, val: NewQuote[K]) => setV((s) => ({ ...s, [k]: val }))

  const save = async () => {
    if (!v.amount || v.amount <= 0) { setErr('Enter the quoted amount.'); return }
    setBusy(true)
    try {
      if (quote) await updateQuote(quote.id, { ...v, file })
      else await createQuote({ ...v, file })
      onOpenChange(false)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title={quote ? 'Edit quote' : 'File a quote'} description={project.title}
        footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>{quote ? 'Save' : 'File quote'}</Button></>}>
        <div className="flex flex-col gap-4 pt-2">
          <Field label="What's it for?">{(id) => <Input id={id} value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Doors, paint & handles" autoFocus />}</Field>
          <Field label="Supplier or contractor" trailing={<button type="button" className="text-[13px] font-medium text-primary-text" onClick={() => setContactOpen(true)}>+ New contact</button>}>
            {(id) => <ContactPicker id={id} value={v.contact_id} onChange={(cid) => set('contact_id', cid)} contacts={contacts} placeholder="Search suppliers & contractors" />}
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Amount" required error={err ?? undefined}>{(id) => <Input id={id} prefix="R" inputMode="decimal" value={v.amount || ''} onChange={(e) => set('amount', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} placeholder="0" invalid={Boolean(err)} />}</Field>
            <Field label="VAT">
              {(id) => (
                <Select id={id} value={v.vat_included ? 'incl' : 'excl'} onChange={(e) => set('vat_included', e.target.value === 'incl')} className="w-32">
                  <option value="incl">Included</option>
                  <option value="excl">Excluded</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quote date">{(id) => <DateInput id={id} value={v.quote_date ?? ''} onChange={(e) => set('quote_date', e.target.value || null)} />}</Field>
            <Field label="Valid until">{(id) => <DateInput id={id} value={v.valid_until ?? ''} onChange={(e) => set('valid_until', e.target.value || null)} />}</Field>
          </div>
          <Field label="Status" hint={v.status === 'paid' ? 'Tip: record deposits from the quote’s menu and it turns to Paid by itself.' : undefined}>
            {(id) => (
              <Select id={id} value={v.status} onChange={(e) => set('status', e.target.value as QuoteStatus)}>
                <option value="received">Received</option>
                <option value="accepted">Accepted — this is the one</option>
                <option value="paid">Paid</option>
                <option value="rejected">Declined</option>
              </Select>
            )}
          </Field>
          <Field label="The quote itself" hint="A photo or PDF of the quotation.">
            {(id) => <AttachField id={id} file={file} existing={v.file_path} onFile={setFile} label="Attach photo or PDF" />}
          </Field>
          <Field label="Notes">{(id) => <Textarea id={id} value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Lead time, what's excluded, gut feel…" rows={2} />}</Field>
        </div>
      </Sheet>
      <ContactSheet open={contactOpen} onOpenChange={setContactOpen} onSaved={(c) => set('contact_id', c.id)} />
    </>
  )
}

function blankQuote(project_id: string): NewQuote {
  return { project_id, contact_id: null, title: '', amount: 0, vat_included: true, status: 'received', quote_date: todayISO(), valid_until: null, file_path: null, notes: '' }
}

// ---------------------------------------------------------------------------
// Expense form
// ---------------------------------------------------------------------------
function ExpenseSheet({ open, onOpenChange, expense, project, contacts, quotes }: { open: boolean; onOpenChange: (o: boolean) => void; expense: Expense | null; project: Project; contacts: Contact[]; quotes: Quote[] }) {
  const { createExpense, updateExpense } = useActions()
  const [v, setV] = useState<NewExpense>(() => blankExpense(project.id))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const linkable = quotes.filter((q) => q.status !== 'rejected' || q.id === v.quote_id)

  useEffect(() => {
    if (!open) return
    setErr(null); setFile(null)
    setV(expense ? { project_id: expense.project_id, title: expense.title, amount: expense.amount, date: expense.date, category: expense.category, contact_id: expense.contact_id, quote_id: expense.quote_id, receipt_path: expense.receipt_path } : blankExpense(project.id))
  }, [open, expense, project.id])

  const set = <K extends keyof NewExpense>(k: K, val: NewExpense[K]) => setV((s) => ({ ...s, [k]: val }))

  const linkQuote = (id: string | null) => {
    const q = quotes.find((x) => x.id === id)
    setV((s) => ({
      ...s,
      quote_id: id,
      category: id ? QUOTE_PAYMENT_CATEGORY : s.category === QUOTE_PAYMENT_CATEGORY ? 'Materials' : s.category,
      contact_id: q?.contact_id ?? s.contact_id,
    }))
  }

  const save = async () => {
    if (!v.title.trim()) { setErr('What did you buy?'); return }
    if (!v.amount || v.amount <= 0) { setErr('Enter the amount.'); return }
    setBusy(true)
    try {
      if (expense) await updateExpense(expense.id, v)
      else await createExpense({ ...v, file })
      onOpenChange(false)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={expense ? 'Edit expense' : 'Log an expense'} description={project.title}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>{expense ? 'Save' : 'Log it'}</Button></>}>
      <div className="flex flex-col gap-4 pt-2">
        <Field label="What" required error={err ?? undefined}>{(id) => <Input id={id} value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Soft-close hinges ×24" autoFocus />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required>{(id) => <Input id={id} prefix="R" inputMode="decimal" value={v.amount || ''} onChange={(e) => set('amount', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} placeholder="0" />}</Field>
          <Field label="Date">{(id) => <DateInput id={id} value={v.date} onChange={(e) => set('date', e.target.value || todayISO())} />}</Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            {(id) => <Select id={id} value={v.category} onChange={(e) => set('category', e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}
          </Field>
          <Field label="Bought from">
            {(id) => <ContactPicker id={id} value={v.contact_id} onChange={(cid) => set('contact_id', cid)} contacts={contacts} placeholder="Search…" compact />}
          </Field>
        </div>
        {linkable.length > 0 && (
          <Field label="Counts toward a quote" hint={v.quote_id ? 'Shows as a deposit on that quote instead of extra cost.' : 'Deposits and part-payments to a contractor go here.'}>
            {(id) => (
              <Select id={id} value={v.quote_id ?? ''} onChange={(e) => linkQuote(e.target.value || null)}>
                <option value="">— No, it’s a separate cost —</option>
                {linkable.map((q) => <option key={q.id} value={q.id}>{q.title || 'Quote'} · {money(q.amount)}</option>)}
              </Select>
            )}
          </Field>
        )}
        {!expense && (
          <Field label="Receipt" hint="Optional — a photo of the slip.">
            {(id) => <AttachField id={id} file={file} existing={null} onFile={setFile} label="Attach receipt" />}
          </Field>
        )}
      </div>
    </Sheet>
  )
}

function blankExpense(project_id: string): NewExpense {
  return { project_id, title: '', amount: 0, date: todayISO(), category: 'Materials', contact_id: null, quote_id: null, receipt_path: null }
}

// ---------------------------------------------------------------------------
// Payment toward a quote — a deposit, a progress payment, or the balance.
// ---------------------------------------------------------------------------
const PAYMENT_LABELS = ['Deposit', 'Progress payment', 'Final payment', 'Materials advance']

function PaymentSheet({ open, onOpenChange, quote, project, contacts, expenses }: { open: boolean; onOpenChange: (o: boolean) => void; quote: Quote | null; project: Project; contacts: Contact[]; expenses: Expense[] }) {
  const { createExpense } = useActions()
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayISO())
  const [labelChoice, setLabelChoice] = useState<string | null>(null) // null = pick a sensible one automatically
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const prog = quote ? quoteProgress(quote, expenses) : null
  const contact = contacts.find((c) => c.id === quote?.contact_id)
  const total = Number(quote?.amount) || 0
  const pctOf = (p: number) => Math.round((total * p) / 100)
  const quick = [10, 25, 30, 50].map((p) => ({ p, value: pctOf(p) })).filter((x) => x.value > 0 && prog && x.value <= prog.owed + 0.5)

  // Seed the form when the sheet opens; later expense changes shouldn't yank the amount around.
  const expensesRef = useRef(expenses)
  expensesRef.current = expenses
  useEffect(() => {
    if (!open || !quote) return
    const p = quoteProgress(quote, expensesRef.current)
    const half = Math.round(((Number(quote.amount) || 0) * 50) / 100)
    setErr(null); setFile(null); setDate(todayISO()); setLabelChoice(null)
    setAmount(p.paid > 0 ? p.owed : Math.min(p.owed, half))
  }, [open, quote])

  if (!quote || !prog) return null
  const afterThis = prog.paid + amount
  const settles = total > 0 && afterThis >= total - 0.005
  const label = labelChoice ?? (settles ? 'Final payment' : prog.paid > 0 ? 'Progress payment' : 'Deposit')
  const pctLabel = total > 0 && amount > 0 ? `${Math.round((amount / total) * 100)}% of the quote` : ''

  const save = async () => {
    if (!amount || amount <= 0) { setErr('How much was paid?'); return }
    setBusy(true)
    try {
      await createExpense({
        project_id: project.id,
        title: `${label} — ${quote.title || 'quote'}${pctLabel ? ` (${Math.round((amount / total) * 100)}%)` : ''}`,
        amount,
        date,
        category: QUOTE_PAYMENT_CATEGORY,
        contact_id: quote.contact_id,
        quote_id: quote.id,
        receipt_path: null,
        file,
      })
      onOpenChange(false)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} size="sm" title={prog.paid > 0 ? 'Record a payment' : 'Record a deposit'} description={`${quote.title || 'Quote'}${contact ? ` · ${contact.company || contact.name}` : ''} · ${money(total)}`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy} leading={<HandCoins className="size-4" />}>{settles ? 'Record & mark paid' : 'Record payment'}</Button></>}>
      <div className="flex flex-col gap-4 pt-2">
        <div className="rounded-2xl bg-surface-2 p-3 text-[13px] text-ink-2">
          {prog.paid > 0 ? <>{money(prog.paid)} paid so far · <b className="text-ink">{money(prog.owed)}</b> still to go</> : <>Nothing paid yet · <b className="text-ink">{money(total)}</b> to go</>}
        </div>
        <Field label="Amount paid" required error={err ?? undefined} hint={pctLabel || undefined}>
          {(id) => <Input id={id} prefix="R" inputMode="decimal" autoFocus value={amount || ''} onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} placeholder="0" invalid={Boolean(err)} />}
        </Field>
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {quick.map((x) => (
            <button key={x.p} type="button" onClick={() => setAmount(x.value)} className={cn('h-8 rounded-full border px-3 text-[13px] font-medium transition-colors', amount === x.value ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink')}>{x.p}% · {money(x.value)}</button>
          ))}
          {prog.owed > 0 && <button type="button" onClick={() => setAmount(prog.owed)} className={cn('h-8 rounded-full border px-3 text-[13px] font-medium transition-colors', amount === prog.owed ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink')}>Balance · {money(prog.owed)}</button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid on">{(id) => <DateInput id={id} value={date} onChange={(e) => setDate(e.target.value || todayISO())} />}</Field>
          <Field label="What kind">
            {(id) => <Select id={id} value={label} onChange={(e) => setLabelChoice(e.target.value)}>{PAYMENT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}</Select>}
          </Field>
        </div>
        <Field label="Proof of payment" hint="Optional — the EFT confirmation or receipt.">
          {(id) => <AttachField id={id} file={file} existing={null} onFile={setFile} label="Attach photo or PDF" />}
        </Field>
        <p className="text-[12px] text-ink-3">
          {settles ? 'This settles the quote — it will be marked as paid.' : `It goes into expenses as “${QUOTE_PAYMENT_CATEGORY}” and counts toward the quote, not on top of it.`}
          {amount > prog.owed + 0.5 ? ` That’s ${money(amount - prog.owed)} more than the quote — the extra counts as real cost.` : ''}
        </p>
      </div>
    </Sheet>
  )
}
