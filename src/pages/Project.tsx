import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertOctagon, BellRing, CalendarDays, Camera, ChevronDown, Expand, FileText, HardHat, Link2, ListChecks, MoreHorizontal, Palette, Pencil, Sparkles, Tag, Trash2, Wallet, Zap } from 'lucide-react'
import { BlockerChip, BlockerSheet, blockedFor } from '../components/project/Blocker'
import { SiteVisitsCard, lastVisitLine } from '../components/project/SiteVisits'
import { useNudge } from '../components/nudges/NudgeSheet'
import { absoluteUrl, copyText } from '../lib/share'
import { useCalm, useUi } from '../store/ui'
import { Page } from '../components/layout/AppShell'
import { useActions, useBoardItems, useEverything, useProject } from '../data/hooks'
import { useAuth } from '../data/session'
import { PROJECT_STATUSES, type ProjectStatus } from '../data/types'
import { XP_RULES, projectCosts, quoteExpiry } from '../lib/xp'
import { onBoard, priced, pricedTotal } from '../lib/board'
import { cn, daysUntil, fmtRelative, money, pluralise } from '../lib/utils'
import { CoverImage } from '../components/project/ProjectCard'
import { ProjectFormFields, fromProject, validateProject, type ProjectFormValue } from '../components/project/ProjectForm'
import { MoneyPanel } from '../components/project/MoneyPanel'
import { PricesPanel } from '../components/project/PricesPanel'
import { PhotosPanel } from '../components/project/PhotosPanel'
import { TasksPanel } from '../components/project/TasksPanel'
import { Timeline } from '../components/project/Timeline'
import { BoardPreview } from '../components/board/BoardPreview'
import { Avatar, BudgetBar, Money, ProgressRing, Reveal, Skeleton } from '../components/ui/Bits'
import { Button, IconButton } from '../components/ui/Button'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../components/ui/Menu'
import { Sheet, useConfirm } from '../components/ui/Sheet'

type Tab = 'overview' | 'board' | 'money' | 'prices' | 'photos' | 'tasks'
const TABS: { value: Tab; label: string; icon: typeof Wallet }[] = [
  { value: 'overview', label: 'Overview', icon: Sparkles },
  { value: 'board', label: 'Board', icon: Palette },
  // Prices comes first: you price things up long before there is a quote to file against them.
  { value: 'prices', label: 'Prices', icon: Tag },
  { value: 'money', label: 'Money', icon: Wallet },
  { value: 'photos', label: 'Photos', icon: Camera },
  { value: 'tasks', label: 'Tasks', icon: ListChecks },
]
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.value === v)

