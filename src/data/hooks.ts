import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useAuth, useDb } from './session'
import type {
  Achievement, BlockerKind, BoardItem, Contact, Expense, Guidance, Household, HouseTask, MeterReading, NewBoardItem, NewContact, NewExpense, NewHouseTask, NewImage,
  NewMeterReading, NewProject, NewQuote, NewShoppingItem, NewUtilityPurchase,
  Invite, NewSiteVisit, NewTask, Nudge, NudgeKind, PinStatus, Project, ProjectImage, Quote, ShoppingItem, SiteVisit, Task, Translation, Utility, UtilityPurchase, XpEvent, XpKind,
} from './types'
import { UTILITIES } from './types'
import { ACHIEVEMENTS, XP_RULES, evaluateAchievements, levelFor, projectCosts, quoteProgress, type GameSnapshot } from '../lib/xp'
import { readingDue } from '../lib/meters'
import { useUi } from '../store/ui'
import { compressImage } from '../lib/images'
import { addDays, format } from 'date-fns'
import { fmtDate, todayISO, uid } from '../lib/utils'
import { softNavigate } from '../lib/share'

export const keys = {
  projects: ['projects'] as QueryKey,
  images: ['images'] as QueryKey,
  contacts: ['contacts'] as QueryKey,
  quotes: ['quotes'] as QueryKey,
  expenses: ['expenses'] as QueryKey,
  tasks: ['tasks'] as QueryKey,
  board: (projectId: string) => ['board', projectId] as QueryKey,
  boardAll: ['board'] as QueryKey,
  xp: ['xp'] as QueryKey,
  achievements: ['achievements'] as QueryKey,
  nudges: ['nudges'] as QueryKey,
  visits: ['visits'] as QueryKey,
  invites: ['invites'] as QueryKey,
  shopping: ['shopping'] as QueryKey,
  houseTasks: ['house-tasks'] as QueryKey,
  readings: ['readings'] as QueryKey,
  purchases: ['purchases'] as QueryKey,
  guidance: ['guidance'] as QueryKey,
  guidanceHidden: ['guidance-hidden'] as QueryKey,
  pinStatus: ['pin-status'] as QueryKey,
}

function useHouseholdQuery<T>(key: QueryKey, fn: () => Promise<T>) {
  const { userId } = useAuth()
  const { db } = useDb()
  return useQuery({ queryKey: [...key, db.mode], queryFn: fn, enabled: Boolean(userId) })
}

// The mode is appended to every key so switching demo ↔ live never mixes caches.
export function useProjects() { const { db } = useDb(); return useHouseholdQuery(keys.projects, () => db.listProjects()) }
export function useImages() { const { db } = useDb(); return useHouseholdQuery(keys.images, () => db.listImages()) }
export function useContacts() { const { db } = useDb(); return useHouseholdQuery(keys.contacts, () => db.listContacts()) }
export function useQuotes() { const { db } = useDb(); return useHouseholdQuery(keys.quotes, () => db.listQuotes()) }
export function useExpenses() { const { db } = useDb(); return useHouseholdQuery(keys.expenses, () => db.listExpenses()) }
export function useTasks() { const { db } = useDb(); return useHouseholdQuery(keys.tasks, () => db.listTasks()) }
export function useXp() { const { db } = useDb(); return useHouseholdQuery(keys.xp, () => db.listXp()) }
export function useAchievements() { const { db } = useDb(); return useHouseholdQuery(keys.achievements, () => db.listAchievements()) }
export function useNudges() { const { db } = useDb(); return useHouseholdQuery(keys.nudges, () => db.listNudges()) }
export function useVisits() { const { db } = useDb(); return useHouseholdQuery(keys.visits, () => db.listVisits()) }
export function useShopping() { const { db } = useDb(); return useHouseholdQuery(keys.shopping, () => db.listShopping()) }
export function useHouseTasks() { const { db } = useDb(); return useHouseholdQuery(keys.houseTasks, () => db.listHouseTasks()) }
export function useReadings() { const { db } = useDb(); return useHouseholdQuery(keys.readings, () => db.listReadings()) }
export function usePurchases() { const { db } = useDb(); return useHouseholdQuery(keys.purchases, () => db.listPurchases()) }
/** The letters written for me — private, so the key carries my id and never another person's cache. */
export function useGuidance() {
  const { db } = useDb()
  const { userId } = useAuth()
  return useHouseholdQuery([...keys.guidance, userId], () => db.listGuidance())
}
/** Where the PIN stands: whether there is one, whether it is locked, how many letters sit behind it. */
export function usePinStatus() {
  const { db } = useDb()
  const { userId } = useAuth()
  return useHouseholdQuery([...keys.pinStatus, userId], () => db.pinStatus())
}
/**
 * The hidden letters, fetched only while a PIN is in hand and dropped from the cache the moment
 * it isn't (gcTime 0): locking is forgetting. A wrong PIN is an error the unlock sheet shows
 * itself, so no retry and no toast.
 */
