import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ChevronDown, Copy, ExternalLink, Eye, EyeOff, Feather, Fingerprint, KeyRound, Lock, LockOpen, MessageCircle, MoreHorizontal, PenLine, Phone, SendHorizontal, Share2, Trash2, X } from 'lucide-react'
import { PinRefused, TRANSLATIONS, type Guidance, type GuidancePassage, type PlanReading, type SafetyKind, type Study, type StudyMention, type Translation } from '../../data/types'
import { useActions, useGuidance, useHiddenGuidance, usePinStatus, useStudy } from '../../data/hooks'
import { useAuth, useDb } from '../../data/session'
import { useCalm, useUi } from '../../store/ui'
import { biometricEnrolled, biometricName, biometricSupported, enrolBiometric, forgetBiometric, unlockWithBiometric, updateBiometricPin } from '../../lib/biometric'
import { canWebShare, copyText, openExternal, webShare, whatsappLink } from '../../lib/share'
import { cn, fmtDate } from '../../lib/utils'
import { EmptyState, Pill, Reveal } from '../ui/Bits'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Chip, Input, Segmented, Textarea } from '../ui/Field'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu'
import { Sheet, useConfirm } from '../ui/Sheet'

const TRANSLATION_KEY = 'hub-word-translation'
const MIN_WORDS = 8
const MAX_CHARS = 2000
/** Hidden letters lock themselves again after this long, however busy the screen has been. */
const RELOCK_AFTER = 10 * 60_000
/** …and sooner if the app is put away for longer than this. */
const RELOCK_WHEN_AWAY = 60_000
const MAX_QUESTION_CHARS = 500

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
 * from the Hub's own Bible. Letters are kept per person and shown to nobody else in the house —
 * and the ones marked hidden are kept behind a PIN as well, for the over-the-shoulder case.
 */
