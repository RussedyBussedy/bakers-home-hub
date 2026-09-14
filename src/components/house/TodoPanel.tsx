import { useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, CalendarDays, ListChecks, Plus, Repeat, Trash2, UserRound, Users } from 'lucide-react'
import type { HouseTask } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { cn, fmtDate, todayISO } from '../../lib/utils'
import { Avatar, EmptyState, Pill, ProgressRing, Reveal } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Chip, DateInput, Input } from '../ui/Field'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu'
import { usePrompt } from '../ui/Sheet'

type Filter = 'all' | 'mine' | 'open' | 'overdue'

const REPEATS: { value: number | null; label: string }[] = [
  { value: null, label: 'One-off' },
  { value: 7, label: 'Every week' },
  { value: 14, label: 'Every 2 weeks' },
  { value: 30, label: 'Every month' },
  { value: 90, label: 'Every 3 months' },
  { value: 365, label: 'Every year' },
]

export function TodoPanel({ tasks }: { tasks: HouseTask[] }) {
  const { addHouseTask, updateHouseTask, deleteHouseTask, sendNudge } = useActions()
  const { profiles, profileById, me, partner } = useAuth()
  const prompt = usePrompt()

  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [repeat, setRepeat] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)

  const today = todayISO()
  const open = useMemo(() => tasks.filter((t) => !t.done).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.sort_order - b.sort_order), [tasks])
  const done = useMemo(() => tasks.filter((t) => t.done).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')), [tasks])
  const overdue = useMemo(() => open.filter((t) => t.due_date && t.due_date < today), [open, today])

  const shown = useMemo(() => {
    if (filter === 'mine') return open.filter((t) => t.assigned_to === me?.id)
    if (filter === 'open') return open.filter((t) => !t.assigned_to)
    if (filter === 'overdue') return overdue
    return open
  }, [open, overdue, filter, me])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      await addHouseTask({ title: title.trim(), notes: '', done: false, due_date: due || null, repeat_days: repeat, assigned_to: assignee })
      setTitle(''); setDue('')
    } catch { /* toast */ } finally { setBusy(false) }
  }

  const pct = tasks.length ? done.length / tasks.length : 0

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <form onSubmit={add} className="card p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Something to do round the house — e.g. Service the pool pump" aria-label="What needs doing" className="flex-1" />
            <div className="flex min-w-0 gap-2">
              <DateInput value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
              <Menu trigger={<Button variant="secondary" size="icon" aria-label="How often" className="shrink-0"><Repeat className={cn('size-5', repeat && 'text-primary-text')} /></Button>}>
                <MenuLabel>How often</MenuLabel>
                {REPEATS.map((r) => <MenuItem key={String(r.value)} onSelect={() => setRepeat(r.value)}>{r.label}{repeat === r.value ? ' ✓' : ''}</MenuItem>)}
              </Menu>
              <Menu trigger={<Button variant="secondary" size="icon" aria-label="Whose job" className="shrink-0">{assignee ? <Avatar name={profileById(assignee)?.display_name ?? ''} color={profileById(assignee)?.color ?? '#999'} size="sm" /> : <Users className="size-5" />}</Button>}>
                <MenuLabel>Whose job</MenuLabel>
                <MenuItem icon={<Users />} onSelect={() => setAssignee(null)}>Either of us{assignee === null ? ' ✓' : ''}</MenuItem>
                {profiles.map((p) => <MenuItem key={p.id} icon={<Avatar name={p.display_name} color={p.color} size="xs" />} onSelect={() => setAssignee(p.id)}>{p.display_name}{assignee === p.id ? ' ✓' : ''}</MenuItem>)}
              </Menu>
              <Button type="submit" leading={<Plus className="size-4" />} loading={busy} disabled={!title.trim()} className="shrink-0">Add</Button>
            </div>
          </div>
          {(assignee || repeat) && (
            <p className="mt-2 text-xs text-ink-3">
              {assignee ? `For ${profileById(assignee)?.display_name}` : 'For either of you'}
              {repeat ? ` · comes back ${REPEATS.find((r) => r.value === repeat)?.label.toLowerCase()}` : ''}
            </p>
          )}
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Everything <span className="tabular opacity-70">{open.length}</span></Chip>
          <Chip active={filter === 'mine'} onClick={() => setFilter('mine')}>Mine <span className="tabular opacity-70">{open.filter((t) => t.assigned_to === me?.id).length}</span></Chip>
          <Chip active={filter === 'open'} onClick={() => setFilter('open')}>Up for grabs <span className="tabular opacity-70">{open.filter((t) => !t.assigned_to).length}</span></Chip>
          {overdue.length > 0 && <Chip active={filter === 'overdue'} onClick={() => setFilter('overdue')} className={cn(filter !== 'overdue' && 'border-danger/40 text-danger')}>Overdue <span className="tabular opacity-70">{overdue.length}</span></Chip>}
        </div>

        <Reveal className="card mt-3 divide-y divide-line">
          {tasks.length === 0 ? (
            <EmptyState icon={<ListChecks />} title="Nothing on the list" description="The jobs that aren't a project — the gutters, the pool pump, the licence renewal. Each one ticked is 8 XP." />
          ) : shown.length === 0 ? (
            <EmptyState compact icon={<ListChecks />} title="Nothing here" description="Nothing matches this filter." />
          ) : (
            <AnimatePresence initial={false}>
              {shown.map((t) => <Row key={t.id} task={t} onToggle={(v) => updateHouseTask(t.id, { done: v })} onAssign={(id) => updateHouseTask(t.id, { assigned_to: id })} onRepeat={(d) => updateHouseTask(t.id, { repeat_days: d })} onDelete={() => deleteHouseTask(t.id)} onDue={async () => {
                const d = await prompt({ title: 'When by?', type: 'date', initial: t.due_date ?? '', confirmLabel: 'Set date' })
                if (d !== null) updateHouseTask(t.id, { due_date: d || null })
              }} onNudge={partner ? () => sendNudge({ to_user: partner.id, kind: 'todo', message: t.title, link: '/house?tab=todo' }) : undefined} partnerName={partner?.display_name} />)}
            </AnimatePresence>
          )}
        </Reveal>

        {done.length > 0 && (
          <div className="card mt-4 overflow-hidden">
            <p className="border-b border-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Done</p>
            <div className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {done.slice(0, 12).map((t) => <Row key={t.id} task={t} onToggle={(v) => updateHouseTask(t.id, { done: v })} onAssign={(id) => updateHouseTask(t.id, { assigned_to: id })} onRepeat={(d) => updateHouseTask(t.id, { repeat_days: d })} onDelete={() => deleteHouseTask(t.id)} />)}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <aside className="card flex h-fit flex-col items-center p-5 text-center lg:sticky lg:top-6">
        <ProgressRing value={pct} size={128} stroke={10} color="var(--sage)">
          <div>
            <p className="font-display-tight text-3xl text-ink tabular">{Math.round(pct * 100)}%</p>
            <p className="text-xs text-ink-3">done</p>
          </div>
        </ProgressRing>
        <p className="mt-3 text-sm text-ink-2">{done.length} of {tasks.length} ticked off</p>
        {overdue.length > 0 && <p className="mt-1 text-sm font-medium text-danger">{overdue.length} overdue</p>}
        <div className="mt-4 w-full space-y-2">
          {profiles.map((p) => {
            const mine = tasks.filter((t) => t.assigned_to === p.id)
            const d = mine.filter((t) => t.done).length
            return (
              <div key={p.id} className="flex items-center gap-2.5 text-sm">
                <Avatar name={p.display_name} color={p.color} size="xs" />
                <span className="flex-1 truncate text-left text-ink-2">{p.display_name}</span>
                <span className="tabular text-ink">{d}/{mine.length}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-5 text-left text-[13px] leading-relaxed text-ink-3">A job set to repeat doesn’t vanish when it’s ticked — it just isn’t due again until next time.</p>
      </aside>
    </div>
  )
}

function Row({ task: t, onToggle, onAssign, onRepeat, onDelete, onDue, onNudge, partnerName }: {
  task: HouseTask
  onToggle: (v: boolean) => void
  onAssign: (id: string | null) => void
  onRepeat: (days: number | null) => void
  onDelete: () => void
  onDue?: () => void
  onNudge?: () => void
  partnerName?: string
}) {
  const { profiles, profileById } = useAuth()
  const who = profileById(t.assigned_to)
  const overdue = !t.done && t.due_date && t.due_date < todayISO()
  const repeatLabel = REPEATS.find((r) => r.value === t.repeat_days)?.label
  return (
    <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={cn('flex items-center gap-3 px-4 py-3', t.done && 'opacity-60')}>
      <Checkbox checked={t.done} onChange={onToggle} label={t.title} size="lg" />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[15px] text-ink transition-colors', t.done && 'text-ink-3 line-through')}>{t.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
          {t.due_date && <span className={cn('inline-flex items-center gap-1', overdue && 'text-danger')}><CalendarDays className="size-3.5" />{overdue ? 'Overdue · ' : ''}{fmtDate(t.due_date, 'EEE d MMM')}</span>}
          {t.repeat_days ? <span className="inline-flex items-center gap-1"><Repeat className="size-3.5" />{repeatLabel?.toLowerCase()}</span> : null}
          {t.completed_at && <span>{t.repeat_days ? 'Last done' : 'Done'} {fmtDate(t.completed_at, 'd MMM')}{t.done_by ? ` by ${profileById(t.done_by)?.display_name}` : ''}</span>}
        </div>
      </div>
      {!t.done && !who && <Pill size="sm" tone="neutral">Either</Pill>}
      <Menu trigger={<button className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface-2" aria-label={who ? `For ${who.display_name}` : 'For either of you'}>{who ? <Avatar name={who.display_name} color={who.color} size="sm" /> : <UserRound className="size-4 text-ink-3" />}</button>}>
        <MenuLabel>Whose job</MenuLabel>
        <MenuItem onSelect={() => onAssign(null)}>Either of us</MenuItem>
        {profiles.map((p) => <MenuItem key={p.id} icon={<Avatar name={p.display_name} color={p.color} size="xs" />} onSelect={() => onAssign(p.id)}>{p.display_name}</MenuItem>)}
        <MenuSeparator />
        {onDue && <MenuItem icon={<CalendarDays />} onSelect={onDue}>Change the date</MenuItem>}
        <MenuLabel>How often</MenuLabel>
        {REPEATS.map((r) => <MenuItem key={String(r.value)} onSelect={() => onRepeat(r.value)}>{r.label}{t.repeat_days === r.value ? ' ✓' : ''}</MenuItem>)}
        {onNudge && <><MenuSeparator /><MenuItem icon={<BellRing />} onSelect={onNudge}>Nudge {partnerName ?? 'them'} about this</MenuItem></>}
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 />} onSelect={onDelete}>Delete</MenuItem>
      </Menu>
      <IconButton label="Delete" size="icon-sm" className="hidden sm:grid" onClick={onDelete}><Trash2 className="size-4" /></IconButton>
    </motion.div>
  )
}
