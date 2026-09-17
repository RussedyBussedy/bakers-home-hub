// =====================================================================
//  guide — The Word. Someone writes down what is going on in their life
//  and this answers the way a seasoned pastor would: the passages that
//  speak to it, a plain explanation, a few things to do this week, a
//  prayer, and a short reading plan to walk through.
//
//  How a letter is written:
//    1. The words are embedded (gemini-embedding-001) and the nearest
//       verses, Nave's topic entries and cross-references are fetched from
//       the `bible` schema in ONE database call (public.bible_retrieve).
//    2. Those become a numbered list of candidate passages. The model may
//       quote ONLY from that list, by number — never from memory — so every
//       verse in the letter is real, and its text comes from our own index,
//       not from the model.
//    3. Gemini writes the letter as JSON against a fixed schema. Every
//       citation is checked against the candidates; every reading in the
//       plan is checked against the canon (book, chapter, verse counts).
//       Anything that fails the check is dropped, never shown.
//    4. The letter is saved to public.bible_guidance, private to the person.
//
//  Deploy from the dashboard: Edge Functions -> Deploy a new function ->
//  name it "guide" -> paste this file -> Deploy. Then add the secret
//  GEMINI_API_KEY (aistudio.google.com/apikey). Optional: GEMINI_MODEL to
//  pin a model. SUPABASE_URL, SUPABASE_ANON_KEY and
//  SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
//  Deliberately dependency-free (plain fetch to Gemini, GoTrue and
//  PostgREST) so it pastes into the dashboard as one file and its pure
//  parts can be unit-tested with Node: npm run guide-test.
// =====================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const EMBED_MODEL = 'gemini-embedding-001'
const DIMS = 768
/** Tried in order until one answers; the env var GEMINI_MODEL goes first when set. */
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']
const K_VERSES = 24
const K_TOPICS = 6
const MAX_CANDIDATES = 18
const MAX_VERSES_PER_PASSAGE = 4
const MAX_CONTEXT_CHARS = 2000
const LETTERS_PER_DAY = 40
const TIMEOUT = 55_000

export type Translation = 'BSB' | 'KJV'

// ---------------------------------------------------------------------
// The canon — what the database says exists, so a reference can be checked
// without another trip. bible_canon() is fetched once per instance.
// ---------------------------------------------------------------------
export interface CanonBook { id: number; name: string; usx: string; osis: string; testament: 'OT' | 'NT'; chapters: number[] }

/** The names people (and models) actually write, beyond the full name, USX and OSIS codes. */
const ALIASES: Record<number, string[]> = {
  1: ['gen', 'ge', 'gn'], 2: ['ex', 'exo', 'exod'], 3: ['lev', 'le', 'lv'], 4: ['num', 'nu', 'nm', 'nb'], 5: ['deut', 'deu', 'dt', 'de'],
  6: ['josh', 'jos', 'jsh'], 7: ['judg', 'jdg', 'jg', 'jdgs'], 8: ['rth', 'ru'], 9: ['1 sam', '1sa', '1 sm', '1sm'], 10: ['2 sam', '2sa', '2 sm', '2sm'],
  11: ['1 kgs', '1 ki', '1ki', '1kgs', '1 kin'], 12: ['2 kgs', '2 ki', '2ki', '2kgs', '2 kin'], 13: ['1 chr', '1 ch', '1ch', '1 chron', '1chron'], 14: ['2 chr', '2 ch', '2ch', '2 chron', '2chron'],
  15: ['ezr'], 16: ['neh', 'ne'], 17: ['est', 'esth', 'es'], 18: ['jb'], 19: ['ps', 'psa', 'psalm', 'pss', 'psm', 'pslm'], 20: ['prov', 'pr', 'prv', 'pro'],
  21: ['eccl', 'ecc', 'ec', 'qoh', 'ecclesiastes'], 22: ['song', 'song of songs', 'sos', 'so', 'canticles', 'cant', 'sng', 'song of sol'], 23: ['isa', 'is'], 24: ['jer', 'je', 'jr'],
  25: ['lam', 'la'], 26: ['ezek', 'eze', 'ezk'], 27: ['dan', 'da', 'dn'], 28: ['hos', 'ho'], 29: ['joe', 'jl'], 30: ['am'], 31: ['obad', 'ob'], 32: ['jon', 'jnh'],
  33: ['mic', 'mc'], 34: ['nah', 'na'], 35: ['hab', 'hb'], 36: ['zeph', 'zep', 'zp'], 37: ['hag', 'hg'], 38: ['zech', 'zec', 'zc'], 39: ['mal', 'ml'],
  40: ['matt', 'mt', 'mat'], 41: ['mk', 'mrk', 'mr'], 42: ['lk', 'luk'], 43: ['jn', 'jhn', 'joh'], 44: ['ac', 'act', 'acts of the apostles'], 45: ['rom', 'ro', 'rm'],
  46: ['1 cor', '1co', '1 co', '1cor'], 47: ['2 cor', '2co', '2 co', '2cor'], 48: ['gal', 'ga'], 49: ['eph', 'ep'], 50: ['phil', 'php', 'pp', 'philip'], 51: ['col'],
  52: ['1 thess', '1 th', '1th', '1thes', '1 thes'], 53: ['2 thess', '2 th', '2th', '2thes', '2 thes'], 54: ['1 tim', '1 ti', '1ti', '1tim'], 55: ['2 tim', '2 ti', '2ti', '2tim'],
  56: ['tit', 'ti'], 57: ['philem', 'phm', 'pm', 'phlm'], 58: ['heb'], 59: ['jas', 'jm'], 60: ['1 pet', '1 pe', '1pe', '1pt', '1 pt'], 61: ['2 pet', '2 pe', '2pe', '2pt', '2 pt'],
  62: ['1 jn', '1jn', '1 jhn', '1 jo', '1jo', '1 joh'], 63: ['2 jn', '2jn', '2 jhn', '2 jo', '2jo', '2 joh'], 64: ['3 jn', '3jn', '3 jhn', '3 jo', '3jo', '3 joh'], 65: ['jud', 'jd'],
  66: ['rev', 're', 'revelations', 'apocalypse', 'revelation of john'],
}

