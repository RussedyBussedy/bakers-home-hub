// Getting contact details into the app without retyping them: the phone's
// contact picker, vCard (.vcf) files, and free text pasted from WhatsApp,
// email signatures or a Google Maps listing.
import type { ContactRole } from '../data/types'
import { normalisePhone } from './share'

export interface ParsedContact {
  name?: string
  company?: string
  phone?: string
  whatsapp?: string
  email?: string
  notes?: string
  role?: ContactRole
}

// ---------------------------------------------------------------------------
// Contact Picker API (Chrome on Android; Safari on iOS behind a feature flag).
// ---------------------------------------------------------------------------
interface PickedContact { name?: string[]; tel?: string[]; email?: string[] }
type ContactsNavigator = Navigator & { contacts?: { select(props: string[], opts?: { multiple?: boolean }): Promise<PickedContact[]> } }

export function canPickFromPhone(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as ContactsNavigator).contacts) && 'ContactsManager' in window
}

export async function pickFromPhone(): Promise<ParsedContact | null> {
  const nav = navigator as ContactsNavigator
  if (!nav.contacts) return null
  const [c] = await nav.contacts.select(['name', 'tel', 'email'], { multiple: false })
  if (!c) return null
  const tels = (c.tel ?? []).map((t) => t.trim()).filter(Boolean)
  return {
    name: (c.name ?? [])[0]?.trim(),
    phone: tels[0],
    whatsapp: pickMobile(tels),
    email: (c.email ?? [])[0]?.trim(),
  }
}

const LEGAL_RE = /\b(pty|ltd|cc|inc|llc|npc|t\/a)\b/i
const TRADE_RE = /\b(builders?|hardware|plumb\w*|electric\w*|construction|projects?|services?|contractors?|suppl\w*|warehouse|kitchens?|cabinets?|cabinetry|joiner\w*|carpent\w*|tiles?|tiling|paint\w*|roof\w*|glass|aluminium|timber|garden\w*|landscap\w*|pools?|security|solar|interiors?|designs?|studio|sons|bros|steel|weld\w*|fenc\w*|gates?|paving|brick\w*|plaster\w*|ceilings?|flooring|carpets?|blinds?|curtains?|shutters?|awnings?|thatch\w*|borehole\w*|irrigation|nursery|hire|rentals?|removals?|cleaning|pest|decking|shopfitt\w*|installations?|maintenance|handyman|renovations?|group|trading|enterprises?|solutions|centre|center|city|world|depot|mart|express)\b/gi
const COMPANY_WORDS = new RegExp(`${LEGAL_RE.source}|${TRADE_RE.source}`, 'i')
const SUPPLIER_RE = /suppl|hardware|warehouse|tiles?|paint|timber|glass|aluminium|nursery|depot|mart|city|world|centre|center|express|trading/i

/** How much a line looks like a business name rather than a person. */
function companyScore(line: string): number {
  let s = 0
  if (LEGAL_RE.test(line)) s += 3
  s += (line.match(TRADE_RE) ?? []).length
  if (/[()&]/.test(line)) s += 1
  return s
}

const NAME_RE = /^[\p{L}'’.\- ]+$/u
const PARTICLES = new Set(['van', 'der', 'de', 'du', 'le', 'da', 'den', 'von', 'la', 'el', 'al'])
const GREETING_RE = /^(hi|hello|hey|howzit|dear|thanks|thank you|regards|kind regards|best|cheers|sent from)\b/i
function nameScore(line: string): number {
  const words = line.split(' ')
  if (!NAME_RE.test(line) || words.length > 4 || GREETING_RE.test(line)) return 0
  let s = words.length === 1 ? 1 : 2
  if (words.length >= 2 && words.length <= 3) s += 1
  if (LEGAL_RE.test(line)) s -= 2
  // People's names are capitalised; sentences aren't.
  const lower = words.filter((w) => !PARTICLES.has(w.toLowerCase()) && /^\p{Ll}/u.test(w)).length
  if (lower) s -= 2
  return s
}

function guessRole(company: string | undefined): ContactRole | undefined {
  if (!company || !COMPANY_WORDS.test(company)) return undefined
  return SUPPLIER_RE.test(company) ? 'supplier' : 'contractor'
}

/** Prefer a South African cell number (06x/07x/08x) for WhatsApp. */
function pickMobile(tels: string[]): string | undefined {
  const norm = tels.map(normalisePhone).filter(Boolean)
  return norm.find((d) => /^27[678]/.test(d)) ?? norm[0]
}

// ---------------------------------------------------------------------------
// vCard — what "Share contact" produces on iPhone and Android.
// ---------------------------------------------------------------------------
function decodeQP(s: string): string {
  const bytes: number[] = []
  const src = s.replace(/=\r?\n/g, '')
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) { bytes.push(parseInt(src.slice(i + 1, i + 3), 16)); i += 2 }
    else bytes.push(src.charCodeAt(i))
  }
  try { return new TextDecoder().decode(new Uint8Array(bytes)) } catch { return src }
}

