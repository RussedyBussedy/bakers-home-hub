import type { ChangePayload, ChangeTable, Db } from './db'
import { PinRefused, type Achievement, type BoardItem, type Contact, type Expense, type Guidance, type HouseTask, type Invite, type InvitePreview, type MeterReading, type Nudge, type Passage, type Profile, type Project, type ProjectImage, type Quote, type ShoppingItem, type SiteVisit, type Task, type Unfurled, type UtilityPurchase, type XpEvent } from './types'
import { buildDemoState, DEMO_USERS, type DemoState } from './demoSeed'
import { uid } from '../lib/utils'

/**
 * The letter the demo writes, whatever is asked. King James, because it is out of copyright and its
 * best-known verses are the ones people already carry — and because the live Hub's letters come
 * from its own Bible index, which the demo doesn't have.
 */
const DEMO_LETTER: Guidance['response'] = {
  greeting: 'Thank you for writing this down — that takes more courage than it looks. What you are carrying is heavy, and you have been carrying it quietly. I want to sit with you in it for a few minutes and let the Word speak before either of us tries to fix anything.',
  passages: [
    { reference: 'Matthew 11:28', book_id: 40, chapter: 11, start: 28, end: 28, verses: [{ verse: 28, text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.' }], why: 'Jesus does not say "sort yourself out and then come". He says come now, tired, as you are. The rest He offers is not the problem disappearing; it is not having to carry it alone.', note: 'nearest to what they wrote' },
    { reference: 'Psalm 34:18', book_id: 19, chapter: 34, start: 18, end: 18, verses: [{ verse: 18, text: 'The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit.' }], why: 'When things break, the instinct is to think God has stepped back. David says the opposite: the broken heart is exactly where He draws near.', note: "Nave's Topical Bible: Afflictions › Consolation in" },
    { reference: 'Philippians 4:6–7', book_id: 50, chapter: 4, start: 6, end: 7, verses: [{ verse: 6, text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.' }, { verse: 7, text: 'And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.' }], why: 'Paul wrote this from a prison cell, so it is not advice from an easy chair. Say the worry out loud to God, specifically, and thank Him for something while you do — the peace comes as a guard, not as an explanation.', note: 'cross-reference of Matthew 11:28' },
  ],
  understanding: 'Most of what you described is not a lack of faith; it is a lack of rest. You have been holding this alone and turning it over at night, and the mind does what it always does with a problem it cannot solve — it keeps going back to it.\n\nThe Scriptures do not promise you the thing will be resolved by Friday. They promise that God is near, that He hears, and that His peace can keep you steady while the matter is still open. That is a different kind of help from the one you were hoping for, and a better one.',
  response: [
    'Tonight, before you sleep, write the worry down on paper in one or two plain sentences, then pray those exact sentences to God. Naming it is half of handing it over.',
    'Tell one person you trust what you told me — your spouse, a friend, someone at church. Burdens are meant to be carried by more than one pair of hands.',
    'Choose one small, practical step you can take this week towards the matter itself, and do that one thing. Leave the rest of it in God’s hands for now.',
    'If the weight of this is affecting your sleep or your health for more than a couple of weeks, see your doctor. That is wisdom, not weakness.',
  ],
  prayer: 'Lord Jesus, I come to You tired and carrying more than I can hold. You said You would give me rest, and I am asking for it now. Draw near to my broken places. Take the worry I keep picking up at night, and keep my heart and my mind in Your peace while I wait for You. Show me the one next step, and give me the courage to take it. Amen.',
  closing: 'The Lord is near to you tonight — nearer than the thing you are afraid of. Rest in that.',
  plan: [
    { reference: 'Psalm 23', book_id: 19, book: 'Psalm', chapter: 23, start: null, end: null, focus: 'Resting when you cannot fix it: who is doing the leading here?' },
    { reference: 'Matthew 11:25–30', book_id: 40, book: 'Matthew', chapter: 11, start: 25, end: 30, focus: 'What Jesus means by an easy yoke.' },
    { reference: 'Philippians 4:4–13', book_id: 50, book: 'Philippians', chapter: 4, start: 4, end: 13, focus: 'Peace and contentment from a prison cell.' },
    { reference: 'Isaiah 41:8–13', book_id: 23, book: 'Isaiah', chapter: 41, start: 8, end: 13, focus: '“Fear not, for I am with thee” — said to people in exile.' },
    { reference: 'Psalm 34', book_id: 19, book: 'Psalm', chapter: 34, start: null, end: null, focus: 'A whole psalm from a man who had been very afraid.' },
  ],
  safety: { concern: false, kind: 'none' },
}

const PSALM_23: Passage = {
  book_id: 19, book: 'Psalms', chapter: 23, start: 1, end: 6,
  verses: [
    { verse: 1, text: 'The LORD is my shepherd; I shall not want.' },
    { verse: 2, text: 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.' },
    { verse: 3, text: 'He restoreth my soul: he leadeth me in the paths of righteousness for his name’s sake.' },
    { verse: 4, text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.' },
    { verse: 5, text: 'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.' },
    { verse: 6, text: 'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.' },
  ],
}

const STORAGE_KEY = 'hub-demo-state-v3'
const SESSION_KEY = 'hub-demo-user'
const CHANNEL = 'hub-demo-sync'
const PIN_KEY = 'hub-demo-word-pins'

function nowISO() {
  return new Date().toISOString()
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState
      if (parsed && parsed.projects && parsed.household) {
        // A demo saved before the app knew about currencies: it was rand.
        parsed.household.currency ||= 'ZAR'
        return parsed
      }
    }
  } catch {
    /* ignore */
  }
  return buildDemoState()
}

/**
 * In-memory implementation used when no Supabase credentials are configured,
 * or when someone taps "Explore the demo". State persists to localStorage and
 * syncs across open tabs with a BroadcastChannel so the "live sync" story can
 * still be seen without a backend.
 */
export function createDemoDb(): Db {
  let state = load()
  const listeners = new Set<(p: ChangePayload) => void>()
  const authListeners = new Set<(id: string | null) => void>()
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* quota exceeded — keep going in memory */
    }
  }
  // Write the freshly seeded state straight away so a second tab (or a test) sees the same data.
  if (!localStorage.getItem(STORAGE_KEY)) persist()

  const emit = (payload: ChangePayload, broadcast = true) => {
    listeners.forEach((l) => l(payload))
    if (broadcast) bc?.postMessage({ kind: 'change', payload })
  }

  bc?.addEventListener('message', (e) => {
    const msg = e.data as { kind: string; payload: ChangePayload }
    if (msg?.kind === 'change') {
      state = load()
      emit(msg.payload, false)
    }
  })

  // Always hand out copies: the UI keeps what it receives in its cache and
  // compares old vs new, so the live state must never be shared by reference.
  const delay = <T,>(v: T, ms = 60): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms))

  const mutate = <T,>(table: ChangeTable, type: ChangePayload['type'], fn: () => T, row?: unknown): Promise<T> => {
    const out = fn()
    persist()
    emit({ table, type, row: (row ?? out ?? null) as Record<string, unknown> | null, old: null })
    return delay(out, 40)
  }

  const currentUser = () => localStorage.getItem(SESSION_KEY)

  // Hidden letters in the demo: a PIN per person, five wrong guesses lock it for fifteen minutes.
  type DemoPin = { pin: string; failed: number; lockedUntil: number | null }
  const pins = (): Record<string, DemoPin> => { try { return JSON.parse(localStorage.getItem(PIN_KEY) || '{}') as Record<string, DemoPin> } catch { return {} } }
  const savePins = (all: Record<string, DemoPin>) => { try { localStorage.setItem(PIN_KEY, JSON.stringify(all)) } catch { /* fine */ } }
  const checkPin = (pin: string | undefined) => {
    const me = currentUser() ?? ''
    const all = pins()
    const p = all[me]
    if (!p) throw new PinRefused('pin_not_set')
    if (p.lockedUntil && p.lockedUntil > Date.now()) throw new PinRefused('pin_locked', null, new Date(p.lockedUntil).toISOString())
    if (pin === p.pin) { p.failed = 0; p.lockedUntil = null; savePins(all); return }
    p.failed += 1
    if (p.failed >= 5) { p.lockedUntil = Date.now() + 15 * 60_000; savePins(all); throw new PinRefused('pin_locked', null, new Date(p.lockedUntil).toISOString()) }
    savePins(all)
    throw new PinRefused('wrong_pin', 5 - p.failed)
  }

  const db: Db = {
    mode: 'demo',

    async signIn(email) {
      const id = /kay/i.test(email) ? DEMO_USERS.kay : DEMO_USERS.russel
      localStorage.setItem(SESSION_KEY, id)
      authListeners.forEach((l) => l(id))
      return {}
    },
    async signUp({ displayName }) {
      // Demo mode has one household and no real accounts; registering just walks you in.
      void displayName
      const id = DEMO_USERS.russel
      localStorage.setItem(SESSION_KEY, id)
      authListeners.forEach((l) => l(id))
      return { needsConfirmation: false }
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY)
      authListeners.forEach((l) => l(null))
    },
    async getUserId() {
      return currentUser()
    },
    onAuthChange(cb) {
      authListeners.add(cb)
      return () => authListeners.delete(cb)
    },
    async resetPassword() {
      return {}
    },
    async updatePassword() {
      return {}
    },

    async getBundle() {
      return delay({ household: state.household, profiles: state.profiles })
    },
    async updateProfile(id, patch) {
      return mutate('profiles', 'UPDATE', () => {
        const p = state.profiles.find((x) => x.id === id)!
        Object.assign(p, patch)
        return { ...p } as Profile
      })
    },

    async renameHousehold(_id, name) {
      return mutate('profiles', 'UPDATE', () => { state.household.name = name })
    },
    async setHouseholdCurrency(_id, code) {
      return mutate('profiles', 'UPDATE', () => { state.household.currency = code })
    },
    async updateHousehold(_id, patch) {
      return mutate('profiles', 'UPDATE', () => { Object.assign(state.household, patch) })
    },
    async removeMember(userId) {
      return mutate('profiles', 'DELETE', () => { state.profiles = state.profiles.filter((p) => p.id !== userId) })
    },
    async leaveHousehold() {
      // Nothing to leave in demo mode — signing out is the honest equivalent.
      localStorage.removeItem(SESSION_KEY)
      authListeners.forEach((l) => l(null))
    },

    async listInvites() {
      return delay([...(state.invites ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    },
    async createInvite(invitedName) {
      return mutate('invites', 'INSERT', () => {
        const inv: Invite = {
          id: uid(),
          household_id: state.household.id,
          code: uid().replace(/-/g, '').slice(0, 10).toUpperCase(),
          created_by: currentUser() ?? DEMO_USERS.russel,
          invited_name: invitedName.trim(),
          expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
          accepted_by: null, accepted_at: null, revoked_at: null,
          created_at: new Date().toISOString(),
        }
        state.invites = [...(state.invites ?? []), inv]
        return inv
      })
    },
    async revokeInvite(id) {
      return mutate('invites', 'UPDATE', () => {
        const inv = (state.invites ?? []).find((i) => i.id === id)
        if (inv) inv.revoked_at = new Date().toISOString()
      })
    },
    async previewInvite(code) {
      const inv = (state.invites ?? []).find((i) => i.code === code)
      if (!inv) return delay<InvitePreview | null>(null)
      const s: InvitePreview['state'] = inv.accepted_at ? 'used'
        : inv.revoked_at ? 'cancelled'
          : new Date(inv.expires_at) < new Date() ? 'expired' : 'live'
      return delay<InvitePreview | null>({
        household_name: state.household.name,
        invited_by: (state.profiles.find((p) => p.id === inv.created_by)?.display_name ?? 'Someone').split(' ')[0]!,
        invited_name: inv.invited_name,
        state: s,
      })
    },

    async listNudges() {
      return delay([...(state.nudges ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    },
    async createNudge(input) {
      return mutate('nudges', 'INSERT', () => {
        const n: Nudge = { ...input, id: uid(), read_at: null, created_at: nowISO() }
        state.nudges = [...(state.nudges ?? []), n]
        return n
      })
    },
    async markNudgesRead(ids) {
      await mutate('nudges', 'UPDATE', () => {
        ;(state.nudges ?? []).forEach((n) => { if (ids.includes(n.id)) n.read_at = nowISO() })
        return undefined
      }, { ids })
    },
    async deleteNudge(id) {
      await mutate('nudges', 'DELETE', () => { state.nudges = (state.nudges ?? []).filter((n) => n.id !== id); return undefined }, { id })
    },

    async listProjects() {
      return delay([...state.projects])
    },
    async createProject(input) {
      return mutate('projects', 'INSERT', () => {
        const p: Project = { blocked_on: null, blocked_note: '', blocked_since: null, ...input, id: uid(), sort_order: state.projects.length + 1, created_at: nowISO(), updated_at: nowISO() }
        state.projects.unshift(p)
        return p
      })
    },
    async updateProject(id, patch) {
      return mutate('projects', 'UPDATE', () => {
        const p = state.projects.find((x) => x.id === id)!
        Object.assign(p, patch, { updated_at: nowISO() })
        return { ...p }
      })
    },
    async deleteProject(id) {
      await mutate('projects', 'DELETE', () => {
        state.projects = state.projects.filter((x) => x.id !== id)
        state.images = state.images.filter((x) => x.project_id !== id)
        state.quotes = state.quotes.filter((x) => x.project_id !== id)
        state.expenses = state.expenses.filter((x) => x.project_id !== id)
        state.tasks = state.tasks.filter((x) => x.project_id !== id)
        state.boardItems = state.boardItems.filter((x) => x.project_id !== id)
        state.visits = (state.visits ?? []).filter((x) => x.project_id !== id)
        return undefined
      }, { id })
    },

    async listVisits() {
      return delay([...(state.visits ?? [])].sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.created_at.localeCompare(a.created_at)))
    },
    async createVisit(input) {
      return mutate('site_visits', 'INSERT', () => {
        const v: SiteVisit = { ...input, id: uid(), created_at: nowISO() }
        state.visits = [...(state.visits ?? []), v]
        return v
      })
    },
    async updateVisit(id, patch) {
      return mutate('site_visits', 'UPDATE', () => {
        const v = (state.visits ?? []).find((x) => x.id === id)!
        Object.assign(v, patch)
        return { ...v }
      })
    },
    async deleteVisit(id) {
      await mutate('site_visits', 'DELETE', () => { state.visits = (state.visits ?? []).filter((x) => x.id !== id); return undefined }, { id })
    },

    async listImages() {
      return delay([...state.images])
    },
    async addImage(input) {
      return mutate('project_images', 'INSERT', () => {
        const i: ProjectImage = { ...input, id: uid(), created_at: nowISO() }
        state.images.push(i)
        return i
      })
    },
    async updateImage(id, patch) {
      return mutate('project_images', 'UPDATE', () => {
        const i = state.images.find((x) => x.id === id)!
        Object.assign(i, patch)
        return { ...i }
      })
    },
    async deleteImage(id) {
      await mutate('project_images', 'DELETE', () => { state.images = state.images.filter((x) => x.id !== id); return undefined }, { id })
    },

    async listContacts() {
      return delay([...state.contacts])
    },
    async createContact(input) {
      return mutate('contacts', 'INSERT', () => {
        const c: Contact = { ...input, id: uid(), created_at: nowISO() }
        state.contacts.push(c)
        return c
      })
    },
    async updateContact(id, patch) {
      return mutate('contacts', 'UPDATE', () => {
        const c = state.contacts.find((x) => x.id === id)!
        Object.assign(c, patch)
        return { ...c }
      })
    },
    async deleteContact(id) {
      await mutate('contacts', 'DELETE', () => {
        state.contacts = state.contacts.filter((x) => x.id !== id)
        state.quotes.forEach((q) => { if (q.contact_id === id) q.contact_id = null })
        return undefined
      }, { id })
    },

    async listQuotes() {
      return delay([...state.quotes])
    },
    async createQuote(input) {
      return mutate('quotes', 'INSERT', () => {
        const q: Quote = { ...input, id: uid(), created_at: nowISO() }
        state.quotes.push(q)
        return q
      })
    },
    async updateQuote(id, patch) {
      return mutate('quotes', 'UPDATE', () => {
        const q = state.quotes.find((x) => x.id === id)!
        Object.assign(q, patch)
        return { ...q }
      })
    },
    async deleteQuote(id) {
      // Mirror "on delete set null": a deposit stays as money spent, just no longer tied to a quote.
      state.expenses = state.expenses.map((e) => (e.quote_id === id ? { ...e, quote_id: null } : e))
      await mutate('quotes', 'DELETE', () => { state.quotes = state.quotes.filter((x) => x.id !== id); return undefined }, { id })
    },
    async listExpenses() {
      return delay([...state.expenses])
    },
    async createExpense(input) {
      return mutate('expenses', 'INSERT', () => {
        const e: Expense = { ...input, id: uid(), created_at: nowISO() }
        state.expenses.push(e)
        return e
      })
    },
    async updateExpense(id, patch) {
      return mutate('expenses', 'UPDATE', () => {
        const e = state.expenses.find((x) => x.id === id)!
        Object.assign(e, patch)
        return { ...e }
      })
    },
    async deleteExpense(id) {
      await mutate('expenses', 'DELETE', () => { state.expenses = state.expenses.filter((x) => x.id !== id); return undefined }, { id })
    },

    async listTasks() {
      return delay([...state.tasks])
    },
    async createTask(input) {
      return mutate('tasks', 'INSERT', () => {
        const siblings = state.tasks.filter((t) => t.project_id === input.project_id)
        const t: Task = { ...input, sort_order: input.sort_order ?? siblings.length + 1, id: uid(), completed_at: null, created_at: nowISO() }
        state.tasks.push(t)
        return t
      })
    },
    async updateTask(id, patch) {
      return mutate('tasks', 'UPDATE', () => {
        const t = state.tasks.find((x) => x.id === id)!
        Object.assign(t, patch)
        return { ...t }
      })
    },
    async deleteTask(id) {
      await mutate('tasks', 'DELETE', () => { state.tasks = state.tasks.filter((x) => x.id !== id); return undefined }, { id })
    },

    async listShopping() {
      return delay([...(state.shopping ?? [])].sort((a, b) => a.sort_order - b.sort_order))
    },
    async createShoppingItem(input) {
      return mutate('shopping_items', 'INSERT', () => {
        const list = (state.shopping ??= [])
        const s: ShoppingItem = { ...input, sort_order: input.sort_order ?? list.length + 1, id: uid(), done_by: null, completed_at: null, created_at: nowISO() }
        list.push(s)
        return s
      })
    },
    async updateShoppingItem(id, patch) {
      return mutate('shopping_items', 'UPDATE', () => {
        const s = (state.shopping ??= []).find((x) => x.id === id)!
        Object.assign(s, patch)
        return { ...s }
      })
    },
    async deleteShoppingItem(id) {
      await mutate('shopping_items', 'DELETE', () => { state.shopping = (state.shopping ?? []).filter((x) => x.id !== id); return undefined }, { id })
    },
    async clearShoppingDone(ids) {
      await mutate('shopping_items', 'DELETE', () => { state.shopping = (state.shopping ?? []).filter((x) => !ids.includes(x.id)); return undefined })
    },

    async listHouseTasks() {
      return delay([...(state.houseTasks ?? [])].sort((a, b) => a.sort_order - b.sort_order))
    },
    async createHouseTask(input) {
      return mutate('house_tasks', 'INSERT', () => {
        const list = (state.houseTasks ??= [])
        const t: HouseTask = { ...input, sort_order: input.sort_order ?? list.length + 1, id: uid(), done_by: null, completed_at: null, created_at: nowISO() }
        list.push(t)
        return t
      })
    },
    async updateHouseTask(id, patch) {
      return mutate('house_tasks', 'UPDATE', () => {
        const t = (state.houseTasks ??= []).find((x) => x.id === id)!
        Object.assign(t, patch)
        return { ...t }
      })
    },
    async deleteHouseTask(id) {
      await mutate('house_tasks', 'DELETE', () => { state.houseTasks = (state.houseTasks ?? []).filter((x) => x.id !== id); return undefined }, { id })
    },

    async listReadings() {
      return delay([...(state.readings ?? [])].sort((a, b) => a.read_on.localeCompare(b.read_on) || a.created_at.localeCompare(b.created_at)))
    },
    async createReading(input) {
      return mutate('meter_readings', 'INSERT', () => {
        const r: MeterReading = { ...input, id: uid(), created_at: nowISO() }
        ;(state.readings ??= []).push(r)
        return r
      })
    },
    async updateReading(id, patch) {
      return mutate('meter_readings', 'UPDATE', () => {
        const r = (state.readings ??= []).find((x) => x.id === id)!
        Object.assign(r, patch)
        return { ...r }
      })
    },
    async deleteReading(id) {
      await mutate('meter_readings', 'DELETE', () => { state.readings = (state.readings ?? []).filter((x) => x.id !== id); return undefined }, { id })
    },

    async listPurchases() {
      return delay([...(state.purchases ?? [])].sort((a, b) => a.bought_on.localeCompare(b.bought_on) || a.created_at.localeCompare(b.created_at)))
    },
    async createPurchase(input) {
      return mutate('utility_purchases', 'INSERT', () => {
        const p: UtilityPurchase = { ...input, id: uid(), created_at: nowISO() }
        ;(state.purchases ??= []).push(p)
        return p
      })
    },
    async updatePurchase(id, patch) {
      return mutate('utility_purchases', 'UPDATE', () => {
        const p = (state.purchases ??= []).find((x) => x.id === id)!
        Object.assign(p, patch)
        return { ...p }
      })
    },
    async deletePurchase(id) {
      await mutate('utility_purchases', 'DELETE', () => { state.purchases = (state.purchases ?? []).filter((x) => x.id !== id); return undefined }, { id })
    },

    async listBoardItems(projectId) {
      return delay(state.boardItems.filter((b) => b.project_id === projectId))
    },
    async createBoardItem(input) {
      return mutate('board_items', 'INSERT', () => {
        const b: BoardItem = { ...input, id: uid(), created_at: nowISO(), updated_at: nowISO() }
        state.boardItems.push(b)
        return b
      })
    },
    async updateBoardItem(id, patch) {
      return mutate('board_items', 'UPDATE', () => {
        const b = state.boardItems.find((x) => x.id === id)!
        Object.assign(b, patch, { updated_at: nowISO() })
        return { ...b }
      })
    },
    async updateBoardItems(patches) {
      await mutate('board_items', 'UPDATE', () => {
        patches.forEach(({ id, patch }) => {
          const b = state.boardItems.find((x) => x.id === id)
          if (b) Object.assign(b, patch, { updated_at: nowISO() })
        })
        return undefined
      }, { ids: patches.map((p) => p.id) })
    },
    async deleteBoardItem(id) {
      await mutate('board_items', 'DELETE', () => { state.boardItems = state.boardItems.filter((x) => x.id !== id); return undefined }, { id })
    },

    async listXp() {
      return delay([...state.xp])
    },
    async addXp(input) {
      return mutate('xp_events', 'INSERT', () => {
        const e: XpEvent = { ...input, id: uid(), created_at: nowISO() }
        state.xp.push(e)
        return e
      })
    },
    async listAchievements() {
      return delay([...state.achievements])
    },
    async unlockAchievement(input) {
      if (state.achievements.some((a) => a.key === input.key)) return null
      return mutate('achievements', 'INSERT', () => {
        const a: Achievement = { ...input, id: uid(), unlocked_at: nowISO() }
        state.achievements.push(a)
        return a
      })
    },

    async unfurl(url) {
      // No backend in demo mode: invent a plausible listing and paint a placeholder picture,
      // so the whole add-a-price flow can be walked through (and tested) offline.
      await new Promise((r) => setTimeout(r, 450))
      const clean = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
      let host = clean
      try { host = new URL(clean).hostname.replace(/^www\./, '') } catch { /* keep the raw text */ }
      const slug = clean.split('?')[0].split('#')[0].replace(/\/$/, '').split('/').pop() || 'Item'
      const title = decodeURIComponent(slug).replace(/[-_+]/g, ' ').replace(/\.\w{2,4}$/, '').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60)
      // A stable pseudo-price per link, so the same paste always looks the same.
      let seed = 0
      for (const ch of clean) seed = (seed * 31 + ch.charCodeAt(0)) % 100000
      const price = Math.round((60 + (seed % 4000)) * 100) / 100
      const supplier = host.split('.')[0].replace(/\b\w/g, (c) => c.toUpperCase())
      let image: string | null = null
      try {
        const c = document.createElement('canvas')
        c.width = 400; c.height = 300
        const g = c.getContext('2d')!
        const hue = seed % 360
        const grad = g.createLinearGradient(0, 0, 400, 300)
        grad.addColorStop(0, `hsl(${hue} 32% 82%)`)
        grad.addColorStop(1, `hsl(${(hue + 40) % 360} 28% 62%)`)
        g.fillStyle = grad; g.fillRect(0, 0, 400, 300)
        g.fillStyle = 'rgba(30,26,22,0.72)'
        g.font = '600 22px system-ui, sans-serif'
        g.textAlign = 'center'
        g.fillText(title.slice(0, 22) || 'Sample', 200, 158)
        image = c.toDataURL('image/png')
      } catch { /* no canvas — the card falls back to the site's icon */ }
      return { url: clean, domain: host, title, price, currency: 'ZAR', supplier, image, imageUrl: null } satisfies Unfurled
    },
    async searchProducts(q) {
      // No search key in demo mode: hand back a believable South African shelf so the whole
      // find-it-and-add-it flow can be walked through (and tested) offline.
      await new Promise((r) => setTimeout(r, 500))
      const term = q.trim().replace(/\s+/g, ' ')
      if (term.length < 2) return []
      const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const Title = term.replace(/\b\w/g, (c) => c.toUpperCase())
      const shops: { domain: string; name: string; dressing: string; favoured: boolean }[] = [
        { domain: 'builders.co.za', name: 'Builders', dressing: '', favoured: true },
        { domain: 'leroymerlin.co.za', name: 'Leroy Merlin', dressing: ' — Brushed Finish', favoured: true },
        { domain: 'takealot.com', name: 'Takealot', dressing: ' (Pack of 2)', favoured: true },
        { domain: 'gelmar.co.za', name: 'Gelmar', dressing: ' 160mm', favoured: true },
        { domain: 'chamberlains.co.za', name: 'Chamberlains', dressing: ' Heavy Duty', favoured: true },
        { domain: 'thelittlehardwareshop.co.za', name: 'The Little Hardware Shop', dressing: ' — Imported', favoured: false },
      ]
      return shops.map((shop) => ({
        title: `${Title}${shop.dressing} | ${shop.name}`,
        url: `https://www.${shop.domain}/p/${slug}`,
        domain: shop.domain,
        snippet: `Shop ${term} at ${shop.name}. Delivery countrywide, collect in store.`,
        favoured: shop.favoured,
      }))
    },
    async askTheWord(context, translation, hidden = false) {
      // No model in demo mode: the same letter for everyone, after a pause long enough to show
      // the waiting screen. The live Hub writes each one from its own Bible index.
      await new Promise((r) => setTimeout(r, 2200))
      const me = currentUser() ?? DEMO_USERS.russel
      if (hidden && !pins()[me]) throw new PinRefused('pin_not_set')
      // The first sentence stands in for the theme the model would name.
      const first = context.trim().split(/(?<=[.!?])\s/)[0]!.replace(/[.!?]+$/, '')
      const g: Guidance = {
        id: uid(), user_id: me, created_at: nowISO(), context: context.trim(), translation,
        theme: first.length > 40 ? `${first.slice(0, 37).replace(/\s+\S*$/, '')}…` : first,
        response: DEMO_LETTER, plan_done: {}, model: 'demo', hidden,
      }
      ;(state.guidance ??= []).unshift(g)
      persist()
      return g
    },
    async listGuidance() {
      const me = currentUser()
      return delay((state.guidance ?? []).filter((g) => g.user_id === me && !g.hidden).sort((a, b) => b.created_at.localeCompare(a.created_at)))
    },
    async deleteGuidance(id, pin) {
      const g = (state.guidance ?? []).find((x) => x.id === id)
      if (!g) throw new PinRefused('not_found')
      if (g.hidden) checkPin(pin)
      state.guidance = (state.guidance ?? []).filter((x) => x.id !== id)
      persist()
    },
    async setReadingDone(id, index, done, pin) {
      const g = (state.guidance ?? []).find((x) => x.id === id)
      if (!g) throw new PinRefused('not_found')
      if (g.hidden) checkPin(pin)
      const plan_done = { ...g.plan_done }
      if (done) plan_done[String(index)] = nowISO().slice(0, 10)
      else delete plan_done[String(index)]
      g.plan_done = plan_done
      persist()
      return { ...g }
    },

    // The demo keeps its PINs in plain sight in localStorage; the live Hub keeps a bcrypt hash in
    // the database and refuses hidden rows without it. Same shape, so the panel cannot tell.
    async pinStatus() {
      const me = currentUser() ?? ''
      const p = pins()[me]
      return delay({ has_pin: Boolean(p), locked_until: p && p.lockedUntil && p.lockedUntil > Date.now() ? new Date(p.lockedUntil).toISOString() : null, hidden_count: (state.guidance ?? []).filter((g) => g.user_id === me && g.hidden).length })
    },
    async setPin(pin, oldPin) {
      const me = currentUser() ?? ''
      if (!/^[0-9]{4,8}$/.test(pin)) throw new PinRefused('bad_pin')
      if (pins()[me]) checkPin(oldPin)
      const all = pins(); all[me] = { pin, failed: 0, lockedUntil: null }; savePins(all)
    },
    async forgetPin() {
      const me = currentUser() ?? ''
      const before = (state.guidance ?? []).length
      state.guidance = (state.guidance ?? []).filter((g) => !(g.user_id === me && g.hidden))
      persist()
      const all = pins(); delete all[me]; savePins(all)
      return before - (state.guidance ?? []).length
    },
    async hideGuidance(id) {
      const me = currentUser() ?? ''
      if (!pins()[me]) throw new PinRefused('pin_not_set')
      const g = (state.guidance ?? []).find((x) => x.id === id && x.user_id === me && !x.hidden)
      if (!g) throw new PinRefused('not_found')
      g.hidden = true
      persist()
    },
    async unhideGuidance(id, pin) {
      checkPin(pin)
      const g = (state.guidance ?? []).find((x) => x.id === id && x.hidden)
      if (!g) throw new PinRefused('not_found')
      g.hidden = false
      persist()
      return { ...g }
    },
    async listHiddenGuidance(pin) {
      checkPin(pin)
      const me = currentUser()
      return (state.guidance ?? []).filter((g) => g.user_id === me && g.hidden).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async readPassage(reading) {
      await new Promise((r) => setTimeout(r, 350))
      if (reading.book_id === 19 && reading.chapter === 23) return PSALM_23
      return {
        book_id: reading.book_id, book: '', chapter: reading.chapter, start: reading.start ?? 1, end: reading.end ?? 1,
        verses: [{ verse: reading.start ?? 1, text: 'In the demo only Psalm 23 can be opened here. The live Hub reads every chapter from its own Bible.' }],
      }
    },
    async upload(blob) {
      // Store as a data URL so it survives a refresh (within localStorage limits).
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    },
    async resolveUrl(path) {
      return path
    },
    async remove() {
      /* nothing to do for data URLs */
    },

    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    presence(_channel, me, onSync) {
      // Show the other half of the household "viewing" after a moment — a little demo magic.
      const other = state.profiles.find((p) => p.id !== me.user_id)
      onSync([me])
      const t = setTimeout(() => {
        if (other) onSync([me, { user_id: other.id, name: other.display_name, color: other.color }])
      }, 2500)
      return () => clearTimeout(t)
    },
  }

  return db
}

export function resetDemo() {
  localStorage.removeItem(STORAGE_KEY)
}
