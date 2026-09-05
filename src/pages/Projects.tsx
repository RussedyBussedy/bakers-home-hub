import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, Plus, Search } from 'lucide-react'
import { Page } from '../components/layout/AppShell'
import { useEverything } from '../data/hooks'
import { PROJECT_STATUSES, type ProjectStatus } from '../data/types'
import { ProjectCard } from '../components/project/ProjectCard'
import { EmptyState, Skeleton } from '../components/ui/Bits'
import { Button } from '../components/ui/Button'
import { Chip, Input } from '../components/ui/Field'

type Filter = 'all' | 'live' | ProjectStatus | 'blocked'

export default function ProjectsPage() {
  const data = useEverything()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return data.projects
      .filter((p) => (filter === 'all' ? true : filter === 'live' ? p.status === 'in_progress' || p.status === 'planning' : filter === 'blocked' ? Boolean(p.blocked_on) : p.status === filter))
      .filter((p) => !needle || `${p.title} ${p.room} ${p.category} ${p.description}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const order: Record<ProjectStatus, number> = { in_progress: 0, planning: 1, idea: 2, on_hold: 3, done: 4 }
        return order[a.status] - order[b.status] || b.updated_at.localeCompare(a.updated_at)
      })
  }, [data.projects, filter, q])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.projects.length, live: data.projects.filter((p) => p.status === 'in_progress' || p.status === 'planning').length, blocked: data.projects.filter((p) => Boolean(p.blocked_on)).length }
    PROJECT_STATUSES.forEach((s) => (c[s.value] = data.projects.filter((p) => p.status === s.value).length))
    return c
  }, [data.projects])

  return (
    <Page wide title="Projects" actions={<Button leading={<Plus className="size-4" />} onClick={() => navigate('/projects/new')} className="hidden sm:inline-flex">New project</Button>}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="pl-10" aria-label="Search projects" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All · {counts.all}</Chip>
          <Chip active={filter === 'live'} onClick={() => setFilter('live')}>Live · {counts.live}</Chip>
          {counts.blocked ? <Chip active={filter === 'blocked'} onClick={() => setFilter('blocked')}>Blocked · {counts.blocked}</Chip> : null}
          {PROJECT_STATUSES.map((s) => (
            <Chip key={s.value} active={filter === s.value} onClick={() => setFilter(s.value)}>{s.label} · {counts[s.value]}</Chip>
          ))}
        </div>
      </div>

      {data.loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72 rounded-3xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon={<Compass />} title={q ? 'Nothing matches' : 'No projects here yet'} description={q ? 'Try a different word.' : 'Every great home starts with a small list. Add your first project.'} action={!q && <Button leading={<Plus className="size-4" />} onClick={() => navigate('/projects/new')}>New project</Button>} />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => <ProjectCard key={p.id} project={p} quotes={data.quotes} expenses={data.expenses} tasks={data.tasks} index={i} />)}
        </div>
      )}
    </Page>
  )
}