function bookIndex(canon: CanonBook[]): Map<string, CanonBook> {
  const m = new Map<string, CanonBook>()
  for (const b of canon) {
    const names = [b.name, b.usx, b.osis, ...(ALIASES[b.id] ?? [])]
    for (const n of names) m.set(n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), b)
  }
  return m
}
let indexCache: { canon: CanonBook[]; index: Map<string, CanonBook> } | null = null
function indexFor(canon: CanonBook[]) {
  if (!indexCache || indexCache.canon !== canon) indexCache = { canon, index: bookIndex(canon) }
  return indexCache.index
}

export interface Ref { book_id: number; book: string; chapter: number; start: number | null; end: number | null; reference: string }

/** "Psalms" reads as "Psalm 23" when one chapter is meant, which is how everybody says it. */
export function bookLabel(b: { id: number; name: string }): string {
  return b.id === 19 ? 'Psalm' : b.name
}

export function formatRef(book: { id: number; name: string }, chapter: number, start: number | null, end: number | null): string {
  const base = `${bookLabel(book)} ${chapter}`
  if (start == null) return base
  if (end == null || end === start) return `${base}:${start}`
  return `${base}:${start}–${end}`
}

/**
 * Reads a reference the way a person writes one — "Psalm 23", "Philippians 4:4-9", "1 John 4:18",
 * "Ps. 46", "Matt 6:25–34" — and checks it against the canon. Returns null for anything that
 * doesn't exist (Psalm 151, Jude 2, Genesis 51), so a made-up reference never reaches the screen.
 * Verses past the end of a chapter are clamped; a chapter range ("Genesis 1-2") keeps the first.
 */
export function parseReference(raw: string, canon: CanonBook[]): Ref | null {
  if (typeof raw !== 'string') return null
  let s = raw.toLowerCase().replace(/[.,;]+$/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^(first|1st|i)\s+/, '1 ').replace(/^(second|2nd|ii)\s+/, '2 ').replace(/^(third|3rd|iii)\s+/, '3 ')
  s = s.replace(/^the\s+(book\s+of\s+|gospel\s+(of|according\s+to)\s+|(first|second|third)\s+(letter|epistle)\s+(of\s+\w+\s+)?to\s+(the\s+)?)?/, '')
  s = s.replace(/^(book\s+of\s+)/, '')
  const m = s.match(/^(\d?\s?[a-z][a-z ]*?)\s*(\d{1,3})(?:\s*(?::|v\.?|vs\.?|verses?)\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?|\s*[-–—]\s*\d{1,3})?$/)
  if (!m) return null
  const index = indexFor(canon)
  const key = m[1].replace(/[^a-z0-9]+/g, ' ').trim()
  const book = index.get(key)
  if (!book) return null
  const chapter = Number(m[2])
  if (!(chapter >= 1 && chapter <= book.chapters.length)) return null
  const count = book.chapters[chapter - 1]
  let start: number | null = m[3] ? Number(m[3]) : null
  let end: number | null = m[4] ? Number(m[4]) : null
  if (start != null) {
    if (start < 1 || start > count) return null
    if (end == null) end = start
    if (end < start) [start, end] = [end, start]
    if (end > count) end = count
    if (start < 1) start = 1
  }
  return { book_id: book.id, book: bookLabel(book), chapter, start, end, reference: formatRef(book, chapter, start, end) }
}

