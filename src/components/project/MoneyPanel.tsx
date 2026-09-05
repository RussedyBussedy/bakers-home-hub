import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Ban, CircleDollarSign, FileText, MoreHorizontal, Paperclip, Plus, Receipt, Trash2, Wallet } from 'lucide-react'
import type { Contact, Expense, NewExpense, NewQuote, Project, Quote, QuoteStatus } from '../../data/types'
import { EXPENSE_CATEGORIES } from '../../data/types'
import { useActions, useMediaUrl } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { projectCosts } from '../../lib/xp'
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
  const { updateQuote, deleteQuote, deleteExpense } = useActions()
  const confirm = useConfirm()
  const { profileById } = useAuth()

  const sorted = useMemo(() => {
    const order: Record<QuoteStatus, number> = { accepted: 0, paid: 0, received: 1, rejected: 2 }
    return [...quotes].sort((a, b) => order[a.status] - order[b.status] || a.amount - b.amount)
  }, [quotes])

  const setStatus = (q: Quote, status: QuoteStatus) => updateQuote(q.id, { status })

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
            <span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-line-strong align-middle" />Expenses {money(costs.real - costs.committed)}</span>
            <span className={cn('font-medium', costs.variance < 0 ? 'text-danger' : 'text-sage-text')}>{costs.variance < 0 ? `${money(-costs.variance)} over` : `${money(costs.variance)} left`}</span>
          </div>
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
                  return (
                    <motion.div key={q.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-3 p-4">
                      <span className={cn('mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl', q.status === 'accepted' || q.status === 'paid' ? 'bg-sage-soft text-sage-text' : q.status === 'rejected' ? 'bg-surface-3 text-ink-3' : 'bg-sky-soft text-sky-text')}>
                        {q.status === 'accepted' || q.status === 'paid' ? <BadgeCheck className="size-5" /> : q.status === 'rejected' ? <Ban className="size-5" /> : <FileText className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className={cn('font-medium text-ink', q.status === 'rejected' && 'text-ink-3 line-through')}>{q.title || 'Quote'}</p>
                          <Pill tone={quoteTone[q.status]} size="sm">{quoteLabel[q.status]}</Pill>
                          {lowest && q.status !== 'rejected' && <Pill tone="gold" size="sm">Lowest</Pill>}
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-ink-2">{c ? `${c.name}${c.company ? ` · ${c.company}` : ''}` : 'No contact'}{q.quote_date ? ` · ${fmtDate(q.quote_date)}` : ''}{q.valid_until && q.status === 'received' ? ` · valid until ${fmtDate(q.valid_until)}` : ''}</p>
                        {q.notes && <p className="mt-1 text-[13px] text-ink-3">{q.notes}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {q.file_path && <QuoteFileLink path={q.file_path} />}
                          {by && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Avatar name={by.display_name} color={by.color} size="xs" /> filed by {by.display_name}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className={cn('font-display-tight text-xl tabular', q.status === 'rejected' ? 'text-ink-3' : 'text-ink')}>{money(q.amount)}</p>
                        <p className="text-[11px] text-ink-3">{q.vat_included ? 'incl. VAT' : 'excl. VAT'}</p>
                        <Menu trigger={<IconButton label="Quote actions" size="icon-sm"><MoreHorizontal className="size-5" /></IconButton>}>
                          {q.status !== 'accepted' && <MenuItem icon={<BadgeCheck />} onSelect={() => setStatus(q, 'accepted')}>Accept this quote</MenuItem>}
                          {q.status === 'accepted' && <MenuItem icon={<CircleDollarSign />} onSelect={() => setStatus(q, 'paid')}>Mark as paid</MenuItem>}
                          {q.status !== 'rejected' && <MenuItem icon={<Ban />} onSelect={() => setStatus(q, 'rejected')}>Decline</MenuItem>}
                          {q.status !== 'received' && <MenuItem icon={<FileText />} onSelect={() => setStatus(q, 'received')}>Back to received</MenuItem>}
                          <MenuSeparator />
                          <MenuItem onSelect={() => setQuoteOpen({ open: true, quote: q })}>Edit</MenuItem>
                          <MenuItem danger icon={<Trash2 />} onSelect={async () => { if (await confirm({ title: 'Delete this quote?', description: 'This can’t be undone.', confirmLabel: 'Delete', danger: true })) deleteQuote(q) }}>Delete</MenuItem>
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
            <EmptyState compact icon={<Receipt />} title="No expenses yet" description="Paint, hinges, plants, the bakkie hire — log the bits you buy yourselves." />
          ) : (
            <AnimatePresence initial={false}>
              {[...expenses].sort((a, b) => b.date.localeCompare(a.date)).map((e) => {
                const c = contacts.find((x) => x.id === e.contact_id)
                return (
                  <motion.div key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2"><Wallet className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] text-ink">{e.title}</p>
                      <p className="truncate text-xs text-ink-3">{fmtDate(e.date)} · {e.category}{c ? ` · ${c.company || c.name}` : ''}</p>
                    </div>
                    {e.receipt_path && <QuoteFileLink path={e.receipt_path} label="Receipt" />}
                    <p className="font-medium tabular text-ink">{money(e.amount)}</p>
                    <Menu trigger={<IconButton label="Expense actions" size="icon-sm"><MoreHorizontal className="size-5" /></IconButton>}>
                      <MenuItem onSelect={() => setExpenseOpen({ open: true, expense: e })}>Edit</MenuItem>
                      <MenuItem danger icon={<Trash2 />} onSelect={async () => { if (await confirm({ title: 'Delete this expense?', confirmLabel: 'Delete', danger: true })) deleteExpense(e) }}>Delete</MenuItem>
                    </Menu>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </section>

      <QuoteSheet open={quoteOpen.open} quote={quoteOpen.quote ?? null} project={project} contacts={contacts} onOpenChange={(o) => setQuoteOpen((s) => ({ ...s, open: o }))} />
      <ExpenseSheet open={expenseOpen.open} expense={expenseOpen.expense ?? null} project={project} contacts={contacts} onOpenChange={(o) => setExpenseOpen((s) => ({ ...s, open: o }))} />
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
            {(id) => (
              <Select id={id} value={v.contact_id ?? ''} onChange={(e) => set('contact_id', e.target.value || null)}>
                <option value="">— Not linked —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
              </Select>
            )}
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
          <Field label="Status">
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
            {(id) => (
              <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3.5 text-sm text-ink-2 hover:text-ink">
                <Paperclip className="size-4" /> {file ? file.name : v.file_path ? 'Attached — tap to replace' : 'Attach photo or PDF'}
                <input id={id} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
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
function ExpenseSheet({ open, onOpenChange, expense, project, contacts }: { open: boolean; onOpenChange: (o: boolean) => void; expense: Expense | null; project: Project; contacts: Contact[] }) {
  const { createExpense, updateExpense } = useActions()
  const [v, setV] = useState<NewExpense>(() => blankExpense(project.id))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null); setFile(null)
    setV(expense ? { project_id: expense.project_id, title: expense.title, amount: expense.amount, date: expense.date, category: expense.category, contact_id: expense.contact_id, receipt_path: expense.receipt_path } : blankExpense(project.id))
  }, [open, expense, project.id])

  const set = <K extends keyof NewExpense>(k: K, val: NewExpense[K]) => setV((s) => ({ ...s, [k]: val }))

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
            {(id) => (
              <Select id={id} value={v.contact_id ?? ''} onChange={(e) => set('contact_id', e.target.value || null)}>
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {!expense && (
          <Field label="Receipt" hint="Optional — a photo of the slip.">
            {(id) => (
              <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3.5 text-sm text-ink-2 hover:text-ink">
                <Paperclip className="size-4" /> {file ? file.name : 'Attach receipt'}
                <input id={id} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </Field>
        )}
      </div>
    </Sheet>
  )
}

function blankExpense(project_id: string): NewExpense {
  return { project_id, title: '', amount: 0, date: todayISO(), category: 'Materials', contact_id: null, receipt_path: null }
}
