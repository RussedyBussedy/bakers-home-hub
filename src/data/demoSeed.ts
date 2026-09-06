import { addDays, format, subDays } from 'date-fns'
import type {
  Achievement, BoardItem, Contact, Expense, Household, Invite, Nudge, Profile, Project, ProjectImage, Quote, SiteVisit, Task, XpEvent,
} from './types'
import { SCENES, materialSwatch, roomScene } from '../lib/demoImages'

export const DEMO_USERS = {
  russel: 'u-russel',
  kay: 'u-kay',
} as const

export interface DemoState {
  household: Household
  profiles: Profile[]
  projects: Project[]
  images: ProjectImage[]
  contacts: Contact[]
  quotes: Quote[]
  expenses: Expense[]
  tasks: Task[]
  boardItems: BoardItem[]
  xp: XpEvent[]
  achievements: Achievement[]
  nudges?: Nudge[]
  visits?: SiteVisit[]
  invites?: Invite[]
}

const d = (daysAgo: number, hour = 10) => {
  const now = new Date()
  const dt = subDays(now, daysAgo)
  const h = daysAgo === 0 ? Math.max(0, Math.min(hour, now.getHours() - 1)) : hour
  dt.setHours(h, 12, 0, 0)
  if (dt > now) dt.setTime(now.getTime() - 60_000)
  return dt.toISOString()
}
const day = (daysFromNow: number) => format(addDays(new Date(), daysFromNow), 'yyyy-MM-dd')