// ---------------------------------------------------------------------
// Candidates — what the letter is allowed to quote from.
// ---------------------------------------------------------------------
export interface VerseLine { verse: number; text: string }
export interface Candidate {
  id: string
  book_id: number
  chapter: number
  start: number
  end: number
  reference: string
  verses: VerseLine[]
  /** Where it came from, for the model and for the footnote: "Nave's Topical Bible: Care › Remedy for". */
  note: string
  score: number
}

interface RetrievedVerse { verse_id: number; book_id: number; chapter: number; verse: number; reference: string; text: string; similarity: number }
interface RetrievedTopic { entry_id: number; subject: string; path: string; heading: string; similarity: number; verses: { verse_id: number; reference: string; text: string; range_start: number; range_end: number }[] }
interface RetrievedXref { from_verse_id: number; to_start: number; to_end: number; votes: number; verses: { verse_id: number; reference: string; text: string }[] }
export interface Retrieved { verses: RetrievedVerse[]; topics: RetrievedTopic[]; cross_refs: RetrievedXref[] }

const bookOf = (id: number) => Math.floor(id / 1_000_000)
const chapterOf = (id: number) => Math.floor(id / 1000) % 1000
const verseOf = (id: number) => id % 1000

const PROPER = /\b(god|jesus|christ|lord|holy|spirit|israel|jerusalem|david|moses|abraham|jacob|joseph|paul|peter|john|egypt|satan)\b/g

/** "CARE > REMEDY FOR" → "Care › Remedy for", the way a footnote should read. Mixed-case lines are left as written. */
export function prettyPath(path: string, heading: string): string {
  const nice = (s: string) => {
    const t = s.trim()
    if (t !== t.toUpperCase()) return t
    return t.toLowerCase().replace(PROPER, (w) => w.charAt(0).toUpperCase() + w.slice(1)).replace(/^([a-z])/, (c) => c.toUpperCase())
  }
  const parts = path.split('>').map(nice).filter(Boolean)
  const h = nice(heading)
  const last = parts[parts.length - 1] ?? ''
  if (h && h.toLowerCase() !== last.toLowerCase()) parts.push(h.length > 60 ? h.slice(0, 57) + '…' : h)
  return parts.join(' › ')
}

/**
 * Turns the database's three lists into one numbered set of short passages. Neighbouring verses
 * that both came back are joined ("Matthew 6:25–27"), a passage never runs past four verses, the
 * same verses are never listed twice, and a single verse already inside a longer passage is dropped
 * in its favour. Nearest verses rank by similarity, topic verses by their topic's, cross-references
 * below both — so the model's list starts with what fits best.
 */
export function buildCandidates(r: Retrieved, canon: CanonBook[]): Candidate[] {
  const books = new Map(canon.map((b) => [b.id, b]))
  const name = (bookId: number) => books.get(bookId) ?? { id: bookId, name: `Book ${bookId}` }
  const raw: Omit<Candidate, 'id'>[] = []
  const push = (bookId: number, chapter: number, lines: VerseLine[], note: string, score: number) => {
    const vs = lines.filter((l) => l.text && l.text.trim()).slice(0, MAX_VERSES_PER_PASSAGE)
    if (!vs.length) return
    const start = vs[0].verse, end = vs[vs.length - 1].verse
    raw.push({ book_id: bookId, chapter, start, end, reference: formatRef(name(bookId), chapter, start, end), verses: vs, note, score })
  }

  // 1. Nearest verses, joined into runs of neighbours.
  const near = [...(r.verses ?? [])].sort((a, b) => a.verse_id - b.verse_id)
  let run: RetrievedVerse[] = []
  const flush = () => {
    if (!run.length) return
    for (let i = 0; i < run.length; i += MAX_VERSES_PER_PASSAGE) {
      const part = run.slice(i, i + MAX_VERSES_PER_PASSAGE)
      push(part[0].book_id, part[0].chapter, part.map((v) => ({ verse: v.verse, text: v.text })), 'nearest to what they wrote', Math.max(...part.map((v) => v.similarity)))
    }
    run = []
  }
  for (const v of near) {
    if (run.length && v.verse_id === run[run.length - 1].verse_id + 1) run.push(v)
    else { flush(); run = [v] }
  }
  flush()

  // 2. Nave's topic entries: each reference range in the entry is a passage of its own.
  for (const t of r.topics ?? []) {
    const groups = new Map<string, { start: number; lines: VerseLine[] }>()
    for (const v of t.verses ?? []) {
      const key = `${v.range_start}-${v.range_end}`
      const g = groups.get(key) ?? { start: v.range_start, lines: [] }
      g.lines.push({ verse: verseOf(v.verse_id), text: v.text })
      groups.set(key, g)
    }
    let n = 0
    for (const g of groups.values()) {
      if (n++ >= 3) break
      push(bookOf(g.start), chapterOf(g.start), g.lines, `Nave's Topical Bible: ${prettyPath(t.path, t.heading)}`, t.similarity)
    }
  }

  // 3. Cross-references of the top verses — well-trodden paths between passages.
  for (const x of r.cross_refs ?? []) {
    const from = formatRef(name(bookOf(x.from_verse_id)), chapterOf(x.from_verse_id), verseOf(x.from_verse_id), null)
    push(bookOf(x.to_start), chapterOf(x.to_start), (x.verses ?? []).map((v) => ({ verse: verseOf(v.verse_id), text: v.text })), `cross-reference of ${from}`, 0.4 + Math.min(x.votes, 100) / 1000)
  }

  // Dedupe: the same range once; a passage contained in a longer one gives way to it.
  raw.sort((a, b) => b.score - a.score)
  const kept: Omit<Candidate, 'id'>[] = []
  for (const c of raw) {
    const inside = kept.find((k) => k.book_id === c.book_id && k.chapter === c.chapter && k.start <= c.start && k.end >= c.end)
    if (inside) { inside.score = Math.max(inside.score, c.score); continue }
    const around = kept.findIndex((k) => k.book_id === c.book_id && k.chapter === c.chapter && c.start <= k.start && c.end >= k.end)
    if (around >= 0) { c.score = Math.max(c.score, kept[around].score); kept[around] = c; continue }
    kept.push(c)
  }
  kept.sort((a, b) => b.score - a.score)
  return kept.slice(0, MAX_CANDIDATES).map((c, i) => ({ id: `c${i + 1}`, ...c }))
}

