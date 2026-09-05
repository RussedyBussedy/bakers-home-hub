import { useEffect, useState } from 'react'
import { AlertOctagon } from 'lucide-react'
import type { BlockerKind, Project } from '../../data/types'
import { BLOCKERS } from '../../data/types'
import { useActions } from '../../data/hooks'
import { cn, daysUntil, fmtDate } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

export const blockerLabel = (kind: BlockerKind) => BLOCKERS.find((b) => b.value === kind)?.label ?? 'Blocked'

/** How long it has been stuck, in words. */
export function blockedFor(project: Project): string {
  if (!project.blocked_since) return ''
  const days = -(daysUntil(project.blocked_since) ?? 0)
  return days <= 0 ? 'since today' : days === 1 ? 'since yesterday' : days < 14 ? `for ${days} days` : `since ${fmtDate(project.blocked_since, 'd MMM')}`
}

/** The red "Blocked · Contractor" chip. `compact` drops the note. */
export function BlockerChip({ project, compact, className, onClick }: { project: Project; compact?: boolean; className?: string; onClick?: () => void }) {
  if (!project.blocked_on) return null
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-[12px] font-semibold text-danger', onClick && 'hover:brightness-95', className)} title={project.blocked_note || undefined}>
      <AlertOctagon className="size-3.5 shrink-0" />
      <span className="truncate">Blocked · {blockerLabel(project.blocked_on)}{!compact && project.blocked_note ? ` — ${project.blocked_note}` : ''}</span>
    </Comp>
  )
}

export function BlockerSheet({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: Project }) {
  const { setBlocker } = useActions()
  const [kind, setKind] = useState<BlockerKind>(project.blocked_on ?? 'contractor')
  const [note, setNote] = useState(project.blocked_note)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setKind(project.blocked_on ?? 'contractor'); setNote(project.blocked_note) } }, [open, project.blocked_on, project.blocked_note])

  const save = async (k: BlockerKind | null) => {
    setBusy(true)
    try { await setBlocker(project.id, k, note); onOpenChange(false) } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} size="sm" title={project.blocked_on ? 'What’s it stuck on?' : 'Mark as blocked'} description={project.blocked_on ? `Blocked ${blockedFor(project)}` : 'The status stays as it is — this is a flag on top.'}
      footer={<>{project.blocked_on && <Button variant="ghost" onClick={() => save(null)} loading={busy} className="mr-auto">Unblock</Button>}<Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => save(kind)} loading={busy}>{project.blocked_on ? 'Save' : 'Mark blocked'}</Button></>}>
      <div className="flex flex-col gap-4 pt-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BLOCKERS.map((b) => (
            <button key={b.value} type="button" onClick={() => setKind(b.value)} aria-pressed={kind === b.value} className={cn('rounded-2xl border p-3 text-left transition-colors', kind === b.value ? 'border-danger bg-danger-soft' : 'border-line bg-surface hover:border-line-strong')}>
              <span className={cn('block text-[14px] font-medium', kind === b.value ? 'text-danger' : 'text-ink')}>{b.label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{b.hint}</span>
            </button>
          ))}
        </div>
        <Field label="One line on what you’re waiting for">
          {(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Waiting for Chris to confirm Monday" autoFocus={!project.blocked_on} />}
        </Field>
      </div>
    </Sheet>
  )
}