export function buildDemoState(): DemoState {
  const H = 'h-bakers'
  const R = DEMO_USERS.russel
  const K = DEMO_USERS.kay

  const household: Household = { id: H, name: 'The Bakers', currency: 'ZAR', created_at: d(120) }
  const profiles: Profile[] = [
    { id: R, household_id: H, display_name: 'Russel', color: '#B84D24', phone: '', created_at: d(120) },
    { id: K, household_id: H, display_name: 'Kay', color: '#7F5A9E', phone: '', created_at: d(120) },
  ]

  const P = {
    kitchen: 'p-kitchen', pool: 'p-pool', lapa: 'p-lapa', bath: 'p-bath', borehole: 'p-borehole',
    garden: 'p-garden', bedroom: 'p-bedroom', study: 'p-study',
  }

  const projects: Project[] = [
    {
      id: P.kitchen, household_id: H, title: 'Kitchen cabinet refresh', description: 'Repaint the existing carcasses in sage, replace the doors with shaker fronts and swap the handles for brushed brass. Keep the granite tops.',
      room: 'Kitchen', category: 'Renovation', status: 'in_progress', priority: 'high', budget_estimate: 28000,
      cover_path: roomScene(SCENES.kitchen!), accent: '#5C7C5A', start_date: day(-26), target_date: day(40), completed_date: null,
      blocked_on: null, blocked_note: '', blocked_since: null,
      sort_order: 1, created_by: K, created_at: d(40), updated_at: d(1),
    },
    {
      id: P.borehole, household_id: H, title: 'Borehole pump replacement', description: 'Pump trips the earth-leakage when switched on. Pull the pump, test the motor, replace if needed and fit a new control box next to the pool pump.',
      room: 'Garden', category: 'Electrical', status: 'in_progress', priority: 'high', budget_estimate: 15000,
      cover_path: roomScene(SCENES.garden!), accent: '#4F7291', start_date: day(-8), target_date: day(15), completed_date: null,
      blocked_on: null, blocked_note: '', blocked_since: null,
      sort_order: 2, created_by: R, created_at: d(12), updated_at: d(0, 8),
    },
    {
      id: P.lapa, household_id: H, title: 'Lapa re-thatch & gutters', description: 'The thatch on the lapa is thinning on the north side. Re-thatch the worn sections, treat for fire and fit proper gutters so the rain stops washing out the paving.',
      room: 'Lapa', category: 'Repair', status: 'planning', priority: 'medium', budget_estimate: 45000,
      cover_path: roomScene(SCENES.lapa!), accent: '#B5563A', start_date: null, target_date: day(86), completed_date: null,
      blocked_on: 'contractor', blocked_note: 'Waiting for Pieter to confirm he starts Monday', blocked_since: day(-2),
      sort_order: 3, created_by: R, created_at: d(30), updated_at: d(3),
    },
    {
      id: P.study, household_id: H, title: 'Study built-in shelves', description: 'Floor-to-ceiling shelving on the long wall with a desk nook. Dark stained oak with a brass rail for the ladder.',
      room: 'Study', category: 'Furniture', status: 'planning', priority: 'low', budget_estimate: 18000,
      cover_path: roomScene(SCENES.study!), accent: '#2E3A3F', start_date: null, target_date: day(100), completed_date: null,
      blocked_on: null, blocked_note: '', blocked_since: null,
      sort_order: 4, created_by: K, created_at: d(20), updated_at: d(6),
    },
    {
      id: P.bath, household_id: H, title: 'Main bathroom refresh', description: 'New vanity, walk-in shower with a rain head, and terrazzo-look floor tiles. Keep the bath, replace the taps.',
      room: 'Bathroom', category: 'Renovation', status: 'idea', priority: 'medium', budget_estimate: 60000,
      cover_path: roomScene(SCENES.bath!), accent: '#4F7291', start_date: null, target_date: null, completed_date: null,
      blocked_on: null, blocked_note: '', blocked_since: null,
      sort_order: 5, created_by: K, created_at: d(15), updated_at: d(2),
    },
    {
      id: P.garden, household_id: H, title: 'Front garden makeover', description: 'Replace the tired lawn strip with indigenous beds, a gravel path and low-voltage lighting up to the front door.',
      room: 'Garden', category: 'Landscaping', status: 'on_hold', priority: 'low', budget_estimate: 12000,
      cover_path: roomScene({ ...SCENES.garden!, wall: '#F3E7D3', wall2: '#E3D0B3' }), accent: '#7A9A77', start_date: null, target_date: null, completed_date: null,
      blocked_on: null, blocked_note: '', blocked_since: null,
      sort_order: 6, created_by: R, created_at: d(60), updated_at: d(25),
    },
    {
      id: P.pool, household_id: H, title: 'Pool pump & filter service', description: 'Sand filter was channelling and the pump was noisy. Replace the sand, new pump seals and a proper backwash routine.',
      room: 'Pool', category: 'Repair', status: 'done', priority: 'high', budget_estimate: 6500,
      cover_path: roomScene(SCENES.pool!), accent: '#2F7F97', start_date: day(-62), target_date: day(-36), completed_date: day(-47),
      blocked_on: null, blocked_note: '', blocked_since: null,
      sort_order: 7, created_by: R, created_at: d(64), updated_at: d(47),
    },
    {
      id: P.bedroom, household_id: H, title: 'Guest bedroom repaint', description: 'Warm white walls with a dusty plum feature wall behind the bed. New curtain rail.',
      room: 'Bedroom', category: 'Painting', status: 'done', priority: 'low', budget_estimate: 4000,
      cover_path: roomScene(SCENES.bed!), accent: '#7F5A9E', start_date: day(-95), target_date: day(-67), completed_date: day(-83),
      blocked_on: null, blocked_note: '', blocked_since: null,
      sort_order: 8, created_by: K, created_at: d(100), updated_at: d(83),
    },
  ]

  const images: ProjectImage[] = [
    { id: 'i1', project_id: P.kitchen, path: roomScene(SCENES.kitchen!), caption: 'Cabinets as they are now', kind: 'before', width: 800, height: 560, created_by: K, created_at: d(40) },
    { id: 'i2', project_id: P.kitchen, path: roomScene({ ...SCENES.kitchen!, accent: '#7A8F6E', wall: '#EFE6D8' }), caption: 'Doors off, ready for priming', kind: 'space', width: 800, height: 560, created_by: R, created_at: d(9) },
    { id: 'i3', project_id: P.pool, path: roomScene({ ...SCENES.pool!, wall: '#D9E6EC' }), caption: 'Cloudy water before the service', kind: 'before', width: 800, height: 560, created_by: R, created_at: d(64) },
    { id: 'i4', project_id: P.pool, path: roomScene(SCENES.pool!), caption: 'Crystal clear again', kind: 'after', width: 800, height: 560, created_by: R, created_at: d(47) },
    { id: 'i5', project_id: P.lapa, path: roomScene(SCENES.lapa!), caption: 'North side thinning', kind: 'before', width: 800, height: 560, created_by: R, created_at: d(30) },
    { id: 'i6', project_id: P.bedroom, path: roomScene({ ...SCENES.bed!, wall: '#E9E2DC', accent: '#B8A2C4' }), caption: 'Before — beige everything', kind: 'before', width: 800, height: 560, created_by: K, created_at: d(100) },
    { id: 'i7', project_id: P.bedroom, path: roomScene(SCENES.bed!), caption: 'Plum feature wall done', kind: 'after', width: 800, height: 560, created_by: K, created_at: d(83) },
    { id: 'i8', project_id: P.borehole, path: roomScene(SCENES.garden!), caption: 'Control panel next to the pool pump', kind: 'space', width: 800, height: 560, created_by: R, created_at: d(12) },
    { id: 'i9', project_id: P.bath, path: roomScene(SCENES.bath!), caption: 'Current bathroom', kind: 'before', width: 800, height: 560, created_by: K, created_at: d(15) },
    { id: 'i10', project_id: P.study, path: roomScene(SCENES.study!), caption: 'The long wall', kind: 'space', width: 800, height: 560, created_by: K, created_at: d(20) },
  ]

  const C = { joe: 'c-joe', cabinet: 'c-cabinet', poolpro: 'c-poolpro', aqua: 'c-aqua', thatch1: 'c-thatch1', thatch2: 'c-thatch2', borehole: 'c-borehole', builders: 'c-builders', sparky: 'c-sparky' }
  const contacts: Contact[] = [
    { id: C.joe, household_id: H, name: 'Joe Mahlangu', company: "Joe's Joinery", role: 'contractor', phone: '082 555 0141', email: 'joe@joesjoinery.co.za', whatsapp: '27825550141', notes: 'Did the neighbours\' cupboards. Reliable, brings his own primer.', rating: 5, created_by: K, created_at: d(35) },
    { id: C.cabinet, household_id: H, name: 'Nadia Pillay', company: 'Cabinet Craft (Pty) Ltd', role: 'supplier', phone: '011 555 0198', email: 'sales@cabinetcraft.co.za', whatsapp: '', notes: 'Showroom in Meyersdal. 6-week lead time on shaker doors.', rating: 4, created_by: K, created_at: d(33) },
    { id: C.poolpro, household_id: H, name: 'Sipho Dlamini', company: 'Pool Pro Alberton', role: 'contractor', phone: '083 555 0177', email: 'sipho@poolpro.co.za', whatsapp: '27835550177', notes: 'Came the next day. Explained the backwash routine properly.', rating: 5, created_by: R, created_at: d(62) },
    { id: C.aqua, household_id: H, name: 'Aqua Care Pools', company: 'Aqua Care', role: 'contractor', phone: '011 555 0122', email: 'info@aquacare.co.za', whatsapp: '', notes: '', rating: 3, created_by: R, created_at: d(61) },
    { id: C.thatch1, household_id: H, name: 'Pieter van der Berg', company: 'Highveld Thatchers', role: 'contractor', phone: '082 555 0163', email: 'pieter@highveldthatch.co.za', whatsapp: '27825550163', notes: 'Includes fire retardant treatment and a 5-year guarantee.', rating: 4, created_by: R, created_at: d(28) },
    { id: C.thatch2, household_id: H, name: 'Thatch & Co', company: 'Thatch & Co', role: 'contractor', phone: '011 555 0110', email: 'quotes@thatchandco.co.za', whatsapp: '', notes: 'Cheaper, but gutters quoted separately.', rating: null, created_by: R, created_at: d(27) },
    { id: C.borehole, household_id: H, name: 'Dawie Kruger', company: 'Borehole Bros', role: 'contractor', phone: '082 555 0190', email: 'dawie@boreholebros.co.za', whatsapp: '27825550190', notes: 'Pulled the pump the same week.', rating: 5, created_by: R, created_at: d(11) },
    { id: C.builders, household_id: H, name: 'Builders Warehouse Alberton', company: 'Builders Warehouse', role: 'supplier', phone: '011 555 0100', email: '', whatsapp: '', notes: 'Paint, hinges and handles. Check the online price first.', rating: 4, created_by: K, created_at: d(90) },
    { id: C.sparky, household_id: H, name: 'Lerato Mokoena', company: 'Bright Spark Electrical', role: 'contractor', phone: '083 555 0155', email: 'lerato@brightspark.co.za', whatsapp: '27835550155', notes: 'Registered — can issue a CoC.', rating: 5, created_by: R, created_at: d(50) },
  ]

  const quotes: Quote[] = [
    { id: 'q1', project_id: P.kitchen, contact_id: C.cabinet, title: 'Shaker doors + fitting', amount: 31500, vat_included: true, status: 'received', quote_date: day(-22), valid_until: day(8), file_path: null, notes: '6-week lead time', created_by: K, created_at: d(22) },
    { id: 'q2', project_id: P.kitchen, contact_id: C.joe, title: 'Doors, paint & handles', amount: 24800, vat_included: true, status: 'accepted', quote_date: day(-20), valid_until: day(10), file_path: null, notes: 'Includes removing and re-hanging doors', created_by: K, created_at: d(20) },
    { id: 'q3', project_id: P.kitchen, contact_id: C.builders, title: 'Off-the-shelf doors only', amount: 19900, vat_included: true, status: 'rejected', quote_date: day(-24), valid_until: day(6), file_path: null, notes: 'Sizes don\'t match the carcasses', created_by: R, created_at: d(24) },
    { id: 'q4', project_id: P.pool, contact_id: C.poolpro, title: 'Sand change, seals & service', amount: 5850, vat_included: true, status: 'paid', quote_date: day(-60), valid_until: day(-30), file_path: null, notes: '', created_by: R, created_at: d(60) },
    { id: 'q5', project_id: P.pool, contact_id: C.aqua, title: 'Full pump replacement', amount: 7200, vat_included: true, status: 'rejected', quote_date: day(-59), valid_until: day(-29), file_path: null, notes: 'Wanted to replace the whole pump', created_by: R, created_at: d(59) },
    { id: 'q6', project_id: P.lapa, contact_id: C.thatch1, title: 'Re-thatch north side + gutters', amount: 48000, vat_included: true, status: 'received', quote_date: day(-12), valid_until: day(18), file_path: null, notes: 'Fire retardant + 5-year guarantee', created_by: R, created_at: d(12) },
    { id: 'q7', project_id: P.lapa, contact_id: C.thatch2, title: 'Re-thatch only', amount: 41500, vat_included: false, status: 'received', quote_date: day(-10), valid_until: day(20), file_path: null, notes: 'Gutters extra, approx R6 500', created_by: R, created_at: d(10) },
    { id: 'q8', project_id: P.borehole, contact_id: C.borehole, title: 'Pull, test & replace pump', amount: 13600, vat_included: true, status: 'accepted', quote_date: day(-9), valid_until: day(21), file_path: null, notes: '0.75kW Franklin pump', created_by: R, created_at: d(9) },
    { id: 'q9', project_id: P.borehole, contact_id: C.sparky, title: 'New control box & CoC', amount: 3200, vat_included: true, status: 'received', quote_date: day(-27), valid_until: day(-3), file_path: null, notes: '', created_by: R, created_at: d(7) },
  ]

  const expenses: Expense[] = [
    { id: 'e1', project_id: P.kitchen, title: 'Soft-close hinges ×24', amount: 1240, date: day(-14), category: 'Fixtures', contact_id: C.builders, quote_id: null, receipt_path: null, created_by: R, created_at: d(14) },
    { id: 'e2', project_id: P.kitchen, title: 'Sage cabinet enamel 5L', amount: 2150, date: day(-11), category: 'Paint', contact_id: C.builders, quote_id: null, receipt_path: null, created_by: K, created_at: d(11) },
    { id: 'e3', project_id: P.pool, title: 'Filter sand 2 × 25kg', amount: 650, date: day(-50), category: 'Materials', contact_id: null, quote_id: null, receipt_path: null, created_by: R, created_at: d(50) },
    { id: 'e4', project_id: P.bedroom, title: 'Plascon paint — 2 colours', amount: 2800, date: day(-90), category: 'Paint', contact_id: C.builders, quote_id: null, receipt_path: null, created_by: K, created_at: d(90) },
    { id: 'e5', project_id: P.bedroom, title: 'Rollers, tape & drop sheets', amount: 320, date: day(-90), category: 'Tools', contact_id: C.builders, quote_id: null, receipt_path: null, created_by: K, created_at: d(90) },
    { id: 'e6', project_id: P.bedroom, title: 'Curtain rail', amount: 480, date: day(-85), category: 'Fixtures', contact_id: null, quote_id: null, receipt_path: null, created_by: R, created_at: d(85) },
    { id: 'e7', project_id: P.borehole, title: 'Trench sand & conduit', amount: 380, date: day(-4), category: 'Materials', contact_id: C.builders, quote_id: null, receipt_path: null, created_by: R, created_at: d(4) },
    { id: 'e8', project_id: P.kitchen, title: 'Deposit — Doors, paint & handles (50%)', amount: 12400, date: day(-18), category: 'Quote payment', contact_id: C.joe, quote_id: 'q2', receipt_path: null, created_by: K, created_at: d(18) },
    { id: 'e9', project_id: P.pool, title: 'Paid in full — Sand change, seals & service', amount: 5850, date: day(-45), category: 'Quote payment', contact_id: C.poolpro, quote_id: 'q4', receipt_path: null, created_by: R, created_at: d(45) },
  ]

  const tasks: Task[] = [
    { id: 't1', project_id: P.kitchen, title: 'Measure all cabinet doors', done: true, due_date: day(-25), assigned_to: R, sort_order: 1, completed_at: d(25), created_by: K, created_at: d(38) },
    { id: 't2', project_id: P.kitchen, title: 'Choose handle style', done: true, due_date: day(-18), assigned_to: K, sort_order: 2, completed_at: d(18), created_by: K, created_at: d(38) },
    { id: 't3', project_id: P.kitchen, title: 'Remove doors & label them', done: true, due_date: day(-9), assigned_to: R, sort_order: 3, completed_at: d(9), created_by: K, created_at: d(38) },
    { id: 't4', project_id: P.kitchen, title: 'Prime carcasses', done: false, due_date: day(3), assigned_to: R, sort_order: 4, completed_at: null, created_by: R, created_at: d(9) },
    { id: 't5', project_id: P.kitchen, title: 'Order brass handles (24)', done: false, due_date: day(5), assigned_to: K, sort_order: 5, completed_at: null, created_by: K, created_at: d(9) },
    { id: 't6', project_id: P.kitchen, title: 'Joe fits the doors', done: false, due_date: day(30), assigned_to: null, sort_order: 6, completed_at: null, created_by: K, created_at: d(9) },
    { id: 't7', project_id: P.pool, title: 'Backwash & rinse', done: true, due_date: null, assigned_to: R, sort_order: 1, completed_at: d(48), created_by: R, created_at: d(62) },
    { id: 't8', project_id: P.pool, title: 'Test chlorine & pH', done: true, due_date: null, assigned_to: R, sort_order: 2, completed_at: d(47), created_by: R, created_at: d(62) },
    { id: 't9', project_id: P.lapa, title: 'Get a third thatch quote', done: false, due_date: day(7), assigned_to: R, sort_order: 1, completed_at: null, created_by: R, created_at: d(10) },
    { id: 't10', project_id: P.lapa, title: 'Check insurance requirements for thatch', done: false, due_date: day(12), assigned_to: K, sort_order: 2, completed_at: null, created_by: K, created_at: d(10) },
    { id: 't11', project_id: P.borehole, title: 'Switch off at DB before Dawie arrives', done: true, due_date: day(-3), assigned_to: R, sort_order: 1, completed_at: d(3), created_by: R, created_at: d(9) },
    { id: 't12', project_id: P.borehole, title: 'Dig trench for new conduit', done: false, due_date: day(2), assigned_to: R, sort_order: 2, completed_at: null, created_by: R, created_at: d(9) },
    { id: 't13', project_id: P.borehole, title: 'Book Lerato for the CoC', done: false, due_date: day(6), assigned_to: K, sort_order: 3, completed_at: null, created_by: K, created_at: d(5) },
    { id: 't14', project_id: P.study, title: 'Sketch shelf layout', done: false, due_date: day(20), assigned_to: K, sort_order: 1, completed_at: null, created_by: K, created_at: d(19) },
    { id: 't15', project_id: P.bedroom, title: 'Two coats on feature wall', done: true, due_date: null, assigned_to: K, sort_order: 1, completed_at: d(84), created_by: K, created_at: d(95) },
    { id: 't16', project_id: P.bedroom, title: 'Hang curtain rail', done: true, due_date: null, assigned_to: R, sort_order: 2, completed_at: d(83), created_by: K, created_at: d(95) },
  ]

  const pin = (id: string, project_id: string, type: BoardItem['type'], x: number, y: number, w: number, h: number, rotation: number, z: number, data: BoardItem['data'], by: string = K, ago = 10): BoardItem => ({
    id, project_id, type, x, y, w, h, rotation, z, data, created_by: by, created_at: d(ago), updated_at: d(ago),
  })

  const boardItems: BoardItem[] = [
    // Kitchen board
    pin('b1', P.kitchen, 'photo', 60, 80, 420, 294, -2, 1, { path: roomScene(SCENES.kitchen!), caption: 'Sage + oak + brass' }, K, 30),
    pin('b2', P.kitchen, 'photo', 520, 60, 260, 260, 3, 2, { path: materialSwatch('#B08D57', 'wood'), caption: 'Oak worktop sample' }, K, 28),
    pin('b3', P.kitchen, 'color', 820, 90, 150, 150, -4, 3, { hex: '#7A8F6E', name: 'Dusty Sage' }, K, 28),
    pin('b4', P.kitchen, 'color', 990, 120, 150, 150, 2, 4, { hex: '#F1E5D3', name: 'Linen' }, K, 28),
    pin('b5', P.kitchen, 'color', 900, 290, 150, 150, -1, 5, { hex: '#C9A24B', name: 'Amber' }, R, 27),
    pin('b6', P.kitchen, 'note', 80, 420, 260, 190, 2, 6, { text: 'Handles: brushed brass bar, 160mm centres. Joe says order 24 + 2 spare.', tint: 'butter' }, K, 25),
    pin('b7', P.kitchen, 'product', 380, 400, 250, 300, -3, 7, { title: 'Brass bar handle 160mm', price: 89, supplier: 'Handle Studio', url: 'https://example.com/handles', image_path: materialSwatch('#C9A24B', 'plain') }, K, 25),
    pin('b8', P.kitchen, 'link', 680, 420, 280, 130, 1, 8, { url: 'https://www.pinterest.com/search/pins/?q=sage%20kitchen', title: 'Sage shaker kitchens', domain: 'pinterest.com' }, K, 24),
    pin('b9', P.kitchen, 'photo', 700, 580, 300, 300, 4, 9, { path: materialSwatch('#5C7C5A', 'plain'), caption: 'Sage enamel — dried sample' }, R, 11),
    pin('b10', P.kitchen, 'label', 1000, 500, 180, 56, 0, 10, { text: 'Wall run 3.6 m', style: 'measure' }, R, 20),
    pin('b11', P.kitchen, 'photo', 1040, 600, 240, 240, -2, 11, { path: materialSwatch('#E7DFD2', 'tile'), caption: 'Zellige splashback?' }, K, 15),
    pin('b12', P.kitchen, 'note', 60, 660, 240, 150, -2, 12, { text: 'Keep the granite. Paint the island a shade darker?', tint: 'blush' }, R, 12),
    // Bathroom board
    pin('b20', P.bath, 'photo', 60, 60, 420, 294, 2, 1, { path: roomScene(SCENES.bath!), caption: 'Rain shower + terrazzo' }, K, 14),
    pin('b21', P.bath, 'photo', 520, 80, 240, 240, -3, 2, { path: materialSwatch('#D9D3C7', 'stone'), caption: 'Terrazzo floor tile' }, K, 14),
    pin('b22', P.bath, 'color', 800, 80, 150, 150, 3, 3, { hex: '#4F7291', name: 'Marine' }, K, 13),
    pin('b23', P.bath, 'color', 970, 100, 150, 150, -2, 4, { hex: '#EAE3D2', name: 'Bone White' }, K, 13),
    pin('b24', P.bath, 'note', 80, 420, 260, 170, -1, 5, { text: 'Black taps or brushed nickel? Kay: nickel. Russel: black.', tint: 'sky' }, K, 12),
    // Priced up but deliberately not pinned — these show on the project's Prices tab only.
    pin('b26', P.kitchen, 'product', 0, 0, 250, 300, 0, 1, { title: 'Sage enamel 5 L — dried sample match', price: 1299, supplier: 'Plascon', url: 'https://example.com/sage-enamel', image_path: materialSwatch('#7A8F6E', 'plain'), off_board: true }, R, 6),
    pin('b27', P.kitchen, 'product', 0, 0, 250, 300, 0, 1, { title: 'Soft-close hinge, 110° (pack of 10)', price: 449.9, supplier: 'Builders Warehouse', url: 'https://example.com/hinges', image_path: materialSwatch('#B9B2A8', 'plain'), off_board: true }, R, 4),
    pin('b28', P.kitchen, 'product', 0, 0, 250, 300, 0, 1, { title: 'Undermount sink 1.5 bowl', price: 3499, supplier: 'Livingstone', url: 'https://example.com/sink', image_path: materialSwatch('#9AA3A8', 'plain'), off_board: true }, K, 2),
    pin('b25', P.bath, 'product', 380, 400, 250, 300, 2, 6, { title: 'Oak floating vanity 1200', price: 8990, supplier: 'Vanity Bar', image_path: materialSwatch('#B08D57', 'wood') }, K, 10),
    pin('b26', P.bath, 'label', 700, 420, 190, 56, 0, 7, { text: 'Shower 900 × 1200', style: 'measure' }, R, 9),
    pin('b27', P.bath, 'photo', 700, 500, 260, 260, -4, 8, { path: materialSwatch('#7BA3B0', 'tile'), caption: 'Sea-glass wall tile' }, R, 8),
    // Lapa board
    pin('b30', P.lapa, 'photo', 60, 60, 420, 294, -2, 1, { path: roomScene(SCENES.lapa!), caption: 'Fresh thatch, deeper overhang' }, R, 29),
    pin('b31', P.lapa, 'color', 520, 80, 150, 150, 3, 2, { hex: '#C8A46B', name: 'Toffee' }, R, 28),
    pin('b32', P.lapa, 'color', 690, 100, 150, 150, -2, 3, { hex: '#B5563A', name: 'Terracotta' }, R, 28),
    pin('b33', P.lapa, 'note', 520, 280, 260, 150, 1, 4, { text: 'Ask both quotes about a fire-retardant certificate for insurance.', tint: 'butter' }, K, 20),
    // Study board
    pin('b40', P.study, 'photo', 60, 60, 420, 294, 2, 1, { path: roomScene(SCENES.study!), caption: 'Wall of shelves + desk nook' }, K, 19),
    pin('b41', P.study, 'photo', 520, 80, 240, 240, -3, 2, { path: materialSwatch('#5A4635', 'wood'), caption: 'Dark stained oak' }, K, 18),
    pin('b42', P.study, 'color', 800, 80, 150, 150, 2, 3, { hex: '#2E3A3F', name: 'Graphite' }, K, 18),
    pin('b43', P.study, 'label', 520, 350, 200, 56, 0, 4, { text: 'Wall 4.2 m × 2.7 m', style: 'measure' }, R, 17),
  ]

  // XP history over the last ~10 weeks so streaks, levels and the leaderboard have something to show.
  const xp: XpEvent[] = []
  let n = 0
  const ev = (user: string, kind: XpEvent['kind'], points: number, ago: number, project: string | null) => {
    xp.push({ id: `x${n++}`, household_id: H, user_id: user, kind, points, project_id: project, ref_id: null, created_at: d(ago, 9 + (n % 9)) })
  }
  ev(K, 'project_created', 25, 100, P.bedroom); ev(K, 'expense_added', 5, 90, P.bedroom); ev(K, 'expense_added', 5, 90, P.bedroom)
  ev(K, 'task_completed', 10, 84, P.bedroom); ev(R, 'task_completed', 10, 83, P.bedroom); ev(K, 'photo_added', 10, 83, P.bedroom)
  ev(K, 'project_completed', 150, 83, P.bedroom); ev(K, 'under_budget', 100, 83, P.bedroom); ev(K, 'on_time', 50, 83, P.bedroom)
  ev(R, 'project_created', 25, 64, P.pool); ev(R, 'photo_added', 10, 64, P.pool); ev(R, 'contact_added', 10, 62, null); ev(R, 'contact_added', 10, 61, null)
  ev(R, 'quote_added', 20, 60, P.pool); ev(R, 'quote_added', 20, 59, P.pool); ev(R, 'quote_accepted', 15, 58, P.pool); ev(R, 'project_created', 25, 60, P.garden)
  ev(R, 'expense_added', 5, 50, P.pool); ev(R, 'task_completed', 10, 48, P.pool); ev(R, 'task_completed', 10, 47, P.pool); ev(R, 'photo_added', 10, 47, P.pool)
  ev(R, 'project_completed', 150, 47, P.pool); ev(R, 'under_budget', 100, 47, P.pool); ev(R, 'on_time', 50, 47, P.pool)
  ev(K, 'project_created', 25, 40, P.kitchen); ev(K, 'photo_added', 10, 40, P.kitchen); ev(K, 'contact_added', 10, 35, null); ev(K, 'contact_added', 10, 33, null)
  ev(K, 'board_started', 15, 30, P.kitchen); ev(K, 'pin_added', 5, 30, P.kitchen); ev(K, 'pin_added', 5, 28, P.kitchen); ev(K, 'swatch_added', 5, 28, P.kitchen); ev(K, 'swatch_added', 5, 28, P.kitchen)
  ev(R, 'project_created', 25, 30, P.lapa); ev(R, 'photo_added', 10, 30, P.lapa); ev(R, 'contact_added', 10, 28, null); ev(R, 'contact_added', 10, 27, null); ev(R, 'swatch_added', 5, 27, P.kitchen)
  ev(K, 'pin_added', 5, 25, P.kitchen); ev(K, 'pin_added', 5, 25, P.kitchen); ev(R, 'task_completed', 10, 25, P.kitchen); ev(K, 'pin_added', 5, 24, P.kitchen); ev(R, 'quote_added', 20, 24, P.kitchen)
  ev(K, 'quote_added', 20, 22, P.kitchen); ev(K, 'quote_added', 20, 20, P.kitchen); ev(K, 'quote_accepted', 15, 19, P.kitchen); ev(K, 'project_created', 25, 20, P.study); ev(K, 'photo_added', 10, 20, P.study)
  ev(K, 'task_completed', 10, 18, P.kitchen); ev(K, 'board_started', 15, 19, P.study); ev(K, 'pin_added', 5, 18, P.study); ev(K, 'swatch_added', 5, 18, P.study)
  ev(K, 'project_created', 25, 15, P.bath); ev(K, 'photo_added', 10, 15, P.bath); ev(K, 'board_started', 15, 14, P.bath); ev(K, 'pin_added', 5, 14, P.bath); ev(K, 'pin_added', 5, 14, P.bath)
  ev(R, 'expense_added', 5, 14, P.kitchen); ev(K, 'swatch_added', 5, 13, P.bath); ev(K, 'swatch_added', 5, 13, P.bath); ev(R, 'project_created', 25, 12, P.borehole); ev(R, 'photo_added', 10, 12, P.borehole)
  ev(R, 'quote_added', 20, 12, P.lapa); ev(R, 'contact_added', 10, 11, null); ev(K, 'expense_added', 5, 11, P.kitchen); ev(R, 'pin_added', 5, 11, P.kitchen); ev(R, 'quote_added', 20, 10, P.lapa)
  ev(R, 'quote_added', 20, 9, P.borehole); ev(R, 'quote_accepted', 15, 9, P.borehole); ev(R, 'task_completed', 10, 9, P.kitchen); ev(R, 'photo_added', 10, 9, P.kitchen); ev(R, 'project_started', 20, 8, P.borehole)
  ev(K, 'pin_added', 5, 8, P.bath); ev(R, 'quote_added', 20, 7, P.borehole); ev(R, 'expense_added', 5, 4, P.borehole); ev(R, 'task_completed', 10, 3, P.borehole); ev(K, 'pin_added', 5, 2, P.bath)
  ev(R, 'pin_added', 5, 1, P.kitchen); ev(K, 'pin_added', 5, 0, P.bath)

  const achievements: Achievement[] = [
    { id: 'a1', household_id: H, user_id: K, key: 'first_quest', unlocked_at: d(100) },
    { id: 'a2', household_id: H, user_id: K, key: 'finisher', unlocked_at: d(83) },
    { id: 'a3', household_id: H, user_id: K, key: 'under_budget', unlocked_at: d(83) },
    { id: 'a4', household_id: H, user_id: K, key: 'on_time', unlocked_at: d(83) },
    { id: 'a5', household_id: H, user_id: R, key: 'deal_maker', unlocked_at: d(58) },
    { id: 'a6', household_id: H, user_id: R, key: 'rolodex', unlocked_at: d(28) },
    { id: 'a7', household_id: H, user_id: K, key: 'three_bids', unlocked_at: d(20) },
    { id: 'a8', household_id: H, user_id: K, key: 'dreamer', unlocked_at: d(15) },
    { id: 'a9', household_id: H, user_id: K, key: 'teamwork', unlocked_at: d(9) },
    { id: 'a10', household_id: H, user_id: K, key: 'colour_theorist', unlocked_at: d(13) },
    { id: 'a11', household_id: H, user_id: R, key: 'before_after', unlocked_at: d(47) },
    { id: 'a12', household_id: H, user_id: R, key: 'penny_pincher', unlocked_at: d(19) },
  ]

  const nudges: Nudge[] = [
    { id: 'n1', household_id: H, from_user: K, to_user: R, kind: 'todo', message: 'Can you order the brass handles this week? Joe wants them before he hangs the doors.', project_id: P.kitchen, link: `/projects/${P.kitchen}?tab=tasks`, read_at: null, created_at: d(1, 18) },
    { id: 'n2', household_id: H, from_user: K, to_user: R, kind: 'done', message: 'Pinned three tile options for the bathroom — have a look and tell me which you hate.', project_id: P.bath, link: `/projects/${P.bath}/board`, read_at: null, created_at: d(2, 20) },
    { id: 'n3', household_id: H, from_user: R, to_user: K, kind: 'fyi', message: 'Dawie is coming Tuesday 8am to pull the pump.', project_id: P.borehole, link: `/projects/${P.borehole}`, read_at: d(3), created_at: d(4, 9) },
  ]

  const visits: SiteVisit[] = [
    { id: 'v1', project_id: P.kitchen, contact_id: C.joe, visit_date: day(-6), outcome: 'arrived', notes: 'Two guys, took all the doors off and primed the carcasses.', logged_by: K, created_at: d(6, 17) },
    { id: 'v2', project_id: P.kitchen, contact_id: C.joe, visit_date: day(-2), outcome: 'partial', notes: 'Only Joe came — hung six doors, back Thursday for the rest.', logged_by: R, created_at: d(2, 16) },
    { id: 'v3', project_id: P.kitchen, contact_id: C.joe, visit_date: day(2), outcome: 'scheduled', notes: 'Remaining doors + handles.', logged_by: R, created_at: d(2, 16) },
    { id: 'v4', project_id: P.lapa, contact_id: C.thatch1, visit_date: day(-3), outcome: 'no_show', notes: 'Supposed to come and measure. No answer on his phone.', logged_by: R, created_at: d(3, 15) },
    { id: 'v5', project_id: P.borehole, contact_id: C.borehole, visit_date: day(-4), outcome: 'arrived', notes: 'Pulled the pump, motor is toast. New one ordered.', logged_by: R, created_at: d(4, 12) },
  ]

  return { household, profiles, projects, images, contacts, quotes, expenses, tasks, boardItems, xp, achievements, nudges, visits }
}
