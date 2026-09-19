/**
 * The Word's guard rails, without a database or a model in the room.
 *   npm run guide-test
 *
 * The model writes the letter; this code decides what of it may be shown. Every quoted passage has
 * to be one we handed it, every reading in the plan has to exist in the canon, and a few words in
 * what someone wrote must always bring the helplines up whatever the model thought.
 */
import { readFileSync } from 'node:fs'
import { assemble, assembleStudy, buildCandidates, clean, fallbackLetter, fallbackStudy, findMentions, formatRef, parseReference, prettyPath, questionsOf, readingSlice, screen, studyPrompt, themeOf, type CanonBook, type ReadingText, type Retrieved } from '../supabase/functions/guide/index'

const canon = JSON.parse(readFileSync(new URL('./fixtures/bible-canon.json', import.meta.url), 'utf8')) as CanonBook[]

let failed = 0
function eq(got: unknown, want: unknown, label: string) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}
const ref = (s: string) => parseReference(s, canon)?.reference ?? null

// --- reading references the way people write them ----------------------------
eq(ref('Psalm 23'), 'Psalm 23', 'a chapter')
eq(ref('Psalms 23'), 'Psalm 23', 'Psalms in the plural becomes Psalm for one chapter')
eq(ref('Ps. 46'), 'Psalm 46', 'an abbreviation with a full stop')
eq(ref('Philippians 4:4-9'), 'Philippians 4:4–9', 'a verse range, en-dashed on the way out')
eq(ref('Philippians 4:4–9'), 'Philippians 4:4–9', 'an en dash on the way in')
eq(ref('1 John 4:18'), '1 John 4:18', 'a numbered book')
eq(ref('I John 4:18'), '1 John 4:18', 'with a roman numeral')
eq(ref('First John 4:18'), '1 John 4:18', 'or spelled out')
eq(ref('1John 4:18'), '1 John 4:18', 'or squashed together')
eq(ref('Matt 6:25-34'), 'Matthew 6:25–34', 'a short name')
eq(ref('Song of Solomon 2:4'), 'Song of Solomon 2:4', 'a long name')
eq(ref('Song of Songs 2:4'), 'Song of Solomon 2:4', 'by its other name')
eq(ref('The Gospel of John 3:16'), 'John 3:16', 'with a preamble')
eq(ref('Romans 8 v 28'), 'Romans 8:28', 'verse written as v')
eq(ref('Genesis 1-2'), 'Genesis 1', 'a chapter range keeps the first chapter')
eq(ref('John 3:17-16'), 'John 3:16–17', 'a backwards range is put right')
eq(ref('Psalm 117:1-5'), 'Psalm 117:1–2', 'verses past the end of a chapter are clamped')
eq(ref('Psalm 151'), null, 'a chapter that does not exist')
eq(ref('Jude 2'), null, 'a chapter in a one-chapter book that does not exist')
eq(ref('Jude 1:24-25'), 'Jude 1:24–25', 'but its one chapter does')
eq(ref('Genesis 51'), null, 'one past the last chapter')
eq(ref('Hezekiah 3:16'), null, 'a book that does not exist')
eq(ref('John 3:0'), null, 'verse zero')
eq(ref(''), null, 'nothing')
eq(ref('read Psalm 23 tonight'), null, 'a sentence is not a reference')
eq(formatRef({ id: 19, name: 'Psalms' }, 119, 105, 105), 'Psalm 119:105', 'a single verse shows once')

