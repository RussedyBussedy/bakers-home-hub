import type {
  Achievement, BoardItem, Contact, Expense, HouseholdBundle, NewBoardItem, NewContact, NewExpense,
  NewImage, NewNudge, NewProject, NewQuote, NewTask, Nudge, Presence, Profile, Project, ProjectImage, Quote, Task, XpEvent,
} from './types'

export type ChangeTable =
  | 'projects' | 'project_images' | 'contacts' | 'quotes' | 'expenses' | 'tasks'
  | 'board_items' | 'xp_events' | 'achievements' | 'profiles' | 'nudges'

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
  signOut(): Promise<void>
  getUserId(): Promise<string | null>
  onAuthChange(cb: (userId: string | null) => void): () => void
  resetPassword(email: string): Promise<AuthResult>
  updatePassword(newPassword: string): Promise<AuthResult>

  // ---- household ---------------------------------------------------
  getBundle(userId: string): Promise<HouseholdBundle>
  updateProfile(id: string, patch: Partial<Pick<Profile, 'display_name' | 'color' | 'phone'>>): Promise<Profile>

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

  // ---- tasks -------------------------------------------------------
  listTasks(): Promise<Task[]>
  createTask(input: NewTask & { created_by: string }): Promise<Task>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  deleteTask(id: string): Promise<void>

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