export default function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { project, isPending } = useProject(id)
  const data = useEverything()
  const board = useBoardItems(id)
  const { updateProject, deleteProject, setBlocker } = useActions()
  const { profileById, partner } = useAuth()
  const calm = useCalm()
  const confirm = useConfirm()
  const nudge = useNudge()
  const toast = useUi((s) => s.toast)
  const [params, setParams] = useSearchParams()
  const paramTab = params.get('tab')
  const [tab, setTab] = useState<Tab>(isTab(paramTab) ? paramTab : (location.state as { tab?: Tab } | null)?.tab ?? 'overview')
  const [editOpen, setEditOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  // Links from nudges arrive as /projects/:id?tab=tasks — follow them, then tidy the URL.
  useEffect(() => { if (isTab(paramTab)) { setTab(paramTab); setParams({}, { replace: true }) } }, [paramTab, setParams])
  // Switching tabs while scrolled past the tab bar: bring the bar to the top so the new tab starts in view,
  // instead of leaving the browser to pick a scroll position from whatever content happened to be there.
  const tabsTop = useRef<HTMLDivElement>(null)
  const firstTab = useRef(true)
  useLayoutEffect(() => {
    if (firstTab.current) { firstTab.current = false; return }
    const el = tabsTop.current
    if (!el) return
    const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY)
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
  }, [tab])

  const quotes = useMemo(() => data.quotes.filter((q) => q.project_id === id), [data.quotes, id])
  const expenses = useMemo(() => data.expenses.filter((e) => e.project_id === id), [data.expenses, id])
  const tasks = useMemo(() => data.tasks.filter((t) => t.project_id === id), [data.tasks, id])
  const images = useMemo(() => data.images.filter((i) => i.project_id === id), [data.images, id])
  const xp = useMemo(() => data.xp.filter((e) => e.project_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)), [data.xp, id])
  const visits = useMemo(() => data.visits.filter((v) => v.project_id === id), [data.visits, id])
  const allPins = useMemo(() => board.data ?? [], [board.data])
  // The price list and the board share one set of items; some are priced but deliberately not pinned.
  const items = useMemo(() => onBoard(allPins), [allPins])
  const pricedPins = useMemo(() => priced(allPins), [allPins])

  if (isPending || data.loading) return <ProjectSkeleton />
  if (!project) {
    return (
      <Page title="Project not found" back>
        <p className="text-ink-2">It may have been deleted on the other phone.</p>
      </Page>
    )
  }

  const costs = projectCosts(project, quotes, expenses)
  const doneTasks = tasks.filter((t) => t.done).length
  const days = daysUntil(project.target_date)
  const creator = profileById(project.created_by)
  const lastVisit = lastVisitLine(visits, data.contacts)
  const showVisits = visits.length > 0 || project.status === 'in_progress' || project.status === 'planning'
  const quoteContactIds = [...quotes].sort((a, b) => (a.status === 'accepted' || a.status === 'paid' ? -1 : 0) - (b.status === 'accepted' || b.status === 'paid' ? -1 : 0)).map((q) => q.contact_id).filter((c): c is string => Boolean(c))
  const expiredQuotes = quotes.filter((q) => quoteExpiry(q).expired).length

  const setStatus = (s: ProjectStatus) => updateProject(project.id, { status: s })

  const remove = async () => {
    if (await confirm({ title: `Delete “${project.title}”?`, description: 'Photos, quotes, tasks and the board go with it. This can’t be undone.', confirmLabel: 'Delete project', danger: true })) {
      await deleteProject(project.id)
      navigate('/projects', { replace: true })
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      {/* Hero */}
      <motion.div className="relative" initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        {/* The hero sizes to its text: the buttons row sits at the top and the title block at the bottom, in normal flow,
            so a long title or a blocker note can never climb up over the Nudge / Edit buttons (it did on phones). */}
        <div className="relative flex min-h-[max(200px,min(46vw,58dvh))] flex-col overflow-hidden bg-surface-2 [overflow-anchor:none] lg:mx-10 lg:mt-6 lg:min-h-[min(380px,58dvh)] lg:rounded-[32px]">
          <div className="absolute inset-0"><CoverImage path={project.cover_path} alt="" accent={project.accent} className="h-full w-full" /></div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1e1a16]/85 via-[#1e1a16]/25 to-transparent" />
          <div className="relative z-10 flex items-center justify-between p-3 safe-top sm:p-4">
            <button onClick={() => navigate(-1)} className="glass grid size-11 place-items-center rounded-full border border-line text-ink shadow-md" aria-label="Back">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div className="flex gap-2">
              <IconButton label={`Nudge ${partner?.display_name ?? 'partner'}`} variant="secondary" className="glass border-line shadow-md" onClick={() => nudge({ project })}><BellRing className="size-5" /></IconButton>
              <Button variant="secondary" className="glass border-line shadow-md" leading={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>Edit</Button>
              <Menu trigger={<IconButton label="More" variant="secondary" className="glass border-line shadow-md"><MoreHorizontal className="size-5" /></IconButton>}>
                <MenuLabel>Move to</MenuLabel>
                {PROJECT_STATUSES.map((s) => <MenuItem key={s.value} onSelect={() => setStatus(s.value)} disabled={project.status === s.value}>{s.label}</MenuItem>)}
                <MenuSeparator />
                <MenuItem icon={<AlertOctagon />} onSelect={() => setBlockOpen(true)}>{project.blocked_on ? 'Change what it’s blocked on…' : 'Mark as blocked…'}</MenuItem>
                {project.blocked_on && <MenuItem onSelect={() => setBlocker(project.id, null)}>Unblock</MenuItem>}
                <MenuItem icon={<BellRing />} onSelect={() => nudge({ project })}>Nudge {partner?.display_name ?? 'partner'}…</MenuItem>
                <MenuItem icon={<Link2 />} onSelect={async () => { if (await copyText(absoluteUrl(`/projects/${project.id}`))) toast({ title: 'Link copied', tone: 'success' }) }}>Copy link</MenuItem>
                <MenuItem icon={<Expand />} onSelect={() => navigate(`/projects/${project.id}/board`)}>Open the board</MenuItem>
                <MenuItem danger icon={<Trash2 />} onSelect={remove}>Delete project</MenuItem>
              </Menu>
            </div>
          </div>
          {/* In a phone-landscape hero only the chips and title fit — the rest is repeated below anyway. */}
          <div className="relative mt-auto p-4 pb-9 pt-5 text-[#F6F1E9] sm:p-6 sm:pb-12 sm:pt-8 short:pb-9">
            <div className="flex flex-wrap items-center gap-2">
              <Menu trigger={<button className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#F6F1E9]/25 px-3 text-xs font-medium hover:bg-[#F6F1E9]/40"><StatusDot status={project.status} />{PROJECT_STATUSES.find((s) => s.value === project.status)?.label} <ChevronDown className="size-3.5" /></button>} align="start">
                <MenuLabel>Move to</MenuLabel>
                {PROJECT_STATUSES.map((s) => <MenuItem key={s.value} onSelect={() => setStatus(s.value)} disabled={project.status === s.value}>{s.label}</MenuItem>)}
              </Menu>
              <span className="text-xs text-[#F6F1E9]/80">{project.room}{project.category ? ` · ${project.category}` : ''}</span>
              {project.priority === 'high' && <span className="rounded-full bg-[#C4552B] px-2 py-0.5 text-[11px] font-semibold">High priority</span>}
              {project.blocked_on && <BlockerChip project={project} compact onClick={() => setBlockOpen(true)} className="bg-[#F6F1E9] text-danger" />}
            </div>
            <h1 className="mt-2 max-w-3xl text-[30px] leading-[1.05] text-[#F6F1E9] sm:text-[42px] short:text-[26px]">{project.title}</h1>
            {/* Plain wrapping text (not a flex row) so a long line breaks naturally on a phone. */}
            {creator && <p className="mt-2 text-xs leading-5 text-[#F6F1E9]/75 short:hidden"><span className="mr-1.5 inline-block align-middle"><Avatar name={creator.display_name} color={creator.color} size="xs" /></span>Started by {creator.display_name} · updated {fmtRelative(project.updated_at)}{lastVisit ? <> · <HardHat className="inline size-3.5 align-[-2px]" /> {lastVisit}</> : null}</p>}
            {project.blocked_on && project.blocked_note && <p className="mt-1.5 max-w-2xl text-[13px] text-[#F6F1E9]/85 short:hidden"><AlertOctagon className="mr-1 inline size-3.5 align-[-2px] text-[#F6C7B8]" />{project.blocked_note} <span className="text-[#F6F1E9]/60">· {blockedFor(project)}</span></p>}
          </div>
        </div>
      </motion.div>

      <div className="px-4 sm:px-6 lg:px-10">
        {/* Stats */}
        <div className="relative z-10 -mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:-mt-8">
          {[
            { label: 'Budget', value: <Money value={costs.budget} />, hint: 'your estimate' },
            { label: 'Real cost', value: <Money value={costs.real} />, hint: `${pluralise(quotes.length, 'quote')} · ${pluralise(expenses.length, 'expense')}`, danger: costs.real > costs.budget && costs.budget > 0 },
            { label: costs.variance >= 0 ? 'Headroom' : 'Over by', value: <Money value={Math.abs(costs.variance)} />, hint: costs.budget ? `${Math.round((costs.real / costs.budget) * 100)}% of budget used` : 'no budget set', danger: costs.variance < 0 },
            { label: 'Timeline', value: project.status === 'done' ? 'Done' : days === null ? '—' : days < 0 ? `${-days}d late` : `${days}d`, hint: project.status === 'done' ? 'completed' : project.target_date ? 'to target date' : 'no target set', danger: days !== null && days < 0 && project.status !== 'done' },
          ].map((s, i) => (
            <Reveal key={s.label} index={i}>
              <div className="card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{s.label}</p>
                <p className={cn('mt-1 font-display-tight text-2xl leading-none tabular sm:text-[28px]', s.danger ? 'text-danger' : 'text-ink')}>{s.value}</p>
                <p className="mt-1 truncate text-[12px] text-ink-3">{s.hint}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Tabs */}
        <div ref={tabsTop} aria-hidden className="mt-6" />
        <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div role="tablist" className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map((t) => {
              const active = tab === t.value
              const count = t.value === 'prices' ? pricedPins.length : t.value === 'board' ? items.length : t.value === 'photos' ? images.length : t.value === 'tasks' ? tasks.length : t.value === 'money' ? quotes.length + expenses.length : 0
              return (
                <button key={t.value} role="tab" aria-selected={active} onClick={() => setTab(t.value)} className={cn('relative flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors', active ? 'text-ink' : 'text-ink-2 hover:text-ink')}>
                  {active && <motion.span layoutId="project-tab" className="absolute inset-0 rounded-full bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <t.icon className={cn('relative size-4', active ? 'text-primary-text' : 'text-ink-3')} />
                  <span className="relative">{t.label}</span>
                  {count > 0 && <span className={cn('relative rounded-full px-1.5 text-[11px] tabular', active ? 'bg-primary-soft text-primary-text' : 'bg-surface-3 text-ink-2')}>{count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        <motion.div key={tab} className="mt-4 pb-8 [overflow-anchor:none]" initial={calm ? false : { opacity: 0.3, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
          {tab === 'overview' && (
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-6">
                <div className="card p-5">
                  <h2 className="text-xl">The plan</h2>
                  <p className={cn('mt-2 whitespace-pre-wrap text-[15px] leading-relaxed', project.description ? 'text-ink-2' : 'text-ink-3 italic')}>{project.description || 'No description yet — tap Edit to add one.'}</p>
                </div>
                <div className="card p-5">
                  <div className="flex items-center justify-between"><h2 className="text-xl">Timeline</h2>{project.target_date && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><CalendarDays className="size-3.5" /> target {project.target_date}</span>}</div>
                  <Timeline project={project} className="mt-4" />
                </div>
                {showVisits && <SiteVisitsCard project={project} visits={visits} contacts={data.contacts} quoteContactIds={quoteContactIds} />}
                <button onClick={() => navigate(`/projects/${project.id}/board`)} className="card card-hover group overflow-hidden text-left">
                  <div className="flex items-center justify-between p-4 pb-2">
                    <div><h2 className="text-xl">Inspiration board</h2><p className="text-[13px] text-ink-3">{items.length === 0 ? 'Start pinning ideas' : `${pluralise(items.length, 'pin')} · tap to open`}</p></div>
                    <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors group-hover:bg-primary-soft group-hover:text-primary-text"><Expand className="size-5" /></span>
                  </div>
                  <BoardPreview items={items} height={220} className="mx-4 mb-4" />
                </button>
              </div>
              <div className="flex min-w-0 flex-col gap-6">
                <div className="card flex items-center gap-5 p-5">
                  <ProgressRing value={costs.budget ? Math.min(1, costs.real / costs.budget) : 0} size={104} stroke={10} color={costs.real > costs.budget && costs.budget > 0 ? 'var(--danger)' : 'var(--sage)'}>
                    <div className="text-center"><p className="font-display-tight text-xl tabular text-ink">{costs.budget ? `${Math.round((costs.real / costs.budget) * 100)}%` : '—'}</p><p className="text-[10px] uppercase tracking-wider text-ink-3">of budget</p></div>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Money</p>
                    <p className="font-display-tight text-2xl text-ink tabular">{money(costs.real)}</p>
                    <p className="text-[13px] text-ink-2">of {money(costs.budget)} budget</p>
                    <BudgetBar budget={costs.budget} real={costs.real} className="mt-2" height={6} />
                    <button onClick={() => setTab('money')} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-text"><FileText className="size-4" /> {quotes.length ? `${pluralise(quotes.length, 'quote')} filed` : 'File the first quote'}</button>
                    {expiredQuotes > 0 && <p className="mt-1 text-[12px] font-medium text-danger">{pluralise(expiredQuotes, 'quote has', 'quotes have')} expired — ask for a fresh price.</p>}
                  </div>
                </div>
                <div className="card p-5">
                  <div className="flex items-center justify-between"><h2 className="text-xl">Tasks</h2><button onClick={() => setTab('tasks')} className="text-sm font-medium text-primary-text">{tasks.length ? 'See all' : 'Add tasks'}</button></div>
                  {tasks.length > 0 ? (
                    <>
                      <p className="mt-1 text-[13px] text-ink-2">{doneTasks} of {tasks.length} done</p>
                      <BudgetBar budget={tasks.length} real={doneTasks} className="mt-2" height={8} />
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {tasks.filter((t) => !t.done).slice(0, 3).map((t) => <li key={t.id} className="flex items-center gap-2 text-[14px] text-ink"><span className="size-1.5 rounded-full bg-primary" /> <span className="truncate">{t.title}</span></li>)}
                      </ul>
                    </>
                  ) : <p className="mt-1 text-[13px] text-ink-3">Break it into small wins.</p>}
                </div>
                <div className="card p-5">
                  <h2 className="text-xl">Recent XP</h2>
                  {xp.length === 0 ? <p className="mt-1 text-[13px] text-ink-3">Nothing earned on this project yet.</p> : (
                    <ul className="mt-2 flex flex-col gap-2">
                      {xp.slice(0, 5).map((e) => { const who = profileById(e.user_id); return (
                        <li key={e.id} className="flex items-center gap-2 text-[13px]">
                          {who && <Avatar name={who.display_name} color={who.color} size="xs" />}
                          <span className="min-w-0 flex-1 truncate text-ink-2"><span className="font-medium text-ink">{who?.display_name}</span> · {XP_RULES[e.kind]?.label}</span>
                          <span className="inline-flex items-center gap-0.5 text-ochre-text tabular"><Zap className="size-3" />{e.points}</span>
                        </li>
                      ) })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
          {tab === 'board' && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div><h2 className="text-xl">Inspiration board</h2><p className="text-[13px] text-ink-3">{pluralise(items.length, 'pin')} · photos, colours, notes, links and products</p></div>
                <Button leading={<Expand className="size-4" />} onClick={() => navigate(`/projects/${project.id}/board`)}>Open board</Button>
              </div>
              <button className="block w-full" onClick={() => navigate(`/projects/${project.id}/board`)} aria-label="Open the board">
                <BoardPreview items={items} height={420} className="mx-4 mb-4" />
              </button>
            </div>
          )}
          {tab === 'money' && <MoneyPanel project={project} quotes={quotes} expenses={expenses} contacts={data.contacts} priced={{ count: pricedPins.length, total: pricedTotal(pricedPins), onOpen: () => setTab('prices') }} />}
          {tab === 'photos' && <PhotosPanel project={project} images={images} />}
          {tab === 'prices' && <PricesPanel project={project} items={allPins} />}
          {tab === 'tasks' && <TasksPanel project={project} tasks={tasks} />}
        </motion.div>
      </div>

      <EditProjectSheet open={editOpen} onOpenChange={setEditOpen} projectId={project.id} />
      <BlockerSheet open={blockOpen} onOpenChange={setBlockOpen} project={project} />
    </div>
  )
}

function StatusDot({ status }: { status: ProjectStatus }) {
  const color = { idea: '#8FB0D0', planning: '#E2B04F', in_progress: '#E0704A', done: '#8FB08B', on_hold: '#A99E92' }[status]
  return <span className="size-2 rounded-full" style={{ background: color }} />
}

function EditProjectSheet({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string }) {
  const { project } = useProject(projectId)
  const { updateProject, uploadFile, addImage } = useActions()
  const [value, setValue] = useState<ProjectFormValue | null>(null)
  const [errors, setErrors] = useState<ReturnType<typeof validateProject>>({})
  const [busy, setBusy] = useState(false)
  const v = value ?? (project ? fromProject(project) : null)

  const save = async () => {
    if (!v || !project) return
    const errs = validateProject(v)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const { coverFile, ...rest } = v
      let cover_path = rest.cover_path
      if (coverFile) {
        cover_path = await uploadFile(coverFile, project.id)
        void addImage({ project_id: project.id, caption: '', kind: 'space', width: null, height: null, file: coverFile })
      }
      await updateProject(project.id, { ...rest, cover_path, title: rest.title.trim() })
      onOpenChange(false)
      setValue(null)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setValue(null) }} title="Edit project" size="lg"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save changes</Button></>}>
      {v && <div className="pt-2"><ProjectFormFields value={v} onChange={setValue} errors={errors} /></div>}
    </Sheet>
  )
}

function ProjectSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <Skeleton className="h-[46vw] max-h-[min(420px,58dvh)] min-h-[200px] w-full rounded-none lg:mx-10 lg:mt-6 lg:w-auto lg:rounded-[32px]" />
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 sm:grid-cols-4 lg:px-10">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="px-4 pt-6 lg:px-10"><Skeleton className="h-64 w-full rounded-3xl" /></div>
    </div>
  )
}
