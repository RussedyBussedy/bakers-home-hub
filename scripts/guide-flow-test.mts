/**
 * The Word, end to end, with the outside world stubbed: GoTrue, PostgREST and Gemini are all
 * played by a fake fetch, so the handler's own choices can be checked — who may ask, what happens
 * when a model is missing or refuses, what gets saved, and what the person gets back.
 *   npm run guide-flow-test
 */
import { readFileSync } from 'node:fs'

const URL_ = 'https://example.supabase.co'
process.env.SUPABASE_URL = URL_
process.env.SUPABASE_ANON_KEY = 'anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
process.env.GEMINI_API_KEY = 'gemini-key'
;(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => process.env[k] }, serve: () => {} }

const canon = JSON.parse(readFileSync(new URL('./fixtures/bible-canon.json', import.meta.url), 'utf8'))

let failed = 0
function eq(got: unknown, want: unknown, label: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}

// --- the world ------------------------------------------------------------------
const retrieved = {
  verses: [
    { verse_id: 40006025, book_id: 40, chapter: 6, verse: 25, reference: 'Matthew 6:25', text: 'Therefore I tell you, do not worry about your life.', similarity: 0.71 },
    { verse_id: 40006026, book_id: 40, chapter: 6, verse: 26, reference: 'Matthew 6:26', text: 'Look at the birds of the air.', similarity: 0.69 },
    { verse_id: 50004006, book_id: 50, chapter: 4, verse: 6, reference: 'Philippians 4:6', text: 'Be anxious for nothing.', similarity: 0.7 },
    { verse_id: 19004008, book_id: 19, chapter: 4, verse: 8, reference: 'Psalms 4:8', text: 'I will both lie down and sleep in peace.', similarity: 0.64 },
  ],
  topics: [{ entry_id: 1, subject: 'CARE', path: 'CARE > REMEDY FOR', heading: 'REMEDY FOR', similarity: 0.62, verses: [
    { verse_id: 19037005, reference: 'Psalms 37:5', text: 'Commit your way to the LORD.', range_start: 19037005, range_end: 19037005 },
  ] }],
  cross_refs: [{ from_verse_id: 40006025, to_start: 20003024, to_end: 20003024, votes: 30, verses: [{ verse_id: 20003024, reference: 'Proverbs 3:24', text: 'When you lie down, you will not be afraid.' }] }],
}
const letter = {
  greeting: 'You wrote that money keeps you awake.',
  passages: [{ id: 'c1', why: 'Jesus speaks straight to worry.' }, { id: 'c2', why: 'Paul again.' }],
  understanding: 'Worry is prayer pointed the wrong way.',
  response: ['Write the numbers down.', 'Tell someone you trust.'],
  prayer: 'Lord, quiet my heart tonight.',
  closing: 'Grace and peace to you.',
  plan: [{ reference: 'Psalm 23', focus: 'Rest.' }, { reference: 'Matthew 6:25-34', focus: 'Worry.' }, { reference: 'Philippians 4:4-9', focus: 'Peace.' }],
  theme: 'Anxiety about money',
  safety: { concern: false, kind: 'none' },
}

const LID = 'aaaaaaaa-0000-0000-0000-000000000001'
const letterRow = {
  id: LID, context: 'I am anxious about money and cannot sleep', translation: 'BSB', theme: 'Anxiety about money', hidden: false,
  response: {
    passages: [{ reference: 'Psalm 4:8', book_id: 19, chapter: 4, start: 8, end: 8, verses: [{ verse: 8, text: 'I will both lie down and sleep in peace.' }], why: 'Sleep is a gift.', note: 'nearest to what they wrote' }],
    plan: [{ reference: 'Psalm 23', focus: 'Rest.' }],
  },
}
const studyAnswer = {
  answer: 'David wrote this psalm in the evening (Psalm 4:8), it seems, and Psalm 3 is its morning twin.',
  passages: [{ id: 'c1', why: 'Where he says it.' }, { id: 'c2', why: 'Jesus on the same worry.' }],
  readings: [{ reference: 'Psalm 3', focus: 'The morning before.' }, { reference: 'Psalm 151', focus: 'No such psalm.' }],
  followups: ['Who was Absalom?', 'Why does he mention the harvest?'],
  safety: { concern: false, kind: 'none' },
}

