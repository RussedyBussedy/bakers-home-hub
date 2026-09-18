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
  /** Meter and account details, used on readings and on the evidence pack. */
  water_meter_no: string
  electricity_meter_no: string
  /**
   * How many of the wheels on the dial are the red, fractional ones.
   * A reading typed straight across the dial is split on this.
   */
  water_meter_decimals: number
  electricity_meter_decimals: number
  municipal_account: string
  address: string
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
  /** How many of them. Absent means one — most things are, so most cards say nothing about it. */
  qty?: number
  /**
   * What this is an option FOR — "Dining table", "Chairs". Several priced items sharing a group are
   * competing options to be compared, not things to be added up. Absent means it stands alone.
   */
  group?: string
  /** The option settled on within its group. At most one per group. */
  chosen?: boolean
  /** The expense created when it was actually bought — the card then shows what was paid. */
  expense_id?: string
  /** In the project's price list but kept off the inspiration board. */
  off_board?: boolean
}

/** What the `unfurl` edge function makes of a pasted product page. */
/** One thing found by a product search — enough to show a card, before the page itself is read. */
export interface ProductHit {
  title: string
  url: string
  domain: string
  snippet: string
  /** A shop the Hub knows sells this sort of thing, so it sits above the rest. */
  favoured: boolean
}

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

// ---------------------------------------------------------------------------
// The house itself — the shopping, the jobs and the meters that carry on
// whether or not anything is being renovated.
// ---------------------------------------------------------------------------

export const SHOPPING_CATEGORIES = [
  'Groceries', 'Hardware', 'Garden', 'Household', 'Paint', 'Pets', 'Pharmacy', 'Other',
] as const

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number]

/** One thing to buy. `assigned_to` null means nobody in particular — anyone can grab it. */
export interface ShoppingItem {
  id: string
  household_id: string
  title: string
  /** Free text so "2 kg" and "a bag" both work. */
  qty: string
  category: string
  notes: string
  est_price: number | null
  done: boolean
  assigned_to: string | null
  /** Who actually ticked it off. */
  done_by: string | null
  completed_at: string | null
  sort_order: number
  created_by: string
  created_at: string
}

/** A job around the house that belongs to no project. */
export interface HouseTask {
  id: string
  household_id: string
  title: string
  notes: string
  done: boolean
  due_date: string | null
  /** How often it comes back around, in days. Null for a one-off. */
  repeat_days: number | null
  assigned_to: string | null
  done_by: string | null
  completed_at: string | null
  sort_order: number
  created_by: string
  created_at: string
}

export type Utility = 'water' | 'electricity'
export type ReadingSource = 'self' | 'council' | 'estimate'

export const READING_SOURCES: { value: ReadingSource; label: string; hint: string }[] = [
  { value: 'self', label: 'Read it myself', hint: 'Off the meter face, with a photo' },
  { value: 'council', label: 'Off a statement', hint: 'What the council says the meter read' },
  { value: 'estimate', label: 'Estimated', hint: 'Nobody read the meter — a number was assumed' },
]

/** How each utility's readings behave, so the maths and the wording follow the meter. */
export const UTILITIES: Record<Utility, {
  label: string
  /** What a reading is measured in. */
  unit: string
  /** What consumption is reported in — litres read better than thousandths of a kilolitre. */
  usageUnit: string
  /** Multiply a difference in `unit` by this to get `usageUnit`. */
  usageFactor: number
  /** Water dials only ever climb; a prepaid meter counts down and is topped up. */
  direction: 'rising' | 'falling'
}> = {
  water: { label: 'Water', unit: 'kl', usageUnit: 'L', usageFactor: 1000, direction: 'rising' },
  electricity: { label: 'Electricity', unit: 'kWh', usageUnit: 'kWh', usageFactor: 1, direction: 'falling' },
}

/** A dated number off a meter face, with the photograph that proves it. */
export interface MeterReading {
  id: string
  household_id: string
  utility: Utility
  /** Water: kilolitres on the dial. Electricity: kWh left on the prepaid meter. */
  reading: number
  read_on: string
  /** Wall-clock time the dial was read, when it was noted. Null means end-of-day. */
  read_time: string | null
  photo_path: string | null
  source: ReadingSource
  notes: string
  created_by: string
  created_at: string
}

/** A prepaid top-up: what was paid, and what landed on the meter. */
export interface UtilityPurchase {
  id: string
  household_id: string
  utility: Utility
  bought_on: string
  /** Wall-clock time the token was bought, when it was noted. Null means start-of-day. */
  bought_time: string | null
  amount: number
  units: number
  token: string
  notes: string
  receipt_path: string | null
  created_by: string
  created_at: string
}

export type NewShoppingItem = Omit<ShoppingItem, 'id' | 'household_id' | 'created_by' | 'created_at' | 'done_by' | 'completed_at' | 'sort_order'> & { sort_order?: number }
export type NewHouseTask = Omit<HouseTask, 'id' | 'household_id' | 'created_by' | 'created_at' | 'done_by' | 'completed_at' | 'sort_order'> & { sort_order?: number }
export type NewMeterReading = Omit<MeterReading, 'id' | 'household_id' | 'created_by' | 'created_at'>
export type NewUtilityPurchase = Omit<UtilityPurchase, 'id' | 'household_id' | 'created_by' | 'created_at'>

export type XpKind =
  | 'project_created' | 'photo_added' | 'pin_added' | 'swatch_added' | 'quote_added'
  | 'quote_accepted' | 'contact_added' | 'expense_added' | 'task_completed'
  | 'project_completed' | 'under_budget' | 'on_time' | 'board_started' | 'project_started'
  | 'visit_logged' | 'chore_done' | 'shopping_done' | 'reading_logged'

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