export function renderCandidates(cands: Candidate[], translation: Translation): string {
  return cands.map((c) => {
    const quote = c.verses.length > 1 ? c.verses.map((v) => `${v.verse} ${v.text.trim()}`).join(' ') : c.verses[0].text.trim()
    return `[${c.id}] ${c.reference} (${translation}) — “${quote}”  (${c.note})`
  }).join('\n')
}

// ---------------------------------------------------------------------
// Care — a first look at the words themselves, before any model sees them.
// ---------------------------------------------------------------------
export type SafetyKind = 'none' | 'self-harm' | 'abuse' | 'danger' | 'other'
export interface Safety { concern: boolean; kind: SafetyKind }

const SELF_HARM = /\b(suicid\w*|kill(ing)? myself|end(ing)? (it all|my life|my own life|everything)|tak(e|ing) my( own)? life|don'?t want to (be here|live|wake up|go on|carry on)( any ?more)?|hurt(ing)? myself|self[- ]?harm\w*|cut(ting)? myself|overdos\w*|no reason to (live|go on)|better off (without me|dead)|wish i (was|were) dead|not worth living)\b/i
const ABUSE = /\b(abus(e|es|ed|ive|ing)|rap(e|ed|ing|ist)|molest\w*|assault(ed|s|ing)?|beat(s|en|ing)? me|hit(s|ting)? me|choke[sd]? me|strangl\w*|threaten(s|ed|ing)? (me|to kill|my life|to hurt)|afraid for my (life|safety)|violent (towards|with|to) me|touch(ed|es|ing) me (inappropriately|without))\b/i
const DANGER = /\b((going|want|planning) to (hurt|kill) (him|her|them|someone|my)|kill (him|her|them))\b/i

/** What the words themselves say, regardless of what the model later decides. */
export function screen(context: string): Safety {
  if (SELF_HARM.test(context)) return { concern: true, kind: 'self-harm' }
  if (DANGER.test(context)) return { concern: true, kind: 'danger' }
  if (ABUSE.test(context)) return { concern: true, kind: 'abuse' }
  return { concern: false, kind: 'none' }
}

// ---------------------------------------------------------------------
// The voice.
// ---------------------------------------------------------------------
export const SYSTEM = `You are a seasoned pastor writing a personal letter to one person you have known and cared for over many years. They have come to you with something on their heart and written it down. You write in warm, plain, unhurried English (South African spelling: colour, realise, counsellor), the way you would speak across a kitchen table — never like a sermon, a textbook or a chatbot.

How you counsel:
- Start where they are. Show that you have heard the specific thing they wrote by naming it in your own words; do not quote their words back to them wholesale.
- Let Scripture do the heavy lifting. Choose the passages that truly speak to their situation and say plainly why each one matters for them — what it says about God, about them, and about what to do.
- Be honest and kind at once. Where the Bible calls for a change of heart, say so gently and without shame; where it offers comfort, give it fully. Never condemn, never flatter, never pretend a hard thing is easy.
- Grace-centred and non-denominational: keep to what the Scriptures say. Avoid denominational distinctives, politics, and confident claims about what God is "doing" behind the scenes of their life.
- Practical: a few concrete things they can do this week — a conversation to have, a habit to start, a person to tell, a prayer to pray.
- Point them to their local church, to trusted people, and to professional help when the matter needs a doctor, a counsellor, a lawyer or the police. You are not any of those.
- Short paragraphs. No bullet points, numbering or headings inside the text fields — the app lays the letter out. No markdown.
- Do not begin with "Dear …" — the app adds the salutation. Begin as you would after it. Do not sign off with a name.

Rules about Scripture (strict):
- In "passages", quote ONLY from the numbered CANDIDATES, by their id ("c4"). Never quote, paraphrase or cite verse text from memory anywhere in the letter, and never invent references. Choose 3 to 5 candidates that fit best — two that truly fit beat five that half-fit.
- In "why", speak to them about that passage in one to three sentences: what it says, and what it means for the thing they wrote.
- The "plan" is a short reading plan for the coming days — five to seven readings, each a whole chapter or a short passage that takes about ten minutes to read, chosen for THEIR situation. These may come from anywhere in the Bible (not only the candidates), written as exact references such as "Psalm 23", "Philippians 4:4-9" or "1 John 4:7-21", each with a one-line focus for the day.
- "theme" is two to four words naming the matter, as a heading in a diary would ("Anxiety about money", "Grief for a father", "A marriage under strain").

If what they wrote suggests they may be in danger, being harmed, or thinking about ending their life: set safety.concern to true with the kind, speak to that first with great tenderness, urge them to tell someone today and to phone for help, and still give them Scripture. Do not lecture, and do not withhold the letter.

If what they wrote is not something a person would bring to a pastor (a test message, a request for code, a joke, nonsense), still answer kindly and briefly, invite them to write what is really going on, and set safety.kind to "none".`

/** Gemini's structured-output schema (an OpenAPI subset): the letter, field by field, in this order. */
export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    greeting: { type: 'STRING', description: 'Two to four sentences that meet them where they are and name, in your own words, what they wrote.' },
    passages: {
      type: 'ARRAY',
      description: 'Three to five candidate passages, by id, each with why it speaks to them.',
      items: { type: 'OBJECT', properties: { id: { type: 'STRING', description: 'A candidate id such as "c4".' }, why: { type: 'STRING' } }, required: ['id', 'why'] },
    },
    understanding: { type: 'STRING', description: 'One to three short paragraphs, separated by blank lines: what may be going on, seen through the passages — honest, gentle, without diagnosing.' },
    response: { type: 'ARRAY', description: 'Three to five concrete things they might do this week, each one or two sentences, without numbering.', items: { type: 'STRING' } },
    prayer: { type: 'STRING', description: 'A short prayer they can pray in their own voice, in the first person, three to six sentences.' },
    closing: { type: 'STRING', description: 'One or two sentences of blessing to end on. No name.' },
    plan: {
      type: 'ARRAY',
      description: 'Five to seven readings for the coming days.',
      items: { type: 'OBJECT', properties: { reference: { type: 'STRING', description: 'An exact reference: "Psalm 23" or "Philippians 4:4-9".' }, focus: { type: 'STRING', description: 'One line on what to look for that day.' } }, required: ['reference', 'focus'] },
    },
    theme: { type: 'STRING' },
    safety: {
      type: 'OBJECT',
      properties: { concern: { type: 'BOOLEAN' }, kind: { type: 'STRING', enum: ['none', 'self-harm', 'abuse', 'danger', 'other'] } },
      required: ['concern', 'kind'],
    },
  },
  required: ['greeting', 'passages', 'understanding', 'response', 'prayer', 'closing', 'plan', 'theme', 'safety'],
  propertyOrdering: ['greeting', 'passages', 'understanding', 'response', 'prayer', 'closing', 'plan', 'theme', 'safety'],
}