interface World {
  user?: { id: string } | null
  models: Record<string, number | { text: string } | 'blocked'>
  lettersToday: number
  saved: unknown[]
  calls: string[]
  profile?: string
  hasPin?: boolean
  /** The letter a study question is asked under; null when it does not exist. */
  letterRow?: Record<string, unknown> | null
  thread: unknown[]
  /** What the PIN function answers for a hidden letter's thread. */
  hiddenStudy?: Record<string, unknown>
  questionsToday: number
  /** What the model answers a study question with; the letter stub answers letters. */
  study: Record<string, unknown> | 'blocked' | null
  prompts: string[]
  studyTable: boolean
  hiddenAuth: string | null
}
let world: World
function reset(over: Partial<World> = {}) {
  world = { user: { id: 'user-1' }, models: { 'gemini-3.8-flash': { text: JSON.stringify(letter) } }, lettersToday: 0, saved: [], calls: [], profile: 'Russel Baker', letterRow, thread: [], questionsToday: 0, study: studyAnswer, prompts: [], studyTable: true, hiddenAuth: null, ...over }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  const headers = new Headers(init?.headers)
  const body = init?.body ? JSON.parse(String(init.body)) : null
  world.calls.push(`${init?.method ?? 'GET'} ${url.replace(URL_, '').replace('https://generativelanguage.googleapis.com/v1beta', 'gemini:').split('?')[0]}`)

  if (url.startsWith(`${URL_}/auth/v1/user`)) {
    const token = headers.get('authorization')
    if (token === 'Bearer good' && world.user) return json({ id: world.user.id })
    return json({ error: 'invalid' }, 401)
  }
  if (url.startsWith(`${URL_}/rest/v1/`)) {
    eq(headers.get('apikey'), 'service-key', 'PostgREST is spoken to with the service key')
    const path = url.slice(`${URL_}/rest/v1/`.length)
    if (path === 'rpc/bible_canon') return json(canon)
    if (path === 'rpc/bible_retrieve') { eq(typeof body.query_embedding, 'string', 'the embedding travels as text'); eq(body.p_translation, world.calls.some((c) => c.includes('KJV')) ? 'KJV' : body.p_translation, 'translation passed'); return json(retrieved) }
    if (path === 'rpc/bible_passage') return body.p_chapter === 151 ? json(null) : json({ book_id: body.p_book, book: 'Psalms', chapter: body.p_chapter, start: 1, end: 6, verses: [{ verse: 1, text: 'The LORD is my shepherd.' }] })
    if (path.startsWith('profiles?')) return json([{ display_name: world.profile }])
    if (path.startsWith('bible_prefs?')) return json(world.hasPin ? [{ user_id: 'user-1' }] : [])
    if (path.startsWith('bible_guidance?id=eq.')) return json(world.letterRow && path.includes(`id=eq.${world.letterRow.id}`) && path.includes('user_id=eq.user-1') ? [world.letterRow] : [])
    if (path.startsWith('bible_guidance?')) return json([], 206, { 'content-range': `0-0/${world.lettersToday}` })
    if (path === 'bible_guidance' && init?.method === 'POST') { const row = { id: 'row-1', created_at: '2026-09-17T10:00:00Z', plan_done: {}, ...body }; world.saved.push(row); return json([row], 201) }
    if (path === 'rpc/bible_hidden_study') { world.hiddenAuth = headers.get('authorization'); return json(world.hiddenStudy ?? { ok: false, error: 'pin_not_set' }) }
    if (!world.studyTable && (path.startsWith('bible_study') || path === 'bible_study')) return json({ message: 'relation "public.bible_study" does not exist' }, 404)
    if (path.startsWith('bible_study?guidance_id=eq.')) return json(world.thread)
    if (path.startsWith('bible_study?')) return json([], 206, { 'content-range': `0-0/${world.questionsToday}` })
    if (path === 'bible_study' && init?.method === 'POST') { const row = { id: 'q-1', created_at: '2026-09-18T10:00:00Z', ...body }; world.saved.push(row); return json([row], 201) }
    return json({ message: 'no such path' }, 404)
  }
  if (url.includes('generativelanguage')) {
    if (url.includes(':embedContent')) return json({ embedding: { values: Array.from({ length: 768 }, (_, i) => Math.sin(i)) } })
    const model = url.match(/models\/([^:]+):generateContent/)?.[1] ?? ''
    world.prompts.push(body?.contents?.[0]?.parts?.[0]?.text ?? '')
    const forStudy = Boolean(body?.generationConfig?.responseSchema?.properties?.answer)
    if (forStudy) {
      if (world.models[model] === undefined) return json({ error: { message: 'not found' } }, 404)
      if (world.study === null) return json({ error: { message: 'no' } }, 500)
      if (world.study === 'blocked') return json({ promptFeedback: { blockReason: 'SAFETY' } })
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(world.study) }] } }] })
    }
    const spec = world.models[model]
    if (spec === undefined) return json({ error: { message: 'not found' } }, 404)
    if (typeof spec === 'number') return json({ error: { message: 'no' } }, spec)
    if (spec === 'blocked') return json({ promptFeedback: { blockReason: 'SAFETY' } })
    return json({ candidates: [{ content: { parts: [{ text: spec.text }] } }] })
  }
  return json({ error: 'unexpected url ' + url }, 500)
}) as typeof fetch

