import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, CheckCircle2, ImageOff } from 'lucide-react'
import type { Expense, Project, Quote, Task } from '../../data/types'
import { useMediaUrl } from '../../data/hooks'
import { useCalm } from '../../store/ui'
import { projectCosts } from '../../lib/xp'
import { cn, daysUntil, money } from '../../lib/utils'
import { BudgetBar, StatusPill } from '../ui/Bits'
import { BlockerChip } from './Blocker'

export function CoverImage({ path, alt, className, accent }: { path: string | null; alt: string; className?: string; accent?: string }) {
  const url = useMediaUrl(path)
  const calm = useCalm()
  if (!path) {
    return (
      <div className={cn('grid place-items-center bg-surface-2 text-ink-3', className)} style={accent ? { background: `linear-gradient(135deg, ${accent}22, ${accent}55)` } : undefined}>
        <ImageOff className="size-6 opacity-60" />
      </div>
    )
  }
  return (
    // overflow-anchor: a cover that is half off the top of the screen must never be the browser's scroll anchor —
    // when the content below it changes (switching a project tab), Chrome would "keep it in place" by jumping the page.
    <div className={cn('relative overflow-hidden bg-surface-2 [overflow-anchor:none]', className)}>
      {url ? (
        <motion.img src={url} alt={alt} className="h-full w-full object-cover [overflow-anchor:none]" initial={calm ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} loading="lazy" />
      ) : (
        <div className="skeleton h-full w-full rounded-none" />
      )}
    </div>
  )
}

export function ProjectCard({ project, quotes, expenses, tasks, index = 0, compact }: { project: Project; quotes: Quote[]; expenses: Expense[]; tasks: Task[]; index?: number; compact?: boolean }) {
  const calm = useCalm()
  const costs = projectCosts(project, quotes, expenses)
  const myTasks = tasks.filter((t) => t.project_id === project.id)
  const done = myTasks.filter((t) => t.done).length
  const days = daysUntil(project.target_date)
  const over = costs.real > costs.budget && costs.budget > 0

  return (
    <motion.div
      initial={calm ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 10) * 0.05 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      className={cn('group relative', compact ? 'w-[272px] shrink-0 snap-start' : '')}
    >
      <Link to={`/projects/${project.id}`} className="card block overflow-hidden transition-shadow duration-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary">
        <div className="relative">
          <CoverImage path={project.cover_path} alt="" accent={project.accent} className={compact ? 'aspect-[16/10]' : 'aspect-[16/10]'} />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5"><StatusPill status={project.status} size="sm" /><BlockerChip project={project} compact className="shadow-sm" /></span>
            {project.status === 'done' && <span className="grid size-7 place-items-center rounded-full bg-sage text-on-dark shadow-sm"><CheckCircle2 className="size-4" /></span>}
          </div>
          <span className="absolute bottom-0 left-0 h-1 w-full" style={{ background: project.accent }} aria-hidden />
        </div>
        <div className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{project.room}{project.category ? ` · ${project.category}` : ''}</p>
          <h3 className="mt-1 line-clamp-2 text-[19px] leading-snug text-ink">{project.title}</h3>
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className={cn('font-medium tabular', over ? 'text-danger' : 'text-ink')}>{money(costs.real)}</span>
              <span className="text-ink-3 tabular">of {money(costs.budget)}</span>
            </div>
            <BudgetBar budget={costs.budget} real={costs.real} className="mt-1.5" height={6} />
          </div>
          <div className="mt-3 flex items-center justify-between text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-ink-3" /> {myTasks.length ? `${done}/${myTasks.length} tasks` : 'No tasks yet'}
            </span>
            {project.target_date && project.status !== 'done' && (
              <span className={cn('inline-flex items-center gap-1.5', days !== null && days < 0 ? 'text-danger' : days !== null && days <= 7 ? 'text-ochre-text' : '')}>
                <CalendarDays className="size-3.5" /> {days === null ? '' : days < 0 ? `${-days}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
              </span>
            )}
            {project.status === 'done' && <span className="text-sage-text">Completed</span>}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
