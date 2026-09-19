import type {
  Achievement, BoardItem, Contact, Expense, Guidance, Household, HouseholdBundle, HouseTask, MeterReading, NewBoardItem, NewContact, NewExpense,
  Invite, InvitePreview, NewHouseTask, NewImage, NewMeterReading, NewNudge, NewProject, NewQuote, NewShoppingItem, NewSiteVisit, NewTask, NewUtilityPurchase,
  Nudge, Passage, PinStatus, PlanReading, Presence, ProductHit, Profile, Project, ProjectImage, Quote, ShoppingItem, SiteVisit, Study, Task, Translation, Unfurled, UtilityPurchase, XpEvent,
} from './types'

export type ChangeTable =
  | 'projects' | 'project_images' | 'contacts' | 'quotes' | 'expenses' | 'tasks'
  | 'board_items' | 'xp_events' | 'achievements' | 'profiles' | 'nudges' | 'site_visits' | 'invites'
  | 'shopping_items' | 'house_tasks' | 'meter_readings' | 'utility_purchases'

export interface ChangePayload {
  table: ChangeTable
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  row: Record<string, unknown> | null
  old: Record<string, unknown> | null
}

export interface AuthResult { error?: string }

/**
 * The single seam between the UI and the backend. There are two
 * implementations: Supabase (production) and an in-memory demo.
 */
export interface Db {
  readonly mode: 'supabase' | 'demo'

  // ---- auth --------------------------------------------------------
  signIn(email: string, password: string): Promise<AuthResult>
  /** Registers an account. With a live invite code the person joins that home; without one they get their own. */
  signUp(input: { email: string; password: string; displayName: string; householdName?: string | null; inviteCode?: string | null }): Promise<AuthResult & { needsConfirmation?: boolean }>
  signOut(): Promise<void>
  getUserId(): Promise<string | null>
  onAuthChange(cb: (userId: string | null) => void): () => void
  resetPassword(email: string): Promise<AuthResult>
  updatePassword(newPassword: string): Promise<AuthResult>

  // ---- household ---------------------------------------------------
  getBundle(userId: string): Promise<HouseholdBundle>
  updateProfile(id: string, patch: Partial<Pick<Profile, 'display_name' | 'color' | 'phone'>>): Promise<Profile>
  renameHousehold(id: string, name: string): Promise<void>
  setHouseholdCurrency(id: string, code: string): Promise<void>
  /** Meter numbers, municipal account and address — what the evidence pack needs to name. */
  updateHousehold(id: string, patch: Partial<Pick<Household, 'water_meter_no' | 'electricity_meter_no' | 'municipal_account' | 'address' | 'water_meter_decimals' | 'electricity_meter_decimals'>>): Promise<void>
  /** Moves somebody out of this home and into an empty one of their own. */
  removeMember(userId: string): Promise<void>
  leaveHousehold(): Promise<void>

  // ---- invites -----------------------------------------------------
  listInvites(): Promise<Invite[]>
  createInvite(invitedName: string): Promise<Invite>
  revokeInvite(id: string): Promise<void>
  /** Readable while signed out: what home a code points at, and whether it is still good. */
  previewInvite(code: string): Promise<InvitePreview | null>

  // ---- nudges ------------------------------------------------------
  listNudges(): Promise<Nudge[]>
  createNudge(input: NewNudge): Promise<Nudge>
  markNudgesRead(ids: string[]): Promise<void>
  deleteNudge(id: string): Promise<void>

  // ---- projects ----------------------------------------------------
  listProjects(): Promise<Project[]>
  createProject(input: NewProject & { household_id: string; created_by: string }): Promise<Project>
  updateProject(id: string, patch: Partial<Project>): Promise<Project>
  deleteProject(id: string): Promise<void>

  // ---- images ------------------------------------------------------
  listImages(): Promise<ProjectImage[]>
  addImage(input: NewImage & { created_by: string }): Promise<ProjectImage>
  updateImage(id: string, patch: Partial<ProjectImage>): Promise<ProjectImage>
  deleteImage(id: string): Promise<void>

  // ---- contacts ----------------------------------------------------
  listContacts(): Promise<Contact[]>
  createContact(input: NewContact & { household_id: string; created_by: string }): Promise<Contact>
  updateContact(id: string, patch: Partial<Contact>): Promise<Contact>
  deleteContact(id: string): Promise<void>

  // ---- quotes & expenses ------------------------------------------
  listQuotes(): Promise<Quote[]>
  createQuote(input: NewQuote & { created_by: string }): Promise<Quote>
  updateQuote(id: string, patch: Partial<Quote>): Promise<Quote>
  deleteQuote(id: string): Promise<void>
  listExpenses(): Promise<Expense[]>
  createExpense(input: NewExpense & { created_by: string }): Promise<Expense>
  updateExpense(id: string, patch: Partial<Expense>): Promise<Expense>
  deleteExpense(id: string): Promise<void>

  // ---- site visits -------------------------------------------------
  listVisits(): Promise<SiteVisit[]>
  createVisit(input: NewSiteVisit & { logged_by: string }): Promise<SiteVisit>
  updateVisit(id: string, patch: Partial<SiteVisit>): Promise<SiteVisit>
  deleteVisit(id: string): Promise<void>

  // ---- tasks -------------------------------------------------------
  listTasks(): Promise<Task[]>
  createTask(input: NewTask & { created_by: string }): Promise<Task>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  deleteTask(id: string): Promise<void>

  // ---- the house ---------------------------------------------------
  listShopping(): Promise<ShoppingItem[]>
  createShoppingItem(input: NewShoppingItem & { household_id: string; created_by: string }): Promise<ShoppingItem>
  updateShoppingItem(id: string, patch: Partial<ShoppingItem>): Promise<ShoppingItem>
  deleteShoppingItem(id: string): Promise<void>
  /** Clears the ticked-off items in one go, after a shop. */
  clearShoppingDone(ids: string[]): Promise<void>