// ---------------------------------------------------------------------------
// The Word — a pastor's letter from the Scriptures, private to the person who asked.
// ---------------------------------------------------------------------------
export type Translation = 'BSB' | 'KJV'
export const TRANSLATIONS: { value: Translation; label: string; long: string }[] = [
  { value: 'BSB', label: 'Berean', long: 'Berean Standard Bible' },
  { value: 'KJV', label: 'King James', long: 'King James Version' },
]

export interface VerseLine { verse: number; text: string }

/** A passage quoted in the letter — the text is from the Hub's own index, never from the model. */
export interface GuidancePassage {
  reference: string
  book_id: number
  chapter: number
  start: number
  end: number
  verses: VerseLine[]
  /** Why this one, for them — in the pastor's words. */
  why: string
  /** Where it was found: "Nave's Topical Bible: Care › Remedy for", "nearest to what they wrote". */
  note: string
}

/** One reading in the plan — a chapter (start and end null) or a short passage. */
export interface PlanReading {
  reference: string
  book_id: number
  book: string
  chapter: number
  start: number | null
  end: number | null
  focus: string
}

export type SafetyKind = 'none' | 'self-harm' | 'abuse' | 'danger' | 'other'

export interface GuidanceBody {
  greeting: string
  passages: GuidancePassage[]
  understanding: string
  response: string[]
  prayer: string
  closing: string
  plan: PlanReading[]
  safety: { concern: boolean; kind: SafetyKind }
  /** Three questions to start the study with — letters written before the study section have none. */
  questions?: string[]
}

export interface Guidance {
  id: string
  user_id: string
  created_at: string
  /** What they wrote. */
  context: string
  translation: Translation
  theme: string
  response: GuidanceBody
  /** Readings ticked off, by their index in the plan: {"0": "2026-09-17"}. */
  plan_done: Record<string, string>
  model: string
  /** Behind the PIN: not returned by ordinary reads, only by the PIN functions. */
  hidden: boolean
}

/** A reference the answer mentions in passing ("Ruth 2:1"), found in its text and checked against the canon, so it can be opened. */
export interface StudyMention {
  /** The exact words in the answer. */
  text: string
  reference: string
  book_id: number
  book: string
  chapter: number
  start: number | null
  end: number | null
}

/** The answer to a study question — in the letter's voice, quoting only from the Hub's own index. */
export interface StudyAnswer {
  text: string
  passages: GuidancePassage[]
  readings: PlanReading[]
  mentions: StudyMention[]
  followups: string[]
  safety: { concern: boolean; kind: SafetyKind }
}

/** One question asked under a letter, and its answer. Reachable exactly when the letter is. */
export interface Study {
  id: string
  guidance_id: string
  user_id: string
  created_at: string
  question: string
  answer: StudyAnswer
  model: string
}

/** Where things stand with the PIN that guards hidden letters. */
export interface PinStatus {
  has_pin: boolean
  /** Set while five wrong guesses have locked the PIN. */
  locked_until: string | null
  hidden_count: number
}

/** Why a PIN call was refused, in the database's words; the app translates. */
export type PinError = 'wrong_pin' | 'pin_locked' | 'pin_not_set' | 'bad_pin' | 'not_found' | 'not_signed_in'

export class PinRefused extends Error {
  code: PinError
  attemptsLeft: number | null
  lockedUntil: string | null
  constructor(code: PinError, attemptsLeft: number | null = null, lockedUntil: string | null = null) {
    super(pinMessage(code, attemptsLeft, lockedUntil))
    this.code = code
    this.attemptsLeft = attemptsLeft
    this.lockedUntil = lockedUntil
  }
}

export function pinMessage(code: PinError, attemptsLeft: number | null = null, lockedUntil: string | null = null): string {
  switch (code) {
    case 'wrong_pin': return attemptsLeft === 1 ? 'That isn’t it — one more try before it locks.' : attemptsLeft != null ? `That isn’t it — ${attemptsLeft} tries left.` : 'That isn’t it.'
    case 'pin_locked': {
      const mins = lockedUntil ? Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60_000)) : 15
      return `Too many wrong guesses. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
    }
    case 'pin_not_set': return 'Set a PIN first.'
    case 'bad_pin': return 'A PIN is 4 to 8 digits.'
    case 'not_found': return 'That letter isn’t there any more.'
    case 'not_signed_in': return 'Sign in first.'
  }
}

/** A chapter or passage fetched to read in the app. */
export interface Passage {
  book_id: number
  book: string
  chapter: number
  start: number
  end: number
  verses: VerseLine[]
}

export type NewProject = Omit<Project, 'id' | 'household_id' | 'created_by' | 'created_at' | 'updated_at' | 'sort_order' | 'blocked_on' | 'blocked_note' | 'blocked_since'>
export type NewContact = Omit<Contact, 'id' | 'household_id' | 'created_by' | 'created_at'>
export type NewQuote = Omit<Quote, 'id' | 'created_by' | 'created_at'>
export type NewExpense = Omit<Expense, 'id' | 'created_by' | 'created_at'>
export type NewTask = Omit<Task, 'id' | 'created_by' | 'created_at' | 'completed_at' | 'sort_order'> & { sort_order?: number }
export type NewBoardItem = Omit<BoardItem, 'id' | 'created_by' | 'created_at' | 'updated_at'>
export type NewImage = Omit<ProjectImage, 'id' | 'created_by' | 'created_at'>
