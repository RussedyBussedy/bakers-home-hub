import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ChevronDown, ExternalLink, Feather, PenLine, Phone, Trash2 } from 'lucide-react'
import { TRANSLATIONS, type Guidance, type GuidancePassage, type PlanReading, type SafetyKind, type Translation } from '../../data/types'
import { useActions, useGuidance } from '../../data/hooks'
import { useAuth, useDb } from '../../data/session'
import { useCalm } from '../../store/ui'
import { cn, fmtDate } from '../../lib/utils'
import { EmptyState, Reveal } from '../ui/Bits'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Chip, Segmented, Textarea } from '../ui/Field'
import { useConfirm } from '../ui/Sheet'

const TRANSLATION_KEY = 'hub-word-translation'
const MIN_WORDS = 8
const MAX_CHARS = 2000

/** Where people usually start. Each one drops an opening line into the box to be finished in their own words. */
const STARTERS: { label: string; line: string }[] = [
  { label: 'Anxious about money', line: 'I’m anxious about money. ' },
  { label: 'Grieving', line: 'Someone I love has died and ' },
  { label: 'Can’t forgive', line: 'I can’t forgive someone for what they did. ' },
  { label: 'Marriage under strain', line: 'Things between my spouse and me are strained. ' },
  { label: 'Far from God', line: 'I feel far from God lately. ' },
  { label: 'Worn out', line: 'I am worn out and running on empty. ' },
  { label: 'Afraid of what’s coming', line: 'I’m afraid of what is coming and ' },
  { label: 'Made a mess of things', line: 'I’ve made a mess of things and ' },
]

/** What a pause feels like while the letter is being written — said plainly, in order. */
const STAGES: { at: number; text: string }[] = [
  { at: 0, text: 'Reading what you wrote…' },
  { at: 2500, text: 'Searching the Scriptures…' },
  { at: 6000, text: 'Writing to you…' },
  { at: 16000, text: 'Nearly there — a good letter takes a moment…' },
]

/**
 * The Word: write down what is going on and get a pastor's letter back, built only on Scripture
 * from the Hub's own Bible. Letters are kept per person and shown to nobody else in the house.
 */
export function WordPanel() {
  const { data: letters, isPending } = useGuidance()
  const { askTheWord } = useActions()
  const { me, partner } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => letters ?? [], [letters])
  // Coming back opens the latest letter — the reading plan is what people return for.
  const current = useMemo(() => list.find((g) => g.id === selected) ?? list[0] ?? null, [list, selected])
  // The composer shows when there is nothing to read yet, or when asked for; otherwise the letter does.
  const composing = writing || (!current && !busy)

  const ask = async (context: string, translation: Translation) => {
    setBusy(true)
    try {
      const g = await askTheWord(context, translation)
      setSelected(g.id)
      setWriting(false)
    } catch { /* toasted by useActions */ } finally { setBusy(false) }
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        {busy ? (
          <Waiting />
        ) : composing ? (
          <Composer onAsk={ask} onCancel={current ? () => setWriting(false) : undefined} />
        ) : current ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-ink-2">{current.id === list[0]?.id ? 'Your latest letter' : `A letter from ${fmtDate(current.created_at, 'd MMMM')}`}</p>
              <Button variant="secondary" size="sm" leading={<PenLine className="size-4" />} onClick={() => setWriting(true)}>Write again</Button>
            </div>
            <Letter key={current.id} letter={current} firstName={firstNameOf(me?.display_name)} partnerName={partner?.display_name} onDeleted={() => setSelected(null)} />
          </>
        ) : null}
      </div>

      <aside className="card h-fit overflow-hidden lg:sticky lg:top-6">
        <p className="border-b border-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Your letters</p>
        {isPending ? (
          <div className="space-y-2 p-4"><div className="skeleton h-5 w-2/3 rounded-lg" /><div className="skeleton h-5 w-1/2 rounded-lg" /></div>
        ) : list.length === 0 ? (
          <EmptyState compact icon={<BookOpen />} title="Nothing yet" description="The letters written for you are kept here, and nowhere else." />
        ) : (
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {list.map((g) => {
              const active = g.id === current?.id && !composing
              const done = Object.keys(g.plan_done ?? {}).length
              return (
                <button key={g.id} type="button" onClick={() => { setSelected(g.id); setWriting(false) }} className={cn('block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2', active && 'bg-surface-2')}>
                  <p className={cn('truncate text-[15px]', active ? 'font-medium text-ink' : 'text-ink')}>{g.theme || 'A letter'}</p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {fmtDate(g.created_at, 'EEE d MMM')}
                    {g.response.plan.length > 0 && ` · ${done}/${g.response.plan.length} readings`}
                  </p>
                </button>
              )
            })}
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] leading-relaxed text-ink-3">
          These are yours alone — {partner ? `${partner.display_name} can’t see them` : 'nobody else in the house can see them'}, and you can delete any of them.
        </p>
      </aside>
    </div>
  )
}