function unescapeV(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

export function parseVCards(text: string): ParsedContact[] {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1)
  return cards.map((card) => {
    const out: ParsedContact = {}
    const tels: string[] = []
    const emails: string[] = []
    const notes: string[] = []
    let nFallback = ''
    for (const raw of card.split('\n')) {
      const idx = raw.indexOf(':')
      if (idx < 0) continue
      const head = raw.slice(0, idx).replace(/^item\d+\./i, '')
      let value = raw.slice(idx + 1)
      const [keyRaw, ...params] = head.split(';')
      const key = (keyRaw ?? '').toUpperCase()
      if (params.some((p) => /QUOTED-PRINTABLE/i.test(p))) value = decodeQP(value)
      value = unescapeV(value)
      if (!value) continue
      switch (key) {
        case 'FN': out.name = value; break
        case 'N': { const [last = '', first = '', middle = ''] = value.split(';'); nFallback = [first, middle, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); break }
        case 'ORG': out.company = value.split(';').filter(Boolean).join(' · '); break
        case 'TEL': tels.push(value); break
        case 'EMAIL': emails.push(value); break
        case 'NOTE': notes.push(value); break
        case 'URL': notes.push(`Web: ${value}`); break
        case 'ADR': { const addr = value.split(';').filter(Boolean).join(', '); if (addr) notes.push(addr); break }
        case 'TITLE': notes.push(value); break
        default: break
      }
    }
    if (!out.name) out.name = nFallback || out.company
    if (tels[0]) out.phone = tels[0]
    out.whatsapp = pickMobile(tels)
    if (emails[0]) out.email = emails[0]
    if (notes.length) out.notes = notes.join('\n')
    if (out.company && !out.name) out.name = out.company
    out.role = guessRole(out.company)
    return out
  }).filter((c) => c.name || c.phone || c.email)
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(new Error('Could not read the file'))
    r.readAsText(file)
  })
}

// ---------------------------------------------------------------------------
// Smart paste — a WhatsApp message, an email signature, a Maps listing.
// ---------------------------------------------------------------------------
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const URL_RE = /(?:https?:\/\/|www\.)\S+/gi
const PHONE_RE = /\+?\d[\d\s().\- ]{6,}\d/g
const LABEL_RE = /^(name|contact|contact person|company|business|org|organisation|organization|tel|telephone|phone|cell|mobile|whatsapp|wa|email|e-mail|web|website|address)\s*[:\-–]\s*/i

export function parsePastedDetails(text: string): ParsedContact {
  const out: ParsedContact = {}
  const emails = text.match(EMAIL_RE) ?? []
  const urls = text.match(URL_RE) ?? []
  const phones = (text.match(PHONE_RE) ?? []).map((p) => p.trim()).filter((p) => { const d = p.replace(/\D/g, ''); return d.length >= 9 && d.length <= 15 })
  if (emails[0]) out.email = emails[0]
  if (phones[0]) out.phone = phones[0]
  out.whatsapp = pickMobile(phones)

  const leftovers: string[] = []
  // Lines, then the comma/dash-separated pieces inside a chatty line.
  const segments = text.split(/\r?\n/).flatMap((l) => l.split(/[,;|•·]| [-–—] /))
  for (const raw of segments) {
    let line = raw.trim()
    if (!line) continue
    const labelled = line.match(LABEL_RE)
    const label = labelled ? labelled[1]!.toLowerCase() : ''
    line = line.replace(LABEL_RE, '').replace(EMAIL_RE, '').replace(URL_RE, '').replace(PHONE_RE, '')
    if (!label && line.includes(':')) line = line.slice(line.lastIndexOf(':') + 1) // "his details: Sipho Dlamini"
    const stripped = line.replace(/^[\s.!?:]+|[\s.!?:]+$/g, '').replace(/\s+/g, ' ').trim()
    if (!stripped) continue
    if (/^(name|contact|contact person)$/.test(label)) { out.name = stripped; continue }
    if (/^(company|business|org|organisation|organization)$/.test(label)) { out.company = stripped; continue }
    if (label) continue // a labelled phone/email/web line — already captured
    leftovers.push(stripped)
  }
  // The line that looks most like a business is the company; the most
  // person-like of the rest (earliest wins ties) is the name.
  const pool = leftovers.filter((l) => l !== out.name && l !== out.company)
  if (!out.company) {
    const best = pool.map((l, i) => ({ l, i, s: companyScore(l) })).sort((a, b) => b.s - a.s || a.i - b.i)[0]
    if (best && best.s > 0) out.company = best.l
  }
  if (!out.name) {
    const rest = pool.filter((l) => l !== out.company)
    const best = rest.map((l, i) => ({ l, i, s: nameScore(l) })).sort((a, b) => b.s - a.s || a.i - b.i)[0]
    if (best && best.s >= 2) out.name = best.l
    else if (rest[0] && !out.company) out.name = rest[0]
  }
  // Signature-style "Name / Company" with nothing tradey in the company name.
  if (!out.company && out.name) {
    const second = pool.find((l) => l !== out.name && l.split(' ').length <= 6)
    if (second) out.company = second
  }
  if (!out.name && out.company) out.name = out.company
  const rest = leftovers.filter((l) => l !== out.name && l !== out.company && !GREETING_RE.test(l))
  const noteBits = [...rest, ...urls.map((u) => `Web: ${u}`)]
  if (noteBits.length) out.notes = noteBits.slice(0, 4).join('\n')
  out.role = guessRole(out.company)
  return out
}

export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`
}