// --- candidates: what the model may quote from -------------------------------
const v = (verse_id: number, text: string, similarity: number) => ({ verse_id, book_id: Math.floor(verse_id / 1e6), chapter: Math.floor(verse_id / 1000) % 1000, verse: verse_id % 1000, reference: '', text, similarity })
const retrieved: Retrieved = {
  verses: [
    v(40006025, 'Therefore I tell you, do not worry about your life', 0.71),
    v(40006027, 'Who of you by worrying can add a single hour', 0.66),
    v(40006026, 'Look at the birds of the air', 0.69),
    v(19004008, 'I will both lie down and sleep in peace', 0.64),
    v(50004006, 'Be anxious for nothing', 0.7),
    v(40017021, '', 0.6), // the BSB has no text here — must never be offered
  ],
  topics: [
    { entry_id: 1, subject: 'CARE', path: 'CARE > REMEDY FOR', heading: 'REMEDY FOR', similarity: 0.62, verses: [
      { verse_id: 19037005, reference: 'Psalms 37:5', text: 'Commit your way to the LORD', range_start: 19037005, range_end: 19037005 },
      { verse_id: 19055022, reference: 'Psalms 55:22', text: 'Cast your burden upon the LORD', range_start: 19055022, range_end: 19055022 },
      { verse_id: 40006025, reference: 'Matthew 6:25', text: 'Therefore I tell you, do not worry about your life', range_start: 40006025, range_end: 40006034 },
      { verse_id: 40006026, reference: 'Matthew 6:26', text: 'Look at the birds of the air', range_start: 40006025, range_end: 40006034 },
      { verse_id: 40006027, reference: 'Matthew 6:27', text: 'Who of you by worrying', range_start: 40006025, range_end: 40006034 },
      { verse_id: 40006028, reference: 'Matthew 6:28', text: 'And why do you worry about clothes', range_start: 40006025, range_end: 40006034 },
      { verse_id: 40006029, reference: 'Matthew 6:29', text: 'Yet I tell you that not even Solomon', range_start: 40006025, range_end: 40006034 },
    ] },
  ],
  cross_refs: [
    { from_verse_id: 40006025, to_start: 20003024, to_end: 20003024, votes: 30, verses: [{ verse_id: 20003024, reference: 'Proverbs 3:24', text: 'When you lie down, you will not be afraid' }] },
    { from_verse_id: 40006025, to_start: 19004008, to_end: 19004008, votes: 12, verses: [{ verse_id: 19004008, reference: 'Psalms 4:8', text: 'I will both lie down and sleep in peace' }] },
  ],
}
const cands = buildCandidates(retrieved, canon)
const idOf = (reference: string) => cands.find((c) => c.reference === reference)!.id
eq(cands.map((c) => c.reference), ['Matthew 6:25–28', 'Philippians 4:6', 'Psalm 4:8', 'Psalm 37:5', 'Psalm 55:22', 'Proverbs 3:24'],
  'neighbours join up, the topic\'s longer run wins over the nearest-verse run, nothing is listed twice, and the best fit comes first')
eq(cands.map((c) => c.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], 'numbered in order')
eq(cands[0]!.verses.map((x) => x.verse), [25, 26, 27, 28], 'a passage never runs past four verses')
eq(cands[0]!.score, 0.71, 'and carries the best score of what it absorbed (so it outranks Philippians at 0.70)')
eq(cands.some((c) => c.reference.startsWith('Matthew 17')), false, 'an empty verse is never offered')
eq(cands[3]!.note, "Nave's Topical Bible: Care › Remedy for", 'the topic path reads like a footnote')
eq(prettyPath('SLEEP > From God', 'From God'), 'Sleep › From God', 'a mixed-case heading is left alone and not repeated')
eq(prettyPath('LOVE > OF GOD', 'Manifested in Christ'), 'Love › Of God › Manifested in Christ', 'God keeps a capital')

