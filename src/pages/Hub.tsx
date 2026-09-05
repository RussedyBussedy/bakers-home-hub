import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format, startOfMonth } from 'date-fns'
import { ArrowRight, CalendarDays, Check, Flame, Plus, Sparkles, Trophy, Wallet, Zap } from 'lucide-react'
import { Checkbox } from '../components/ui/Checkbox'
import { Page } from '../components/layout/AppShell'
import { useAuth } from '../data/session'
import { useActions, useEverything, useLevel } from '../data/hooks'
import { ACHIEVEMENTS, XP_RULES, projectCosts, weeklyStreak } from '../lib/xp'
import { cn, fmtRelative, greeting, money, pluralise, todayISO } from '../lib/utils'
import { ProjectCard } from '../components/project/ProjectCard'
import { Avatar, CountUp, EmptyState, Reveal, SectionTitle, Skeleton } from '../components/ui/Bits'
import { Button } from '../components/ui/Button'

export default function HubPage() {
  const { me, partner, profiles, profileById, household } = useAuth()
  const data = useEverything()
  const level = useLevel()
  const { updateTask } = useActions()

  const streak = weeklyStreak(data.xp)
  const active = useMemo(() => data.projects.filter((p) => p.status === 'in_progress' || p.status === 'planning').slice(0, 6), [data.projects])
  const upNext = useMemo(() => {
    const today = todayISO()
    return data.tasks
      .filter((t) => !t.done)
      .map((t) => ({ t, p: data.projects.find((p) => p.id === t.project_id) }))
      .filter((x) => x.p && x.p.status !== 'done' && x.p.status !== 'on_hold')
      .sort((a, b) => (a.t.due_date ?? '9999').localeCompare(b.t.due_date ?? '9999'))
      .slice(0, 5)
      .map((x) => ({ ...x, overdue: Boolean(x.t.due_date && x.t.due_date < today), today: x.t.due_date === today }))
  }, [data.tasks, data.projects])

  const monthXp = useMemo(() => {
    const start = startOfMonth(new Date()).getTime()
    const by: Record<string, number> = {}
    data.xp.forEach((e) => { if (new Date(e.created_at).getTime() >= start) by[e.user_id] = (by[e.user_id] ?? 0) + e.points })
    return by
  }, [data.xp])
  const monthMax = Math.max(1, ...Object.values(monthXp))

  const totals = useMemo(() => {
    const live = data.projects.filter((p) => p.status !== 'on_hold')
    let budget = 0, real = 0
    live.forEach((p) => { const c = projectCosts(p, data.quotes, data.expenses); budget += c.budget; real += c.real })
    return { budget, real, count: live.length, done: data.projects.filter((p) => p.status === 'done').length }
  }, [data.projects, data.quotes, data.expenses])

  const feed = useMemo(() => [...data.xp].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8), [data.xp])
  const nextBadge = useMemo(() => ACHIEVEMENTS.find((a) => !data.achievements.some((x) => x.key === a.key)), [data.achievements])

  if (data.loading) return <HubSkeleton />

  return (
    <Page wide>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-2">{greeting()}, {me?.display_name}</p>
          <h1 className="text-[30px] sm:text-[36px]">{household?.name ?? 'Home'} Hub</h1>
        </div>
        <div className="flex -space-x-2">
          {profiles.map((p) => <Avatar key={p.id} name={p.display_name} color={p.color} ring />)}
        </div>
      </div>

      {/* Level hero */}
      <Reveal className="mt-5">
        <div className="grain relative overflow-hidden rounded-[28px] bg-[#1e1a16] text-[#f6f1e9] shadow-lg dark:bg-[#26201b] dark:ring-1 dark:ring-line">
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/40 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -left-10 -bottom-24 size-64 rounded-full bg-ochre/30 blur-3xl" aria-hidden />
          <div className="relative grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#f6f1e9]/60">Household level</p>
              <div className="mt-1 flex items-end gap-3">
                <span className="font-display-tight text-[64px] leading-none sm:text-[80px]"><CountUp value={level.level} /></span>
                <div className="pb-2">
                  <p className="font-display text-2xl leading-tight sm:text-3xl">{level.title}</p>
                  <p className="mt-1 text-sm text-[#f6f1e9]/70"><CountUp value={level.current} /> XP{level.next ? ` · ${level.toNext.toLocaleString('en-ZA')} to next level` : ''}</p>
                </div>
              </div>
              <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-[#f6f1e9]/15">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-ochre via-primary to-blush" initial={{ width: 0 }} animate={{ width: `${Math.max(0.02, level.progress) * 100}%` }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }} />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f6f1e9]/10 px-3 text-[13px]"><Flame className={cn('size-4', streak.weeks > 0 ? 'text-ochre' : 'text-[#f6f1e9]/50')} /> {streak.weeks}-week streak{streak.activeThisWeek ? '' : ' · do something this week to keep it'}</span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f6f1e9]/10 px-3 text-[13px]"><Trophy className="size-4 text-gold" /> {data.achievements.length}/{ACHIEVEMENTS.length} badges</span>
              </div>
            </div>
            <div className="flex min-w-[200px] flex-col justify-center gap-3 rounded-2xl bg-[#f6f1e9]/10 p-4 sm:w-[240px]">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#f6f1e9]/60">{format(new Date(), 'MMMM')} so far</p>
              {profiles.map((p, i) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><Avatar name={p.display_name} color={p.color} size="xs" /> {p.display_name}</span>
                    <span className="tabular font-semibold">{(monthXp[p.id] ?? 0).toLocaleString('en-ZA')} XP</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f6f1e9]/15">
                    <motion.div className="h-full rounded-full" style={{ background: p.color }} initial={{ width: 0 }} animate={{ width: `${((monthXp[p.id] ?? 0) / monthMax) * 100}%` }} transition={{ duration: 1, delay: 0.3 + i * 0.1, ease: [0.16, 1, 0.3, 1] }} />
                  </div>
                </div>
              ))}
              {partner && monthXp[partner.id] !== undefined && me && (monthXp[partner.id] ?? 0) > (monthXp[me.id] ?? 0) && (
                <p className="text-[12px] text-[#f6f1e9]/60">{partner.display_name} is ahead this month — better get pinning.</p>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Active quests */}
      <section className="mt-8">
        <SectionTitle sub={`${pluralise(totals.count, 'live project')} · ${totals.done} completed`} action={<Link to="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-primary-text">All projects <ArrowRight className="size-4" /></Link>}>
          On the go
        </SectionTitle>
        {active.length === 0 ? (
          <div className="card mt-4">
            <EmptyState icon={<Sparkles />} title="No projects on the go" description="Start a quest — a room, a repair, a garden bed. Small counts." action={<Button leading={<Plus className="size-4" />} onClick={() => (window.location.href = '/projects/new')}>New project</Button>} />
          </div>
        ) : (
          <div className="-mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
            {active.map((p, i) => <ProjectCard key={p.id} project={p} quotes={data.quotes} expenses={data.expenses} tasks={data.tasks} index={i} compact />)}
          </div>
        )}
      </section>

      <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Up next */}
        <section>
          <SectionTitle sub="Across every live project">Up next</SectionTitle>
          <div className="card mt-4 divide-y divide-line">
            {upNext.length === 0 ? (
              <EmptyState compact icon={<Check />} title="Nothing due" description="Add tasks to a project and they'll show up here." />
            ) : (
              upNext.map(({ t, p, overdue, today }, i) => (
                <Reveal key={t.id} index={i}>
                  <Link to={`/projects/${t.project_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                    <Checkbox checked={t.done} onChange={(v) => updateTask(t.id, { done: v })} label={`Mark “${t.title}” done`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{t.title}</span>
                      <span className="block truncate text-xs text-ink-3">{p?.title}</span>
                    </span>
                    {t.assigned_to && (() => { const a = profileById(t.assigned_to); return a ? <Avatar name={a.display_name} color={a.color} size="xs" /> : null })()}
                    {t.due_date && (
                      <span className={cn('inline-flex items-center gap-1 text-xs tabular', overdue ? 'text-danger' : today ? 'text-ochre-text' : 'text-ink-3')}>
                        <CalendarDays className="size-3.5" /> {overdue ? 'Overdue' : today ? 'Today' : format(new Date(t.due_date), 'd MMM')}
                      </span>
                    )}
                  </Link>
                </Reveal>
              ))
            )}
          </div>

          {/* Money glance */}
          <div className="card mt-4 flex items-center gap-4 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sage-soft text-sage-text"><Wallet className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Real cost vs budget</p>
              <p className="mt-0.5 font-display-tight text-xl text-ink tabular">{money(totals.real)} <span className="text-ink-3">of {money(totals.budget)}</span></p>
            </div>
            <Link to="/insights" className="text-sm font-medium text-primary-text">Insights</Link>
          </div>
        </section>

        {/* Activity */}
        <section>
          <SectionTitle sub="What you've both been up to">Activity</SectionTitle>
          <div className="card mt-4 p-2">
            {feed.length === 0 ? (
              <EmptyState compact icon={<Zap />} title="Quiet so far" description="Every photo, quote and task earns XP." />
            ) : (
              <ul className="flex flex-col">
                {feed.map((e, i) => {
                  const who = profileById(e.user_id)
                  const proj = data.projects.find((p) => p.id === e.project_id)
                  return (
                    <Reveal as="li" key={e.id} index={i} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2/60">
                      {who ? <Avatar name={who.display_name} color={who.color} size="sm" /> : <span className="size-8 rounded-full bg-surface-3" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink"><span className="font-medium">{who?.display_name ?? 'Someone'}</span> · {XP_RULES[e.kind]?.label ?? e.kind}</span>
                        <span className="block truncate text-xs text-ink-3">{proj?.title ?? ''}{proj ? ' · ' : ''}{fmtRelative(e.created_at)}</span>
                      </span>
                      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-ochre-text tabular">+{e.points}</span>
                    </Reveal>
                  )
                })}
              </ul>
            )}
          </div>
          {nextBadge && (
            <Link to="/rewards" className="card card-hover mt-4 flex items-center gap-3 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-ochre-text"><Trophy className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold uppercase tracking-wider text-ink-3">Next badge</span>
                <span className="block truncate text-[15px] font-medium text-ink">{nextBadge.title} <span className="font-normal text-ink-2">— {nextBadge.description}</span></span>
              </span>
              <ArrowRight className="size-4 text-ink-3" />
            </Link>
          )}
        </section>
      </div>
    </Page>
  )
}

function HubSkeleton() {
  return (
    <Page wide>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-10 w-64" />
      <Skeleton className="mt-6 h-56 w-full rounded-[28px]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-full rounded-3xl" />)}
      </div>
    </Page>
  )
}
