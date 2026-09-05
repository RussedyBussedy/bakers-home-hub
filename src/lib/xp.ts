import { differenceInCalendarWeeks, startOfWeek, subWeeks } from 'date-fns'
import type { Achievement, BoardItem, Contact, Expense, Profile, Project, ProjectImage, Quote, Task, XpEvent, XpKind } from '../data/types'
import { sum } from './utils'

// ---------------------------------------------------------------------------
// XP rules
// ---------------------------------------------------------------------------
export const XP_RULES: Record<XpKind, { points: number; label: string }> = {
  project_created: { points: 25, label: 'New quest started' },
  project_started: { points: 20, label: 'Work began' },
  board_started: { points: 15, label: 'Inspiration board opened' },
  photo_added: { points: 10, label: 'Photo added' },
  pin_added: { points: 5, label: 'Pinned to the board' },
  swatch_added: { points: 5, label: 'Colour captured' },
  quote_added: { points: 20, label: 'Quote filed' },
  quote_accepted: { points: 15, label: 'Quote accepted' },
  contact_added: { points: 10, label: 'Contact saved' },
  expense_added: { points: 5, label: 'Expense logged' },
  task_completed: { points: 10, label: 'Task ticked off' },
  visit_logged: { points: 5, label: 'Site day logged' },
  project_completed: { points: 150, label: 'Quest complete!' },
  under_budget: { points: 100, label: 'Finished under budget' },
  on_time: { points: 50, label: 'Finished on time' },
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
const LEVELS: { xp: number; title: string }[] = [
  { xp: 0, title: 'First Coat' },
  { xp: 120, title: 'Weekend Warriors' },
  { xp: 320, title: 'Handy Pair' },
  { xp: 650, title: 'Renovators' },
  { xp: 1100, title: 'Master Builders' },
  { xp: 1700, title: 'Grand Designers' },
  { xp: 2500, title: 'Home Legends' },
  { xp: 3600, title: 'Dream-Home Architects' },
  { xp: 5000, title: 'Estate Icons' },
  { xp: 7000, title: 'Hall of Fame' },
]

export interface LevelInfo {
  level: number
  title: string
  current: number
  floor: number
  next: number | null
  progress: number // 0..1 within level
  toNext: number
}

export function levelFor(totalXp: number): LevelInfo {
  let idx = 0
  for (let i = 0; i < LEVELS.length; i++) if (totalXp >= LEVELS[i]!.xp) idx = i
  // beyond the table: +1800 xp per level
  let floor = LEVELS[idx]!.xp
  let level = idx + 1
  let title = LEVELS[idx]!.title
  let next: number | null = LEVELS[idx + 1]?.xp ?? null
  if (idx === LEVELS.length - 1) {
    const extra = Math.floor((totalXp - floor) / 1800)
    level += extra
    floor += extra * 1800
    next = floor + 1800
    title = extra > 0 ? `Hall of Fame ${'★'.repeat(Math.min(extra, 5))}` : title
  }
  const span = next ? next - floor : 1
  const progress = next ? (totalXp - floor) / span : 1
  return { level, title, current: totalXp, floor, next, progress: Math.max(0, Math.min(1, progress)), toNext: next ? next - totalXp : 0 }
}

// ---------------------------------------------------------------------------
// Streaks — consecutive weeks (Mon–Sun) with at least one XP event.
// ---------------------------------------------------------------------------
export function weeklyStreak(events: XpEvent[], now = new Date()): { weeks: number; activeThisWeek: boolean } {
  if (events.length === 0) return { weeks: 0, activeThisWeek: false }
  const weekKeys = new Set(events.map((e) => startOfWeek(new Date(e.created_at), { weekStartsOn: 1 }).getTime()))
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 }).getTime()
  const activeThisWeek = weekKeys.has(thisWeek)
  let weeks = 0
  let cursor = activeThisWeek ? startOfWeek(now, { weekStartsOn: 1 }) : startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
  while (weekKeys.has(cursor.getTime())) {
    weeks++
    cursor = subWeeks(cursor, 1)
  }
  return { weeks, activeThisWeek }
}