function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

// ---------------------------------------------------------------------------
// Writing it down
// ---------------------------------------------------------------------------
function Composer({ onAsk, onCancel }: { onAsk: (context: string, translation: Translation) => Promise<void>; onCancel?: () => void }) {
  const [text, setText] = useState('')
  const [translation, setTranslation] = useState<Translation>(() => {
    try { return localStorage.getItem(TRANSLATION_KEY) === 'KJV' ? 'KJV' : 'BSB' } catch { return 'BSB' }
  })
  const box = useRef<HTMLTextAreaElement>(null)
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const ready = words >= MIN_WORDS

  const pickTranslation = (t: Translation) => {
    setTranslation(t)
    try { localStorage.setItem(TRANSLATION_KEY, t) } catch { /* fine */ }
  }
  const start = (line: string) => {
    setText((t) => (t.trim() ? `${t.replace(/\s+$/, '')}\n${line}` : line))
    requestAnimationFrame(() => { box.current?.focus(); const n = box.current?.value.length ?? 0; box.current?.setSelectionRange(n, n) })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    void onAsk(text.trim(), translation)
  }

  return (
    <Reveal>
      <form onSubmit={submit} className="card p-4 sm:p-6">
        <label htmlFor="word-context" className="font-display text-[22px] text-ink sm:text-2xl">What’s on your heart?</label>
        <p className="mt-1.5 max-w-prose text-[15px] text-ink-2">
          Write it the way you’d tell a pastor you trust — what happened, how it feels, what you can’t get past. You’ll get a letter back built on Scripture: the passages that speak to it, what they mean for you, a few things to do, a prayer, and a week of readings.
        </p>
        <Textarea
          ref={box}
          id="word-context"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          rows={6}
          maxLength={MAX_CHARS}
          placeholder="e.g. My father passed away last month and I can’t seem to pray. I go through the motions on Sunday but I feel nothing, and I’m angry that he was taken so soon…"
          className="mt-4 text-[16px]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {STARTERS.map((s) => <Chip key={s.label} onClick={() => start(s.line)}>{s.label}</Chip>)}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented size="sm" value={translation} onChange={pickTranslation} options={TRANSLATIONS.map((t) => ({ value: t.value, label: t.label }))} />
          <div className="flex items-center gap-2">
            {onCancel && <Button variant="ghost" onClick={onCancel}>Back to the letter</Button>}
            <Button type="submit" leading={<Feather className="size-4" />} disabled={!ready} title={ready ? undefined : `A few more words — at least ${MIN_WORDS}`}>Ask for a word</Button>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-ink-3">Nobody else in the house can read what you write here or the letter that comes back.</p>
      </form>
    </Reveal>
  )
}