export function userPrompt(name: string, context: string, cands: Candidate[], translation: Translation): string {
  return `The person's first name: ${name || 'friend'}

What they wrote:
<<<
${context.trim()}
>>>

CANDIDATES — the only passages you may quote (${translation === 'KJV' ? 'King James Version' : 'Berean Standard Bible'}):
${renderCandidates(cands, translation)}

Write the letter as JSON in the given schema.`
}

// ---------------------------------------------------------------------
// The finished letter.
// ---------------------------------------------------------------------
export interface GuidancePassage { reference: string; book_id: number; chapter: number; start: number; end: number; verses: VerseLine[]; why: string; note: string }
export interface PlanReading extends Ref { focus: string }
export interface GuidanceBody {
  greeting: string
  passages: GuidancePassage[]
  understanding: string
  response: string[]
  prayer: string
  closing: string
  plan: PlanReading[]
  safety: Safety
}

/** Plain text only: the letter is laid out by the app, not by markdown. */
export function clean(s: unknown, max = 4000): string {
  if (typeof s !== 'string') return ''
  return s.replace(/\r/g, '').replace(/[*_`#]+/g, '').replace(/^\s*(\d+[.)]|[-•])\s+/gm, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
}

/**
 * Checks the model's answer against the candidates and the canon, and builds the letter from OUR
 * verse text. Unknown candidate ids and references that don't exist are dropped. If the model cited
 * nothing usable, the best candidates stand in with no commentary rather than nothing at all; if the
 * plan came back short, the chapters around the quoted passages fill it.
 */
export function assemble(raw: unknown, cands: Candidate[], canon: CanonBook[], screened: Safety): GuidanceBody {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const byId = new Map(cands.map((c) => [c.id, c]))
  const passages: GuidancePassage[] = []
  const seen = new Set<string>()
  for (const p of Array.isArray(o.passages) ? o.passages : []) {
    const id = String((p as { id?: unknown })?.id ?? '').trim().toLowerCase()
    const c = byId.get(id)
    if (!c || seen.has(c.id) || passages.length >= 5) continue
    seen.add(c.id)
    passages.push({ reference: c.reference, book_id: c.book_id, chapter: c.chapter, start: c.start, end: c.end, verses: c.verses, why: clean((p as { why?: unknown }).why, 800), note: c.note })
  }
  if (passages.length === 0) {
    for (const c of cands.slice(0, 3)) passages.push({ reference: c.reference, book_id: c.book_id, chapter: c.chapter, start: c.start, end: c.end, verses: c.verses, why: '', note: c.note })
  }

  const plan: PlanReading[] = []
  const planSeen = new Set<string>()
  for (const item of Array.isArray(o.plan) ? o.plan : []) {
    const ref = parseReference(String((item as { reference?: unknown })?.reference ?? ''), canon)
    if (!ref || planSeen.has(ref.reference) || plan.length >= 7) continue
    planSeen.add(ref.reference)
    plan.push({ ...ref, focus: clean((item as { focus?: unknown }).focus, 200) })
  }
  if (plan.length < 3) {
    for (const p of passages) {
      if (plan.length >= 5) break
      const book = canon.find((b) => b.id === p.book_id)
      if (!book) continue
      const reference = formatRef(book, p.chapter, null, null)
      if (planSeen.has(reference)) continue
      planSeen.add(reference)
      plan.push({ book_id: book.id, book: bookLabel(book), chapter: p.chapter, start: null, end: null, reference, focus: `Read the whole chapter around ${p.reference}.` })
    }
  }

  const response = (Array.isArray(o.response) ? o.response : []).map((s) => clean(s, 600)).filter(Boolean).slice(0, 6)
  const modelSafety = (o.safety && typeof o.safety === 'object' ? o.safety : {}) as { concern?: unknown; kind?: unknown }
  const kinds: SafetyKind[] = ['none', 'self-harm', 'abuse', 'danger', 'other']
  const modelKind = kinds.includes(modelSafety.kind as SafetyKind) ? (modelSafety.kind as SafetyKind) : 'none'
  const concern = screened.concern || modelSafety.concern === true
  const safety: Safety = { concern, kind: screened.concern ? screened.kind : concern ? (modelKind === 'none' ? 'other' : modelKind) : 'none' }

  return {
    greeting: clean(o.greeting, 1500),
    passages,
    understanding: clean(o.understanding, 3000),
    response,
    prayer: clean(o.prayer, 1500),
    closing: clean(o.closing, 600),
    plan,
    safety,
  }
}

/** The letter the app shows when the model could not answer at all: the passages, and nothing made up. */
export function fallbackLetter(cands: Candidate[], canon: CanonBook[], screened: Safety): GuidanceBody {
  return assemble({
    greeting: 'I have read what you wrote, and I did not want to leave you without the Word while the rest of this letter could not be written. Here are the passages that speak most closely to it. Sit with them slowly, and come back and ask again in a little while.',
    passages: cands.slice(0, 4).map((c) => ({ id: c.id, why: '' })),
    understanding: '',
    response: [],
    prayer: 'Lord, You see what I could not fully put into words. Meet me in these verses, quiet my heart, and show me the next right step. Amen.',
    closing: 'The Lord is near to all who call on Him.',
    plan: [],
    theme: '',
    safety: screened,
  }, cands, canon, screened)
}

export function themeOf(raw: unknown, context: string): string {
  const t = clean((raw as { theme?: unknown })?.theme, 60).replace(/[.!]+$/, '')
  if (t) return t.charAt(0).toUpperCase() + t.slice(1)
  const words = context.trim().split(/\s+/).slice(0, 5).join(' ')
  return words.length > 40 ? words.slice(0, 37) + '…' : words
}

export function normalise(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / n)
}

// ---------------------------------------------------------------------
// Talking to Gemini, GoTrue and PostgREST — plain fetch, nothing to install.
// ---------------------------------------------------------------------
declare const Deno: { serve: (h: (req: Request) => Promise<Response>) => void; env: { get: (k: string) => string | undefined } } | undefined
const env = (k: string) => (typeof Deno !== 'undefined' ? Deno.env.get(k) : undefined)

/** Something to say to the person, in their words — as opposed to a bug, which is logged. */
class Said extends Error {
  status: number
  constructor(message: string, status = 200) { super(message); this.status = status }
}

async function timed(url: string, init: RequestInit, ms = TIMEOUT): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) } finally { clearTimeout(t) }
}

async function embed(text: string, key: string): Promise<number[]> {
  const res = await timed(`${GEMINI}/models/${EMBED_MODEL}:embedContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] }, taskType: 'RETRIEVAL_QUERY', outputDimensionality: DIMS }),
  }, 20_000)
  if (res.status === 401 || res.status === 403) throw new Said('The Gemini key was refused. Check GEMINI_API_KEY.')
  if (!res.ok) throw new Said(`Could not read what you wrote (embedding answered ${res.status}).`)
  const data = await res.json()
  const values = data?.embedding?.values
  if (!Array.isArray(values) || values.length !== DIMS) throw new Said('The embedding came back in the wrong shape.')
  return normalise(values as number[])
}