// --- the letter: only what checks out gets through ----------------------------
const calm = screen('I am anxious about money and cannot sleep')
const letter = assemble({
  greeting: '**Money** worries keep you awake.',
  passages: [{ id: idOf('Matthew 6:25–28').toUpperCase(), why: 'Jesus speaks to this.' }, { id: 'c9', why: 'made up' }, { id: idOf('Matthew 6:25–28'), why: 'again' }, { id: idOf('Psalm 37:5'), why: 'Commit it.' }],
  understanding: 'Para one.\n\n\n\nPara two.',
  response: ['1. Write the numbers down.', '- Tell Kay.', '', 42],
  prayer: 'Lord, quiet my heart.',
  closing: 'Grace and peace.',
  plan: [
    { reference: 'Psalm 23', focus: 'Rest.', question: 'Who is the shepherd, and who are the sheep?' }, { reference: 'Psalm 151', focus: 'Nope.' }, { reference: 'Matthew 6:25-34', focus: 'Worry.' },
    { reference: 'Psalm 23', focus: 'Twice.' }, { reference: 'Philippians 4:4-9', focus: 'Peace.', question: 42 },
  ],
  theme: 'anxiety about money.',
  safety: { concern: false, kind: 'none' },
}, cands, canon, calm)
eq(letter.passages.map((p) => p.reference), ['Matthew 6:25–28', 'Psalm 37:5'], 'ids are matched loosely, unknown ones dropped, repeats kept once')
eq(letter.passages[0]!.verses[0]!.text, 'Therefore I tell you, do not worry about your life', 'the verse text is ours, not the model\'s')
eq(letter.passages[0]!.why, 'Jesus speaks to this.', 'with the model\'s reason attached')
eq(letter.greeting, 'Money worries keep you awake.', 'markdown is stripped')
eq(letter.understanding, 'Para one.\n\nPara two.', 'paragraph breaks survive, extra blank lines do not')
eq(letter.response, ['Write the numbers down.', 'Tell Kay.'], 'numbering and bullets are removed, rubbish dropped')
eq(letter.plan.map((p) => p.reference), ['Psalm 23', 'Matthew 6:25–34', 'Philippians 4:4–9'], 'the plan keeps only real, distinct readings')
eq(letter.plan[1], { book_id: 40, book: 'Matthew', chapter: 6, start: 25, end: 34, reference: 'Matthew 6:25–34', focus: 'Worry.', question: '' }, 'each reading knows where it is')
eq(letter.plan.map((p) => p.question), ['Who is the shepherd, and who are the sheep?', '', ''], 'a reading carries its starter question when the model gave one')
eq(letter.safety, { concern: false, kind: 'none' }, 'no concern raised')
eq(letter.questions, [], 'a letter written without starter questions has none')
eq(questionsOf(['Who was **David**?', ' who was david? ', 'What does "meek" mean here?', 42, '', 'What happened next?'], 3), ['Who was David?', 'What does "meek" mean here?', 'What happened next?'], 'starter questions: cleaned, deduped, three at most')
eq(themeOf({ theme: 'anxiety about money.' }, ''), 'Anxiety about money', 'the theme is tidied')
eq(themeOf({}, 'I am anxious about money and cannot sleep'), 'I am anxious about money', 'or taken from the first words')

const thin = assemble({ passages: [{ id: 'zzz', why: '' }], plan: [] }, cands, canon, calm)
eq(thin.passages.map((p) => p.reference), ['Matthew 6:25–28', 'Philippians 4:6', 'Psalm 4:8'], 'no usable citations: the best candidates stand in')
eq(thin.plan.map((p) => p.reference), ['Matthew 6', 'Philippians 4', 'Psalm 4'], 'no usable plan: the chapters around them')
eq(thin.plan[0]!.focus, 'Read the whole chapter around Matthew 6:25–28.', 'with a plain focus line')

// --- care: the words themselves decide, whatever the model said -----------------
eq(screen("I don't want to be here anymore"), { concern: true, kind: 'self-harm' }, 'despair is heard')
eq(screen('I keep thinking about ending it all'), { concern: true, kind: 'self-harm' }, 'in different words')
eq(screen('my husband hits me when he drinks'), { concern: true, kind: 'abuse' }, 'harm at home is heard')
eq(screen('I want to hurt him for what he did'), { concern: true, kind: 'danger' }, 'and anger that could turn into harm')
eq(screen('I am afraid of the future and want to end my contract'), { concern: false, kind: 'none' }, 'but ordinary fear and ordinary endings are not alarms')
const worried = assemble({ passages: [{ id: 'c1', why: 'x' }], safety: { concern: false, kind: 'none' } }, cands, canon, screen("I don't want to be here anymore"))
eq(worried.safety, { concern: true, kind: 'self-harm' }, 'the model cannot talk the screen out of a concern')
const flagged = assemble({ passages: [{ id: 'c1', why: 'x' }], safety: { concern: true, kind: 'abuse' } }, cands, canon, calm)
eq(flagged.safety, { concern: true, kind: 'abuse' }, 'and the model can raise one the screen missed')
const vague = assemble({ passages: [{ id: 'c1', why: 'x' }], safety: { concern: true, kind: 'none' } }, cands, canon, calm)
eq(vague.safety, { concern: true, kind: 'other' }, 'a concern with no kind is still a concern')