const { handler } = await import('../supabase/functions/guide/index')
const ask = async (body: unknown, auth: string | null = 'Bearer good') => {
  const res = await handler(new Request('https://fn/guide', { method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  return { status: res.status, body: await res.json() as Record<string, any> }
}

// --- who may ask ------------------------------------------------------------------
reset()
eq((await ask({ context: 'I am anxious about money and cannot sleep' }, null)).status, 401, 'no sign-in: 401')
eq((await ask({ context: 'I am anxious about money and cannot sleep' }, 'Bearer anon-key')).body.error, 'Sign in to ask.', 'the anon key alone is not a person')
eq((await ask({ context: 'I am anxious about money and cannot sleep' }, 'Bearer stale')).status, 401, 'a dead token: 401')

// --- the letter ---------------------------------------------------------------------
reset()
let r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.status, 200, 'a letter comes back')
eq(r.body.error, undefined, 'without an error')
const g = r.body.guidance
eq(g.user_id, 'user-1', 'saved for the person who asked')
eq(g.translation, 'BSB', 'in the Berean by default')
eq(g.theme, 'Anxiety about money', 'with the theme')
eq(g.model, 'gemini-3.8-flash', 'and which model wrote it')
eq(g.response.passages.map((p: { reference: string }) => p.reference), ['Matthew 6:25–26', 'Philippians 4:6'], 'the passages the model chose, by id')
eq(g.response.passages[0].verses.map((v: { text: string }) => v.text), ['Therefore I tell you, do not worry about your life.', 'Look at the birds of the air.'], 'with our verse text')
eq(g.response.plan.map((p: { reference: string }) => p.reference), ['Psalm 23', 'Matthew 6:25–34', 'Philippians 4:4–9'], 'and the reading plan checked against the canon')
eq(world.saved.length, 1, 'one row saved')
eq(world.calls.filter((c) => c.startsWith('POST gemini:')).length, 2, 'one embedding call and one letter')
eq(world.calls.some((c) => c.includes('/auth/v1/user')), true, 'the sign-in was checked')

reset()
r = await ask({ context: 'I am anxious about money and cannot sleep', translation: 'KJV' })
eq(r.body.guidance.translation, 'KJV', 'the King James when asked')

reset()
r = await ask({ context: 'hi' })
eq(r.body.error, 'Write a little more about what is going on.', 'too little to go on')
eq(world.saved.length, 0, 'nothing saved for it')

reset({ lettersToday: 40 })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(typeof r.body.error, 'string', 'a day\'s worth of letters is enough')
eq(world.calls.some((c) => c.includes('gemini:')), false, 'and Gemini is not troubled for it')

// --- when models go missing or refuse ----------------------------------------------
reset({ models: { 'gemini-3.5-flash': { text: JSON.stringify(letter) } } })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.guidance.model, 'gemini-3.5-flash', 'a missing model is skipped for the next one')

process.env.GEMINI_MODEL = 'my-pinned-model'
reset({ models: { 'my-pinned-model': { text: JSON.stringify(letter) }, 'gemini-3.8-flash': { text: '{}' } } })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.guidance.model, 'my-pinned-model', 'GEMINI_MODEL goes first')
delete process.env.GEMINI_MODEL

reset({ models: { 'gemini-3.8-flash': 'blocked' } })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.guidance.response.passages.length, 4, 'a refused answer still carries the passages')
eq(r.body.guidance.response.passages.every((p: { why: string }) => p.why === ''), true, 'with nothing invented')
eq(r.body.guidance.model.includes('passages only'), true, 'and says so in the record')

reset({ models: {} })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.guidance.model.startsWith('fallback:'), true, 'no model at all: the fallback letter, marked as such')
eq(r.body.guidance.response.greeting.length > 20, true, 'which still says something kind')

reset({ models: { 'gemini-3.8-flash': { text: 'not json at all' } } })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(world.calls.filter((c) => c.includes(':generateContent')).length, 2, 'broken JSON gets one more try')
eq(r.body.guidance.model.includes('passages only'), true, 'then the passages go out on their own')