export function WordPanel() {
  const { data: letters, isPending } = useGuidance()
  const { data: pinStatus } = usePinStatus()
  const { askTheWord, hideGuidance, lockHidden } = useActions()
  const { me, partner, userId } = useAuth()
  const toast = useUi((s) => s.toast)
  const [selected, setSelected] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [busy, setBusy] = useState(false)
  /** The letter just written, kept in hand even when it went straight behind the PIN. */
  const [fresh, setFresh] = useState<Guidance | null>(null)

  // The PIN lives here, in memory, and nowhere else — for as long as the letters are unlocked.
  const [pin, setPinInHand] = useState<string | null>(null)
  const hidden = useHiddenGuidance(pin)
  const [sheet, setSheet] = useState<'none' | 'unlock' | 'set-pin' | 'change-pin'>('none')
  const [afterPin, setAfterPin] = useState<((pin: string) => void) | null>(null)

  const currentHidden = useRef(false)
  const lock = useCallback(() => {
    setPinInHand(null)
    lockHidden()
    if (currentHidden.current) setSelected(null)
  }, [lockHidden])

  // Locking is automatic: after ten minutes, after a minute away, and always on leaving the tab.
  useEffect(() => {
    if (!pin) return
    const t = setTimeout(lock, RELOCK_AFTER)
    let away = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') away = Date.now()
      else if (away && Date.now() - away > RELOCK_WHEN_AWAY) lock()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVisibility) }
  }, [pin, lock])
  useEffect(() => () => lockHidden(), [lockHidden])

  const list = useMemo(() => letters ?? [], [letters])
  const hiddenList = useMemo(() => hidden.data ?? [], [hidden.data])
  // Coming back opens the latest letter — the reading plan is what people return for.
  const current = useMemo(
    () => list.find((g) => g.id === selected) ?? hiddenList.find((g) => g.id === selected) ?? (fresh && fresh.id === selected ? fresh : null) ?? list[0] ?? null,
    [list, hiddenList, fresh, selected],
  )
  useEffect(() => { currentHidden.current = Boolean(current?.hidden) }, [current])
  // The composer shows when there is nothing to read yet, or when asked for; otherwise the letter does.
  const composing = writing || (!current && !busy)
  const hasPin = pinStatus?.has_pin ?? false
  const hiddenCount = pinStatus?.hidden_count ?? 0

  const ask = async (context: string, translation: Translation, keepHidden: boolean) => {
    setBusy(true)
    try {
      const g = await askTheWord(context, translation, keepHidden)
      setFresh(g)
      setSelected(g.id)
      setWriting(false)
    } catch { /* toasted by useActions */ } finally { setBusy(false) }
  }

  /** Runs `then` with a PIN in hand — straight away if there is one, otherwise after setting one. */
  const withPin = (then: (pin: string) => void) => {
    if (hasPin) then(pin ?? '')
    else { setAfterPin(() => then); setSheet('set-pin') }
  }

  const hide = (g: Guidance) => withPin(async () => {
    try {
      await hideGuidance(g)
      if (current?.id === g.id) setSelected(null)
      toast({ title: 'Hidden', description: pin ? 'It has moved to your hidden letters.' : 'It is behind your PIN now — unlock to see it.', tone: 'neutral' })
    } catch { /* toasted */ }
  })

  const unlock = async () => {
    if (userId && biometricEnrolled(userId)) {
      const got = await unlockWithBiometric(userId)
      if (got) { setPinInHand(got); return }
    }
    setSheet('unlock')
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        {busy ? (
          <Waiting />
        ) : composing ? (
          <Composer onAsk={ask} onCancel={current ? () => setWriting(false) : undefined} hasPin={hasPin} onNeedPin={() => { setAfterPin(null); setSheet('set-pin') }} />
        ) : current ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-ink-2">
                {current.hidden && <Pill tone="plum" size="sm"><EyeOff className="size-3" /> Hidden</Pill>}
                {current.id === list[0]?.id ? 'Your latest letter' : `A letter from ${fmtDate(current.created_at, 'd MMMM')}`}
              </p>
              <Button variant="secondary" size="sm" leading={<PenLine className="size-4" />} onClick={() => setWriting(true)}>Write again</Button>
            </div>
            <Letter key={current.id} letter={current} pin={pin} firstName={firstNameOf(me?.display_name)} partnerName={partner?.display_name} onDeleted={() => setSelected(null)} onHide={() => hide(current)} onUnhidden={(g) => setSelected(g.id)} />
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
          <div className="max-h-[50vh] divide-y divide-line overflow-y-auto">
            {list.map((g) => <HistoryRow key={g.id} letter={g} active={g.id === current?.id && !composing} onOpen={() => { setSelected(g.id); setWriting(false) }} />)}
          </div>
        )}

        {/* Hidden letters: a closed door with a count on it, or the open list with a way to shut it. */}
        {pin ? (
          <div className="border-t border-line">
            <div className="flex items-center gap-2 px-4 py-2.5">
              <LockOpen className="size-3.5 text-plum-text" aria-hidden />
              <p className="flex-1 text-[12px] font-semibold uppercase tracking-wider text-plum-text">Hidden{hiddenList.length ? ` · ${hiddenList.length}` : ''}</p>
              <HiddenMenu userId={userId} onChangePin={() => setSheet('change-pin')} pinInHand={pin} onForgot={lock} />
              <Button variant="ghost" size="sm" leading={<Lock className="size-4" />} onClick={lock} aria-label="Lock hidden letters">Lock</Button>
            </div>
            {hidden.isPending ? (
              <div className="space-y-2 px-4 pb-4"><div className="skeleton h-5 w-2/3 rounded-lg" /></div>
            ) : hidden.isError ? (
              <div className="px-4 pb-4">
                <p className="text-[13px] text-danger">{hidden.error instanceof Error ? hidden.error.message : 'The PIN was refused.'}</p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => { lock(); setSheet('unlock') }}>Type the PIN</Button>
              </div>
            ) : hiddenList.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-ink-3">Nothing hidden. “Hide” on a letter puts it here.</p>
            ) : (
              <div className="max-h-[40vh] divide-y divide-line overflow-y-auto border-t border-line">
                {hiddenList.map((g) => <HistoryRow key={g.id} letter={g} active={g.id === current?.id && !composing} onOpen={() => { setSelected(g.id); setWriting(false) }} />)}
              </div>
            )}
          </div>
        ) : hasPin || hiddenCount > 0 ? (
          <button type="button" onClick={() => void unlock()} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-left transition-colors hover:bg-surface-2" aria-label="Unlock hidden letters">
            <Lock className="size-4 text-ink-3" aria-hidden />
            <span className="flex-1 text-[14px] text-ink">{hiddenCount === 0 ? 'Nothing hidden yet' : `${hiddenCount} hidden`}</span>
            <span className="text-[13px] font-medium text-primary-text">Unlock</span>
          </button>
        ) : null}

        <p className="border-t border-line px-4 py-3 text-[13px] leading-relaxed text-ink-3">
          These are yours alone — {partner ? `${partner.display_name} can’t see them` : 'nobody else in the house can see them'}, and you can delete any of them.
          {!hasPin && ' “Hide” on a letter puts it behind a PIN as well, for when someone is looking at your screen.'}
        </p>
      </aside>

      <PinSheet
        open={sheet === 'set-pin' || sheet === 'change-pin'}
        change={sheet === 'change-pin'}
        onClose={() => { setSheet('none'); setAfterPin(null) }}
        onSet={(newPin) => {
          setSheet('none')
          // Changing the PIN while unlocked keeps the new one in hand; setting one for the first time
          // leaves things locked — what gets hidden now is meant to be out of sight.
          if (pin) setPinInHand(newPin)
          if (userId) updateBiometricPin(userId, newPin)
          const then = afterPin
          setAfterPin(null)
          then?.(newPin)
        }}
      />
      <UnlockSheet open={sheet === 'unlock'} onClose={() => setSheet('none')} onUnlocked={(p) => { setSheet('none'); setPinInHand(p); if (userId) updateBiometricPin(userId, p) }} lockedUntil={pinStatus?.locked_until ?? null} />
    </div>
  )
}