function Waiting() {
  const [stage, setStage] = useState(0)
  const calm = useCalm()
  useEffect(() => {
    const timers = STAGES.slice(1).map((s, i) => setTimeout(() => setStage(i + 1), s.at))
    return () => timers.forEach(clearTimeout)
  }, [])
  return (
    <div className="card flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center" role="status" aria-live="polite">
      <motion.div
        className="grid size-14 place-items-center rounded-3xl bg-primary-soft text-primary-text"
        animate={calm ? undefined : { y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Feather className="size-6" />
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.p key={stage} className="mt-4 font-display text-xl text-ink" initial={calm ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }}>
          {STAGES[stage]!.text}
        </motion.p>
      </AnimatePresence>
      <p className="mt-2 max-w-sm text-sm text-ink-2">Only passages from the Bible itself are used — nothing is quoted from memory.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The letter
// ---------------------------------------------------------------------------
function Letter({ letter, firstName, partnerName, onDeleted }: { letter: Guidance; firstName: string; partnerName?: string; onDeleted: () => void }) {
  const { deleteGuidance, tickReading } = useActions()
  const confirm = useConfirm()
  const r = letter.response
  const long = TRANSLATIONS.find((t) => t.value === letter.translation)?.long ?? letter.translation
  const thin = !r.understanding && r.response.length === 0
  const [showContext, setShowContext] = useState(letter.context.length <= 240)

  const remove = async () => {
    const ok = await confirm({ title: 'Delete this letter?', description: 'It goes for good. Nobody else could see it anyway.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    onDeleted()
    void deleteGuidance(letter.id)
  }

  return (
    <Reveal as="section">
      <article className="card overflow-hidden">
        <header className="border-b border-line px-5 py-4 sm:px-8 sm:py-5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">{fmtDate(letter.created_at, 'EEEE d MMMM yyyy')} · {long}</p>
          <h2 className="mt-1 text-[24px] text-ink sm:text-[28px]">{letter.theme || 'A letter for you'}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            <span className="text-ink-3">You wrote: </span>
            <span className="italic">“{showContext ? letter.context : `${letter.context.slice(0, 240).replace(/\s+\S*$/, '')}…`}”</span>
            {!showContext && <button type="button" onClick={() => setShowContext(true)} className="ml-1 font-medium text-primary-text hover:underline">more</button>}
          </p>
        </header>

        {r.safety.concern && <CareCard kind={r.safety.kind} />}

        <div className="font-letter px-5 py-6 text-[17px] leading-[1.7] text-ink sm:px-8 sm:py-8 sm:text-[18px]">
          {firstName && <p className="mb-4">Dear {firstName},</p>}
          <Paragraphs text={r.greeting} />

          <Heading>From the Word</Heading>
          {r.passages.map((p, i) => <PassageCard key={`${p.reference}-${i}`} passage={p} />)}

          {thin ? (
            <p className="mt-6 rounded-2xl bg-surface-2 px-5 py-4 font-sans text-[14px] leading-relaxed text-ink-2">
              Only the passages could be written this time — the rest of the letter didn’t come through. Sit with these, and ask again in a little while.
            </p>
          ) : (
            <>
              {r.understanding && <><Heading>What may be going on</Heading><Paragraphs text={r.understanding} /></>}
              {r.response.length > 0 && (
                <>
                  <Heading>How you might respond</Heading>
                  <ol className="mt-3 space-y-3">
                    {r.response.map((step, i) => (
                      <li key={i} className="flex gap-3.5">
                        <span className="mt-[3px] grid size-7 shrink-0 place-items-center rounded-full bg-sage-soft font-sans text-[13px] font-semibold text-sage-text tabular">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {r.prayer && (
                <>
                  <Heading>A prayer</Heading>
                  <blockquote className="mt-3 rounded-2xl border-l-4 border-primary/60 bg-surface-2 px-5 py-4 italic"><Paragraphs text={r.prayer} tight /></blockquote>
                </>
              )}
              {r.closing && <div className="mt-6"><Paragraphs text={r.closing} /></div>}
            </>
          )}
        </div>

        {r.plan.length > 0 && (
          <section className="border-t border-line bg-surface-2/50 px-5 py-5 sm:px-8 sm:py-6">
            <h3 className="text-[20px] text-ink">Walk with this</h3>
            <p className="mt-1 text-[14px] text-ink-2">A reading a day for the coming week, chosen for what you wrote. Tap one to read it here; tick it when you have.</p>
            <div className="mt-4 space-y-2">
              {r.plan.map((reading, i) => (
                <ReadingRow key={`${reading.reference}-${i}`} day={i + 1} reading={reading} translation={letter.translation} done={Boolean(letter.plan_done?.[String(i)])} onTick={(v) => void tickReading(letter.id, i, v)} />
              ))}
            </div>
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-3 sm:px-8">
          <span className="max-w-prose">
            Scripture from the {long}. The letter is written with the help of Gemini around those passages — weigh it as you would any counsel, and take anything heavy to your own pastor.
            {' '}Private to you{partnerName ? ` — ${partnerName} can’t see it` : ''}.
          </span>
          <Button variant="ghost" size="sm" leading={<Trash2 className="size-4" />} onClick={remove} className="text-ink-3 hover:text-danger">Delete</Button>
        </footer>
      </article>
    </Reveal>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-8 mb-1 font-sans text-[12px] font-semibold uppercase tracking-wider text-primary-text">{children}</h3>
}

function Paragraphs({ text, tight }: { text: string; tight?: boolean }) {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return <>{parts.map((p, i) => <p key={i} className={cn(i > 0 && (tight ? 'mt-2' : 'mt-3'))}>{p}</p>)}</>
}

/** The footnote for where a passage was found, in the fewest words. */
function noteLabel(note: string): string | null {
  if (!note) return null
  if (/^nearest/i.test(note)) return null
  if (/^Nave/i.test(note)) return note.replace(/^Nave's Topical Bible:\s*/i, 'Nave’s: ')
  if (/^cross-reference/i.test(note)) return note.replace(/^cross-reference/i, 'Cross-reference')
  return note
}

function PassageCard({ passage: p }: { passage: GuidancePassage }) {
  const label = noteLabel(p.note)
  return (
    <figure className="mt-4 rounded-2xl border border-line bg-surface px-5 py-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-sans">
        <span className="text-[13px] font-semibold uppercase tracking-wider text-primary-text">{p.reference}</span>
        {label && <span className="text-[11px] text-ink-3">{label}</span>}
      </figcaption>
      <blockquote className="mt-2 leading-[1.7]">
        {p.verses.map((v) => (
          <span key={v.verse}>
            {p.verses.length > 1 && <sup className="mr-0.5 font-sans text-[11px] text-ink-3 tabular">{v.verse}</sup>}
            {v.text}{' '}
          </span>
        ))}
      </blockquote>
      {p.why && <p className="mt-3 font-sans text-[15px] leading-relaxed text-ink-2">{p.why}</p>}
    </figure>
  )
}

// ---------------------------------------------------------------------------
// The reading plan
// ---------------------------------------------------------------------------
function ReadingRow({ day, reading, translation, done, onTick }: { day: number; reading: PlanReading; translation: Translation; done: boolean; onTick: (v: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const calm = useCalm()
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <Checkbox checked={done} onChange={onTick} label={`Day ${day}: ${reading.reference}`} size="lg" />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Day {day}</span>
            <span className={cn('font-medium transition-colors', done ? 'text-ink-3 line-through' : 'text-ink')}>{reading.reference}</span>
          </p>
          {reading.focus && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{reading.focus}</p>}
        </button>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={calm ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
            <PassageReader reading={reading} translation={translation} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** BibleHub keeps every chapter of both translations online, under the book's name. */
function bibleHubUrl(reading: PlanReading, translation: Translation): string {
  const slug = reading.book_id === 22 ? 'songs' : reading.book_id === 19 ? 'psalms' : reading.book.toLowerCase().replace(/\s+/g, '_')
  return `https://biblehub.com/${translation.toLowerCase()}/${slug}/${reading.chapter}.htm`
}

function PassageReader({ reading, translation }: { reading: PlanReading; translation: Translation }) {
  const { db } = useDb()
  const q = useQuery({
    queryKey: ['passage', db.mode, translation, reading.book_id, reading.chapter, reading.start, reading.end],
    queryFn: () => db.readPassage(reading, translation),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })
  return (
    <div className="border-t border-line px-4 py-4 sm:px-5">
      {q.isPending ? (
        <div className="space-y-2" aria-busy>
          <div className="skeleton h-4 w-11/12 rounded-lg" /><div className="skeleton h-4 w-full rounded-lg" /><div className="skeleton h-4 w-3/4 rounded-lg" />
        </div>
      ) : q.isError ? (
        <p className="text-sm text-danger">{q.error instanceof Error ? q.error.message : 'That passage could not be opened.'}</p>
      ) : (
        <div className="font-letter text-[17px] leading-[1.7] text-ink">
          {q.data.verses.map((v) => (
            <span key={v.verse}>
              <sup className="mr-0.5 font-sans text-[11px] text-ink-3 tabular">{v.verse}</sup>{v.text}{' '}
            </span>
          ))}
        </div>
      )}
      <a href={bibleHubUrl(reading, translation)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink">
        Whole chapter on BibleHub <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// When someone is not safe
// ---------------------------------------------------------------------------
const LINES: Record<Exclude<SafetyKind, 'none'>, { lead: string; lines: { label: string; number: string; tel?: string }[] }> = {
  'self-harm': {
    lead: 'If you are thinking about ending your life, or you are not safe right now, please phone one of these today. They are free, they are open through the night, and the people who answer are kind.',
    lines: [
      { label: 'SADAG Suicide Crisis Helpline (24h)', number: '0800 567 567' },
      { label: 'SADAG Mental Health Helpline (24h)', number: '0800 456 789 · SMS 31393', tel: '0800456789' },
      { label: 'LifeLine South Africa', number: '0861 322 322' },
      { label: 'Ambulance', number: '10177 · 112 from a mobile', tel: '10177' },
    ],
  },
  abuse: {
    lead: 'If someone is hurting you, that is not something to pray through alone — it is something to get help with today. These lines are free and confidential.',
    lines: [
      { label: 'Gender-Based Violence Command Centre (24h)', number: '0800 428 428' },
      { label: 'Police', number: '10111' },
      { label: 'LifeLine South Africa', number: '0861 322 322' },
      { label: 'Childline', number: '116' },
    ],
  },
  danger: {
    lead: 'If you or someone else is in danger right now, please phone for help before anything else.',
    lines: [
      { label: 'Police', number: '10111' },
      { label: 'Ambulance', number: '10177 · 112 from a mobile', tel: '10177' },
      { label: 'LifeLine South Africa', number: '0861 322 322' },
    ],
  },
  other: {
    lead: 'Some things are too heavy to carry with a letter alone. If you need someone to talk to today, these lines are free and open.',
    lines: [
      { label: 'LifeLine South Africa', number: '0861 322 322' },
      { label: 'SADAG Mental Health Helpline (24h)', number: '0800 456 789 · SMS 31393', tel: '0800456789' },
      { label: 'Emergency', number: '10111 · 10177 · 112 from a mobile', tel: '112' },
    ],
  },
}

function CareCard({ kind }: { kind: SafetyKind }) {
  const care = LINES[kind === 'none' ? 'other' : kind]
  return (
    <div className="mx-5 mt-5 rounded-2xl border border-ochre/50 bg-ochre-soft px-5 py-4 sm:mx-8" role="note">
      <p className="font-display text-[20px] text-ink">Please don’t carry this alone</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{care.lead}</p>
      <ul className="mt-3 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2">
        {care.lines.map((l) => (
          <li key={l.label} className="flex items-start gap-2">
            <Phone className="mt-1 size-3.5 shrink-0 text-ochre-text" aria-hidden />
            <span><a href={`tel:${l.tel ?? l.number.replace(/\s+/g, '')}`} className="font-semibold text-ink tabular hover:underline">{l.number}</a><span className="block text-[12px] text-ink-3">{l.label}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