export function useHiddenGuidance(pin: string | null) {
  const { db } = useDb()
  const { userId } = useAuth()
  return useQuery({
    queryKey: [...keys.guidanceHidden, userId, db.mode],
    queryFn: () => db.listHiddenGuidance(pin!),
    enabled: Boolean(userId && pin),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
}

/** The shopping list, the chores and the meters — everything that belongs to the house itself. */
export function useHouse() {
  const shopping = useShopping(), houseTasks = useHouseTasks(), readings = useReadings(), purchases = usePurchases()
  return {
    loading: [shopping, houseTasks, readings, purchases].some((q) => q.isPending),
    shopping: shopping.data ?? [],
    houseTasks: houseTasks.data ?? [],
    readings: readings.data ?? [],
    purchases: purchases.data ?? [],
  }
}

/** Nudges addressed to me (or to everyone) that I haven't read yet. */
export function useInbox() {
  const { userId } = useAuth()
  const q = useNudges()
  const unread = useMemo(() => (q.data ?? []).filter((n) => n.from_user !== userId && (n.to_user === null || n.to_user === userId) && !n.read_at), [q.data, userId])
  return { ...q, unread }
}
export function useInvites() {
  const { db } = useDb()
  const q = useHouseholdQuery(keys.invites, () => db.listInvites())
  const live = useMemo(
    () => (q.data ?? []).filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date()),
    [q.data],
  )
  return { ...q, live }
}

export function useBoardItems(projectId: string) {
  const { db } = useDb()
  return useHouseholdQuery(keys.board(projectId), () => db.listBoardItems(projectId))
}

export function useProject(id: string | undefined) {
  const q = useProjects()
  return { ...q, project: useMemo(() => q.data?.find((p) => p.id === id) ?? null, [q.data, id]) }
}

/** All the data the game and analytics need, in one place. */
export function useEverything() {
  const projects = useProjects(), images = useImages(), contacts = useContacts(), quotes = useQuotes()
  const expenses = useExpenses(), tasks = useTasks(), xp = useXp(), achievements = useAchievements(), visits = useVisits()
  const loading = [projects, images, contacts, quotes, expenses, tasks, xp, achievements].some((q) => q.isPending)
  return {
    loading,
    projects: projects.data ?? [],
    images: images.data ?? [],
    contacts: contacts.data ?? [],
    quotes: quotes.data ?? [],
    expenses: expenses.data ?? [],
    tasks: tasks.data ?? [],
    xp: xp.data ?? [],
    achievements: achievements.data ?? [],
    visits: visits.data ?? [],
  }
}

export function useLevel() {
  const { data: xp } = useXp()
  return useMemo(() => levelFor((xp ?? []).reduce((a, e) => a + e.points, 0)), [xp])
}

// ---------------------------------------------------------------------------
// Media URLs — resolved lazily and cached per path.
// ---------------------------------------------------------------------------
const urlMemo = new Map<string, Promise<string>>()

export function useMediaUrl(path: string | null | undefined): string | null {
  const { db } = useDb()
  const [url, setUrl] = useState<string | null>(() => (path && /^(https?:|data:|blob:)/.test(path) ? path : null))
  useEffect(() => {
    if (!path) { setUrl(null); return }
    if (/^(https?:|data:|blob:)/.test(path)) { setUrl(path); return }
    let alive = true
    let p = urlMemo.get(path)
    if (!p) {
      p = db.resolveUrl(path)
      urlMemo.set(path, p)
      p.catch(() => urlMemo.delete(path))
    }
    p.then((u) => { if (alive) setUrl(u) }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [path, db])
  return url
}

// ---------------------------------------------------------------------------
// Actions — every write goes through here so XP, achievements and cache
// updates happen in one place.
// ---------------------------------------------------------------------------
export function useActions() {
  const { db } = useDb()
  const qc = useQueryClient()
  const { me, household, profiles, partner } = useAuth()
  const popXp = useUi((s) => s.popXp)
  const celebrate = useUi((s) => s.celebrate)
  const toast = useUi((s) => s.toast)
  const mode = db.mode

  const k = useCallback((key: QueryKey) => [...key, mode] as QueryKey, [mode])
  const invalidate = useCallback((...ks: QueryKey[]) => ks.forEach((key) => qc.invalidateQueries({ queryKey: k(key) })), [qc, k])
  const setList = useCallback(<T,>(key: QueryKey, fn: (old: T[]) => T[]) => qc.setQueryData<T[]>(k(key), (old) => fn(old ?? [])), [qc, k])

  const snapshot = useCallback(async (): Promise<GameSnapshot> => {
    const get = async <T,>(key: QueryKey, fn: () => Promise<T[]>) => (qc.getQueryData<T[]>(k(key))) ?? (await fn())
    const boards = qc.getQueriesData<BoardItem[]>({ queryKey: keys.boardAll }).flatMap(([, d]) => d ?? [])
    return {
      projects: await get<Project>(keys.projects, () => db.listProjects()),
      images: await get<ProjectImage>(keys.images, () => db.listImages()),
      contacts: await get<Contact>(keys.contacts, () => db.listContacts()),
      quotes: await get<Quote>(keys.quotes, () => db.listQuotes()),
      expenses: await get<Expense>(keys.expenses, () => db.listExpenses()),
      tasks: await get<Task>(keys.tasks, () => db.listTasks()),
      boardItems: boards,
      xp: await get<XpEvent>(keys.xp, () => db.listXp()),
      achievements: await get<Achievement>(keys.achievements, () => db.listAchievements()),
      profiles,
    }
  }, [qc, k, db, profiles])

  const checkAchievements = useCallback(async () => {
    if (!me || !household) return
    try {
      const s = await snapshot()
      const earned = evaluateAchievements(s)
      for (const key of earned) {
        const a = await db.unlockAchievement({ household_id: household.id, user_id: me.id, key })
        if (a) {
          setList<Achievement>(keys.achievements, (old) => (old.some((x) => x.key === key) ? old : [...old, a]))
          const def = ACHIEVEMENTS.find((d) => d.key === key)
          if (def) celebrate({ kind: 'achievement', title: def.title, subtitle: def.description, achievementKey: key })
        }
      }
    } catch {
      /* achievements are a bonus — never block the action */
    }
  }, [me, household, snapshot, db, setList, celebrate])

  const award = useCallback(
    async (kind: XpKind, projectId: string | null, refId: string | null = null, opts: { once?: boolean } = {}) => {
      if (!me || !household) return
      const rule = XP_RULES[kind]
      const existing = qc.getQueryData<XpEvent[]>(k(keys.xp)) ?? []
      if (opts.once && existing.some((e) => e.kind === kind && (refId ? e.ref_id === refId : e.project_id === projectId))) return
      const before = levelFor(existing.reduce((a, e) => a + e.points, 0))
      try {
        const ev = await db.addXp({ household_id: household.id, user_id: me.id, kind, points: rule.points, project_id: projectId, ref_id: refId })
        setList<XpEvent>(keys.xp, (old) => [...old, ev])
        popXp(rule.points, rule.label)
        const after = levelFor(before.current + rule.points)
        if (after.level > before.level) {
          setTimeout(() => celebrate({ kind: 'level_up', title: `Level ${after.level}`, subtitle: after.title, level: after.level }), 600)
        }
        void checkAchievements()
      } catch {
        /* XP is decorative — never block the action */
      }
    },
    [me, household, qc, k, db, setList, popXp, celebrate, checkAchievements],
  )

  const fail = useCallback((e: unknown, what: string) => {
    toast({ title: `Couldn't ${what}`, description: e instanceof Error ? e.message : 'Please try again.', tone: 'danger' })
    throw e
  }, [toast])

  // ---- projects ------------------------------------------------------------
  const createProject = useCallback(async (input: NewProject) => {
    if (!me || !household) throw new Error('Not signed in')
    try {
      const p = await db.createProject({ ...input, household_id: household.id, created_by: me.id })
      setList<Project>(keys.projects, (old) => [p, ...old])
      void award('project_created', p.id)
      return p
    } catch (e) { return fail(e, 'create the project') }
  }, [me, household, db, setList, award, fail])

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    const prev = qc.getQueryData<Project[]>(k(keys.projects))?.find((p) => p.id === id)
    const next = { ...patch }
    if (patch.status === 'done' && prev?.status !== 'done' && !next.completed_date) next.completed_date = todayISO()
    if (patch.status === 'in_progress' && prev && !prev.start_date && !next.start_date) next.start_date = todayISO()
    setList<Project>(keys.projects, (old) => old.map((p) => (p.id === id ? { ...p, ...next, updated_at: new Date().toISOString() } : p)))
    try {
      const saved = await db.updateProject(id, next)
      setList<Project>(keys.projects, (old) => old.map((p) => (p.id === id ? saved : p)))
      if (patch.status === 'done' && prev?.status !== 'done') {
        await award('project_completed', id, null, { once: true })
        const quotes = qc.getQueryData<Quote[]>(k(keys.quotes)) ?? []
        const expenses = qc.getQueryData<Expense[]>(k(keys.expenses)) ?? []
        const c = projectCosts(saved, quotes, expenses)
        if (c.budget > 0 && c.real <= c.budget) await award('under_budget', id, null, { once: true })
        if (saved.target_date && saved.completed_date && saved.completed_date <= saved.target_date) await award('on_time', id, null, { once: true })
        celebrate({ kind: 'project_done', title: 'Quest complete!', subtitle: saved.title })
      } else if (patch.status === 'in_progress' && prev && (prev.status === 'idea' || prev.status === 'planning')) {
        void award('project_started', id, null, { once: true })
      }
      return saved
    } catch (e) {
      invalidate(keys.projects)
      return fail(e, 'save the project')
    }
  }, [qc, k, setList, db, award, celebrate, invalidate, fail])

  const deleteProject = useCallback(async (id: string) => {
    setList<Project>(keys.projects, (old) => old.filter((p) => p.id !== id))
    try { await db.deleteProject(id); invalidate(keys.images, keys.quotes, keys.expenses, keys.tasks) } catch (e) { invalidate(keys.projects); return fail(e, 'delete the project') }
  }, [setList, db, invalidate, fail])

  // ---- media -----------------------------------------------------------------
  const uploadFile = useCallback(async (file: File | Blob, folder: string, opts: { image?: boolean } = { image: true }) => {
    if (!household) throw new Error('Not signed in')
    const isImage = (opts.image ?? true) && (file.type.startsWith('image/') || !file.type)
    const blob = isImage ? await compressImage(file) : file
    const ext = isImage ? 'jpg' : (file instanceof File ? file.name.split('.').pop() || 'bin' : 'bin')
    const path = `${household.id}/${folder}/${uid()}.${ext}`
    return db.upload(blob, path)
  }, [household, db])

  const addImage = useCallback(async (input: Omit<NewImage, 'path'> & { file: File | Blob }) => {
    if (!me) throw new Error('Not signed in')
    try {
      const path = await uploadFile(input.file, input.project_id)
      const { file: _f, ...rest } = input
      const img = await db.addImage({ ...rest, path, created_by: me.id })
      setList<ProjectImage>(keys.images, (old) => [...old, img])
      void award('photo_added', input.project_id, img.id)
      return img
    } catch (e) { return fail(e, 'upload the photo') }
  }, [me, uploadFile, db, setList, award, fail])

  const updateImage = useCallback(async (id: string, patch: Partial<ProjectImage>) => {
    setList<ProjectImage>(keys.images, (old) => old.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    try { return await db.updateImage(id, patch) } catch (e) { invalidate(keys.images); return fail(e, 'update the photo') }
  }, [setList, db, invalidate, fail])

  const deleteImage = useCallback(async (img: ProjectImage) => {
    setList<ProjectImage>(keys.images, (old) => old.filter((i) => i.id !== img.id))
    try { await db.deleteImage(img.id); void db.remove([img.path]) } catch (e) { invalidate(keys.images); return fail(e, 'delete the photo') }
  }, [setList, db, invalidate, fail])

  // ---- contacts ------------------------------------------------------------
  const createContact = useCallback(async (input: NewContact) => {
    if (!me || !household) throw new Error('Not signed in')
    try {
      const c = await db.createContact({ ...input, household_id: household.id, created_by: me.id })
      setList<Contact>(keys.contacts, (old) => [...old, c].sort((a, b) => a.name.localeCompare(b.name)))
      void award('contact_added', null, c.id)
      return c
    } catch (e) { return fail(e, 'save the contact') }
  }, [me, household, db, setList, award, fail])

  const updateContact = useCallback(async (id: string, patch: Partial<Contact>) => {
    setList<Contact>(keys.contacts, (old) => old.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    try { return await db.updateContact(id, patch) } catch (e) { invalidate(keys.contacts); return fail(e, 'save the contact') }
  }, [setList, db, invalidate, fail])

  const deleteContact = useCallback(async (id: string) => {
    setList<Contact>(keys.contacts, (old) => old.filter((c) => c.id !== id))
    try { await db.deleteContact(id); invalidate(keys.quotes) } catch (e) { invalidate(keys.contacts); return fail(e, 'delete the contact') }
  }, [setList, db, invalidate, fail])

  // ---- quotes & expenses ---------------------------------------------------
  const createQuote = useCallback(async (input: NewQuote & { file?: File | null }) => {
    if (!me) throw new Error('Not signed in')
    try {
      const { file, ...rest } = input
      const file_path = file ? await uploadFile(file, `${input.project_id}/quotes`, { image: file.type.startsWith('image/') }) : rest.file_path
      const q = await db.createQuote({ ...rest, file_path, created_by: me.id })
      setList<Quote>(keys.quotes, (old) => [...old, q])
      void award('quote_added', q.project_id, q.id)
      if (q.status === 'accepted' || q.status === 'paid') void award('quote_accepted', q.project_id, q.id, { once: true })
      return q
    } catch (e) { return fail(e, 'file the quote') }
  }, [me, uploadFile, db, setList, award, fail])

  const updateQuote = useCallback(async (id: string, patch: Partial<Quote> & { file?: File | null }) => {
    const prev = qc.getQueryData<Quote[]>(k(keys.quotes))?.find((q) => q.id === id)
    const { file, ...rest } = patch
    setList<Quote>(keys.quotes, (old) => old.map((q) => (q.id === id ? { ...q, ...rest } : q)))
    try {
      const file_path = file && prev ? await uploadFile(file, `${prev.project_id}/quotes`, { image: file.type.startsWith('image/') }) : undefined
      const saved = await db.updateQuote(id, file_path ? { ...rest, file_path } : rest)
      setList<Quote>(keys.quotes, (old) => old.map((q) => (q.id === id ? saved : q)))
      const nowAccepted = saved.status === 'accepted' || saved.status === 'paid'
      const wasAccepted = prev?.status === 'accepted' || prev?.status === 'paid'
      if (nowAccepted && !wasAccepted) void award('quote_accepted', saved.project_id, saved.id, { once: true })
      return saved
    } catch (e) { invalidate(keys.quotes); return fail(e, 'update the quote') }
  }, [qc, k, setList, uploadFile, db, award, invalidate, fail])

  const deleteQuote = useCallback(async (q: Quote) => {
    setList<Quote>(keys.quotes, (old) => old.filter((x) => x.id !== q.id))
    try {
      await db.deleteQuote(q.id)
      if (q.file_path) void db.remove([q.file_path])
      // Deposits toward it stay as expenses, now unlinked.
      setList<Expense>(keys.expenses, (old) => old.map((e) => (e.quote_id === q.id ? { ...e, quote_id: null } : e)))
    } catch (e) { invalidate(keys.quotes); return fail(e, 'delete the quote') }
  }, [setList, db, invalidate, fail])

  /**
   * Keep a quote's status honest with what has been paid toward it: a first
   * deposit accepts the quote, paying it off marks it paid, and removing a
   * payment from a paid quote drops it back to accepted.
   */
  const syncQuoteStatus = useCallback(async (quoteId: string | null | undefined) => {
    if (!quoteId) return
    const quote = qc.getQueryData<Quote[]>(k(keys.quotes))?.find((q) => q.id === quoteId)
    if (!quote || quote.status === 'rejected') return
    const { settled, paid } = quoteProgress(quote, qc.getQueryData<Expense[]>(k(keys.expenses)) ?? [])
    try {
      if (settled && quote.status !== 'paid') {
        await updateQuote(quote.id, { status: 'paid' })
        toast({ title: 'Paid in full', description: `“${quote.title || 'Quote'}” is settled and marked as paid.`, tone: 'success' })
      } else if (!settled && paid > 0 && quote.status === 'received') {
        await updateQuote(quote.id, { status: 'accepted' })
      } else if (!settled && quote.status === 'paid') {
        await updateQuote(quote.id, { status: 'accepted' })
      }
    } catch { /* the toast from updateQuote covers it */ }
  }, [qc, k, updateQuote, toast])

  const createExpense = useCallback(async (input: NewExpense & { file?: File | null }) => {
    if (!me) throw new Error('Not signed in')
    try {
      const { file, ...rest } = input
      const receipt_path = file ? await uploadFile(file, `${input.project_id}/receipts`, { image: file.type.startsWith('image/') }) : rest.receipt_path
      const e = await db.createExpense({ ...rest, receipt_path, created_by: me.id })
      setList<Expense>(keys.expenses, (old) => [...old, e])
      void award('expense_added', e.project_id, e.id)
      await syncQuoteStatus(e.quote_id)
      return e
    } catch (e) { return fail(e, 'log the expense') }
  }, [me, uploadFile, db, setList, award, syncQuoteStatus, fail])

  const updateExpense = useCallback(async (id: string, patch: Partial<Expense>) => {
    const prev = qc.getQueryData<Expense[]>(k(keys.expenses))?.find((e) => e.id === id)
    setList<Expense>(keys.expenses, (old) => old.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    try {
      const saved = await db.updateExpense(id, patch)
      await syncQuoteStatus(saved.quote_id)
      if (prev?.quote_id && prev.quote_id !== saved.quote_id) await syncQuoteStatus(prev.quote_id)
      return saved
    } catch (e) { invalidate(keys.expenses); return fail(e, 'update the expense') }
  }, [qc, k, setList, db, syncQuoteStatus, invalidate, fail])

  const deleteExpense = useCallback(async (e: Expense) => {
    setList<Expense>(keys.expenses, (old) => old.filter((x) => x.id !== e.id))
    try {
      await db.deleteExpense(e.id)
      if (e.receipt_path) void db.remove([e.receipt_path])
      await syncQuoteStatus(e.quote_id)
    } catch (err) { invalidate(keys.expenses); return fail(err, 'delete the expense') }
  }, [setList, db, syncQuoteStatus, invalidate, fail])

  // ---- nudges (quiet) ------------------------------------------------------
  /** A nudge sent as a side effect (e.g. assigning a task) — never blocks or toasts on failure. */
  const quietNudge = useCallback(async (input: { to_user: string | null; kind: NudgeKind; message: string; project_id?: string | null; link?: string | null }) => {
    if (!me || !household) return
    try {
      const n = await db.createNudge({ household_id: household.id, from_user: me.id, to_user: input.to_user, kind: input.kind, message: input.message, project_id: input.project_id ?? null, link: input.link ?? null })
      setList<Nudge>(keys.nudges, (old) => [n, ...old])
    } catch { /* best effort */ }
  }, [me, household, db, setList])

  // ---- tasks ---------------------------------------------------------------
  const createTask = useCallback(async (input: NewTask) => {
    if (!me) throw new Error('Not signed in')
    try {
      const t = await db.createTask({ ...input, created_by: me.id })
      setList<Task>(keys.tasks, (old) => [...old, t])
      if (t.assigned_to && t.assigned_to !== me.id) void quietNudge({ to_user: t.assigned_to, kind: 'todo', message: `Assigned to you: ${t.title}`, project_id: t.project_id, link: `/projects/${t.project_id}?tab=tasks` })
      return t
    } catch (e) { return fail(e, 'add the task') }
  }, [me, db, setList, quietNudge, fail])

  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    const prev = qc.getQueryData<Task[]>(k(keys.tasks))?.find((t) => t.id === id)
    const next = { ...patch }
    if (patch.done === true) next.completed_at = new Date().toISOString()
    if (patch.done === false) next.completed_at = null
    setList<Task>(keys.tasks, (old) => old.map((t) => (t.id === id ? { ...t, ...next } : t)))
    try {
      const saved = await db.updateTask(id, next)
      if (patch.done && !prev?.done) void award('task_completed', saved.project_id, saved.id, { once: true })
      if (patch.assigned_to && patch.assigned_to !== prev?.assigned_to && patch.assigned_to !== me?.id && !saved.done) {
        void quietNudge({ to_user: patch.assigned_to, kind: 'todo', message: `Assigned to you: ${saved.title}`, project_id: saved.project_id, link: `/projects/${saved.project_id}?tab=tasks` })
      }
      return saved
    } catch (e) { invalidate(keys.tasks); return fail(e, 'update the task') }
  }, [qc, k, setList, db, award, me, quietNudge, invalidate, fail])

  const deleteTask = useCallback(async (id: string) => {
    setList<Task>(keys.tasks, (old) => old.filter((t) => t.id !== id))
    try { await db.deleteTask(id) } catch (e) { invalidate(keys.tasks); return fail(e, 'delete the task') }
  }, [setList, db, invalidate, fail])

  // ---- site visits ---------------------------------------------------------
  const logVisit = useCallback(async (input: NewSiteVisit) => {
    if (!me) throw new Error('Not signed in')
    try {
      const v = await db.createVisit({ ...input, logged_by: me.id })
      setList<SiteVisit>(keys.visits, (old) => [v, ...old])
      void award('visit_logged', v.project_id, v.id)
      if (v.outcome === 'no_show' && partner) {
        const project = qc.getQueryData<Project[]>(k(keys.projects))?.find((p) => p.id === v.project_id)
        const who = qc.getQueryData<Contact[]>(k(keys.contacts))?.find((c) => c.id === v.contact_id)
        void quietNudge({ to_user: partner.id, kind: 'fyi', message: `${who ? who.name : 'The contractor'} didn't show up${v.visit_date === todayISO() ? ' today' : ` on ${fmtDate(v.visit_date, 'EEE d MMM')}`}${project ? ` — ${project.title}` : ''}${v.notes ? `. ${v.notes}` : ''}`, project_id: v.project_id, link: `/projects/${v.project_id}` })
      }
      return v
    } catch (e) { return fail(e, 'log the visit') }
  }, [me, partner, db, setList, award, qc, k, quietNudge, fail])

  const updateVisit = useCallback(async (id: string, patch: Partial<SiteVisit>) => {
    setList<SiteVisit>(keys.visits, (old) => old.map((v) => (v.id === id ? { ...v, ...patch } : v)))
    try { return await db.updateVisit(id, patch) } catch (e) { invalidate(keys.visits); return fail(e, 'update the visit') }
  }, [setList, db, invalidate, fail])

  const deleteVisit = useCallback(async (id: string) => {
    setList<SiteVisit>(keys.visits, (old) => old.filter((v) => v.id !== id))
    try { await db.deleteVisit(id) } catch (e) { invalidate(keys.visits); return fail(e, 'remove the visit') }
  }, [setList, db, invalidate, fail])

  // ---- blockers ------------------------------------------------------------
  const setBlocker = useCallback(async (projectId: string, kind: BlockerKind | null, note = '') => {
    const prev = qc.getQueryData<Project[]>(k(keys.projects))?.find((p) => p.id === projectId)
    const since = kind ? (prev?.blocked_on ? prev.blocked_since ?? todayISO() : todayISO()) : null
    return updateProject(projectId, { blocked_on: kind, blocked_note: kind ? note.trim() : '', blocked_since: since })
  }, [qc, k, updateProject])

  // ---- nudges --------------------------------------------------------------
  const sendNudge = useCallback(async (input: { to_user: string | null; kind: NudgeKind; message: string; project_id?: string | null; link?: string | null }) => {
    if (!me || !household) throw new Error('Not signed in')
    try {
      const n = await db.createNudge({ household_id: household.id, from_user: me.id, to_user: input.to_user, kind: input.kind, message: input.message.trim(), project_id: input.project_id ?? null, link: input.link ?? null })
      setList<Nudge>(keys.nudges, (old) => [n, ...old])
      return n
    } catch (e) { return fail(e, 'send the nudge') }
  }, [me, household, db, setList, fail])

  const inviteSomeone = useCallback(async (invitedName: string) => {
    try {
      const inv = await db.createInvite(invitedName)
      setList<Invite>(keys.invites, (old) => [inv, ...old])
      return inv
    } catch (e) { return fail(e, 'make the invite') }
  }, [db, setList, fail])

  const cancelInvite = useCallback(async (id: string) => {
    setList<Invite>(keys.invites, (old) => old.map((i) => (i.id === id ? { ...i, revoked_at: new Date().toISOString() } : i)))
    try { await db.revokeInvite(id) } catch (e) { invalidate(keys.invites); return fail(e, 'cancel the invite') }
  }, [db, setList, invalidate, fail])

  const removeMember = useCallback(async (userId: string) => {
    try {
      await db.removeMember(userId)
      // Their profile moved to another household, so the whole bundle is stale.
      await qc.invalidateQueries({ queryKey: ['bundle'] })
    } catch (e) { return fail(e, 'remove them from the home') }
  }, [db, qc, fail])

  const leaveHome = useCallback(async () => {
    try {
      await db.leaveHousehold()
      await qc.invalidateQueries({ queryKey: ['bundle'] })
      await qc.invalidateQueries()
    } catch (e) { return fail(e, 'leave the home') }
  }, [db, qc, fail])

  const renameHousehold = useCallback(async (name: string) => {
    if (!household) throw new Error('Not signed in')
    try {
      await db.renameHousehold(household.id, name.trim())
      await qc.invalidateQueries({ queryKey: ['bundle'] })
    } catch (e) { return fail(e, 'rename the home') }
  }, [db, household, qc, fail])

  const setHouseholdCurrency = useCallback(async (code: string) => {
    if (!household) throw new Error('Not signed in')
    try {
      await db.setHouseholdCurrency(household.id, code)
      await qc.invalidateQueries({ queryKey: ['bundle'] })
    } catch (e) { return fail(e, 'change the currency') }
  }, [db, household, qc, fail])

  const markNudgesRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    setList<Nudge>(keys.nudges, (old) => old.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)))
    try { await db.markNudgesRead(ids) } catch { invalidate(keys.nudges) }
  }, [setList, db, invalidate])

  const deleteNudge = useCallback(async (id: string) => {
    setList<Nudge>(keys.nudges, (old) => old.filter((n) => n.id !== id))
    try { await db.deleteNudge(id) } catch (e) { invalidate(keys.nudges); return fail(e, 'remove the nudge') }
  }, [setList, db, invalidate, fail])

  // ---- the house: shopping list --------------------------------------------
  /** Tells whoever it was meant for, unless that person is the one doing the telling. */
  const tellAssignee = useCallback((assignee: string | null, message: string, link: string) => {
    if (!assignee || assignee === me?.id) return
    void quietNudge({ to_user: assignee, kind: 'todo', message, link })
  }, [me, quietNudge])

  const addShoppingItem = useCallback(async (input: NewShoppingItem) => {
    if (!me || !household) throw new Error('Not signed in')
    try {
      const list = qc.getQueryData<ShoppingItem[]>(k(keys.shopping)) ?? []
      const item = await db.createShoppingItem({ ...input, sort_order: input.sort_order ?? list.length + 1, household_id: household.id, created_by: me.id })
      setList<ShoppingItem>(keys.shopping, (old) => [...old, item])
      tellAssignee(item.assigned_to, `On the shopping list for you: ${item.title}`, '/house?tab=shopping')
      return item
    } catch (e) { return fail(e, 'add that to the list') }
  }, [me, household, qc, k, db, setList, tellAssignee, fail])

  const updateShoppingItem = useCallback(async (id: string, patch: Partial<ShoppingItem>) => {
    const prev = qc.getQueryData<ShoppingItem[]>(k(keys.shopping))?.find((s) => s.id === id)
    const next = { ...patch }
    // Ticking is the whole point of a shared list, so it records who did it and when.
    if (patch.done === true) { next.done_by = me?.id ?? null; next.completed_at = new Date().toISOString() }
    if (patch.done === false) { next.done_by = null; next.completed_at = null }
    setList<ShoppingItem>(keys.shopping, (old) => old.map((s) => (s.id === id ? { ...s, ...next } : s)))
    try {
      const saved = await db.updateShoppingItem(id, next)
      setList<ShoppingItem>(keys.shopping, (old) => old.map((s) => (s.id === id ? saved : s)))
      if (patch.done === true && !prev?.done) {
        void award('shopping_done', null, saved.id, { once: true })
        // Save the other person a wasted trip down the same aisle.
        if (prev?.assigned_to && prev.assigned_to !== me?.id) {
          void quietNudge({ to_user: prev.assigned_to, kind: 'done', message: `Got it — ${saved.title} is off the list.`, link: '/house?tab=shopping' })
        }
      }
      if (patch.assigned_to && patch.assigned_to !== prev?.assigned_to && !saved.done) {
        tellAssignee(saved.assigned_to, `On the shopping list for you: ${saved.title}`, '/house?tab=shopping')
      }
      return saved
    } catch (e) { invalidate(keys.shopping); return fail(e, 'update the list') }
  }, [qc, k, me, setList, db, award, quietNudge, tellAssignee, invalidate, fail])

  const deleteShoppingItem = useCallback(async (id: string) => {
    setList<ShoppingItem>(keys.shopping, (old) => old.filter((s) => s.id !== id))
    try { await db.deleteShoppingItem(id) } catch (e) { invalidate(keys.shopping); return fail(e, 'remove that item') }
  }, [setList, db, invalidate, fail])

  const clearShoppingDone = useCallback(async () => {
    const ids = (qc.getQueryData<ShoppingItem[]>(k(keys.shopping)) ?? []).filter((s) => s.done).map((s) => s.id)
    if (!ids.length) return 0
    setList<ShoppingItem>(keys.shopping, (old) => old.filter((s) => !ids.includes(s.id)))
    try { await db.clearShoppingDone(ids); return ids.length } catch (e) { invalidate(keys.shopping); return fail(e, 'clear the list') }
  }, [qc, k, setList, db, invalidate, fail])

  // ---- the house: chores ---------------------------------------------------
  const addHouseTask = useCallback(async (input: NewHouseTask) => {
    if (!me || !household) throw new Error('Not signed in')
    try {
      const list = qc.getQueryData<HouseTask[]>(k(keys.houseTasks)) ?? []
      const t = await db.createHouseTask({ ...input, sort_order: input.sort_order ?? list.length + 1, household_id: household.id, created_by: me.id })
      setList<HouseTask>(keys.houseTasks, (old) => [...old, t])
      tellAssignee(t.assigned_to, `Assigned to you: ${t.title}`, '/house?tab=todo')
      return t
    } catch (e) { return fail(e, 'add the job') }
  }, [me, household, qc, k, db, setList, tellAssignee, fail])

  const updateHouseTask = useCallback(async (id: string, patch: Partial<HouseTask>) => {
    const prev = qc.getQueryData<HouseTask[]>(k(keys.houseTasks))?.find((t) => t.id === id)
    const next = { ...patch }
    if (patch.done === true) {
      next.done_by = me?.id ?? null
      next.completed_at = new Date().toISOString()
      // A chore that comes back around isn't finished — it just isn't due again yet.
      // One row keeps its history instead of breeding a new one every month.
      if (prev?.repeat_days) {
        next.done = false
        next.due_date = format(addDays(new Date(), prev.repeat_days), 'yyyy-MM-dd')
      }
    }
    if (patch.done === false) { next.done_by = null; next.completed_at = null }
    setList<HouseTask>(keys.houseTasks, (old) => old.map((t) => (t.id === id ? { ...t, ...next } : t)))
    try {
      const saved = await db.updateHouseTask(id, next)
      setList<HouseTask>(keys.houseTasks, (old) => old.map((t) => (t.id === id ? saved : t)))
      if (patch.done === true && !prev?.done) {
        void award('chore_done', null, `${saved.id}:${saved.completed_at ?? ''}`)
        if (prev?.assigned_to && prev.assigned_to !== me?.id) {
          void quietNudge({ to_user: prev.assigned_to, kind: 'done', message: `Done: ${saved.title}`, link: '/house?tab=todo' })
        }
      }
      if (patch.assigned_to && patch.assigned_to !== prev?.assigned_to && !saved.done) {
        tellAssignee(saved.assigned_to, `Assigned to you: ${saved.title}`, '/house?tab=todo')
      }
      return saved
    } catch (e) { invalidate(keys.houseTasks); return fail(e, 'update the job') }
  }, [qc, k, me, setList, db, award, quietNudge, tellAssignee, invalidate, fail])

  const deleteHouseTask = useCallback(async (id: string) => {
    setList<HouseTask>(keys.houseTasks, (old) => old.filter((t) => t.id !== id))
    try { await db.deleteHouseTask(id) } catch (e) { invalidate(keys.houseTasks); return fail(e, 'remove the job') }
  }, [setList, db, invalidate, fail])

  // ---- the house: meters ---------------------------------------------------
  const logReading = useCallback(async (input: Omit<NewMeterReading, 'photo_path'> & { file?: File | Blob | null; photo_path?: string | null }) => {
    if (!me || !household) throw new Error('Not signed in')
    try {
      const { file, ...rest } = input
      const photo_path = file ? await uploadFile(file, 'meters') : rest.photo_path ?? null
      const r = await db.createReading({ ...rest, photo_path, household_id: household.id, created_by: me.id })
      setList<MeterReading>(keys.readings, (old) => [...old, r].sort((a, b) => a.read_on.localeCompare(b.read_on)))
      void award('reading_logged', null, r.id)
      return r
    } catch (e) { return fail(e, 'log the reading') }
  }, [me, household, uploadFile, db, setList, award, fail])

  const updateReading = useCallback(async (id: string, patch: Partial<MeterReading> & { file?: File | Blob | null }) => {
    const { file, ...rest } = patch
    setList<MeterReading>(keys.readings, (old) => old.map((r) => (r.id === id ? { ...r, ...rest } : r)))
    try {
      const photo_path = file ? await uploadFile(file, 'meters') : undefined
      const saved = await db.updateReading(id, photo_path ? { ...rest, photo_path } : rest)
      setList<MeterReading>(keys.readings, (old) => old.map((r) => (r.id === id ? saved : r)))
      return saved
    } catch (e) { invalidate(keys.readings); return fail(e, 'update the reading') }
  }, [setList, uploadFile, db, invalidate, fail])

  const deleteReading = useCallback(async (r: MeterReading) => {
    setList<MeterReading>(keys.readings, (old) => old.filter((x) => x.id !== r.id))
    try { await db.deleteReading(r.id); if (r.photo_path) void db.remove([r.photo_path]) } catch (e) { invalidate(keys.readings); return fail(e, 'remove the reading') }
  }, [setList, db, invalidate, fail])

  const logPurchase = useCallback(async (input: Omit<NewUtilityPurchase, 'receipt_path'> & { file?: File | Blob | null; receipt_path?: string | null }) => {
    if (!me || !household) throw new Error('Not signed in')
    try {
      const { file, ...rest } = input
      const receipt_path = file ? await uploadFile(file, 'meters') : rest.receipt_path ?? null
      const p = await db.createPurchase({ ...rest, receipt_path, household_id: household.id, created_by: me.id })
      setList<UtilityPurchase>(keys.purchases, (old) => [...old, p].sort((a, b) => a.bought_on.localeCompare(b.bought_on)))
      return p
    } catch (e) { return fail(e, 'log the top-up') }
  }, [me, household, uploadFile, db, setList, fail])

  const updatePurchase = useCallback(async (id: string, patch: Partial<UtilityPurchase>) => {
    setList<UtilityPurchase>(keys.purchases, (old) => old.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    try { return await db.updatePurchase(id, patch) } catch (e) { invalidate(keys.purchases); return fail(e, 'update the top-up') }
  }, [setList, db, invalidate, fail])

  const deletePurchase = useCallback(async (p: UtilityPurchase) => {
    setList<UtilityPurchase>(keys.purchases, (old) => old.filter((x) => x.id !== p.id))
    try { await db.deletePurchase(p.id); if (p.receipt_path) void db.remove([p.receipt_path]) } catch (e) { invalidate(keys.purchases); return fail(e, 'remove the top-up') }
  }, [setList, db, invalidate, fail])

  const updateHomeDetails = useCallback(async (patch: Partial<Pick<Household, 'water_meter_no' | 'electricity_meter_no' | 'municipal_account' | 'address' | 'water_meter_decimals' | 'electricity_meter_decimals'>>) => {
    if (!household) throw new Error('Not signed in')
    try {
      await db.updateHousehold(household.id, patch)
      await qc.invalidateQueries({ queryKey: ['bundle'] })
    } catch (e) { return fail(e, 'save the home details') }
  }, [household, db, qc, fail])

  // ---- board ---------------------------------------------------------------
  const addBoardItem = useCallback(async (input: NewBoardItem) => {
    if (!me) throw new Error('Not signed in')
    const temp: BoardItem = { ...input, id: `temp-${uid()}`, created_by: me.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    setList<BoardItem>(keys.board(input.project_id), (old) => [...old, temp])
    try {
      const b = await db.createBoardItem({ ...input, created_by: me.id })
      setList<BoardItem>(keys.board(input.project_id), (old) => old.map((x) => (x.id === temp.id ? b : x)))
      void award('board_started', input.project_id, null, { once: true })
      void award(input.type === 'color' ? 'swatch_added' : 'pin_added', input.project_id, b.id)
      return b
    } catch (e) {
      setList<BoardItem>(keys.board(input.project_id), (old) => old.filter((x) => x.id !== temp.id))
      return fail(e, 'add to the board')
    }
  }, [me, setList, db, award, fail])

  const updateBoardItem = useCallback(async (item: BoardItem, patch: Partial<BoardItem>, opts: { silent?: boolean } = {}) => {
    setList<BoardItem>(keys.board(item.project_id), (old) => old.map((x) => (x.id === item.id ? { ...x, ...patch } : x)))
    try {
      return await db.updateBoardItem(item.id, patch)
    } catch (e) {
      if (!opts.silent) { invalidate(keys.board(item.project_id)); return fail(e, 'move the pin') }
      return null
    }
  }, [setList, db, invalidate, fail])

  const updateBoardItems = useCallback(async (projectId: string, patches: { id: string; patch: Partial<BoardItem> }[]) => {
    setList<BoardItem>(keys.board(projectId), (old) => old.map((x) => { const p = patches.find((q) => q.id === x.id); return p ? { ...x, ...p.patch } : x }))
    try { await db.updateBoardItems(patches) } catch (e) { invalidate(keys.board(projectId)); return fail(e, 'update the board') }
  }, [setList, db, invalidate, fail])

  const deleteBoardItem = useCallback(async (item: BoardItem) => {
    setList<BoardItem>(keys.board(item.project_id), (old) => old.filter((x) => x.id !== item.id))
    try {
      await db.deleteBoardItem(item.id)
      const d = item.data as { path?: string; image_path?: string }
      const paths = [d.path, d.image_path].filter((p): p is string => Boolean(p))
      if (paths.length) void db.remove(paths)
    } catch (e) { invalidate(keys.board(item.project_id)); return fail(e, 'remove the pin') }
  }, [setList, db, invalidate, fail])

  // ---- the Word --------------------------------------------------------------
  const guidanceKey = useCallback(() => [...keys.guidance, me?.id ?? null] as QueryKey, [me])
  const hiddenKey = useCallback(() => [...keys.guidanceHidden, me?.id ?? null] as QueryKey, [me])
  const pinKey = useCallback(() => [...keys.pinStatus, me?.id ?? null] as QueryKey, [me])
  // The count moves at once for the eye, then the database has the last word: a refetch that was
  // already in flight (setting the PIN invalidates too) could otherwise land after the bump with a
  // number from before the change.
  const bumpHidden = useCallback((by: number) => {
    qc.setQueryData<PinStatus>(k(pinKey()), (old) => (old ? { ...old, hidden_count: Math.max(0, old.hidden_count + by) } : old))
    invalidate(pinKey())
  }, [qc, k, pinKey, invalidate])

  const askTheWord = useCallback(async (context: string, translation: Translation, hidden = false) => {
    try {
      const g = await db.askTheWord(context, translation, hidden)
      if (g.hidden) {
        // Only into the hidden cache if it is open; otherwise it waits behind the PIN like the rest.
        if (qc.getQueryData<Guidance[]>(k(hiddenKey()))) setList<Guidance>(hiddenKey(), (old) => [g, ...old.filter((x) => x.id !== g.id)])
        bumpHidden(1)
      } else {
        setList<Guidance>(guidanceKey(), (old) => [g, ...old.filter((x) => x.id !== g.id)])
      }
      return g
    } catch (e) { return fail(e, 'write the letter') }
  }, [db, qc, k, setList, guidanceKey, hiddenKey, bumpHidden, fail])

  const deleteGuidance = useCallback(async (g: Guidance, pin?: string) => {
    const key = g.hidden ? hiddenKey() : guidanceKey()
    setList<Guidance>(key, (old) => old.filter((x) => x.id !== g.id))
    try {
      await db.deleteGuidance(g.id, g.hidden ? pin : undefined)
      if (g.hidden) bumpHidden(-1)
    } catch (e) { invalidate(key); return fail(e, 'delete the letter') }
  }, [db, setList, guidanceKey, hiddenKey, bumpHidden, invalidate, fail])

  const tickReading = useCallback(async (g: Guidance, index: number, done: boolean, pin?: string) => {
    const key = g.hidden ? hiddenKey() : guidanceKey()
    setList<Guidance>(key, (old) => old.map((x) => {
      if (x.id !== g.id) return x
      const plan_done = { ...x.plan_done }
      if (done) plan_done[String(index)] = todayISO(); else delete plan_done[String(index)]
      return { ...x, plan_done }
    }))
    try { await db.setReadingDone(g.id, index, done, g.hidden ? pin : undefined) } catch (e) { invalidate(key); return fail(e, 'save the tick') }
  }, [db, setList, guidanceKey, hiddenKey, invalidate, fail])

  const hideGuidance = useCallback(async (g: Guidance) => {
    setList<Guidance>(guidanceKey(), (old) => old.filter((x) => x.id !== g.id))
    try {
      await db.hideGuidance(g.id)
      if (qc.getQueryData<Guidance[]>(k(hiddenKey()))) setList<Guidance>(hiddenKey(), (old) => [{ ...g, hidden: true }, ...old.filter((x) => x.id !== g.id)])
      bumpHidden(1)
    } catch (e) { invalidate(guidanceKey()); return fail(e, 'hide the letter') }
  }, [db, qc, k, setList, guidanceKey, hiddenKey, bumpHidden, invalidate, fail])

  const unhideGuidance = useCallback(async (g: Guidance, pin: string) => {
    setList<Guidance>(hiddenKey(), (old) => old.filter((x) => x.id !== g.id))
    try {
      const back = await db.unhideGuidance(g.id, pin)
      setList<Guidance>(guidanceKey(), (old) => [back, ...old.filter((x) => x.id !== back.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      bumpHidden(-1)
      return back
    } catch (e) { invalidate(hiddenKey()); return fail(e, 'bring the letter back') }
  }, [db, setList, guidanceKey, hiddenKey, bumpHidden, invalidate, fail])

  const setPin = useCallback(async (pin: string, oldPin?: string) => {
    await db.setPin(pin, oldPin)   // a refusal is shown by the sheet, in its own words
    invalidate(pinKey())
  }, [db, invalidate, pinKey])

  const forgetPin = useCallback(async () => {
    try {
      const gone = await db.forgetPin()
      qc.removeQueries({ queryKey: k(hiddenKey()) })
      invalidate(pinKey())
      toast({ title: 'PIN forgotten', description: gone ? `${gone} hidden letter${gone === 1 ? '' : 's'} went with it.` : 'There were no hidden letters.', tone: 'neutral' })
    } catch (e) { return fail(e, 'forget the PIN') }
  }, [db, qc, k, hiddenKey, invalidate, pinKey, toast, fail])

  /** Locking is forgetting: the hidden letters leave memory with the PIN. */
  const lockHidden = useCallback(() => { qc.removeQueries({ queryKey: k(hiddenKey()) }) }, [qc, k, hiddenKey])

  return {
    award, checkAchievements, invalidate, uploadFile,
    askTheWord, deleteGuidance, tickReading, hideGuidance, unhideGuidance, setPin, forgetPin, lockHidden,
    createProject, updateProject, deleteProject,
    addImage, updateImage, deleteImage,
    createContact, updateContact, deleteContact,
    createQuote, updateQuote, deleteQuote,
    createExpense, updateExpense, deleteExpense,
    createTask, updateTask, deleteTask,
    logVisit, updateVisit, deleteVisit, setBlocker,
    addShoppingItem, updateShoppingItem, deleteShoppingItem, clearShoppingDone,
    addHouseTask, updateHouseTask, deleteHouseTask,
    logReading, updateReading, deleteReading,
    logPurchase, updatePurchase, deletePurchase, updateHomeDetails,
    addBoardItem, updateBoardItem, updateBoardItems, deleteBoardItem,
    sendNudge, markNudgesRead, deleteNudge,
    inviteSomeone, cancelInvite, removeMember, renameHousehold, setHouseholdCurrency, leaveHome,
  }
}

// ---------------------------------------------------------------------------
// The meter reminder.
// ---------------------------------------------------------------------------
/**
 * Puts an overdue meter reading on the other person's phone, once.
 *
 * The banner on the Meters tab only helps somebody already looking at it, and
 * the whole risk is nobody looking for five weeks. So the first app opened after
 * a reading goes over a month raises a household nudge — deduped against the
 * last fortnight's nudges, because a reminder that arrives twice a day stops
 * being a reminder.
 */
export function useMeterReminder() {
  const { me, household } = useAuth()
  const { db } = useDb()
  const qc = useQueryClient()
  const mode = db.mode
  const { data: readings } = useReadings()
  const { data: nudges } = useNudges()
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current || !me || !household || !readings || !nudges) return
    const overdue = (['water', 'electricity'] as Utility[]).filter((u) => readingDue(readings, u).state === 'overdue')
    if (!overdue.length) return

    const fortnightAgo = Date.now() - 14 * 864e5
    const already = nudges.some((n) => n.link === METER_NUDGE_LINK && new Date(n.created_at).getTime() > fortnightAgo)
    if (already) { sent.current = true; return }

    sent.current = true
    const names = overdue.map((u) => UTILITIES[u].label.toLowerCase())
    const which = names.length > 1 ? `${names[0]} and ${names[1]}` : names[0]
    const days = Math.max(...overdue.map((u) => readingDue(readings, u).daysSince ?? 0))
    void db.createNudge({
      household_id: household.id,
      from_user: me.id,
      to_user: null,
      kind: 'todo',
      message: `The ${which} meter hasn't been read in ${days} days. A month-long gap is exactly what a disputed statement lands in.`,
      project_id: null,
      link: METER_NUDGE_LINK,
    }).then(() => qc.invalidateQueries({ queryKey: [...keys.nudges, mode] })).catch(() => { /* best effort */ })
  }, [me, household, readings, nudges, db, qc, mode])
}

const METER_NUDGE_LINK = '/house?tab=meters'

// ---------------------------------------------------------------------------
// Realtime — invalidate the right queries when the other person changes data.
// ---------------------------------------------------------------------------
export function useRealtimeSync() {
  const { db } = useDb()
  const qc = useQueryClient()
  const { userId, profileById } = useAuth()
  const toast = useUi((s) => s.toast)
  const mode = db.mode

  useEffect(() => {
    if (!userId) return
    const off = db.subscribe((p) => {
      const inv = (key: QueryKey) => qc.invalidateQueries({ queryKey: [...key, mode] })
      switch (p.table) {
        case 'projects': inv(keys.projects); break
        case 'project_images': inv(keys.images); break
        case 'contacts': inv(keys.contacts); break
        case 'quotes': inv(keys.quotes); break
        case 'expenses': inv(keys.expenses); break
        case 'tasks': inv(keys.tasks); break
        case 'site_visits': inv(keys.visits); break
        case 'invites': inv(keys.invites); break
        case 'shopping_items': inv(keys.shopping); break
        case 'house_tasks': inv(keys.houseTasks); break
        case 'meter_readings': inv(keys.readings); break
        case 'utility_purchases': inv(keys.purchases); break
        case 'board_items': {
          const pid = (p.row?.project_id ?? p.old?.project_id) as string | undefined
          if (pid) inv(keys.board(pid)); else qc.invalidateQueries({ queryKey: keys.boardAll })
          break
        }
        case 'profiles': qc.invalidateQueries({ queryKey: ['bundle'] }); break
        case 'nudges': {
          inv(keys.nudges)
          const row = p.row as Partial<Nudge> | null
          if (p.type === 'INSERT' && row && row.from_user && row.from_user !== userId && (!row.to_user || row.to_user === userId)) {
            const who = profileById(row.from_user)?.display_name ?? 'Your partner'
            const label = row.kind === 'todo' ? 'needs you' : row.kind === 'done' ? 'got it done' : 'says'
            const link = row.link, id = row.id
            toast({
              title: `${who} ${label}`, description: row.message, tone: row.kind === 'done' ? 'success' : 'neutral', duration: 9000,
              actionLabel: link ? 'Open' : 'Got it',
              onAction: () => {
                if (id) void db.markNudgesRead([id]).then(() => inv(keys.nudges))
                if (link) softNavigate(link)
              },
            })
          }
          break
        }
        case 'xp_events': {
          inv(keys.xp)
          const row = p.row as Partial<XpEvent> | null
          if (p.type === 'INSERT' && row && row.user_id && row.user_id !== userId) {
            const who = profileById(row.user_id)?.display_name ?? 'Your partner'
            const label = row.kind ? XP_RULES[row.kind]?.label : ''
            toast({ title: `${who} +${row.points} XP`, description: label, tone: 'xp', duration: 3500 })
          }
          break
        }
        case 'achievements': {
          inv(keys.achievements)
          const row = p.row as Partial<Achievement> | null
          if (p.type === 'INSERT' && row && row.user_id && row.user_id !== userId) {
            const who = profileById(row.user_id)?.display_name ?? 'Your partner'
            const def = ACHIEVEMENTS.find((d) => d.key === row.key)
            if (def) toast({ title: `${who} unlocked “${def.title}”`, description: def.description, tone: 'success', duration: 5000 })
          }
          break
        }
      }
    })
    return off
  }, [db, qc, userId, mode, profileById, toast])
}