reset({ models: { 'gemini-3.8-flash': { text: JSON.stringify({ ...letter, safety: { concern: false, kind: 'none' } }) } } })
r = await ask({ context: "I don't want to be here anymore, the debt is too much" })
eq(r.body.guidance.response.safety, { concern: true, kind: 'self-harm' }, 'the screen raises the concern the model missed')

// --- born hidden -----------------------------------------------------------------------
reset({ hasPin: true })
r = await ask({ context: 'I am anxious about money and cannot sleep', hidden: true })
eq(r.body.guidance.hidden, true, 'a letter can be born hidden when there is a PIN to reach it with')
reset({ hasPin: false })
r = await ask({ context: 'I am anxious about money and cannot sleep', hidden: true })
eq(r.body.error, 'Set a PIN for hidden letters first, then ask again.', 'but not without one')
eq(world.saved.length, 0, 'and nothing is saved in that case')
reset()
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.guidance.hidden, false, 'an ordinary letter is not hidden')

// --- what the person is told never names the service -------------------------------------
reset({ models: {} })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(/gemini|model|ai\b/i.test(JSON.stringify(r.body.guidance.response)), false, 'a failed letter says nothing about a model')
reset({ models: { 'gemini-3.8-flash': 401 } })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.guidance.model.startsWith('fallback:'), true, 'a refused key still gives the passages')
eq(/gemini/i.test(r.body.guidance.model.replace(/^fallback: /, '')), false, 'and the reason recorded does not name the service either')

// --- starter questions come with the letter ---------------------------------------------
reset({ models: { 'gemini-3.8-flash': { text: JSON.stringify({ ...letter, questions: ['Who wrote Psalm 4?', 'What does "anxious" mean in Philippians 4:6?', 'Why birds?', 'A fourth'] }) } } })
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.guidance.response.questions, ['Who wrote Psalm 4?', 'What does "anxious" mean in Philippians 4:6?', 'Why birds?'], 'three starter questions travel with the letter')

// --- study: a question under a letter -----------------------------------------------------
reset()
r = await ask({ action: 'study', guidance_id: LID, question: 'Who wrote this psalm, and when?' })
eq(r.body.error, undefined, 'a question under a visible letter is answered')
const s = r.body.study
eq([s.guidance_id, s.user_id, s.question], [LID, 'user-1', 'Who wrote this psalm, and when?'], 'and saved under the letter, for the person')
eq(s.model, 'gemini-3.8-flash', 'by the same model')
eq(s.answer.text, studyAnswer.answer, 'the answer text')
eq(s.answer.passages.map((p: { reference: string }) => p.reference), ['Psalm 4:8', 'Matthew 6:25–26'], 'the letter\'s own passage leads the candidates; the rest come from the question')
eq(s.answer.passages[0].verses[0].text, 'I will both lie down and sleep in peace.', 'with our verse text')
eq(s.answer.readings.map((p: { reference: string }) => p.reference), ['Psalm 3'], 'readings checked against the canon')
eq(s.answer.mentions.map((m: { text: string }) => m.text), ['Psalm 4:8', 'Psalm 3'], 'references in the text, ready to open')
eq(s.answer.followups, ['Who was Absalom?', 'Why does he mention the harvest?'], 'and a couple of follow-ups')
eq(world.calls.includes('POST /rest/v1/rpc/bible_hidden_study'), false, 'a visible letter\'s thread needs no PIN')
eq(world.calls.some((c) => c.startsWith('GET /rest/v1/bible_study')), true, 'the thread so far is read')
eq(world.prompts[0]?.includes('Theme: Anxiety about money') && world.prompts[0]?.includes('[c1] Psalm 4:8'), true, 'the model sees the letter and the candidates')
eq(world.saved.length, 1, 'one row saved')

reset({ thread: [{ question: 'Who was David?', answer: { text: 'A shepherd who became king.' } }] })
r = await ask({ action: 'study', guidance_id: LID, question: 'And his father?' })
eq(world.prompts[0]?.includes('They asked: Who was David?') && world.prompts[0]?.includes('You answered: A shepherd who became king.'), true, 'the thread so far goes to the model')
eq(r.body.study.answer.text.length > 0, true, 'and the follow-up is answered')

