import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, BellRing, Check, CheckCheck, ChevronDown, Hand, Info, X } from 'lucide-react'
import type { Nudge, NudgeKind, Project } from '../../data/types'
import { useActions, useInbox } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { cn, fmtRelative } from '../../lib/utils'
import { Avatar, SectionTitle } from '../ui/Bits'

const KIND: Record<NudgeKind, { label: string; icon: typeof Hand; cls: string }> = {
  todo: { label: 'For you', icon: Hand, cls: 'bg-primary-soft text-primary-text' },
  done: { label: 'Done', icon: Check, cls: 'bg-sage-soft text-sage-text' },
  fyi: { label: 'FYI', icon: Info, cls: 'bg-sky-soft text-sky-text' },
}

/**
 * Unread nudges for me, plus a fold-out of recent history.
 * `variant="top"` renders only while something is unread; `variant="history"`
 * renders only when nothing is — so the Hub shows one or the other.
 */
export function NudgeInbox({ projects, className, variant = 'top' }: { projects: Project[]; className?: string; variant?: 'top' | 'history' }) {
  const { data, unread } = useInbox()
  const { userId, profileById } = useAuth()
  const { markNudgesRead, deleteNudge } = useActions()
  const navigate = useNavigate()
  const [showEarlier, setShowEarlier] = useState(variant === 'history')

  const earlier = useMemo(() => (data ?? []).filter((n) => !unread.some((u) => u.id === n.id)).slice(0, 8), [data, unread])
  const projectTitle = (id: string | null) => projects.find((p) => p.id === id)?.title

  if (!data || data.length === 0) return null
  if (variant === 'top' && unread.length === 0) return null
  if (variant === 'history' && unread.length > 0) return null

  const open = (n: Nudge) => {
    void markNudgesRead([n.id])
    if (n.link) navigate(n.link)
  }

  return (
    <section className={className}>
      <SectionTitle
        sub={unread.length ? `${unread.length} waiting for you` : 'All caught up — the last few, for the record'}
        action={unread.length > 1 ? <button onClick={() => markNudgesRead(unread.map((n) => n.id))} className="inline-flex items-center gap-1 text-sm font-medium text-primary-text"><CheckCheck className="size-4" /> Mark all read</button> : undefined}
      >
        <span className="inline-flex items-center gap-2"><BellRing className="size-5 text-primary-text" /> Nudges</span>
      </SectionTitle>

      <div className="card mt-4 overflow-hidden">
        <AnimatePresence initial={false}>
          {unread.map((n) => {
            const from = profileById(n.from_user)
            const k = KIND[n.kind]
            return (
              <motion.div key={n.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0 }} className="flex items-start gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
                {from ? <Avatar name={from.display_name} color={from.color} size="sm" className="mt-0.5" /> : <span className="mt-0.5 size-8 rounded-full bg-surface-3" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold', k.cls)}><k.icon className="size-3" /> {k.label}</span>
                    <span className="text-xs text-ink-3">{from?.display_name ?? 'Someone'} · {fmtRelative(n.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug text-ink">{n.message}</p>
                  {projectTitle(n.project_id) && <p className="mt-0.5 truncate text-xs text-ink-3">{projectTitle(n.project_id)}</p>}
                  <div className="mt-2 flex gap-2">
                    {n.link && <button onClick={() => open(n)} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-[13px] font-medium text-bg hover:opacity-90"><ArrowUpRight className="size-3.5" /> Open</button>}
                    <button onClick={() => markNudgesRead([n.id])} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[13px] font-medium text-ink-2 hover:border-line-strong hover:text-ink"><Check className="size-3.5" /> Got it</button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {earlier.length > 0 && (
          <div className={cn(unread.length > 0 && 'border-t border-line')}>
            {variant === 'top' && (
              <button onClick={() => setShowEarlier((s) => !s)} className="flex w-full items-center justify-between px-4 py-2.5 text-[13px] text-ink-2 hover:bg-surface-2/60">
                <span>{showEarlier ? 'Hide earlier' : `Earlier · ${earlier.length}`}</span>
                <ChevronDown className={cn('size-4 transition-transform', showEarlier && 'rotate-180')} />
              </button>
            )}
            <AnimatePresence initial={false}>
              {showEarlier && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {earlier.map((n, i) => {
                    const mine = n.from_user === userId
                    const from = profileById(n.from_user)
                    const to = profileById(n.to_user)
                    const k = KIND[n.kind]
                    return (
                      <li key={n.id} className={cn('flex items-center gap-3 px-4 py-2.5 text-[13px]', (variant === 'top' || i > 0) && 'border-t border-line')}>
                        <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', k.cls)}><k.icon className="size-3" /></span>
                        <button onClick={() => n.link && navigate(n.link)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-ink-2"><span className="font-medium text-ink">{mine ? `You → ${to?.display_name ?? 'everyone'}` : from?.display_name ?? 'Someone'}</span> · {n.message}</span>
                          <span className="block text-xs text-ink-3">{projectTitle(n.project_id) ? `${projectTitle(n.project_id)} · ` : ''}{fmtRelative(n.created_at)}</span>
                        </button>
                        <button onClick={() => deleteNudge(n.id)} aria-label="Remove" className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"><X className="size-4" /></button>
                      </li>
                    )
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  )
}
