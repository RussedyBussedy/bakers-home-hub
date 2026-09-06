// Domain types shared by the Supabase and demo data layers.

export type ProjectStatus = 'idea' | 'planning' | 'in_progress' | 'done' | 'on_hold'
export type Priority = 'low' | 'medium' | 'high'
export type ContactRole = 'contractor' | 'supplier' | 'designer' | 'other'
export type QuoteStatus = 'received' | 'accepted' | 'rejected' | 'paid'
export type ImageKind = 'before' | 'space' | 'after' | 'other'
export type BoardItemType = 'photo' | 'color' | 'note' | 'link' | 'product' | 'label'

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; tone: Tone }[] = [
  { value: 'idea', label: 'Idea', tone: 'sky' },
  { value: 'planning', label: 'Planning', tone: 'ochre' },
  { value: 'in_progress', label: 'In progress', tone: 'primary' },
  { value: 'done', label: 'Done', tone: 'sage' },
  { value: 'on_hold', label: 'On hold', tone: 'neutral' },
]

export type Tone = 'primary' | 'sage' | 'ochre' | 'sky' | 'plum' | 'neutral' | 'gold' | 'danger'

export const ROOMS = [
  'Kitchen', 'Lounge', 'Dining room', 'Main bedroom', 'Bedroom', 'Bathroom', 'Guest bathroom',
  'Study', 'Garage', 'Garden', 'Pool', 'Lapa', 'Patio', 'Roof', 'Exterior', 'Whole house', 'Other',
] as const

export const CATEGORIES = [
  'Renovation', 'Repair', 'Decor', 'Landscaping', 'Electrical', 'Plumbing', 'Painting',
  'Furniture', 'Security', 'Energy', 'Storage', 'Other',
] as const

export const EXPENSE_CATEGORIES = [
  'Materials', 'Labour', 'Quote payment', 'Tools', 'Paint', 'Fixtures', 'Furniture', 'Plants', 'Delivery', 'Permits', 'Other',
] as const

/** The category a deposit or part-payment toward a quote is filed under. */
export const QUOTE_PAYMENT_CATEGORY = 'Quote payment'

export interface Household {
  id: string
  name: string
  /** ISO 4217 code — what everyone in this home sees prices in. Guessed at signup, changeable. */
  currency: string
  created_at: string
}

export interface Profile {
  id: string
  household_id: string
  display_name: string
  color: string
  phone: string
  created_at: string
}