function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

function HistoryRow({ letter: g, active, onOpen }: { letter: Guidance; active: boolean; onOpen: () => void }) {
  const done = Object.keys(g.plan_done ?? {}).length
  return (
    <button type="button" onClick={onOpen} className={cn('block w-full px-4 py-3 text-left transition-colors hover:bg-surface-2', active && 'bg-surface-2')}>
      <p className={cn('flex items-center gap-1.5 truncate text-[15px] text-ink', active && 'font-medium')}>
        {g.hidden && <EyeOff className="size-3.5 shrink-0 text-plum-text" aria-label="Hidden" />}
        <span className="truncate">{g.theme || 'A letter'}</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-3">
        {fmtDate(g.created_at, 'EEE d MMM')}
        {g.response.plan.length > 0 && ` · ${done}/${g.response.plan.length} readings`}
      </p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// The PIN and the door
// ---------------------------------------------------------------------------
function HiddenMenu({ userId, pinInHand, onChangePin, onForgot }: { userId: string | null; pinInHand: string; onChangePin: () => void; onForgot: () => void }) {
  const { forgetPin } = useActions()
  const { me } = useAuth()
  const confirm = useConfirm()
  const toast = useUi((s) => s.toast)
  const [bio, setBio] = useState<{ supported: boolean; enrolled: boolean }>({ supported: false, enrolled: false })
  useEffect(() => {
    let alive = true
    void biometricSupported().then((supported) => { if (alive) setBio({ supported, enrolled: userId ? biometricEnrolled(userId) : false }) })
    return () => { alive = false }
  }, [userId])

  const toggleBio = async () => {
    if (!userId) return
    if (bio.enrolled) {
      forgetBiometric(userId)
      setBio((b) => ({ ...b, enrolled: false }))
      toast({ title: `${biometricName()} switched off here`, description: 'The PIN still works.', tone: 'neutral' })
      return
    }
    try {
      await enrolBiometric(userId, me?.display_name ?? '', pinInHand)
      setBio((b) => ({ ...b, enrolled: true }))
      toast({ title: `${biometricName()} switched on`, description: 'On this device it will unlock your hidden letters instead of the PIN.', tone: 'success' })
    } catch {
      toast({ title: 'Not set up', description: `The device didn’t finish the ${biometricName()} prompt. Nothing changed.`, tone: 'neutral' })
    }
  }

  const forget = async () => {
    const ok = await confirm({ title: 'Forget the PIN?', description: 'There is no way back to a hidden letter without it, so every hidden letter is deleted along with the PIN. Bring back the ones you want to keep first.', confirmLabel: 'Forget PIN and delete', danger: true })
    if (!ok) return
    if (userId) forgetBiometric(userId)
    await forgetPin()
    onForgot()
  }

  return (
    <Menu trigger={<button type="button" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Hidden letters settings"><MoreHorizontal className="size-4" /></button>}>
      <MenuLabel>Hidden letters</MenuLabel>
      <MenuItem icon={<KeyRound />} onSelect={onChangePin}>Change PIN</MenuItem>
      {bio.supported && <MenuItem icon={<Fingerprint />} onSelect={() => void toggleBio()}>{bio.enrolled ? `Stop using ${biometricName()} here` : `Use ${biometricName()} on this device`}</MenuItem>}
      <MenuSeparator />
      <MenuItem danger icon={<Trash2 />} onSelect={() => void forget()}>Forget PIN (deletes hidden letters)</MenuItem>
    </Menu>
  )
}

const PIN_HINT = 'Four to eight digits. The database checks it, so hidden letters really are out of reach without it — and there is no reset: forgetting it deletes them.'

function PinSheet({ open, change, onClose, onSet }: { open: boolean; change: boolean; onClose: () => void; onSet: (pin: string) => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }} title={change ? 'Change your PIN' : 'Set a PIN for hidden letters'} description={PIN_HINT} size="sm" centered>
      {/* The form lives inside the sheet, so closing it is what clears the fields. */}
      <PinForm change={change} onClose={onClose} onSet={onSet} />
    </Sheet>
  )
}

function PinForm({ change, onClose, onSet }: { change: boolean; onClose: () => void; onSet: (pin: string) => void }) {
  const { setPin } = useActions()
  const [old, setOld] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const valid = /^[0-9]{4,8}$/.test(a)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) { setError('A PIN is 4 to 8 digits.'); return }
    if (a !== b) { setError('The two PINs don’t match.'); return }
    setBusy(true); setError(null)
    try {
      await setPin(a, change ? old : undefined)
      onSet(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the PIN.')
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2" data-testid="pin-form">
      {change && <PinInput label="Current PIN" value={old} onChange={setOld} autoFocus />}
      <PinInput label={change ? 'New PIN' : 'PIN'} value={a} onChange={setA} autoFocus={!change} />
      <PinInput label="Again, to be sure" value={b} onChange={setB} />
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={!valid || b.length === 0 || (change && old.length < 4)}>{change ? 'Change PIN' : 'Set PIN'}</Button>
      </div>
    </form>
  )
}

function PinInput({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <Input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={8} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} className="mt-1.5 tabular tracking-[0.3em]" aria-label={label} autoFocus={autoFocus} />
    </label>
  )
}