reset()
eq((await ask({ action: 'study', guidance_id: LID, question: 'hi' })).body.error, 'Ask a little more.', 'too short a question')
eq((await ask({ action: 'study', guidance_id: 'nope', question: 'Who was David?' })).body.error, 'Which letter is this about?', 'a bad letter id')
reset({ letterRow: null })
eq((await ask({ action: 'study', guidance_id: LID, question: 'Who was David?' })).body.error, 'That letter isn’t there any more.', 'a letter that is not theirs, or gone')
reset({ questionsToday: 120 })
r = await ask({ action: 'study', guidance_id: LID, question: 'Who was David?' })
eq(typeof r.body.error, 'string', 'a day\'s worth of questions is enough')
eq(world.calls.some((c) => c.includes('gemini:')), false, 'and the model is not troubled for it')
reset({ studyTable: false })
eq((await ask({ action: 'study', guidance_id: LID, question: 'Who was David?' })).body.error, 'The study section is not set up on this Hub yet (migration 013 has not been run).', 'before migration 013, it says so')

// hidden letters: the PIN is checked as the person, through the database's own door
reset({ letterRow: { ...letterRow, hidden: true } })
r = await ask({ action: 'study', guidance_id: LID, question: 'Who was David?' })
eq([r.body.error, r.body.pin], ['That letter is locked — unlock it first.', { ok: false, error: 'locked' }], 'a hidden letter without a PIN is not even tried')
eq(world.calls.includes('POST /rest/v1/rpc/bible_hidden_study'), false, 'so no guess is spent')
reset({ letterRow: { ...letterRow, hidden: true }, hiddenStudy: { ok: false, error: 'wrong_pin', attempts_left: 3 } })
r = await ask({ action: 'study', guidance_id: LID, question: 'Who was David?', pin: '0000' })
eq(r.body.pin, { ok: false, error: 'wrong_pin', attempts_left: 3 }, 'a wrong PIN comes back in the database\'s words')
eq(world.hiddenAuth, 'Bearer good', 'asked with the person\'s own token, so the guess counts against them')
eq(world.calls.some((c) => c.includes('gemini:')), false, 'and nothing is written')
reset({ letterRow: { ...letterRow, hidden: true }, hiddenStudy: { ok: true, study: [{ question: 'Who was David?', answer: { text: 'A shepherd.' } }] } })
r = await ask({ action: 'study', guidance_id: LID, question: 'And his father?', pin: '1234' })
eq(r.body.error, undefined, 'the right PIN opens the hidden thread')
eq(world.prompts[0]?.includes('They asked: Who was David?'), true, 'and its history goes to the model')
eq(world.saved.length, 1, 'and the answer is saved')

// when the model cannot answer a question
reset({ study: 'blocked' })
r = await ask({ action: 'study', guidance_id: LID, question: 'Who was David?' })
eq([r.body.study.answer.passages.length, r.body.study.model.includes('passages only')], [3, true], 'a refused answer still carries the nearest passages')
reset({ study: null })
r = await ask({ action: 'study', guidance_id: LID, question: 'Who was David?' })
eq(r.body.study.model.startsWith('fallback:'), true, 'a model that falls over: the fallback answer, marked as such')
eq(/gemini|model|\bai\b/i.test(JSON.stringify(r.body.study.answer)), false, 'which names no service')
reset({ study: { ...studyAnswer, safety: { concern: false, kind: 'none' } } })
r = await ask({ action: 'study', guidance_id: LID, question: "Does God mind that I don't want to be here anymore?" })
eq(r.body.study.answer.safety, { concern: true, kind: 'self-harm' }, 'the screen hears a question the same way it hears a letter')

// --- reading a passage -----------------------------------------------------------------
reset()
r = await ask({ action: 'passage', book: 19, chapter: 23 })
eq(r.body.passage.verses[0].text, 'The LORD is my shepherd.', 'a chapter to read')
r = await ask({ action: 'passage', book: 19, chapter: 151 })
eq(r.body.error, 'That passage is not in the Bible.', 'a chapter that is not there')
r = await ask({ action: 'passage', book: 'x' })
eq(r.body.error, 'Which passage?', 'or not asked for properly')

// --- missing settings --------------------------------------------------------------------
delete process.env.GEMINI_API_KEY
reset()
r = await ask({ context: 'I am anxious about money and cannot sleep' })
eq(r.body.error, 'The Word is not switched on for this Hub yet.', 'without a key, it says so plainly (the secret\'s name goes to the logs, not the screen)')
process.env.GEMINI_API_KEY = 'gemini-key'

console.log(failed === 0 ? '\nAll good.' : `\n${failed} failed.`)
if (failed > 0) process.exit(1)
