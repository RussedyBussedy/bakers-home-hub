import { createClient, FunctionRegion, type SupabaseClient } from '@supabase/supabase-js'
import type { ChangePayload, ChangeTable, Db } from './db'
import { guessCurrencyCode, searchCountry } from '../lib/currency'
import { PinRefused, type Achievement, type BoardItem, type Contact, type Expense, type Guidance, type Household, type HouseTask, type Invite, type InvitePreview, type MeterReading, type Nudge, type Passage, type PinError, type PinStatus, type Presence, type ProductHit, type Profile, type Project, type ProjectImage, type Quote, type ShoppingItem, type SiteVisit, type Task, type Unfurled, type UtilityPurchase, type XpEvent } from './types'

/**
 * The Word's function runs next to the database rather than next to the phone: it makes several
 * short trips to Postgres for one long one to Gemini, so the region that matters is the database's.
 */
const WORD_REGION = FunctionRegion.EuWest1

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

/**
 * Why an edge function call failed, in words that point at the actual problem.
 *
 * "Is it deployed?" was the old answer to everything, which is worse than useless once it IS
 * deployed — it sends you to the dashboard when the real trouble was a dead signal or an expired
 * session. supabase-js hands back the raw Response on an HTTP failure, so the status can speak.
 */
export async function fnError(what: string, error: unknown): Promise<Error> {
  const e = error as { name?: string; message?: string; context?: Response }
  const status = e?.context?.status
  if (status === 404) return new Error(`The ${what} isn't set up on this Hub yet.`)
  if (status === 401 || status === 403) return new Error('Your sign-in has expired — sign out and back in.')
  if (status === 546 || status === 503) return new Error(`The ${what} ran out of steam on that one. Try again.`)
  if (status) {
    // Deno throwing inside the function returns the reason as text; show it rather than a number.
    const said = await e.context!.clone().text().catch(() => '')
    const detail = said.slice(0, 120).trim()
    return new Error(detail ? `The ${what} said: ${detail}` : `The ${what} answered ${status}.`)
  }
  if (e?.name === 'FunctionsFetchError' || /fetch|network/i.test(e?.message ?? '')) {
    return new Error(`Could not reach the ${what} — check your connection.`)
  }
  return new Error(e?.message || `The ${what} did not answer.`)
}

/**
 * The PIN functions answer with {ok, ...} rather than raising, so that a wrong guess still counts
 * (a raised error would roll the count back with everything else). This turns a refusal into a
 * PinRefused the panel can read — code, tries left, how long the lock lasts.
 */
