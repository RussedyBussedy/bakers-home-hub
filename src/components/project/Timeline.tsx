import { motion } from 'framer-motion'
import { differenceInCalendarDays } from 'date-fns'
import type { Project } from '../../data/types'
import { cn, fmtDate, toDate } from '../../lib/utils'

export function Timeline({ project, className }: { project: Project; className?: string }) {
  const start = toDate(project.start_date) ?? toDate(project.created_at)!
  const target = toDate(project.target_date)
  const completed = toDate(project.completed_date)
  const today = new Date()
  const end = completed && (!target || completed > target) ? completed : target ?? (today > start ? today : start)
  const span = Math.max(1, differenceInCalendarDays(end, start))
  const pos = (d: Date) => Math.min(1, Math.max(0, differenceInCalendarDays(d, start) / span))
  const todayPos = pos(today)
  const progress = completed ? 1 : todayPos
  const overdue = !completed && target && today > target

  return (
    <div className={cn('', className)}>
      <div className="relative h-16 pt-2">
        <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-surface-3" />
        <motion.div className={cn('absolute left-0 top-6 h-2 rounded-full', completed ? 'bg-sage' : overdue ? 'bg-danger' : 'bg-primary')} initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
        <Marker at={0} label="Start" date={project.start_date ?? project.created_at} tone="ink" />
        {target && <Marker at={pos(target)} label="Target" date={project.target_date} tone={overdue ? 'danger' : 'ochre'} bottom />}
        {/* A marker sitting on top of "Start" takes the lower label row so the two don't print over each other. */}
        {completed ? (
          <Marker at={pos(completed)} label="Done" date={project.completed_date} tone="sage" bottom={pos(completed) < 0.12} />
        ) : (
          today >= start && <Marker at={todayPos} label="Today" tone="primary" pulse bottom={todayPos < 0.12} />
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">
        {completed
          ? `Finished ${fmtDate(project.completed_date)}${target ? (completed <= target ? ' — on time' : ` — ${differenceInCalendarDays(completed, target)} days late`) : ''}`
          : target
            ? overdue ? `${differenceInCalendarDays(today, target)} days past target` : `${differenceInCalendarDays(target, today)} days to target`
            : 'No target date set'}
      </p>
    </div>
  )
}

function Marker({ at, label, date, tone, bottom, pulse }: { at: number; label: string; date?: string | null; tone: 'ink' | 'ochre' | 'sage' | 'primary' | 'danger'; bottom?: boolean; pulse?: boolean }) {
  const color = { ink: 'var(--ink)', ochre: 'var(--ochre)', sage: 'var(--sage)', primary: 'var(--primary)', danger: 'var(--danger)' }[tone]
  const edge = at < 0.12 ? 'start' : at > 0.88 ? 'end' : 'center'
  const text = `${label}${date ? ` · ${fmtDate(date, 'd MMM')}` : ''}`
  const labelEl = (
    <span className={cn('absolute whitespace-nowrap text-[11px] font-medium text-ink-2', bottom ? 'top-[22px]' : '-top-[18px]', edge === 'start' ? 'left-0' : edge === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2')}>{text}</span>
  )
  return (
    <div className="absolute top-[20px]" style={{ left: `${at * 100}%`, transform: 'translateX(-50%)' }}>
      <span className="relative grid size-4 place-items-center">
        {pulse && <span className="absolute inset-0 animate-ping rounded-full opacity-40" style={{ background: color }} />}
        <span className="size-4 rounded-full border-[3px] border-surface shadow-sm" style={{ background: color }} />
        {labelEl}
      </span>
    </div>
  )
}
