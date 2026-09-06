import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImagePlus, X } from 'lucide-react'
import type { NewProject, Project } from '../../data/types'
import { CATEGORIES, PROJECT_STATUSES, ROOMS } from '../../data/types'
import { useCurrency } from '../../lib/currency'
import { cn, todayISO } from '../../lib/utils'
import { textOn } from '../../lib/colors'
import { Button } from '../ui/Button'
import { DateInput, Field, Input, Select, Textarea } from '../ui/Field'
import { CoverImage } from './ProjectCard'

export const ACCENTS = ['#B84D24', '#5C7C5A', '#D19A2C', '#4F7291', '#7F5A9E', '#2F7F97', '#8B6D4B', '#2E3A3F', '#C9748F', '#7A9A77']

export interface ProjectFormValue extends NewProject {
  coverFile: File | null
}

export function emptyProject(): ProjectFormValue {
  return {
    title: '', description: '', room: 'Kitchen', category: 'Renovation', status: 'idea', priority: 'medium', budget_estimate: 0,
    cover_path: null, accent: ACCENTS[0]!, start_date: null, target_date: null, completed_date: null, coverFile: null,
  }
}

export function fromProject(p: Project): ProjectFormValue {
  return {
    title: p.title, description: p.description, room: p.room, category: p.category, status: p.status, priority: p.priority,
    budget_estimate: p.budget_estimate, cover_path: p.cover_path, accent: p.accent, start_date: p.start_date, target_date: p.target_date,
    completed_date: p.completed_date, coverFile: null,
  }
}

export function ProjectFormFields({ value, onChange, errors }: { value: ProjectFormValue; onChange: (v: ProjectFormValue) => void; errors: Partial<Record<keyof ProjectFormValue, string>> }) {
  const cur = useCurrency()
  const set = <K extends keyof ProjectFormValue>(k: K, v: ProjectFormValue[K]) => onChange({ ...value, [k]: v })
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!value.coverFile) { setPreview(null); return }
    const url = URL.createObjectURL(value.coverFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [value.coverFile])
  const customRoom = !(ROOMS as readonly string[]).includes(value.room)

  return (
    <div className="flex flex-col gap-5">
      {/* Cover */}
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-ink-2">Cover photo</p>
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-2">
          {preview ? (
            <img src={preview} alt="" className="aspect-[16/9] w-full object-cover" />
          ) : value.cover_path ? (
            <CoverImage path={value.cover_path} alt="" className="aspect-[16/9]" />
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 text-ink-3 hover:text-ink">
              <ImagePlus className="size-7" />
              <span className="text-sm">Add a photo of the space</span>
            </button>
          )}
          {(preview || value.cover_path) && (
            <div className="absolute bottom-2 right-2 flex gap-2">
              <Button size="sm" variant="secondary" leading={<Camera className="size-4" />} onClick={() => fileRef.current?.click()}>Change</Button>
              <Button size="icon-sm" variant="secondary" aria-label="Remove cover" onClick={() => onChange({ ...value, coverFile: null, cover_path: null })}><X className="size-4" /></Button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) set('coverFile', f); e.target.value = '' }} />
        </div>
      </div>

      <Field label="Project name" required error={errors.title}>
        {(id) => <Input id={id} value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Kitchen cabinet refresh" invalid={Boolean(errors.title)} autoFocus />}
      </Field>

      <Field label="What's the plan?" hint="A sentence or two you'll both understand in six months.">
        {(id) => <Textarea id={id} value={value.description} onChange={(e) => set('description', e.target.value)} placeholder="Repaint the carcasses, new shaker doors, brass handles…" />}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Room">
          {(id) => (
            <Select id={id} value={customRoom ? '__custom' : value.room} onChange={(e) => set('room', e.target.value === '__custom' ? '' : e.target.value)}>
              {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="__custom">Something else…</option>
            </Select>
          )}
        </Field>
        <Field label="Type">
          {(id) => (
            <Select id={id} value={value.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
        </Field>
      </div>
      {customRoom && (
        <Field label="Room name">{(id) => <Input id={id} value={value.room} onChange={(e) => set('room', e.target.value)} placeholder="e.g. Kids' playroom" />}</Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          {(id) => (
            <Select id={id} value={value.status} onChange={(e) => {
              const status = e.target.value as ProjectFormValue['status']
              onChange({ ...value, status, completed_date: status === 'done' ? value.completed_date ?? todayISO() : value.completed_date, start_date: status === 'in_progress' && !value.start_date ? todayISO() : value.start_date })
            }}>
              {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Priority">
          {(id) => (
            <Select id={id} value={value.priority} onChange={(e) => set('priority', e.target.value as ProjectFormValue['priority'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          )}
        </Field>
      </div>

      <Field label="Budget estimate" hint="Your honest guess. Real quotes and expenses get tracked against it." error={errors.budget_estimate}>
        {(id) => <Input id={id} prefix={cur.symbol} inputMode="decimal" value={value.budget_estimate || ''} onChange={(e) => set('budget_estimate', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} placeholder="0" />}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">{(id) => <DateInput id={id} value={value.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />}</Field>
        <Field label="Target finish">{(id) => <DateInput id={id} value={value.target_date ?? ''} onChange={(e) => set('target_date', e.target.value || null)} />}</Field>
      </div>
      {value.status === 'done' && (
        <Field label="Completed on">{(id) => <DateInput id={id} value={value.completed_date ?? ''} onChange={(e) => set('completed_date', e.target.value || null)} />}</Field>
      )}

      <div>
        <p className="mb-2 text-[13px] font-medium text-ink-2">Accent colour</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((c) => (
            <button key={c} type="button" onClick={() => set('accent', c)} aria-label={`Accent ${c}`} aria-pressed={value.accent === c}
              className={cn('grid size-9 place-items-center rounded-full transition-transform hover:scale-110', value.accent === c && 'ring-2 ring-offset-2 ring-offset-surface ring-ink')} style={{ background: c }}>
              {value.accent === c && <Check className="size-4" style={{ color: textOn(c) }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function validateProject(v: ProjectFormValue) {
  const errors: Partial<Record<keyof ProjectFormValue, string>> = {}
  if (!v.title.trim()) errors.title = 'Give the project a name.'
  if (v.budget_estimate < 0) errors.budget_estimate = 'Budget can’t be negative.'
  return errors
}