// --- when the model says nothing at all --------------------------------------
const fb = fallbackLetter(cands, canon, calm)
eq(fb.passages.length, 4, 'the fallback letter still carries the passages')
eq(fb.passages.every((p) => p.why === ''), true, 'with no invented commentary')
eq(fb.plan.length > 0, true, 'and something to read')
eq(clean('  **Bold** and `code` #tag  \n\n\n\nnext '), 'Bold and code tag\n\nnext', 'clean() leaves plain text')

// --- study: a question under the letter ----------------------------------------
const mentions = findMentions('Boaz first appears in Ruth 2:1, and the whole of Ruth 2 is worth reading; compare 1 John 4:18 and Psalm 23. In 2 days, chapter 3 and John 3:0 say nothing, nor does Hezekiah 3:16. Ruth 2:1 again.', canon)
eq(mentions.map((m) => m.text), ['Ruth 2:1', 'Ruth 2', '1 John 4:18', 'Psalm 23'], 'references mentioned in passing are found once each; false alarms are left alone')
eq(mentions[2], { book_id: 62, book: '1 John', chapter: 4, start: 18, end: 18, reference: '1 John 4:18', text: '1 John 4:18' }, 'each one knows where it is')
eq(findMentions('Philippians 4:6-7 and Matt. 6:25–34.', canon).map((m) => m.reference), ['Philippians 4:6–7', 'Matthew 6:25–34'], 'ranges and abbreviations too')

const own = [{ book_id: 8, chapter: 2, start: 1, end: 3, reference: 'Ruth 2:1–3', verses: [{ verse: 1, text: 'Now Naomi had a relative' }, { verse: 2, text: 'And Ruth the Moabitess said' }, { verse: 3, text: 'So she went out' }], note: 'quoted in the letter', score: 1 }]
const scands = buildCandidates(retrieved, canon, own)
eq(scands[0]!.reference, 'Ruth 2:1–3', 'the letter\'s own passages lead the candidates when a question is asked under it')
eq(scands[0]!.id, 'c1', 'and are numbered with the rest')
eq(scands.length, cands.length + 1, 'alongside what the question itself brought up')

const study = assembleStudy({
  answer: 'Boaz was a landowner of Bethlehem (Ruth 2:1).\n\n\n\nHe becomes the *kinsman-redeemer*.',
  passages: [{ id: 'C1', why: 'Where he first appears.' }, { id: 'c99', why: 'nope' }, { id: 'c1', why: 'again' }],
  readings: [{ reference: 'Ruth 2', focus: 'The whole day in the field.' }, { reference: 'Ruth 9', focus: 'no such chapter' }, { reference: 'Ruth 2', focus: 'twice' }],
  followups: ['What is a kinsman-redeemer?', 'Why did Naomi send Ruth to the threshing floor?', 'Third', 'Fourth'],
  safety: { concern: false, kind: 'none' },
}, scands, canon, screen('who was Boaz?'))
eq(study.text, 'Boaz was a landowner of Bethlehem (Ruth 2:1).\n\nHe becomes the kinsman-redeemer.', 'the answer is plain text with its paragraphs')
eq(study.passages.map((p) => p.reference), ['Ruth 2:1–3'], 'quoted passages come only from the candidates, once each')
eq(study.passages[0]!.verses[1]!.text, 'And Ruth the Moabitess said', 'with our verse text')
eq(study.readings.map((r) => r.reference), ['Ruth 2'], 'readings that do not exist are dropped, repeats kept once')
eq(study.mentions.map((m) => m.text), ['Ruth 2:1'], 'the reference in the text can be opened')
eq(study.followups.length, 3, 'three follow-ups at most')
eq(study.safety, { concern: false, kind: 'none' }, 'no concern')
eq(assembleStudy({ answer: 'x', passages: [], readings: [], followups: [], safety: { concern: false, kind: 'none' } }, scands, canon, screen("I don't want to be here anymore")).safety, { concern: true, kind: 'self-harm' }, 'the screen still wins on a question')
const sfb = fallbackStudy(scands, canon, screen('who was Boaz?'))
eq([sfb.passages.length, sfb.passages.every((p) => p.why === ''), sfb.followups], [3, true, []], 'the fallback answer carries the nearest passages and nothing made up')
const sp = studyPrompt('Russel', { theme: 'Grief for a father', context: 'My dad died', passages: [{ reference: 'Psalm 23', why: 'Comfort.' }], plan: [{ reference: 'Psalm 23', focus: 'Rest.' }] }, [{ question: 'Who was David?', answer: 'A shepherd.' }], 'Why did he write it?', scands, 'BSB')
eq([sp.includes('Theme: Grief for a father'), sp.includes('They asked: Who was David?'), sp.includes('Why did he write it?'), sp.includes('[c1] Ruth 2:1–3'), sp.includes('THE READING')], [true, true, true, true, false], 'the model sees the letter, the thread and the candidates')