  listHouseTasks(): Promise<HouseTask[]>
  createHouseTask(input: NewHouseTask & { household_id: string; created_by: string }): Promise<HouseTask>
  updateHouseTask(id: string, patch: Partial<HouseTask>): Promise<HouseTask>
  deleteHouseTask(id: string): Promise<void>

  // ---- meters ------------------------------------------------------
  listReadings(): Promise<MeterReading[]>
  createReading(input: NewMeterReading & { household_id: string; created_by: string }): Promise<MeterReading>
  updateReading(id: string, patch: Partial<MeterReading>): Promise<MeterReading>
  deleteReading(id: string): Promise<void>

  listPurchases(): Promise<UtilityPurchase[]>
  createPurchase(input: NewUtilityPurchase & { household_id: string; created_by: string }): Promise<UtilityPurchase>
  updatePurchase(id: string, patch: Partial<UtilityPurchase>): Promise<UtilityPurchase>
  deletePurchase(id: string): Promise<void>

  // ---- board -------------------------------------------------------
  listBoardItems(projectId: string): Promise<BoardItem[]>
  createBoardItem(input: NewBoardItem & { created_by: string }): Promise<BoardItem>
  updateBoardItem(id: string, patch: Partial<BoardItem>): Promise<BoardItem>
  updateBoardItems(patches: { id: string; patch: Partial<BoardItem> }[]): Promise<void>
  deleteBoardItem(id: string): Promise<void>

  // ---- game --------------------------------------------------------
  listXp(): Promise<XpEvent[]>
  addXp(input: Omit<XpEvent, 'id' | 'created_at'>): Promise<XpEvent>
  listAchievements(): Promise<Achievement[]>
  unlockAchievement(input: { household_id: string; user_id: string | null; key: string }): Promise<Achievement | null>

  // ---- the web -----------------------------------------------------
  /** Reads a pasted product page and returns its title, price and picture. */
  unfurl(url: string): Promise<Unfurled>
  searchProducts(q: string): Promise<ProductHit[]>

  // ---- the Word ----------------------------------------------------
  /** Writes a pastor's letter for what someone has written, and keeps it — private to them. `hidden` puts it straight behind the PIN. */
  askTheWord(context: string, translation: Translation, hidden?: boolean): Promise<Guidance>
  /** The letters in the open — never the hidden ones. */
  listGuidance(): Promise<Guidance[]>
  /** Ticks (or unticks) one reading in a letter's plan. A hidden letter needs the PIN. */
  setReadingDone(id: string, index: number, done: boolean, pin?: string): Promise<Guidance>
  /** A hidden letter needs the PIN. */
  deleteGuidance(id: string, pin?: string): Promise<void>
  /** A chapter or passage from the Hub's Bible, to read in the app. */
  readPassage(reading: Pick<PlanReading, 'book_id' | 'chapter' | 'start' | 'end'>, translation: Translation): Promise<Passage>

  // ---- hidden letters (behind a PIN the database checks) -----------
  pinStatus(): Promise<PinStatus>
  /** Sets a PIN of 4–8 digits; changing one needs the old one. Throws PinRefused. */
  setPin(pin: string, oldPin?: string): Promise<void>
  /** Forgets the PIN and deletes every hidden letter, since nothing could reach them again. Returns how many went. */
  forgetPin(): Promise<number>
  /** Puts a visible letter behind the PIN (one must exist). */
  hideGuidance(id: string): Promise<void>
  /** Brings a hidden letter back into the open list. */
  unhideGuidance(id: string, pin: string): Promise<Guidance>
  /** The hidden letters, for the right PIN. Throws PinRefused. */
  listHiddenGuidance(pin: string): Promise<Guidance[]>

  // ---- study: questions under a letter, or under one reading of its plan ----
  /** Asks a question about a letter (readingIndex null) or one of its readings (0 = Day 1) and keeps the answer with it. A hidden letter needs the PIN. */
  askStudy(guidanceId: string, question: string, readingIndex: number | null, pin?: string): Promise<Study>
  /** The whole thread under a letter — every reading's and the letter's own — oldest first. A hidden letter needs the PIN. */
  listStudy(guidanceId: string, pin?: string): Promise<Study[]>
  /** Files a question under another reading, or back under the letter. A hidden letter needs the PIN. */
  moveStudy(id: string, readingIndex: number | null, pin?: string): Promise<Study>
  /** Removes one question and its answer. A hidden letter needs the PIN. */
  deleteStudy(id: string, pin?: string): Promise<void>

  // ---- media -------------------------------------------------------
  /** Uploads a blob and returns the storage path to persist. */
  upload(blob: Blob, path: string): Promise<string>
  /** Resolves a storage path to a URL the browser can load. */
  resolveUrl(path: string): Promise<string>
  remove(paths: string[]): Promise<void>

  // ---- realtime ----------------------------------------------------
  subscribe(onChange: (payload: ChangePayload) => void): () => void
  presence(channel: string, me: Presence, onSync: (list: Presence[]) => void): () => void
}

import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './config'

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
// Set VITE_DEMO_ONLY=true to force the sample-data mode (used for screenshots/tests).
const demoOnly = String(import.meta.env.VITE_DEMO_ONLY ?? '') === 'true'

export const SUPABASE_URL = demoOnly ? undefined : envUrl || DEFAULT_SUPABASE_URL
export const SUPABASE_ANON_KEY = demoOnly ? undefined : envKey || DEFAULT_SUPABASE_ANON_KEY
export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
