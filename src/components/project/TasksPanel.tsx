import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, CalendarDays, ListChecks, Plus, Trash2, UserRound } from 'lucide-react'
import type { Project, Task } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { cn, fmtDate, todayISO } from '../../lib/utils'
import { useNudge } from '../nudges/NudgeSheet'
import { Avatar, EmptyState, ProgressRing } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { DateInput, Input } from '../ui/Field'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu'
import { usePrompt } from '../ui/Sheet'

export function TasksPanel({ project, tasks }: { project: Project; tasks: Task[] }) {
  const { createTask, updateTask, deleteTask } = useActions()
  const { profiles, profileById, partner } = useAuth()
  const nudge = useNudge()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const prompt = usePrompt()

  const open = tasks.filter((t) => !t.done).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.sort_order - b.sort_order)
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  const pct = tasks.length ? done.length / tasks.length : 0

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await createTask({ project_id: project.id, title: title.trim(), done: false, due_date: due || null, assigned_to: assignee, sort_order: tasks.length + 1 })
      setTitle(''); setDue('')
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <form onSubmit={add} className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task — e.g. Prime the carcasses" aria-label="New task" className="flex-1" />
          <div className="flex gap-2">
            <DateInput value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="w-40" />
            <Menu trigger={<Button variant="secondary" size="icon" aria-label="Assign to"><UserRound className="size-5" /></Button>}>
              <MenuLabel>Assign to</MenuLabel>
              <MenuItem onSelect={() => setAssignee(null)}>Nobody yet</MenuItem>
              {profiles.map((p) => <MenuItem key={p.id} icon={<Avatar name={p.display_name} color={p.color} size="xs" />} onSelect={() => setAssignee(p.id)}>{p.display_name}{assignee === p.id ? ' ✓' : ''}</MenuItem>)}
            </Menu>
            <Button type="submit" leading={<Plus className="size-4" />} loading={busy} disabled={!title.trim()}>Add</Button>
          </div>
        </form>
        {assignee && <p className="mt-2 text-xs text-ink-3">New tasks will be assigned to {profileById(assignee)?.display_name}.</p>}

        <div className="card mt-4 divide-y divide-line">
          {tasks.length === 0 ? (
            <EmptyState compact icon={<ListChecks />} title="No tasks yet" description="Break the project into small wins. Each one ticked earns 10 XP." />
          ) : (
            <AnimatePresence initial={false}>
              {[...open, ...done].map((t) => {
                const who = profileById(t.assigned_to)
                const overdue = !t.done && t.due_date && t.due_date < todayISO()
                return (
                  <motion.div key={t.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={cn('flex items-center gap-3 px-4 py-3', t.done && 'opacity-70')}>
                    <Checkbox checked={t.done} onChange={(v) => updateTask(t.id, { done: v })} label={t.title} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[15px] text-ink transition-colors', t.done && 'text-ink-3 line-through')}>{t.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                        {t.due_date && <span className={cn('inline-flex items-center gap-1', overdue && 'text-danger')}><CalendarDays className="size-3.5" /> {overdue ? 'Overdue · ' : ''}{fmtDate(t.due_date, 'EEE d MMM')}</span>}
                        {t.done && t.completed_at && <span>Done {fmtDate(t.completed_at, 'd MMM')}</span>}
                      </div>
                    </div>
                    <Menu trigger={<button className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Assign">{who ? <Avatar name={who.display_name} color={who.color} size="sm" /> : <UserRound className="size-4 text-ink-3" />}</button>}>
                      <MenuLabel>Assign to</MenuLabel>
                      <MenuItem onSelect={() => updateTask(t.id, { assigned_to: null })}>Nobody</MenuItem>
                      {profiles.map((p) => <MenuItem key={p.id} icon={<Avatar name={p.display_name} color={p.color} size="xs" />} onSelect={() => updateTask(t.id, { assigned_to: p.id })}>{p.display_name}</MenuItem>)}
                      <MenuSeparator />
                      <MenuItem icon={<BellRing />} onSelect={() => nudge({ project, task: t, link: `/projects/${project.id}?tab=tasks` })}>{t.done ? `Tell ${partner?.display_name ?? 'partner'} it’s done` : `Nudge ${partner?.display_name ?? 'partner'} about this`}</MenuItem>
                      <MenuItem onSelect={async () => { const d = await prompt({ title: 'Due date', type: 'date', initial: t.due_date ?? '', confirmLabel: 'Set date' }); if (d !== null) updateTask(t.id, { due_date: d || null }) }}>Change due date</MenuItem>
                      <MenuItem danger icon={<Trash2 />} onSelect={() => deleteTask(t.id)}>Delete</MenuItem>
                    </Menu>
                    <IconButton label="Delete task" size="icon-sm" className="hidden sm:grid" onClick={() => deleteTask(t.id)}><Trash2 className="size-4" /></IconButton>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
      <aside className="card flex flex-col items-center p-5 text-center lg:sticky lg:top-6 lg:self-start">
        <ProgressRing value={pct} size={128} stroke={10} color="var(--sage)">
          <div>
            <p className="font-display-tight text-3xl text-ink tabular">{Math.round(pct * 100)}%</p>
            <p className="text-xs text-ink-3">done</p>
          </div>
        </ProgressRing>
        <p className="mt-3 text-sm text-ink-2">{done.length} of {tasks.length} tasks ticked</p>
        {profiles.length > 1 && (
          <div className="mt-4 flex w-full flex-col gap-2">
            {profiles.map((p) => {
              const mine = tasks.filter((t) => t.assigned_to === p.id)
              const d = mine.filter((t) => t.done).length
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <Avatar name={p.display_name} color={p.color} size="xs" />
                  <span className="flex-1 text-left text-ink-2">{p.display_name}</span>
                  <span className="tabular text-ink">{d}/{mine.length}</span>
                </div>
              )
            })}
          </div>
        )}
      </aside>
    </div>
  )
}