function UnlockSheet({ open, onClose, onUnlocked, lockedUntil }: { open: boolean; onClose: () => void; onUnlocked: (pin: string) => void; lockedUntil: string | null }) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }} title="Hidden letters" description="Type your PIN to open them for a few minutes." size="sm" centered>
      <UnlockForm onClose={onClose} onUnlocked={onUnlocked} lockedUntil={lockedUntil} />
    </Sheet>
  )
}

function UnlockForm({ onClose, onUnlocked, lockedUntil }: { onClose: () => void; onUnlocked: (pin: string) => void; lockedUntil: string | null }) {
  const { db } = useDb()
  const { userId } = useAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(() => (lockedUntil && new Date(lockedUntil) > new Date() ? new PinRefused('pin_locked', null, lockedUntil).message : null))
  const [busy, setBusy] = useState(false)
  const enrolled = userId ? biometricEnrolled(userId) : false

  // The PIN is tried against the database by fetching the hidden letters; the panel's query does the
  // same fetch again a moment later from its own cache key, which is cheap and keeps one source of truth.
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pin.length < 4) return
    setBusy(true); setError(null)
    try {
      await db.listHiddenGuidance(pin)
      onUnlocked(pin)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That isn’t it.')
    } finally { setBusy(false) }
  }

  const tryBiometric = async () => {
    if (!userId) return
    const got = await unlockWithBiometric(userId)
    if (got) onUnlocked(got)
    else setError(`${biometricName()} didn’t go through — type the PIN instead.`)
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2" data-testid="unlock-form">
      <PinInput label="PIN" value={pin} onChange={setPin} autoFocus />
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {enrolled ? <Button variant="ghost" size="sm" leading={<Fingerprint className="size-4" />} onClick={() => void tryBiometric()}>Try {biometricName()}</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={pin.length < 4} leading={<LockOpen className="size-4" />}>Unlock</Button>
        </div>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Writing it down
// ---------------------------------------------------------------------------
function Composer({ onAsk, onCancel, hasPin, onNeedPin }: { onAsk: (context: string, translation: Translation, hidden: boolean) => Promise<void>; onCancel?: () => void; hasPin: boolean; onNeedPin: () => void }) {
  const [text, setText] = useState('')
  const [keepHidden, setKeepHidden] = useState(false)
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
  // Ticking it before there is a PIN asks for one; the tick then takes effect the moment one exists.
  const toggleHidden = (v: boolean) => {
    setKeepHidden(v)
    if (v && !hasPin) onNeedPin()
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    void onAsk(text.trim(), translation, keepHidden && hasPin)
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
          {/* A div, not a button: the Checkbox is a button of its own and buttons don't nest. */}
          <div onClick={() => toggleHidden(!(keepHidden && hasPin))} className="flex cursor-pointer items-center gap-2.5 text-left text-[13px] text-ink-2">
            <Checkbox checked={keepHidden && hasPin} onChange={toggleHidden} label="Keep this one hidden" />
            <span><EyeOff className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Keep this one hidden{hasPin ? '' : ' (sets up a PIN first)'}</span>
          </div>
          <p className="text-[13px] text-ink-3">Nobody else in the house can read what you write here.</p>
        </div>
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
      <p className="mt-2 max-w-sm text-sm text-ink-2">Every passage comes from the Bible itself, word for word.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The letter
// ---------------------------------------------------------------------------
function Letter({ letter, pin, firstName, partnerName, onDeleted, onHide, onUnhidden }: { letter: Guidance; pin: string | null; firstName: string; partnerName?: string; onDeleted: () => void; onHide: () => void; onUnhidden: (g: Guidance) => void }) {
  const { deleteGuidance, tickReading, unhideGuidance } = useActions()
  const confirm = useConfirm()
  const r = letter.response
  const long = TRANSLATIONS.find((t) => t.value === letter.translation)?.long ?? letter.translation
  const thin = !r.understanding && r.response.length === 0
  const [showContext, setShowContext] = useState(letter.context.length <= 240)
  // A hidden letter can only be worked on with the PIN in hand; without it, it is read-only.
  const canTouch = !letter.hidden || Boolean(pin)

  const remove = async () => {
    const ok = await confirm({ title: 'Delete this letter?', description: 'It goes for good. Nobody else could see it anyway.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    onDeleted()
    void deleteGuidance(letter, pin ?? undefined)
  }
  const unhide = async () => {
    if (!pin) return
    try { onUnhidden(await unhideGuidance(letter, pin)) } catch { /* toasted */ }
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
          {r.passages.map((p, i) => <PassageCard key={`${p.reference}-${i}`} passage={p} translation={letter.translation} />)}

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
                        <span className="min-w-0 flex-1">{step}</span>
                        <ShareButton text={step} label={`Share step ${i + 1}`} className="mt-0.5" />
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {r.prayer && (
                <>
                  <Heading>A prayer</Heading>
                  <blockquote className="relative mt-3 rounded-2xl border-l-4 border-primary/60 bg-surface-2 px-5 py-4 pr-12 italic">
                    <Paragraphs text={r.prayer} tight />
                    <ShareButton text={r.prayer} label="Share the prayer" className="absolute top-3 right-3" />
                  </blockquote>
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
                <ReadingRow key={`${reading.reference}-${i}`} day={i + 1} reading={reading} translation={letter.translation} done={Boolean(letter.plan_done?.[String(i)])} onTick={canTouch ? (v) => void tickReading(letter, i, v, pin ?? undefined) : undefined} />
              ))}
            </div>
          </section>
        )}

        <StudySection letter={letter} pin={pin} canTouch={canTouch} />

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-3 sm:px-8">
          <span className="max-w-prose">
            Scripture from the {long}. Weigh the letter as you would any counsel, and take anything heavy to your own pastor.
            {' '}Private to you{partnerName ? ` — ${partnerName} can’t see it` : ''}.
          </span>
          <span className="flex items-center gap-1">
            {letter.hidden
              ? <Button variant="ghost" size="sm" leading={<Eye className="size-4" />} onClick={() => void unhide()} disabled={!canTouch} className="text-ink-3 hover:text-ink">Unhide</Button>
              : <Button variant="ghost" size="sm" leading={<EyeOff className="size-4" />} onClick={onHide} className="text-ink-3 hover:text-ink">Hide</Button>}
            <Button variant="ghost" size="sm" leading={<Trash2 className="size-4" />} onClick={remove} disabled={!canTouch} className="text-ink-3 hover:text-danger">Delete</Button>
          </span>
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

/** A verse the way it reads in a message: the words, then where they are from. */
function verseText(p: GuidancePassage, translation: Translation): string {
  return `“${p.verses.map((v) => v.text.trim()).join(' ')}”\n— ${p.reference} (${translation})`
}

function PassageCard({ passage: p, translation }: { passage: GuidancePassage; translation: Translation }) {
  const label = noteLabel(p.note)
  return (
    <figure className="mt-4 rounded-2xl border border-line bg-surface px-5 py-4">
      <figcaption className="flex items-baseline justify-between gap-x-3 font-sans">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-primary-text">{p.reference}</span>
          {label && <span className="text-[11px] text-ink-3">{label}</span>}
        </span>
        <ShareButton text={verseText(p, translation)} label={`Share ${p.reference}`} className="-mr-2 -mt-1 self-start" />
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
// Passing a verse or a word of advice on — WhatsApp first, since that is where it will go.
// ---------------------------------------------------------------------------
function ShareButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const toast = useUi((s) => s.toast)
  const copy = async () => {
    toast(await copyText(text) ? { title: 'Copied', description: 'Paste it wherever you like.', tone: 'success' } : { title: 'Could not copy', description: 'Your browser did not allow it.', tone: 'neutral' })
  }
  return (
    <Menu trigger={<button type="button" className={cn('grid size-8 shrink-0 place-items-center rounded-full font-sans text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink', className)} aria-label={label}><Share2 className="size-4" /></button>}>
      <MenuItem icon={<MessageCircle />} onSelect={() => openExternal(whatsappLink(null, text))}>Send on WhatsApp</MenuItem>
      {canWebShare() && <MenuItem icon={<Share2 />} onSelect={() => void webShare({ text })}>Share…</MenuItem>}
      <MenuItem icon={<Copy />} onSelect={() => void copy()}>Copy</MenuItem>
    </Menu>
  )
}

// ---------------------------------------------------------------------------
// The reading plan
// ---------------------------------------------------------------------------
function ReadingRow({ day, reading, translation, done, onTick }: { day: number; reading: PlanReading; translation: Translation; done: boolean; onTick?: (v: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const calm = useCalm()
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <Checkbox checked={done} onChange={(v) => onTick?.(v)} label={`Day ${day}: ${reading.reference}`} size="lg" className={cn(!onTick && 'opacity-50')} />
        {/* The arrow is part of the button: the whole row past the tick opens the reading, not just the words. */}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="-my-3 -mr-4 flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 text-left">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Day {day}</span>
              <span className={cn('font-medium transition-colors', done ? 'text-ink-3 line-through' : 'text-ink')}>{reading.reference}</span>
            </span>
            {reading.focus && <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{reading.focus}</span>}
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
        </button>
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

/** Anything with a place in the Bible can be opened: a reading in the plan, a reference mentioned in an answer. */
type Readable = Pick<PlanReading, 'book_id' | 'book' | 'chapter' | 'start' | 'end' | 'reference'>

/** BibleHub keeps every chapter of both translations online, under the book's name. */
function bibleHubUrl(reading: Readable, translation: Translation): string {
  const slug = reading.book_id === 22 ? 'songs' : reading.book_id === 19 ? 'psalms' : reading.book.toLowerCase().replace(/\s+/g, '_')
  return `https://biblehub.com/${translation.toLowerCase()}/${slug}/${reading.chapter}.htm`
}

function PassageReader({ reading, translation }: { reading: Readable; translation: Translation }) {
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
// Study — questions asked under the letter
// ---------------------------------------------------------------------------
function StudySection({ letter, pin, canTouch }: { letter: Guidance; pin: string | null; canTouch: boolean }) {
  const { askStudy, deleteStudy } = useActions()
  const confirm = useConfirm()
  const q = useStudy(letter, pin)
  const thread = useMemo(() => q.data ?? [], [q.data])
  const [text, setText] = useState('')
  /** The question being answered right now, shown in its place until the answer lands. */
  const [asking, setAsking] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const tail = useRef<HTMLDivElement>(null)
  const justAsked = useRef(false)
  // The letter's own starters until something has been asked; after that, where the last answer points.
  const suggestions = thread.length === 0 ? (letter.response.questions ?? []) : (thread[thread.length - 1]!.answer.followups ?? [])

  useEffect(() => {
    if (!justAsked.current) return
    justAsked.current = false
    tail.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [thread.length])

  const ask = async (question: string) => {
    const clean = question.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_CHARS)
    if (clean.length < 3 || asking) return
    setAsking(clean)
    setText('')
    try {
      await askStudy(letter, clean, pin ?? undefined)
      justAsked.current = true
    } catch {
      setText(clean) // toasted; the question goes back in the box to try again
    } finally { setAsking(null) }
  }
  const remove = async (s: Study) => {
    const ok = await confirm({ title: 'Remove this question?', description: 'The question and its answer go; the letter stays.', confirmLabel: 'Remove', danger: true })
    if (ok) void deleteStudy(letter, s, pin ?? undefined)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text) }

  return (
    <section className="border-t border-line px-5 py-5 sm:px-8 sm:py-6" aria-label="Study">
      <h3 className="text-[20px] text-ink">Study</h3>
      <p className="mt-1 text-[14px] text-ink-2">Ask about anything the letter raised — a verse, a person, a word, a place, what something meant then and now. The answers stay here with the letter.</p>

      {!canTouch ? (
        <p className="mt-3 text-[13px] text-ink-3">Unlock your hidden letters to read the study, or add to it.</p>
      ) : q.isPending ? (
        <div className="mt-4 space-y-2" aria-busy><div className="skeleton h-4 w-2/3 rounded-lg" /><div className="skeleton h-4 w-1/2 rounded-lg" /></div>
      ) : q.isError ? (
        <p className="mt-3 text-[13px] text-danger">{q.error instanceof Error ? q.error.message : 'The study could not be opened.'}</p>
      ) : (
        <>
          {(thread.length > 0 || asking) && (
            <div className="mt-4 space-y-3">
              {thread.map((s) => <StudyTurn key={s.id} study={s} translation={letter.translation} onRemove={() => void remove(s)} />)}
              {asking && (
                <div className="rounded-2xl border border-line bg-surface" role="status" aria-live="polite">
                  <p className="border-b border-line px-4 py-3 text-[15px] text-ink"><span className="text-ink-3">You asked: </span>{asking}</p>
                  <div className="space-y-2 px-4 py-4" aria-busy><div className="skeleton h-4 w-11/12 rounded-lg" /><div className="skeleton h-4 w-full rounded-lg" /><div className="skeleton h-4 w-2/3 rounded-lg" /></div>
                  <p className="px-4 pb-3 text-[13px] text-ink-3">Looking it up in the Scriptures…</p>
                </div>
              )}
              <div ref={tail} />
            </div>
          )}
          {suggestions.length > 0 && !asking && (
            <div className="mt-4 flex flex-wrap gap-2" aria-label={thread.length === 0 ? 'Questions to start with' : 'Questions you might ask next'}>
              {suggestions.map((sq) => (
                <button key={sq} type="button" onClick={() => void ask(sq)} className="inline-flex max-w-full items-start gap-1.5 rounded-2xl border border-line bg-surface px-3.5 py-2 text-left text-[14px] leading-snug text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
                  <span className="whitespace-normal">{sq}</span>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="mt-4">
            <Textarea
              ref={box}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_QUESTION_CHARS))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }}
              rows={2}
              maxLength={MAX_QUESTION_CHARS}
              placeholder="Ask about a verse, a person, a word…"
              aria-label="Your question"
              className="text-[15px]"
              disabled={Boolean(asking)}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-3">{thread.length > 0 ? 'Follow-up questions remember what was asked before.' : 'Enter sends; Shift+Enter for a new line.'}</span>
              <Button type="submit" size="sm" leading={<SendHorizontal className="size-4" />} disabled={text.trim().length < 3 || Boolean(asking)} loading={Boolean(asking)}>Ask</Button>
            </div>
          </form>
        </>
      )}
    </section>
  )
}

/** One question and its answer. References in the answer open in place, like the reading plan. */
function StudyTurn({ study: s, translation, onRemove }: { study: Study; translation: Translation; onRemove: () => void }) {
  const a = s.answer
  const [open, setOpen] = useState<Readable | null>(null)
  const toggle = (m: Readable) => setOpen((o) => (o && o.reference === m.reference ? null : m))
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-[15px] text-ink"><span className="text-ink-3">You asked: </span>{s.question}</p>
        <span className="flex shrink-0 items-center">
          <ShareButton text={`${s.question}\n\n${a.text}`} label="Share this answer" />
          <button type="button" onClick={onRemove} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-danger" aria-label="Remove this question"><X className="size-4" /></button>
        </span>
      </div>
      {a.safety.concern && <CareCard kind={a.safety.kind} className="mx-4 mt-4" />}
      <div className="font-letter px-4 py-4 text-[17px] leading-[1.7] text-ink">
        <AnswerText text={a.text} mentions={a.mentions ?? []} open={open} onOpen={toggle} />
        {open && !(a.readings ?? []).some((r) => r.reference === open.reference) && (
          <div className="mt-3 rounded-2xl border border-line bg-surface-2/50">
            <p className="flex items-center justify-between px-4 pt-3 font-sans text-[13px] font-semibold uppercase tracking-wider text-primary-text">{open.reference}<button type="button" onClick={() => setOpen(null)} className="text-ink-3 hover:text-ink" aria-label="Close the passage"><X className="size-4" /></button></p>
            <PassageReader reading={open} translation={translation} />
          </div>
        )}
        {a.passages.map((p, i) => <PassageCard key={`${p.reference}-${i}`} passage={p} translation={translation} />)}
        {(a.readings ?? []).length > 0 && (
          <div className="mt-4 font-sans">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-primary-text">Worth reading in full</p>
            <div className="mt-2 space-y-2">
              {a.readings.map((r, i) => <ReadingToggle key={`${r.reference}-${i}`} reading={r} translation={translation} open={open?.reference === r.reference} onToggle={() => toggle(r)} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The answer's paragraphs, with every reference the function found turned into something to tap. */
function AnswerText({ text, mentions, open, onOpen }: { text: string; mentions: StudyMention[]; open: { reference: string } | null; onOpen: (m: StudyMention) => void }) {
  const byText = useMemo(() => new Map(mentions.map((m) => [m.text, m])), [mentions])
  const rx = useMemo(() => (mentions.length ? new RegExp(`(${[...byText.keys()].sort((x, y) => y.length - x.length).map(escapeRx).join('|')})`, 'g') : null), [mentions.length, byText])
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className={cn(i > 0 && 'mt-3')}>
          {(rx ? p.split(rx) : [p]).map((piece, j) => {
            const m = byText.get(piece)
            if (!m) return <span key={j}>{piece}</span>
            return (
              <button key={j} type="button" onClick={() => onOpen(m)} aria-expanded={open?.reference === m.reference} className={cn('rounded-sm font-medium text-primary-text underline decoration-dotted underline-offset-4 hover:decoration-solid', open?.reference === m.reference && 'bg-primary-soft')}>
                {piece}
              </button>
            )
          })}
        </p>
      ))}
    </>
  )
}

function ReadingToggle({ reading, translation, open, onToggle }: { reading: PlanReading; translation: Translation; open: boolean; onToggle: () => void }) {
  const calm = useCalm()
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-ink">{reading.reference}</span>
          {reading.focus && <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{reading.focus}</span>}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
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

function CareCard({ kind, className }: { kind: SafetyKind; className?: string }) {
  const care = LINES[kind === 'none' ? 'other' : kind]
  return (
    <div className={cn('rounded-2xl border border-ochre/50 bg-ochre-soft px-5 py-4', className ?? 'mx-5 mt-5 sm:mx-8')} role="note">
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
