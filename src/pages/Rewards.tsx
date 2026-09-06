import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { eachWeekOfInterval, endOfWeek, format, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { Flame, Lock, Trophy, Zap } from 'lucide-react'
import { Page } from '../components/layout/AppShell'
import { useAuth } from '../data/session'
import { useEverything, useLevel } from '../data/hooks'
import { ACHIEVEMENTS, XP_RULES, weeklyStreak } from '../lib/xp'
import { cn, fmtDate, fmtRelative, num } from '../lib/utils'
import { AchievementIcon } from '../components/game/AchievementIcon'
import { Avatar, CountUp, Reveal, SectionTitle } from '../components/ui/Bits'
import { Tooltip } from '../components/ui/Menu'

const TONE_BG: Record<string, string> = { primary: 'bg-primary-soft text-primary-text', sage: 'bg-sage-soft text-sage-text', ochre: 'bg-ochre-soft text-ochre-text', sky: 'bg-sky-soft text-sky-text', plum: 'bg-plum-soft text-plum-text', gold: 'bg-gold-soft text-ochre-text' }

export default function RewardsPage() {
  const { profiles, profileById } = useAuth()
  const data = useEverything()
  const level = useLevel()
  const streak = weeklyStreak(data.xp)

  const unlocked = useMemo(() => new Map(data.achievements.map((a) => [a.key, a])), [data.achievements])

  // Weekly activity for the last 16 weeks, per person.
  const weeks = useMemo(() => {
    const now = new Date()
    const start = startOfWeek(subWeeks(now, 15), { weekStartsOn: 1 })
    return eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 }).map((ws) => {
      const we = endOfWeek(ws, { weekStartsOn: 1 })
      const inWeek = data.xp.filter((e) => { const t = new Date(e.created_at); return t >= ws && t <= we })
      const by: Record<string, number> = {}
      inWeek.forEach((e) => (by[e.user_id] = (by[e.user_id] ?? 0) + e.points))
      return { ws, total: inWeek.reduce((a, e) => a + e.points, 0), by }
    })
  }, [data.xp])
  const weekMax = Math.max(1, ...weeks.map((w) => w.total))

  // Monthly leaderboard: this month and last.
  const months = useMemo(() => [0, 1, 2].map((k) => {
    const m = subMonths(new Date(), k)
    const ms = startOfMonth(m)
    const me_ = new Date(ms.getFullYear(), ms.getMonth() + 1, 1)
    const by: Record<string, number> = {}
    data.xp.forEach((e) => { const t = new Date(e.created_at); if (t >= ms && t < me_) by[e.user_id] = (by[e.user_id] ?? 0) + e.points })
    return { label: format(m, 'MMMM'), by }
  }), [data.xp])

  const totals = useMemo(() => {
    const by: Record<string, number> = {}
    data.xp.forEach((e) => (by[e.user_id] = (by[e.user_id] ?? 0) + e.points))
    return by
  }, [data.xp])

  const feed = useMemo(() => [...data.xp].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12), [data.xp])

  return (
    <Page wide title="Rewards">
      <div className="grid gap-4 sm:grid-cols-3">
        <Reveal index={0}><div className="card flex items-center gap-4 p-5">
          <span className="grid size-14 place-items-center rounded-3xl bg-gold-soft text-ochre-text"><Zap className="size-6" /></span>
          <div><p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Household XP</p><p className="font-display-tight text-3xl text-ink"><CountUp value={level.current} /></p><p className="text-[13px] text-ink-2">Level {level.level} · {level.title}</p></div>
        </div></Reveal>
        <Reveal index={1}><div className="card flex items-center gap-4 p-5">
          <span className={cn('grid size-14 place-items-center rounded-3xl', streak.weeks > 0 ? 'bg-primary-soft text-primary-text' : 'bg-surface-2 text-ink-3')}><Flame className="size-6" /></span>
          <div><p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Streak</p><p className="font-display-tight text-3xl text-ink"><CountUp value={streak.weeks} /> <span className="text-lg text-ink-2">wk</span></p><p className="text-[13px] text-ink-2">{streak.activeThisWeek ? 'This week is banked' : 'Do one thing this week to keep it alive'}</p></div>
        </div></Reveal>
        <Reveal index={2}><div className="card flex items-center gap-4 p-5">
          <span className="grid size-14 place-items-center rounded-3xl bg-plum-soft text-plum-text"><Trophy className="size-6" /></span>
          <div><p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Badges</p><p className="font-display-tight text-3xl text-ink"><CountUp value={data.achievements.length} /> <span className="text-lg text-ink-2">/ {ACHIEVEMENTS.length}</span></p><p className="text-[13px] text-ink-2">{ACHIEVEMENTS.length - data.achievements.length} still to earn</p></div>
        </div></Reveal>
      </div>

      {/* Leaderboard */}
      <section className="mt-8">
        <SectionTitle sub="Friendly competition, obviously">Head to head</SectionTitle>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="card p-5">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">All time</p>
            <div className="mt-3 flex flex-col gap-4">
              {profiles.map((p, i) => {
                const max = Math.max(1, ...Object.values(totals))
                const v = totals[p.id] ?? 0
                const leader = v === max && v > 0
                return (
                  <div key={p.id}>
                    <div className="flex items-center gap-3">
                      <Avatar name={p.display_name} color={p.color} />
                      <div className="min-w-0 flex-1"><p className="font-medium text-ink">{p.display_name} {leader && <span className="ml-1 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] text-ochre-text">Leading</span>}</p><p className="text-[12px] text-ink-3">{data.xp.filter((e) => e.user_id === p.id).length} actions</p></div>
                      <p className="font-display-tight text-2xl tabular text-ink">{num(v)}</p>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-3"><motion.div className="h-full rounded-full" style={{ background: p.color }} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: 1, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }} /></div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4">
              {months.map((m) => (
                <div key={m.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{m.label}</p>
                  {profiles.map((p) => <p key={p.id} className="mt-1 flex items-center gap-1.5 text-[13px] tabular"><span className="size-2 rounded-full" style={{ background: p.color }} />{num(m.by[p.id] ?? 0)}</p>)}
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Last 16 weeks</p>
            <div className="mt-4 flex h-40 items-end gap-1.5">
              {weeks.map((w, i) => (
                <Tooltip key={w.ws.toISOString()} label={`Week of ${fmtDate(w.ws.toISOString(), 'd MMM')} · ${w.total} XP`}>
                  <div className="flex h-full flex-1 flex-col justify-end gap-px">
                    {profiles.map((p) => (
                      <motion.div key={p.id} className="w-full rounded-sm" style={{ background: p.color, opacity: 0.9 }} initial={{ height: 0 }} animate={{ height: `${((w.by[p.id] ?? 0) / weekMax) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }} />
                    ))}
                    {w.total === 0 && <div className="h-1 w-full rounded-sm bg-surface-3" />}
                  </div>
                </Tooltip>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-ink-3"><span>{fmtDate(weeks[0]?.ws.toISOString(), 'd MMM')}</span><span>This week</span></div>
            <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-ink-2">{profiles.map((p) => <span key={p.id} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: p.color }} />{p.display_name}</span>)}</div>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="mt-8">
        <SectionTitle sub="Earned by doing the real work">Badges</SectionTitle>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ACHIEVEMENTS.map((a, i) => {
            const u = unlocked.get(a.key)
            const who = u ? profileById(u.user_id) : null
            return (
              <Reveal key={a.key} index={i}>
                <div className={cn('card relative h-full p-4 transition-all', !u && 'opacity-70 grayscale-[0.4]')}>
                  <div className={cn('grid size-12 place-items-center rounded-2xl', u ? TONE_BG[a.tone] : 'bg-surface-2 text-ink-3')}>
                    {u ? <AchievementIcon name={a.icon} className="size-6" /> : <Lock className="size-5" />}
                  </div>
                  <p className="mt-3 font-medium text-ink">{a.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{a.description}</p>
                  {u ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">{who && <Avatar name={who.display_name} color={who.color} size="xs" />} {who?.display_name ? `${who.display_name} · ` : ''}{fmtDate(u.unlocked_at, 'd MMM yyyy')}</p>
                  ) : <p className="mt-2 text-[12px] text-ink-3">Locked</p>}
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* XP rules & feed */}
      <section className="mt-8 grid min-w-0 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle sub="What earns what">How XP works</SectionTitle>
          <div className="card mt-4 divide-y divide-line">
            {(Object.keys(XP_RULES) as (keyof typeof XP_RULES)[]).map((k) => (
              <div key={k} className="flex items-center justify-between px-4 py-2.5 text-[14px]"><span className="text-ink">{XP_RULES[k].label}</span><span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-ochre-text tabular">+{XP_RULES[k].points}</span></div>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle sub="Latest first">History</SectionTitle>
          <div className="card mt-4 divide-y divide-line">
            {feed.length === 0 ? <p className="p-4 text-sm text-ink-3">Nothing yet.</p> : feed.map((e) => {
              const who = profileById(e.user_id)
              const proj = data.projects.find((p) => p.id === e.project_id)
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  {who && <Avatar name={who.display_name} color={who.color} size="sm" />}
                  <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-ink">{XP_RULES[e.kind]?.label ?? e.kind}</p><p className="truncate text-[12px] text-ink-3">{who?.display_name}{proj ? ` · ${proj.title}` : ''} · {fmtRelative(e.created_at)}</p></div>
                  <span className="text-xs font-semibold text-ochre-text tabular">+{e.points}</span>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </Page>
  )
}