// --- study under one reading of the plan ------------------------------------------
const psalm: ReadingText = { index: 0, reference: 'Psalm 23', focus: 'Rest.', book_id: 19, book: 'Psalms', chapter: 23, start: 1, end: 6, verses: [1, 2, 3, 4, 5, 6].map((n) => ({ verse: n, text: `Verse ${n} of the psalm.` })) }
const rp = studyPrompt('Russel', { theme: 'Grief', context: 'My dad died', passages: [], plan: [{ reference: 'Psalm 23', focus: 'Rest.' }] }, [], 'What is the valley of the shadow?', scands, 'BSB', psalm)
eq([rp.includes('THE READING they are asking about — Day 1 of the plan, Psalm 23 (Berean Standard Bible)'), rp.includes('4 Verse 4 of the psalm.'), rp.includes('Quote it with the id "r"')], [true, true, true], 'under a reading, the model sees the reading itself')
const longPsalm: ReadingText = { ...psalm, verses: Array.from({ length: 120 }, (_, i) => ({ verse: i + 1, text: `Line ${i + 1}.` })) }
const lp = studyPrompt('Russel', { theme: '', context: '', passages: [], plan: [] }, [], 'Q?', scands, 'BSB', longPsalm)
eq([lp.includes('80 Line 80.'), lp.includes('81 Line 81.'), lp.includes('(verses 81–120 not shown)')], [true, false, true], 'a very long reading is cut at 80 verses, and says so')
eq(readingSlice(psalm, '4-5', canon), { reference: 'Psalm 23:4–5', book_id: 19, chapter: 23, start: 4, end: 5, verses: [{ verse: 4, text: 'Verse 4 of the psalm.' }, { verse: 5, text: 'Verse 5 of the psalm.' }], why: '', note: 'from the reading' }, 'a range of the reading becomes a passage with our text')
eq(readingSlice(psalm, '6–4', canon)?.reference, 'Psalm 23:4–6', 'a backwards range is put right')
eq(readingSlice(psalm, '1-20', canon)?.verses.length, 6, 'never more than a handful of verses, never past the end')
eq(readingSlice(psalm, '9', canon), null, 'a verse the reading does not have is nothing')
eq(readingSlice(psalm, '', canon), null, 'no range, nothing')
const rs = assembleStudy({
  answer: 'The valley is in Psalm 23:4.',
  passages: [{ id: 'r', why: 'The verse itself.', verses: '4' }, { id: 'R', why: 'again', verses: '4' }, { id: 'c1', why: 'Ruth.' }, { id: 'r', why: 'no range' }],
  readings: [], followups: [], safety: { concern: false, kind: 'none' },
}, scands, canon, calm, psalm)
eq(rs.passages.map((p) => [p.reference, p.note, p.why]), [['Psalm 23:4', 'from the reading', 'The verse itself.'], ['Ruth 2:1–3', 'quoted in the letter', 'Ruth.']], 'the reading is quotable by range as "r", once per range, alongside the candidates')
eq(assembleStudy({ answer: 'x', passages: [{ id: 'r', why: 'y', verses: '4' }], readings: [], followups: [], safety: { concern: false, kind: 'none' } }, scands, canon, calm).passages, [], 'with no reading given, "r" is not a source')

console.log(failed === 0 ? '\nAll good.' : `\n${failed} failed.`)
if (failed > 0) process.exit(1)
