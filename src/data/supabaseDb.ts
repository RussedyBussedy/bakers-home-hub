import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ChangePayload, ChangeTable, Db } from './db'
import type { Achievement, BoardItem, Contact, Expense, Household, Nudge, Presence, Profile, Project, ProjectImage, Quote, SiteVisit, Task, Unfurled, XpEvent } from './types'

const BUCKET = 'media'
const SIGNED_TTL = 60 * 60 * 24 // 24h
const URL_CACHE_KEY = 'hub-signed-urls-v1'

type UrlCache = Record<string, { url: string; exp: number }>

function loadUrlCache(): UrlCache {
  try {
    return JSON.parse(localStorage.getItem(URL_CACHE_KEY) || '{}') as UrlCache
  } catch {
    return {}
  }
}

function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? 'Something went wrong')
}

export function createSupabaseDb(url: string, anonKey: string): Db {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  let urlCache = loadUrlCache()
  const saveUrlCache = () => {
    try {
      // prune expired
      const now = Date.now()
      for (const k of Object.keys(urlCache)) if (urlCache[k]!.exp < now) delete urlCache[k]
      localStorage.setItem(URL_CACHE_KEY, JSON.stringify(urlCache))
    } catch {
      /* ignore */
    }
  }

  const one = async <T,>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
    const { data, error } = await q
    if (error) fail(error)
    return data as T
  }
  const many = async <T,>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const { data, error } = await q
    if (error) fail(error)
    return (data ?? []) as T[]
  }

  const db: Db = {
    mode: 'supabase',

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      return error ? { error: friendlyAuthError(error.message) } : {}
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async getUserId() {
      const { data } = await sb.auth.getSession()
      return data.session?.user.id ?? null
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session?.user.id ?? null))
      return () => data.subscription.unsubscribe()
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/settings?recovery=1` })
      return error ? { error: error.message } : {}
    },
    async updatePassword(newPassword) {
      const { error } = await sb.auth.updateUser({ password: newPassword })
      return error ? { error: error.message } : {}
    },

    async getBundle(userId) {
      const profile = await one<Profile>(sb.from('profiles').select('*').eq('id', userId).single())
      const household = await one<Household>(sb.from('households').select('*').eq('id', profile.household_id).single())
      const profiles = await many<Profile>(sb.from('profiles').select('*').eq('household_id', profile.household_id).order('created_at'))
      return { household, profiles }
    },
    async updateProfile(id, patch) {
      return one<Profile>(sb.from('profiles').update(patch).eq('id', id).select().single())
    },

    async listNudges() {
      return many<Nudge>(sb.from('nudges').select('*').order('created_at', { ascending: false }).limit(200))
    },
    async createNudge(input) {
      return one<Nudge>(sb.from('nudges').insert(input).select().single())
    },
    async markNudgesRead(ids) {
      if (ids.length === 0) return
      await one(sb.from('nudges').update({ read_at: new Date().toISOString() }).in('id', ids))
    },
    async deleteNudge(id) {
      await one(sb.from('nudges').delete().eq('id', id))
    },

    async listProjects() {
      return many<Project>(sb.from('projects').select('*').order('updated_at', { ascending: false }))
    },
    async createProject(input) {
      return one<Project>(sb.from('projects').insert(input).select().single())
    },
    async updateProject(id, patch) {
      return one<Project>(sb.from('projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    },
    async deleteProject(id) {
      const household = await db.getUserId().then(async (uid) => (uid ? (await one<Profile>(sb.from('profiles').select('*').eq('id', uid).single())).household_id : null))
      await one(sb.from('projects').delete().eq('id', id))
      if (household) void removeFolder(`${household}/${id}`)
    },

    async listImages() {
      return many<ProjectImage>(sb.from('project_images').select('*').order('created_at'))
    },
    async addImage(input) {
      return one<ProjectImage>(sb.from('project_images').insert(input).select().single())
    },
    async updateImage(id, patch) {
      return one<ProjectImage>(sb.from('project_images').update(patch).eq('id', id).select().single())
    },
    async deleteImage(id) {
      await one(sb.from('project_images').delete().eq('id', id))
    },

    async listContacts() {
      return many<Contact>(sb.from('contacts').select('*').order('name'))
    },
    async createContact(input) {
      return one<Contact>(sb.from('contacts').insert(input).select().single())
    },
    async updateContact(id, patch) {
      return one<Contact>(sb.from('contacts').update(patch).eq('id', id).select().single())
    },
    async deleteContact(id) {
      await one(sb.from('contacts').delete().eq('id', id))
    },

    async listQuotes() {
      return many<Quote>(sb.from('quotes').select('*').order('created_at'))
    },
    async createQuote(input) {
      return one<Quote>(sb.from('quotes').insert(input).select().single())
    },
    async updateQuote(id, patch) {
      return one<Quote>(sb.from('quotes').update(patch).eq('id', id).select().single())
    },
    async deleteQuote(id) {
      await one(sb.from('quotes').delete().eq('id', id))
    },
    async listExpenses() {
      return many<Expense>(sb.from('expenses').select('*').order('date'))
    },
    async createExpense(input) {
      return one<Expense>(sb.from('expenses').insert(input).select().single())
    },
    async updateExpense(id, patch) {
      return one<Expense>(sb.from('expenses').update(patch).eq('id', id).select().single())
    },
    async deleteExpense(id) {
      await one(sb.from('expenses').delete().eq('id', id))
    },

    async listVisits() {
      return many<SiteVisit>(sb.from('site_visits').select('*').order('visit_date', { ascending: false }).order('created_at', { ascending: false }))
    },
    async createVisit(input) {
      return one<SiteVisit>(sb.from('site_visits').insert(input).select().single())
    },
    async updateVisit(id, patch) {
      return one<SiteVisit>(sb.from('site_visits').update(patch).eq('id', id).select().single())
    },
    async deleteVisit(id) {
      await one(sb.from('site_visits').delete().eq('id', id))
    },

    async listTasks() {
      return many<Task>(sb.from('tasks').select('*').order('sort_order'))
    },
    async createTask(input) {
      return one<Task>(sb.from('tasks').insert({ sort_order: 0, ...input }).select().single())
    },
    async updateTask(id, patch) {
      return one<Task>(sb.from('tasks').update(patch).eq('id', id).select().single())
    },
    async deleteTask(id) {
      await one(sb.from('tasks').delete().eq('id', id))
    },

    async listBoardItems(projectId) {
      return many<BoardItem>(sb.from('board_items').select('*').eq('project_id', projectId).order('z'))
    },
    async createBoardItem(input) {
      return one<BoardItem>(sb.from('board_items').insert(input).select().single())
    },
    async updateBoardItem(id, patch) {
      return one<BoardItem>(sb.from('board_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    },
    async updateBoardItems(patches) {
      await Promise.all(patches.map(({ id, patch }) => one(sb.from('board_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))))
    },
    async deleteBoardItem(id) {
      await one(sb.from('board_items').delete().eq('id', id))
    },

    async listXp() {
      return many<XpEvent>(sb.from('xp_events').select('*').order('created_at'))
    },
    async addXp(input) {
      return one<XpEvent>(sb.from('xp_events').insert(input).select().single())
    },
    async listAchievements() {
      return many<Achievement>(sb.from('achievements').select('*').order('unlocked_at'))
    },
    async unlockAchievement(input) {
      const { data, error } = await sb
        .from('achievements')
        .upsert(input, { onConflict: 'household_id,key', ignoreDuplicates: true })
        .select()
        .maybeSingle()
      if (error) fail(error)
      return (data as Achievement | null) ?? null
    },

    async unfurl(url) {
      const { data, error } = await sb.functions.invoke<Unfurled & { error?: string }>('unfurl', { body: { url } })
      if (error) throw new Error('Could not reach the link reader. Is the "unfurl" function deployed?')
      if (!data) throw new Error('The link reader sent nothing back.')
      if (data.error) throw new Error(data.error)
      return data
    },
    async upload(blob, path) {
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false })
      if (error) fail(error)
      return path
    },
    async resolveUrl(path) {
      if (/^(https?:|data:|blob:)/.test(path)) return path
      const cached = urlCache[path]
      if (cached && cached.exp > Date.now() + 60_000) return cached.url
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL)
      if (error || !data) fail(error)
      urlCache[path] = { url: data.signedUrl, exp: Date.now() + SIGNED_TTL * 1000 }
      saveUrlCache()
      return data.signedUrl
    },
    async remove(paths) {
      const real = paths.filter((p) => !/^(https?:|data:|blob:)/.test(p))
      if (real.length === 0) return
      await sb.storage.from(BUCKET).remove(real)
      real.forEach((p) => delete urlCache[p])
      saveUrlCache()
    },

    subscribe(onChange) {
      const channel = sb
        .channel('household-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          onChange({
            table: payload.table as ChangeTable,
            type: payload.eventType as ChangePayload['type'],
            row: (payload.new as Record<string, unknown>) ?? null,
            old: (payload.old as Record<string, unknown>) ?? null,
          })
        })
        .subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
    presence(name, me, onSync) {
      const channel = sb.channel(`presence:${name}`, { config: { presence: { key: me.user_id } } })
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState<Presence>()
          const list: Presence[] = []
          const seen = new Set<string>()
          for (const key of Object.keys(state)) {
            for (const p of state[key] ?? []) {
              if (p.user_id && !seen.has(p.user_id)) {
                seen.add(p.user_id)
                list.push({ user_id: p.user_id, name: p.name, color: p.color })
              }
            }
          }
          onSync(list)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel.track(me)
        })
      return () => {
        void channel.untrack().then(() => sb.removeChannel(channel))
      }
    },
  }

  // Best-effort recursive delete of a storage folder (photos, quotes, receipts of a deleted project).
  async function removeFolder(prefix: string) {
    try {
      const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 })
      if (!data) return
      const files = data.filter((f) => f.id).map((f) => `${prefix}/${f.name}`)
      const folders = data.filter((f) => !f.id).map((f) => `${prefix}/${f.name}`)
      if (files.length) await sb.storage.from(BUCKET).remove(files)
      for (const f of folders) await removeFolder(f)
    } catch {
      /* orphaned files are harmless */
    }
  }

  // Keep the URL cache fresh if another tab updated it.
  window.addEventListener('storage', (e) => {
    if (e.key === URL_CACHE_KEY) urlCache = loadUrlCache()
  })

  return db
}

function friendlyAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match. Try again or reset your password."
  if (/email not confirmed/i.test(msg)) return 'This account still needs to be confirmed in Supabase (Authentication → Users).'
  if (/rate limit/i.test(msg)) return 'Too many attempts — give it a minute and try again.'
  return msg
}