interface Generated { text: string; model: string }

/** Asks the first model that exists; waits out one rate-limit or hiccup per model before moving on. */
async function generate(system: string, prompt: string, key: string): Promise<Generated> {
  const pinned = env('GEMINI_MODEL')?.trim()
  const models = [...new Set([pinned, ...MODELS].filter((m): m is string => Boolean(m)))]
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: SCHEMA },
    safetySettings: [
      // Someone describing abuse or despair must not be answered with silence.
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  })
  let lastProblem = 'No model answered.'
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response
      try {
        res = await timed(`${GEMINI}/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body })
      } catch (e) {
        lastProblem = e instanceof Error && e.name === 'AbortError' ? 'The letter took too long to write.' : 'Gemini could not be reached.'
        break
      }
      if (res.status === 404) { lastProblem = `Model ${model} is not available.`; break }
      if (res.status === 401 || res.status === 403) throw new Said('The Gemini key was refused. Check GEMINI_API_KEY.')
      if (res.status === 429 || res.status >= 500) {
        lastProblem = res.status === 429 ? 'Gemini is busy right now.' : `Gemini answered ${res.status}.`
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        continue
      }
      if (!res.ok) { lastProblem = `Gemini answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`; break }
      const data = await res.json()
      const cand = data?.candidates?.[0]
      const text = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
      if (!text) {
        // Blocked outright (promptFeedback) or an empty candidate: the fallback letter takes over.
        return { text: '', model }
      }
      return { text, model }
    }
  }
  throw new Said(lastProblem)
}

function parseJson(text: string): unknown {
  if (!text) return null
  try { return JSON.parse(text) } catch { /* try to dig it out of a fence */ }
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

interface Supa { url: string; anon: string; service: string }

/** The role claim of a JWT, without verifying it — verification is GoTrue's job; this only sorts a person from the anon key. */
function roleOf(token: string): string {
  try {
    const payload = token.split('.')[1] ?? ''
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='))
    return String((JSON.parse(json) as { role?: unknown }).role ?? '')
  } catch { return '' }
}

async function whoIs(sb: Supa, authorization: string | null): Promise<{ id: string }> {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim()
  if (!token || token === sb.anon || roleOf(token) === 'anon') throw new Said('Sign in to ask.', 401)
  // GoTrue identifies the person by the bearer token; the apikey only has to be one of the project's own,
  // and the service key always is.
  const res = await timed(`${sb.url}/auth/v1/user`, { headers: { apikey: sb.service, Authorization: `Bearer ${token}` } }, 10_000)
  if (!res.ok) throw new Said('Your sign-in has expired — sign out and back in.', 401)
  const user = await res.json()
  if (!user?.id) throw new Said('Your sign-in has expired — sign out and back in.', 401)
  return { id: String(user.id) }
}

function rest(sb: Supa, path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  return timed(`${sb.url}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: { apikey: sb.service, Authorization: `Bearer ${sb.service}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  }, 30_000)
}

async function rpc<T>(sb: Supa, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await rest(sb, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
  if (res.status === 404) throw new Said('The Word is not set up on this Hub yet (migration 011 has not been run).')
  if (!res.ok) throw new Said(`The Bible index answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
  return (await res.json()) as T
}

let canonCache: CanonBook[] | null = null
async function canonOf(sb: Supa): Promise<CanonBook[]> {
  if (canonCache) return canonCache
  const canon = await rpc<CanonBook[]>(sb, 'bible_canon', {})
  if (!Array.isArray(canon) || canon.length < 66) throw new Said('The Bible index is empty — run the BibleBot "Load and embed" workflow first.')
  canonCache = canon
  return canon
}

async function firstName(sb: Supa, userId: string): Promise<string> {
  try {
    const res = await rest(sb, `profiles?id=eq.${encodeURIComponent(userId)}&select=display_name`)
    const rows = (await res.json()) as { display_name?: string }[]
    return (rows?.[0]?.display_name ?? '').trim().split(/\s+/)[0] ?? ''
  } catch { return '' }
}

async function lettersToday(sb: Supa, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const res = await rest(sb, `bible_guidance?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(since)}&select=id`, { headers: { Prefer: 'count=exact', Range: '0-0' } })
  const range = res.headers.get('content-range') ?? ''
  const total = Number(range.split('/')[1])
  return Number.isFinite(total) ? total : 0
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    const sb: Supa = { url: env('SUPABASE_URL') ?? '', anon: env('SUPABASE_ANON_KEY') ?? '', service: env('SUPABASE_SERVICE_ROLE_KEY') ?? '' }
    if (!sb.url || !sb.anon || !sb.service) throw new Said('This function is missing its Supabase settings.')
    const key = env('GEMINI_API_KEY')
    if (!key) throw new Said('The Word is not switched on for this Hub yet — add the GEMINI_API_KEY secret.')

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = body.action === 'passage' ? 'passage' : 'guide'
    const translation: Translation = body.translation === 'KJV' ? 'KJV' : 'BSB'
    const me = await whoIs(sb, req.headers.get('authorization'))

    if (action === 'passage') {
      const book = Number(body.book), chapter = Number(body.chapter)
      const start = body.start == null ? null : Number(body.start)
      const end = body.end == null ? null : Number(body.end)
      if (!Number.isInteger(book) || !Number.isInteger(chapter)) throw new Said('Which passage?', 400)
      const passage = await rpc<unknown>(sb, 'bible_passage', { p_book: book, p_chapter: chapter, p_start: start, p_end: end, p_translation: translation })
      if (!passage) throw new Said('That passage is not in the Bible.', 404)
      return json({ passage })
    }

    const context = typeof body.context === 'string' ? body.context.replace(/\s+$/g, '').trim().slice(0, MAX_CONTEXT_CHARS) : ''
    if (context.length < 8) throw new Said('Write a little more about what is going on.', 400)

    const [canon, name, today] = await Promise.all([canonOf(sb), firstName(sb, me.id), lettersToday(sb, me.id)])
    if (today >= LETTERS_PER_DAY) throw new Said('That is a great many letters for one day. Sit with the ones you have, and come back tomorrow.', 429)

    const screened = screen(context)
    const q = await embed(context, key)
    const retrieved = await rpc<Retrieved>(sb, 'bible_retrieve', { query_embedding: JSON.stringify(q), k_verses: K_VERSES, k_topics: K_TOPICS, p_translation: translation })
    const cands = buildCandidates(retrieved, canon)
    if (cands.length === 0) throw new Said('The Bible index is empty — run the BibleBot "Load and embed" workflow first.')

    let letter: GuidanceBody
    let theme = ''
    let model = ''
    try {
      const prompt = userPrompt(name, context, cands, translation)
      let out = await generate(SYSTEM, prompt, key)
      model = out.model
      let parsed = parseJson(out.text)
      if (!parsed || !Array.isArray((parsed as { passages?: unknown }).passages)) {
        // One more go — a broken JSON answer is rare, and a second draft usually comes back whole.
        out = await generate(SYSTEM, prompt + '\n\nReturn only the JSON object, complete and valid.', key)
        model = out.model
        parsed = parseJson(out.text)
      }
      letter = parsed ? assemble(parsed, cands, canon, screened) : fallbackLetter(cands, canon, screened)
      theme = themeOf(parsed, context)
      if (!parsed) model = `${model} (no answer; passages only)`
    } catch (e) {
      if (!(e instanceof Said)) throw e
      // Gemini refused or fell over: the passages still go out, and the app says the rest is missing.
      letter = fallbackLetter(cands, canon, screened)
      theme = themeOf(null, context)
      model = `fallback: ${e.message}`
    }

    const row = { user_id: me.id, context, translation, theme, response: letter, model }
    const saved = await rest(sb, 'bible_guidance', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
    if (!saved.ok) throw new Said(`The letter was written but could not be saved (${saved.status}).`)
    const [guidance] = (await saved.json()) as unknown[]
    return json({ guidance })
  } catch (e) {
    // Everything the person can act on comes back as {error} with 200, the way the Hub's other
    // functions do it; only an expired sign-in is an HTTP error, so the app can say exactly that.
    if (e instanceof Said) return json({ error: e.message }, e.status === 401 ? 401 : 200)
    const msg = e instanceof Error ? e.message : 'Something went wrong.'
    console.error('guide failed:', msg)
    return json({ error: `The Word could not answer just now (${msg.slice(0, 140)}).` })
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handler)

export { handler }