export interface Invite {
  id: string
  household_id: string
  code: string
  created_by: string
  invited_name: string
  expires_at: string
  accepted_by: string | null
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

/** All an invited person may see before they have an account. */
export interface InvitePreview {
  household_name: string
  invited_by: string
  invited_name: string
  state: 'live' | 'used' | 'cancelled' | 'expired'
}

export type NudgeKind = 'todo' | 'done' | 'fyi'

export interface Nudge {
  id: string
  household_id: string
  from_user: string
  to_user: string | null
  kind: NudgeKind
  message: string
  project_id: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export type NewNudge = Omit<Nudge, 'id' | 'created_at' | 'read_at'>

export type BlockerKind = 'contractor' | 'parts' | 'decision' | 'weather' | 'payment' | 'other'

export const BLOCKERS: { value: BlockerKind; label: string; hint: string }[] = [
  { value: 'contractor', label: 'Contractor', hint: 'Waiting on someone to show up or confirm' },
  { value: 'parts', label: 'Parts', hint: 'Materials or parts not here yet' },
  { value: 'decision', label: 'Decision', hint: 'One of you needs to choose' },
  { value: 'weather', label: 'Weather', hint: 'Rain stopped play' },
  { value: 'payment', label: 'Payment', hint: 'Money needs to move first' },
  { value: 'other', label: 'Other', hint: 'Something else' },
]

export interface Project {
  id: string
  household_id: string
  title: string
  description: string
  room: string
  category: string
  status: ProjectStatus
  priority: Priority
  budget_estimate: number
  cover_path: string | null
  accent: string
  start_date: string | null
  target_date: string | null
  completed_date: string | null
  /** What the project is stuck on, if anything — independent of status. */
  blocked_on: BlockerKind | null
  blocked_note: string
  blocked_since: string | null
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
}

export type VisitOutcome = 'scheduled' | 'arrived' | 'partial' | 'no_show' | 'cancelled'

export const VISIT_OUTCOMES: { value: VisitOutcome; label: string; tone: Tone }[] = [
  { value: 'scheduled', label: 'Scheduled', tone: 'sky' },
  { value: 'arrived', label: 'Arrived', tone: 'sage' },
  { value: 'partial', label: 'Partial', tone: 'ochre' },
  { value: 'no_show', label: 'No-show', tone: 'danger' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
]

/** One expected or actual contractor visit to the site. */
export interface SiteVisit {
  id: string
  project_id: string
  contact_id: string | null
  visit_date: string
  outcome: VisitOutcome
  notes: string
  logged_by: string
  created_at: string
}

export type NewSiteVisit = Omit<SiteVisit, 'id' | 'logged_by' | 'created_at'>

export interface ProjectImage {
  id: string
  project_id: string
  path: string
  caption: string
  kind: ImageKind
  width: number | null
  height: number | null
  created_by: string
  created_at: string
}

export interface Contact {
  id: string
  household_id: string
  name: string
  company: string
  role: ContactRole
  phone: string
  email: string
  whatsapp: string
  notes: string
  rating: number | null
  created_by: string
  created_at: string
}

export interface Quote {
  id: string
  project_id: string
  contact_id: string | null
  title: string
  amount: number
  vat_included: boolean
  status: QuoteStatus
  quote_date: string | null
  valid_until: string | null
  file_path: string | null
  notes: string
  created_by: string
  created_at: string
}

export interface Expense {
  id: string
  project_id: string
  title: string
  amount: number
  date: string
  category: string
  contact_id: string | null
  /** Set when this expense is a deposit or part-payment toward a quote. */
  quote_id: string | null
  receipt_path: string | null
  created_by: string
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  done: boolean
  due_date: string | null
  assigned_to: string | null
  sort_order: number
  completed_at: string | null
  created_by: string
  created_at: string
}

export interface PhotoData { path: string; caption?: string; natural_w?: number; natural_h?: number }
export interface ColorData { hex: string; name: string; source?: string; /** Nearest RAL Classic code, e.g. "RAL 7006 Beige grey". */ ral?: string }
export interface NoteData { text: string; tint: 'butter' | 'blush' | 'mint' | 'sky' | 'paper' | 'lilac' }
export interface LinkData { url: string; title: string; domain: string; image_url?: string }
export interface ProductData {
  title: string
  price: number | null
  url?: string
  image_path?: string
  /** Picture straight off the web page, used when we couldn't store a copy of our own. */
  image_url?: string
  supplier?: string
  /** In the project's price list but kept off the inspiration board. */
  off_board?: boolean
}

/** What the `unfurl` edge function makes of a pasted product page. */
export interface Unfurled {
  url: string
  domain: string
  title: string
  price: number | null
  currency: string | null
  supplier: string
  /** The page's picture as a data URL, ready to compress and store. */
  image: string | null
  imageUrl: string | null
}
export interface LabelData { text: string; style: 'tag' | 'measure' | 'arrow' }

export type BoardItemData = PhotoData | ColorData | NoteData | LinkData | ProductData | LabelData

export interface BoardItem {
  id: string
  project_id: string
  type: BoardItemType
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  data: BoardItemData
  created_by: string
  created_at: string
  updated_at: string
}

export type XpKind =
  | 'project_created' | 'photo_added' | 'pin_added' | 'swatch_added' | 'quote_added'
  | 'quote_accepted' | 'contact_added' | 'expense_added' | 'task_completed'
  | 'project_completed' | 'under_budget' | 'on_time' | 'board_started' | 'project_started'
  | 'visit_logged'

export interface XpEvent {
  id: string
  household_id: string
  user_id: string
  kind: XpKind
  points: number
  project_id: string | null
  ref_id: string | null
  created_at: string
}

export interface Achievement {
  id: string
  household_id: string
  user_id: string | null
  key: string
  unlocked_at: string
}

export interface Presence {
  user_id: string
  name: string
  color: string
}

/** Everything the app needs for one household, loaded together. */
export interface HouseholdBundle {
  household: Household
  profiles: Profile[]
}

export type NewProject = Omit<Project, 'id' | 'household_id' | 'created_by' | 'created_at' | 'updated_at' | 'sort_order' | 'blocked_on' | 'blocked_note' | 'blocked_since'>
export type NewContact = Omit<Contact, 'id' | 'household_id' | 'created_by' | 'created_at'>
export type NewQuote = Omit<Quote, 'id' | 'created_by' | 'created_at'>
export type NewExpense = Omit<Expense, 'id' | 'created_by' | 'created_at'>
export type NewTask = Omit<Task, 'id' | 'created_by' | 'created_at' | 'completed_at' | 'sort_order'> & { sort_order?: number }
export type NewBoardItem = Omit<BoardItem, 'id' | 'created_by' | 'created_at' | 'updated_at'>
export type NewImage = Omit<ProjectImage, 'id' | 'created_by' | 'created_at'>