export function weeksAgo(date: Date, now = new Date()) {
  return differenceInCalendarWeeks(now, date, { weekStartsOn: 1 })
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------
export interface ProjectCosts {
  budget: number
  committed: number // accepted + paid quotes
  spent: number // cash actually out the door: every expense, deposits included
  quotePaid: number // deposits and part-payments made toward accepted quotes
  owed: number // committed minus what has been paid toward it
  real: number // committed quotes + other expenses (the "real cost")
  variance: number // budget - real (positive = under budget)
  quotesReceived: number
  lowestQuote: number | null
  highestQuote: number | null
  savedByChoosing: number // highest - accepted, if an accepted exists
}

/**
 * A deposit is an expense that points at a quote, so it must not be counted
 * twice: the accepted quote already carries the full amount. Payments toward a
 * quote that is no longer accepted (declined, deleted) are just money spent.
 */
export function projectCosts(project: Project, quotes: Quote[], expenses: Expense[]): ProjectCosts {
  const q = quotes.filter((x) => x.project_id === project.id)
  const e = expenses.filter((x) => x.project_id === project.id)
  const accepted = q.filter((x) => x.status === 'accepted' || x.status === 'paid')
  const acceptedIds = new Set(accepted.map((x) => x.id))
  const committed = sum(accepted, (x) => x.amount)
  const towardQuotes = e.filter((x) => x.quote_id && acceptedIds.has(x.quote_id))
  const quotePaid = sum(towardQuotes, (x) => x.amount)
  const otherExpenses = sum(e, (x) => x.amount) - quotePaid
  const real = committed + otherExpenses + Math.max(0, quotePaid - committed)
  const amounts = q.map((x) => x.amount)
  const lowest = amounts.length ? Math.min(...amounts) : null
  const highest = amounts.length ? Math.max(...amounts) : null
  const acceptedAmount = accepted.length ? sum(accepted, (x) => x.amount) : null
  return {
    budget: Number(project.budget_estimate) || 0,
    committed,
    spent: sum(e, (x) => x.amount),
    quotePaid,
    owed: Math.max(0, committed - quotePaid),
    real,
    variance: (Number(project.budget_estimate) || 0) - real,
    quotesReceived: q.length,
    lowestQuote: lowest,
    highestQuote: highest,
    savedByChoosing: acceptedAmount != null && highest != null ? Math.max(0, highest - acceptedAmount) : 0,
  }
}

/**
 * A received quote goes stale after its valid-until date; an accepted one
 * doesn't (the deal is done). `daysLeft` is null when there is no date.
 */
export function quoteExpiry(quote: Quote, today = new Date()): { expired: boolean; daysLeft: number | null; soon: boolean } {
  if (quote.status !== 'received' || !quote.valid_until) return { expired: false, daysLeft: null, soon: false }
  const until = new Date(`${quote.valid_until}T23:59:59`)
  const daysLeft = Math.ceil((until.getTime() - today.getTime()) / 86_400_000)
  return { expired: daysLeft < 0, daysLeft, soon: daysLeft >= 0 && daysLeft <= 14 }
}

/** What has been paid toward one quote, and what is still to go. */
export function quoteProgress(quote: Quote, expenses: Expense[]) {
  const payments = expenses.filter((e) => e.quote_id === quote.id).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  const paid = sum(payments, (e) => e.amount)
  const amount = Number(quote.amount) || 0
  return { payments, paid, owed: Math.max(0, amount - paid), pct: amount > 0 ? Math.min(1, paid / amount) : 0, settled: amount > 0 && paid >= amount - 0.005 }
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export interface AchievementDef {
  key: string
  title: string
  description: string
  icon: string // lucide icon name (resolved in the UI)
  tone: 'primary' | 'sage' | 'ochre' | 'sky' | 'plum' | 'gold'
  perPerson?: boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_quest', title: 'First Quest', description: 'Start your very first project.', icon: 'Flag', tone: 'primary' },
  { key: 'dreamer', title: 'Dreamer', description: 'Pin 10 things to an inspiration board.', icon: 'Sparkles', tone: 'plum' },
  { key: 'colour_theorist', title: 'Colour Theorist', description: 'Capture 10 colour swatches.', icon: 'Palette', tone: 'plum' },
  { key: 'mood_master', title: 'Mood Master', description: 'Fill one board with 25 pins.', icon: 'LayoutGrid', tone: 'plum' },
  { key: 'picture_perfect', title: 'Picture Perfect', description: 'Add 10 photos across your projects.', icon: 'Camera', tone: 'sky' },
  { key: 'before_after', title: 'Before & After', description: 'Add a before and an after photo to the same project.', icon: 'GitCompare', tone: 'sky' },
  { key: 'three_bids', title: 'Three Bids', description: 'Collect 3 quotes on one project — the smart way to buy.', icon: 'Scale', tone: 'ochre' },
  { key: 'deal_maker', title: 'Deal Maker', description: 'Accept your first quote.', icon: 'Handshake', tone: 'ochre' },
  { key: 'penny_pincher', title: 'Penny Pincher', description: 'Save 20% or more by choosing a cheaper quote.', icon: 'PiggyBank', tone: 'gold' },
  { key: 'rolodex', title: 'Little Black Book', description: 'Save 5 suppliers or contractors.', icon: 'BookUser', tone: 'sky' },
  { key: 'task_master', title: 'Task Master', description: 'Tick off 25 tasks.', icon: 'ListChecks', tone: 'sage' },
  { key: 'finisher', title: 'Finisher', description: 'Complete your first project.', icon: 'Trophy', tone: 'gold' },
  { key: 'hat_trick', title: 'Hat-trick', description: 'Complete 3 projects.', icon: 'Medal', tone: 'gold' },
  { key: 'under_budget', title: 'Budget Hero', description: 'Finish a project under budget.', icon: 'Wallet', tone: 'sage' },
  { key: 'on_time', title: 'Right on Time', description: 'Finish a project by its target date.', icon: 'CalendarCheck', tone: 'sage' },
  { key: 'streak_4', title: 'On a Roll', description: 'Stay active 4 weeks in a row.', icon: 'Flame', tone: 'primary' },
  { key: 'teamwork', title: 'Teamwork', description: 'Both of you earn XP in the same week.', icon: 'HeartHandshake', tone: 'primary' },
  { key: 'big_dreams', title: 'Big Dreams', description: 'Have 5 projects on the go at once.', icon: 'Rocket', tone: 'plum' },
]

export interface GameSnapshot {
  projects: Project[]
  images: ProjectImage[]
  contacts: Contact[]
  quotes: Quote[]
  expenses: Expense[]
  tasks: Task[]
  boardItems: BoardItem[] // items across all projects (may be partial)
  xp: XpEvent[]
  achievements: Achievement[]
  profiles: Profile[]
}

/** Returns achievement keys that are earned by the data but not yet unlocked. */
export function evaluateAchievements(s: GameSnapshot, now = new Date()): string[] {
  const has = new Set(s.achievements.map((a) => a.key))
  const earned: string[] = []
  const check = (key: string, cond: boolean) => { if (cond && !has.has(key)) earned.push(key) }

  check('first_quest', s.projects.length >= 1)
  const pinsByProject = new Map<string, number>()
  s.boardItems.forEach((b) => pinsByProject.set(b.project_id, (pinsByProject.get(b.project_id) ?? 0) + 1))
  check('dreamer', [...pinsByProject.values()].some((n) => n >= 10))
  check('mood_master', [...pinsByProject.values()].some((n) => n >= 25))
  check('colour_theorist', s.boardItems.filter((b) => b.type === 'color').length >= 10)
  check('picture_perfect', s.images.length >= 10)
  const kinds = new Map<string, Set<string>>()
  s.images.forEach((i) => { const set = kinds.get(i.project_id) ?? new Set(); set.add(i.kind); kinds.set(i.project_id, set) })
  check('before_after', [...kinds.values()].some((set) => set.has('before') && set.has('after')))
  const quotesByProject = new Map<string, Quote[]>()
  s.quotes.forEach((q) => quotesByProject.set(q.project_id, [...(quotesByProject.get(q.project_id) ?? []), q]))
  check('three_bids', [...quotesByProject.values()].some((qs) => qs.length >= 3))
  check('deal_maker', s.quotes.some((q) => q.status === 'accepted' || q.status === 'paid'))
  check('penny_pincher', [...quotesByProject.values()].some((qs) => {
    const acc = qs.find((q) => q.status === 'accepted' || q.status === 'paid')
    if (!acc) return false
    const highest = Math.max(...qs.map((q) => q.amount))
    return highest > 0 && (highest - acc.amount) / highest >= 0.2
  }))
  check('rolodex', s.contacts.length >= 5)
  check('task_master', s.tasks.filter((t) => t.done).length >= 25)
  const done = s.projects.filter((p) => p.status === 'done')
  check('finisher', done.length >= 1)
  check('hat_trick', done.length >= 3)
  check('under_budget', done.some((p) => { const c = projectCosts(p, s.quotes, s.expenses); return c.budget > 0 && c.real <= c.budget }))
  check('on_time', done.some((p) => p.completed_date && p.target_date && p.completed_date <= p.target_date))
  check('streak_4', weeklyStreak(s.xp, now).weeks >= 4)
  const thisWeek = startOfWeek(now, { weekStartsOn: 1 }).getTime()
  const activeThisWeek = new Set(s.xp.filter((e) => startOfWeek(new Date(e.created_at), { weekStartsOn: 1 }).getTime() === thisWeek).map((e) => e.user_id))
  check('teamwork', s.profiles.length >= 2 && s.profiles.every((p) => activeThisWeek.has(p.id)))
  check('big_dreams', s.projects.filter((p) => p.status === 'in_progress' || p.status === 'planning').length >= 5)
  return earned
}

export function achievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key)
}
