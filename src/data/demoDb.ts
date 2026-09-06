import type { ChangePayload, ChangeTable, Db } from './db'
import type { Achievement, BoardItem, Contact, Expense, Invite, InvitePreview, Nudge, Profile, Project, ProjectImage, Quote, SiteVisit, Task, Unfurled, XpEvent } from './types'
import { buildDemoState, DEMO_USERS, type DemoState } from './demoSeed'
import { uid } from '../lib/utils'

const STORAGE_KEY = 'hub-demo-state-v2'
const SESSION_KEY = 'hub-demo-user'
const CHANNEL = 'hub-demo-sync'

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