async function pinCall<T = Record<string, unknown>>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args)
  if (error) fail(error)
  const r = (data ?? {}) as { ok?: boolean; error?: PinError; attempts_left?: number; locked_until?: string } & T
  if (!r.ok) throw new PinRefused(r.error ?? 'not_found', r.attempts_left ?? null, r.locked_until ?? null)
  return r
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
    async signUp({ email, password, displayName, householdName, inviteCode }) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        // The trigger on the auth table reads these: the name to show, what to call the new home,
        // and the invite to redeem (which wins — you join a home that is already named).
        options: {
          data: {
            display_name: displayName,
            // What this device reckons money looks like where it is. Ignored for someone joining
            // an existing home — that home already has a currency.
            currency: guessCurrencyCode(),
            ...(householdName ? { household_name: householdName } : {}),
            ...(inviteCode ? { invite_code: inviteCode } : {}),
          },
        },
      })
      if (error) return { error: friendlyAuthError(error.message) }
      // No session back means Supabase wants the address confirmed before they can sign in.
      return { needsConfirmation: !data.session }
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

    async listShopping() {
      return many<ShoppingItem>(sb.from('shopping_items').select('*').order('sort_order'))
    },
    async createShoppingItem(input) {
      return one<ShoppingItem>(sb.from('shopping_items').insert({ sort_order: 0, ...input }).select().single())
    },
    async updateShoppingItem(id, patch) {
      return one<ShoppingItem>(sb.from('shopping_items').update(patch).eq('id', id).select().single())
    },
    async deleteShoppingItem(id) {
      await one(sb.from('shopping_items').delete().eq('id', id))
    },
    async clearShoppingDone(ids) {
      if (!ids.length) return
      await one(sb.from('shopping_items').delete().in('id', ids))
    },

    async listHouseTasks() {
      return many<HouseTask>(sb.from('house_tasks').select('*').order('sort_order'))
    },
    async createHouseTask(input) {
      return one<HouseTask>(sb.from('house_tasks').insert({ sort_order: 0, ...input }).select().single())
    },
    async updateHouseTask(id, patch) {
      return one<HouseTask>(sb.from('house_tasks').update(patch).eq('id', id).select().single())
    },
    async deleteHouseTask(id) {
      await one(sb.from('house_tasks').delete().eq('id', id))
    },

    async listReadings() {
      return many<MeterReading>(sb.from('meter_readings').select('*').order('read_on', { ascending: true }).order('created_at', { ascending: true }))
    },
    async createReading(input) {
      return one<MeterReading>(sb.from('meter_readings').insert(input).select().single())
    },
    async updateReading(id, patch) {
      return one<MeterReading>(sb.from('meter_readings').update(patch).eq('id', id).select().single())
    },
    async deleteReading(id) {
      await one(sb.from('meter_readings').delete().eq('id', id))
    },

    async listPurchases() {
      return many<UtilityPurchase>(sb.from('utility_purchases').select('*').order('bought_on', { ascending: true }).order('created_at', { ascending: true }))
    },
    async createPurchase(input) {
      return one<UtilityPurchase>(sb.from('utility_purchases').insert(input).select().single())
    },
    async updatePurchase(id, patch) {
      return one<UtilityPurchase>(sb.from('utility_purchases').update(patch).eq('id', id).select().single())
    },
    async deletePurchase(id) {
      await one(sb.from('utility_purchases').delete().eq('id', id))
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

    async renameHousehold(id, name) {
      await one(sb.from('households').update({ name }).eq('id', id))
    },
    async setHouseholdCurrency(id, code) {
      await one(sb.from('households').update({ currency: code }).eq('id', id))
    },
    async updateHousehold(id, patch) {
      await one(sb.from('households').update(patch).eq('id', id))
    },
    async removeMember(userId) {
      const { error } = await sb.rpc('remove_member', { who: userId })
      if (error) fail(error)
    },
    async leaveHousehold() {
      const { error } = await sb.rpc('leave_household')
      if (error) fail(error)
    },

    async listInvites() {
      return many<Invite>(sb.from('invites').select('*').order('created_at', { ascending: false }).limit(50))
    },
    async createInvite(invitedName) {
      const { data: session } = await sb.auth.getSession()
      const me = session.session?.user.id
      if (!me) throw new Error('Not signed in')
      const { data: profile } = await sb.from('profiles').select('household_id').eq('id', me).single()
      if (!profile) throw new Error('No household')
      return one<Invite>(
        sb.from('invites')
          .insert({ household_id: profile.household_id, code: inviteCode(), created_by: me, invited_name: invitedName.trim() })
          .select().single(),
      )
    },
    async revokeInvite(id) {
      await one(sb.from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', id))
    },
    async previewInvite(code) {
      const { data, error } = await sb.rpc('invite_preview', { invite_code: code })
      if (error) fail(error)
      const row = (data as InvitePreview[] | null)?.[0]
      return row ?? null
    },

    async unfurl(url) {
      const { data, error } = await sb.functions.invoke<Unfurled & { error?: string }>('unfurl', { body: { url } })
      if (error) throw await fnError('link reader', error)
      if (!data) throw new Error('The link reader sent nothing back.')
      if (data.error) throw new Error(data.error)
      return data
    },
    async searchProducts(q) {
      const { data, error } = await sb.functions.invoke<{ results?: ProductHit[]; error?: string }>(
        'search',
        { body: { q, country: searchCountry() } },
      )
      if (error) throw await fnError('product search', error)
      if (!data) throw new Error('Search sent nothing back.')
      if (data.error) throw new Error(data.error)
      return data.results ?? []
    },

    async askTheWord(context, translation, hidden = false) {
      const { data, error } = await sb.functions.invoke<{ guidance?: Guidance; error?: string }>(
        'guide',
        { body: { action: 'guide', context, translation, hidden }, region: WORD_REGION },
      )
      if (error) throw await fnError('Word', error)
      if (!data) throw new Error('The Word sent nothing back.')
      if (data.error) throw new Error(data.error)
      if (!data.guidance) throw new Error('The Word sent nothing back.')
      return data.guidance
    },
    async listGuidance() {
      // The policies only ever return the letters in the open; hidden ones need listHiddenGuidance.
      return many<Guidance>(sb.from('bible_guidance').select('*').order('created_at', { ascending: false }).limit(100))
    },
    async deleteGuidance(id, pin) {
      if (pin != null) { await pinCall(sb, 'bible_hidden_delete', { p_id: id, p_pin: pin }); return }
      await one(sb.from('bible_guidance').delete().eq('id', id))
    },
    async setReadingDone(id, index, done, pin) {
      if (pin != null) return (await pinCall<{ letter: Guidance }>(sb, 'bible_hidden_tick', { p_id: id, p_index: index, p_done: done, p_pin: pin })).letter
      const current = await one<Pick<Guidance, 'plan_done'>>(sb.from('bible_guidance').select('plan_done').eq('id', id).single())
      const plan_done = { ...(current.plan_done ?? {}) }
      if (done) plan_done[String(index)] = new Date().toISOString().slice(0, 10)
      else delete plan_done[String(index)]
      return one<Guidance>(sb.from('bible_guidance').update({ plan_done }).eq('id', id).select().single())
    },

    async pinStatus() {
      const { data, error } = await sb.rpc('bible_pin_status')
      if (error) fail(error)
      const s = (data ?? {}) as Partial<PinStatus>
      return { has_pin: Boolean(s.has_pin), locked_until: s.locked_until ?? null, hidden_count: Number(s.hidden_count ?? 0) }
    },
    async setPin(pin, oldPin) {
      await pinCall(sb, 'bible_set_pin', { p_pin: pin, p_old: oldPin ?? null })
    },
    async forgetPin() {
      return (await pinCall<{ deleted: number }>(sb, 'bible_forget_pin', {})).deleted ?? 0
    },
    async hideGuidance(id) {
      await pinCall(sb, 'bible_hide', { p_id: id })
    },
    async unhideGuidance(id, pin) {
      return (await pinCall<{ letter: Guidance }>(sb, 'bible_unhide', { p_id: id, p_pin: pin })).letter
    },
    async listHiddenGuidance(pin) {
      return (await pinCall<{ letters: Guidance[] }>(sb, 'bible_hidden_letters', { p_pin: pin })).letters ?? []
    },
    async readPassage(reading, translation) {
      const { data, error } = await sb.functions.invoke<{ passage?: Passage; error?: string }>(
        'guide',
        { body: { action: 'passage', book: reading.book_id, chapter: reading.chapter, start: reading.start, end: reading.end, translation }, region: WORD_REGION },
      )
      if (error) throw await fnError('Word', error)
      if (!data?.passage) throw new Error(data?.error || 'That passage could not be found.')
      return data.passage
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
  if (/email not confirmed/i.test(msg)) return 'Check your email for the confirmation link — the account is not live until you follow it.'
  if (/already registered|already been registered|user already exists/i.test(msg)) return 'There is already an account with that email. Sign in instead.'
  if (/password.*(6|at least|short)/i.test(msg)) return 'Pick a password of at least six characters.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts — give it a minute and try again. (Confirmation emails are limited to a handful an hour.)'
  if (/signups? not allowed|disabled/i.test(msg)) return 'New accounts are switched off on this hub at the moment.'
  return msg
}

/** Short, unambiguous invite code — no 0/O or 1/I to misread off a phone screen. */
function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}
