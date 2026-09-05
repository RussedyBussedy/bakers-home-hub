import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { addMonths, differenceInCalendarDays, eachMonthOfInterval, format, startOfMonth, startOfYear, subDays, subMonths } from 'date-fns'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Table2 } from 'lucide-react'
import { Page } from '../components/layout/AppShell'
import { useEverything } from '../data/hooks'
import { PROJECT_STATUSES, type Project } from '../data/types'
import { projectCosts } from '../lib/xp'
import { cn, money, toDate } from '../lib/utils'
import { EmptyState, Reveal, SectionTitle, StatusPill } from '../components/ui/Bits'
import { Segmented } from '../components/ui/Field'
import { Tooltip } from '../components/ui/Menu'

type Range = 'all' | 'year' | '90d'
type Scope = 'live' | 'all'

export default function InsightsPage() {
  const data = useEverything()
  const [range, setRange] = useState<Range>('all')
  const [scope, setScope] = useState<Scope>('all')
  const [tableView, setTableView] = useState(false)

  const since = useMemo(() => (range === 'year' ? startOfYear(new Date()) : range === '90d' ? subDays(new Date(), 90) : null), [range])
  const inRange = (s: string | null | undefined) => { if (!since) return true; const d = toDate(s); return d ? d >= since : true }

  const projects = useMemo(() => data.projects.filter((p) => (scope === 'all' ? true : p.status === 'in_progress' || p.status === 'planning')).filter((p) => (since ? inRange(p.created_at) || inRange(p.completed_date) || inRange(p.start_date) : true)), [data.projects, scope, since]) // eslint-disable-line react-hooks/exhaustive-deps
  const quotes = useMemo(() => data.quotes.filter((q) => inRange(q.quote_date ?? q.created_at)), [data.quotes, since]) // eslint-disable-line react-hooks/exhaustive-deps
  const expenses = useMemo(() => data.expenses.filter((e) => inRange(e.date)), [data.expenses, since]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => projects.map((p) => ({ p, c: projectCosts(p, quotes, expenses) })).sort((a, b) => b.c.budget - a.c.budget), [projects, quotes, expenses])
  const totals = useMemo(() => rows.reduce((acc, r) => ({ budget: acc.budget + r.c.budget, real: acc.real + r.c.real, saved: acc.saved + r.c.savedByChoosing, owed: acc.owed + r.c.owed, spent: acc.spent + r.c.spent }), { budget: 0, real: 0, saved: 0, owed: 0, spent: 0 }), [rows])
  const doneCount = projects.filter((p) => p.status === 'done').length
  const accuracy = useMemo(() => {
    const done = rows.filter((r) => r.p.status === 'done' && r.c.budget > 0)
    if (!done.length) return null
    return done.reduce((a, r) => a + r.c.real / r.c.budget, 0) / done.length
  }, [rows])

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    // Deposits toward accepted quotes sit inside "Contractor quotes" already.
    expenses.filter((e) => !e.quote_id && projects.some((p) => p.id === e.project_id)).forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount))
    quotes.filter((q) => (q.status === 'accepted' || q.status === 'paid') && projects.some((p) => p.id === q.project_id)).forEach((q) => m.set('Contractor quotes', (m.get('Contractor quotes') ?? 0) + q.amount))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses, quotes, projects])

  const monthly = useMemo(() => {
    const end = startOfMonth(new Date())
    const start = subMonths(end, 11)
    return eachMonthOfInterval({ start, end }).map((m) => {
      const next = addMonths(m, 1)
      const inMonth = (s: string | null | undefined) => { const d = toDate(s); return d ? d >= m && d < next : false }
      const ex = data.expenses.filter((e) => !e.quote_id && inMonth(e.date)).reduce((a, e) => a + e.amount, 0)
      const qs = data.quotes.filter((q) => (q.status === 'accepted' || q.status === 'paid') && inMonth(q.quote_date ?? q.created_at)).reduce((a, q) => a + q.amount, 0)
      return { month: format(m, 'MMM'), full: format(m, 'MMMM yyyy'), total: ex + qs, expenses: ex, quotes: qs }
    })
  }, [data.expenses, data.quotes])
  const monthlyMax = Math.max(0, ...monthly.map((m) => m.total))

  const suppliers = useMemo(() => data.contacts.map((c) => {
    const qs = data.quotes.filter((q) => q.contact_id === c.id)
    const accepted = qs.filter((q) => q.status === 'accepted' || q.status === 'paid')
    const spend = accepted.reduce((a, q) => a + q.amount, 0) + data.expenses.filter((e) => e.contact_id === c.id && !e.quote_id).reduce((a, e) => a + e.amount, 0)
    return { c, quotes: qs.length, accepted: accepted.length, spend }
  }).filter((s) => s.quotes > 0 || s.spend > 0).sort((a, b) => b.spend - a.spend), [data.contacts, data.quotes, data.expenses])

  if (data.loading) return <Page wide title="Insights"><div className="skeleton h-64 w-full rounded-3xl" /></Page>

  return (
    <Page wide title="Insights">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Range> value={range} onChange={setRange} size="sm" options={[{ value: 'all', label: 'All time' }, { value: 'year', label: 'This year' }, { value: '90d', label: 'Last 90 days' }]} />
        <Segmented<Scope> value={scope} onChange={setScope} size="sm" options={[{ value: 'all', label: 'All projects' }, { value: 'live', label: 'Live only' }]} />
      </div>

      {/* KPI row */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Budgeted', value: money(totals.budget), hint: `${projects.length} project${projects.length === 1 ? '' : 's'}` },
          { label: 'Real cost', value: money(totals.real), hint: `${Math.round(totals.budget ? (totals.real / totals.budget) * 100 : 0)}% of budget`, tone: totals.real > totals.budget && totals.budget > 0 ? 'danger' : undefined },
          { label: totals.budget - totals.real >= 0 ? 'Headroom' : 'Over budget', value: money(Math.abs(totals.budget - totals.real)), hint: 'budget minus real cost', tone: totals.budget - totals.real < 0 ? 'danger' : 'sage' },
          { label: 'Still owed', value: money(totals.owed), hint: `on accepted quotes · ${money(totals.spent)} paid out`, tone: totals.owed > 0 ? 'ochre' : 'sage' },
          { label: 'Saved by comparing', value: money(totals.saved), hint: 'accepted vs highest quote', tone: 'sage' },
          { label: 'Budget accuracy', value: accuracy == null ? '—' : `${Math.round(accuracy * 100)}%`, hint: accuracy == null ? 'finish a project to see' : `real ÷ estimate on ${doneCount} done` },
        ].map((k, i) => (
          <Reveal key={k.label} index={i}>
            <div className="card p-4">
              <p className="text-[12px] font-medium text-ink-2">{k.label}</p>
              <p className={cn('mt-1 text-[26px] font-semibold leading-none tracking-tight', k.tone === 'danger' ? 'text-danger' : k.tone === 'sage' ? 'text-sage-text' : k.tone === 'ochre' ? 'text-ochre-text' : 'text-ink')}>{k.value}</p>
              <p className="mt-1.5 text-[12px] text-ink-3">{k.hint}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Budget vs real per project */}
        <section className="card p-5">
          <SectionTitle sub="Estimate as the track, real cost as the fill" action={
            <button onClick={() => setTableView((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm text-ink-2 hover:text-ink" aria-pressed={tableView}>
              {tableView ? <><BarChart3 className="size-4" /> Chart</> : <><Table2 className="size-4" /> Table</>}
            </button>
          }>Budget vs real cost</SectionTitle>
          {rows.length === 0 ? <EmptyState compact icon={<BarChart3 />} title="No projects in this range" /> : tableView ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead><tr className="text-left text-[12px] uppercase tracking-wider text-ink-3"><th className="py-2 font-medium">Project</th><th className="py-2 font-medium">Status</th><th className="py-2 text-right font-medium">Budget</th><th className="py-2 text-right font-medium">Real</th><th className="py-2 text-right font-medium">Variance</th></tr></thead>
                <tbody>
                  {rows.map(({ p, c }) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-2 pr-2"><Link to={`/projects/${p.id}`} className="text-ink hover:underline">{p.title}</Link></td>
                      <td className="py-2"><StatusPill status={p.status} size="sm" /></td>
                      <td className="py-2 text-right tabular text-ink-2">{money(c.budget)}</td>
                      <td className="py-2 text-right tabular text-ink">{money(c.real)}</td>
                      <td className={cn('py-2 text-right tabular', c.variance < 0 ? 'text-danger' : 'text-sage-text')}>{c.variance < 0 ? '−' : '+'}{money(Math.abs(c.variance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              {rows.map(({ p, c }, i) => {
                const max = Math.max(1, ...rows.map((r) => Math.max(r.c.budget, r.c.real)))
                const over = c.real > c.budget && c.budget > 0
                return (
                  <div key={p.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                      <Link to={`/projects/${p.id}`} className="min-w-0 truncate font-medium text-ink hover:underline">{p.title}</Link>
                      <span className="shrink-0 tabular text-ink-2">{money(c.real)} <span className="text-ink-3">/ {money(c.budget)}</span></span>
                    </div>
                    <Tooltip label={`${p.title}: budget ${money(c.budget)}, real cost ${money(c.real)}${c.variance < 0 ? `, over by ${money(-c.variance)}` : `, ${money(c.variance)} left`}`}>
                      <div className="relative h-6 w-full" role="img" aria-label={`${p.title}: ${money(c.real)} of ${money(c.budget)} budget`}>
                        <div className={cn('absolute inset-y-1 left-0 rounded-r-[4px]', over ? 'bg-danger-soft' : 'bg-sage-soft')} style={{ width: `${(c.budget / max) * 100}%` }} />
                        <motion.div className={cn('absolute inset-y-1 left-0 rounded-r-[4px]', over ? 'bg-danger' : 'bg-sage')} initial={{ width: 0 }} animate={{ width: `${(c.real / max) * 100}%` }} transition={{ duration: 0.9, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }} />
                        {c.budget > 0 && <span className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${(c.budget / max) * 100}%` }} aria-hidden />}
                      </div>
                    </Tooltip>
                  </div>
                )
              })}
              <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-ink-2">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-sage" /> Real cost</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-sage-soft" /> Budget</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-danger" /> Over budget</span>
              </div>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
        {/* Spend by category */}
        <section className="card p-5">
          <SectionTitle sub="Accepted quotes and logged expenses">Where the money goes</SectionTitle>
          {byCategory.length === 0 ? <EmptyState compact icon={<BarChart3 />} title="Nothing spent yet" /> : (
            <div className="mt-5 flex flex-col gap-3">
              {byCategory.slice(0, 8).map(([cat, amount], i) => {
                const max = byCategory[0]![1]
                return (
                  <div key={cat} className="grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-3 text-[13px]">
                    <span className="truncate text-ink-2">{cat}</span>
                    <div className="relative h-4">
                      <motion.div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-primary" initial={{ width: 0 }} animate={{ width: `${(amount / max) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }} />
                    </div>
                    <span className="tabular text-ink">{money(amount)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        {/* Monthly spend */}
        <section className="card p-5">
          <SectionTitle sub="Last 12 months · accepted quotes + expenses">Spend over time</SectionTitle>
          {monthlyMax === 0 ? <EmptyState compact icon={<BarChart3 />} title="No spend recorded yet" /> : (
            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickFormatter={(v: number) => money(v, { compact: true })} width={52} />
                  <RTooltip cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]!.payload as (typeof monthly)[number]
                    return (
                      <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-md">
                        <p className="text-[11px] uppercase tracking-wider text-ink-3">{d.full}</p>
                        <p className="font-semibold tabular text-ink">{money(d.total)}</p>
                        <p className="text-ink-2">Quotes {money(d.quotes)} · Expenses {money(d.expenses)}</p>
                      </div>
                    )
                  }} />
                  <Area type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} fill="url(#spendFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)', fill: 'var(--primary)' }} isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        </div>
      </div>

      {/* Timeline */}
      <section className="card mt-6 p-5">
        <SectionTitle sub="Start → target, with today marked">Project timelines</SectionTitle>
        <Gantt projects={projects} />
      </section>

      {/* Suppliers */}
      <section className="card mt-6 p-5">
        <SectionTitle sub="Who you've spent with, and how often they quote">Suppliers & contractors</SectionTitle>
        {suppliers.length === 0 ? <EmptyState compact icon={<Table2 />} title="No supplier activity yet" /> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead><tr className="text-left text-[12px] uppercase tracking-wider text-ink-3"><th className="py-2 font-medium">Contact</th><th className="py-2 text-right font-medium">Quotes</th><th className="py-2 text-right font-medium">Accepted</th><th className="py-2 text-right font-medium">Spend</th><th className="py-2 text-right font-medium">Rating</th></tr></thead>
              <tbody>
                {suppliers.map(({ c, quotes: q, accepted, spend }) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-2.5 pr-2"><p className="text-ink">{c.name}</p><p className="text-[12px] text-ink-3">{c.company}</p></td>
                    <td className="py-2.5 text-right tabular text-ink-2">{q}</td>
                    <td className="py-2.5 text-right tabular text-ink-2">{accepted}</td>
                    <td className="py-2.5 text-right tabular whitespace-nowrap text-ink">{money(spend)}</td>
                    <td className="py-2.5 text-right text-ochre-text">{c.rating ? '★'.repeat(c.rating) : <span className="text-ink-3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  )
}

function Gantt({ projects }: { projects: Project[] }) {
  const rows = projects.filter((p) => p.start_date || p.target_date || p.completed_date || p.status === 'in_progress')
  if (rows.length === 0) return <EmptyState compact icon={<BarChart3 />} title="No dated projects" description="Add start and target dates to see them here." />
  const today = new Date()
  const dates = rows.flatMap((p) => [toDate(p.start_date) ?? toDate(p.created_at)!, toDate(p.target_date), toDate(p.completed_date)]).filter((d): d is Date => Boolean(d))
  const min = new Date(Math.min(...dates.map((d) => d.getTime()), today.getTime()))
  const max = new Date(Math.max(...dates.map((d) => d.getTime()), today.getTime()))
  const span = Math.max(1, differenceInCalendarDays(max, min))
  const pos = (d: Date) => (differenceInCalendarDays(d, min) / span) * 100
  const months = eachMonthOfInterval({ start: startOfMonth(min), end: max }).filter((m) => m >= min && m <= max)
  return (
    <div className="mt-4">
      <div className="relative ml-[120px] h-5 text-[11px] text-ink-3">
        {months.map((m) => <span key={m.toISOString()} className="absolute -translate-x-1/2" style={{ left: `${pos(m)}%` }}>{format(m, 'MMM')}</span>)}
      </div>
      <div className="relative flex flex-col gap-2.5">
        <span className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-primary" style={{ left: `calc(120px + (100% - 120px) * ${pos(today) / 100})` }} aria-hidden />
        {rows.map((p, i) => {
          const start = toDate(p.start_date) ?? toDate(p.created_at)!
          const end = toDate(p.completed_date) ?? toDate(p.target_date) ?? today
          const late = p.status !== 'done' && p.target_date && today > toDate(p.target_date)!
          return (
            <div key={p.id} className="grid grid-cols-[120px_1fr] items-center gap-2">
              <Link to={`/projects/${p.id}`} className="truncate text-[13px] text-ink hover:underline">{p.title}</Link>
              <div className="relative h-5">
                <Tooltip label={`${p.title}: ${format(start, 'd MMM')} → ${format(end, 'd MMM')} · ${PROJECT_STATUSES.find((s) => s.value === p.status)?.label}`}>
                  <motion.div className={cn('absolute inset-y-1 rounded-[4px]', p.status === 'done' ? 'bg-sage' : late ? 'bg-danger' : '')} style={{ left: `${pos(start)}%`, background: p.status === 'done' ? undefined : late ? undefined : p.accent }} initial={{ width: 0 }} animate={{ width: `${Math.max(0.8, pos(end) - pos(start))}%` }} transition={{ duration: 0.8, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }} />
                </Tooltip>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-3"><span className="mr-1 inline-block h-3 w-px bg-primary align-middle" /> Today · sage = done · red = past target</p>
    </div>
  )
}
