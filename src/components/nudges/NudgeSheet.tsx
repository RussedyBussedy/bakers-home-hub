import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { CheckCircle2, Hand, Info, MessageCircle, Send, Share2 } from 'lucide-react'
import type { NudgeKind, Project, Quote, Task } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { useUi } from '../../store/ui'
import { absoluteUrl, canWebShare, openExternal, webShare, whatsappLink } from '../../lib/share'
import { cn, homeTitle, money } from '../../lib/utils'
import { Avatar } from '../ui/Bits'
import { Button } from '../ui/Button'
import { Segmented, Textarea } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

export interface NudgeContext {
  project?: Project | null
  task?: Task | null
  quote?: Quote | null
  /** In-app path the nudge should open. Defaults to the project page. */
  link?: string | null
  kind?: NudgeKind
  message?: string
}

const useNudgeStore = create<{ ctx: NudgeContext | null; open: (c: NudgeContext) => void; close: () => void }>((set) => ({
  ctx: null,
  open: (c) => set({ ctx: c }),
  close: () => set({ ctx: null }),
}))

/** `const nudge = useNudge(); nudge({ project, task })` opens the nudge sheet from anywhere. */
export function useNudge() {
  return useNudgeStore((s) => s.open)
}

const KIND_LABEL: Record<NudgeKind, string> = { todo: 'Please do', done: 'Done', fyi: 'FYI' }

function suggestions(ctx: NudgeContext, kind: NudgeKind): string[] {
  if (ctx.task) {
    return { todo: ['Can you take this one?', 'Any chance you can do this today?', 'This one needs your hands'], done: ['Done and dusted', 'Ticked this off — next!'], fyi: ['Have a look at this task', 'Moved the due date on this'] }[kind]
  }
  if (ctx.quote) {
    return { todo: ['Can you chase them for a final price?', 'Please call them about this'], done: ['Accepted this quote', 'Paid this one'], fyi: ['What do you think of this quote?', 'This one looks like the best value', 'Feels pricey to me'] }[kind]
  }
  if (ctx.project) {
    return { todo: ['Need your say on this', 'Can you pick a colour?', 'Please add your photos'], done: ['Finished this one!', 'Big step done today'], fyi: ['Have a look at the board', 'Added some photos', 'Updated the budget'] }[kind]
  }
  return { todo: ['Can you sort this out?', 'Reminder for when you get a chance'], done: ['Sorted', 'Done — tick it off'], fyi: ['Just so you know', 'Have a look when you can'] }[kind]
}

function subjectLine(ctx: NudgeContext): string {
  if (ctx.task) return `“${ctx.task.title}”`
  if (ctx.quote) return `Quote “${ctx.quote.title || 'Quote'}” (${money(ctx.quote.amount)})`
  return ''
}

const WA_KEY = 'hub-nudge-wa'
const EMPTY: NudgeContext = {}

export function NudgeHost() {
  const ctx = useNudgeStore((s) => s.ctx)
  const close = useNudgeStore((s) => s.close)
  const { me, partner, household } = useAuth()
  const { sendNudge } = useActions()
  const toast = useUi((s) => s.toast)
  const [kind, setKind] = useState<NudgeKind>('fyi')
  const [text, setText] = useState('')
  const [wa, setWa] = useState(false)
  const [share, setShare] = useState(false)
  const [busy, setBusy] = useState(false)

  const open = Boolean(ctx)
  const c = ctx ?? EMPTY
  const link = c.link ?? (c.project ? `/projects/${c.project.id}` : '/')

  const applyChip = (s: string) => setText((t) => {
    const base = subjectLine(c)
    const prefix = base ? `${base} — ` : ''
    const bare = t.trim()
    if (!bare || bare === prefix.trim()) return `${prefix}${s}`
    return `${t.trimEnd()} ${s}`
  })

  useEffect(() => {
    if (!ctx) return
    setKind(ctx.kind ?? (ctx.task ? (ctx.task.done ? 'done' : 'todo') : 'fyi'))
    const subject = subjectLine(ctx)
    setText(ctx.message ?? (subject ? `${subject} — ` : ''))
    setShare(false)
    try { setWa(localStorage.getItem(WA_KEY) === '1') } catch { setWa(false) }
  }, [ctx])

  const chips = useMemo(() => suggestions(c, kind), [c, kind])
  const who = partner?.display_name ?? 'your partner'
  const canSend = text.trim().length > 0 && !busy

  const composed = () => {
    const from = me?.display_name ?? 'Someone'
    const where = c.project ? ` · ${c.project.title}` : household ? ` · ${homeTitle(household.name)}` : ''
    return `${KIND_LABEL[kind]} from ${from}${where}\n${text.trim()}\n${absoluteUrl(link)}`
  }

  const send = async () => {
    if (!canSend) return
    // External hand-offs first — they need to happen inside the tap, before any awaiting.
    if (wa) openExternal(whatsappLink(partner?.phone, composed()))
    else if (share) void webShare({ title: `${KIND_LABEL[kind]} from ${me?.display_name ?? 'Home Hub'}`, text: `${text.trim()}`, url: absoluteUrl(link) })
    setBusy(true)
    try {
      await sendNudge({ to_user: partner?.id ?? null, kind, message: text, project_id: c.project?.id ?? null, link })
      toast({ title: `Nudge sent to ${who}`, description: partner ? 'They’ll see it on their Hub the moment they open the app.' : undefined, tone: 'success' })
      close()
    } catch { /* toast shown by actions */ } finally { setBusy(false) }
  }

  const toggleWa = () => { const v = !wa; setWa(v); if (v) setShare(false); try { localStorage.setItem(WA_KEY, v ? '1' : '0') } catch { /* ignore */ } }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) close() }} size="sm"
      title={<span className="inline-flex items-center gap-2.5">{partner && <Avatar name={partner.display_name} color={partner.color} size="sm" />} Nudge {partner?.display_name ?? ''}</span>}
      description={c.project ? c.project.title : 'A quick note that lands on the Hub'}
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={send} loading={busy} disabled={!canSend} leading={wa ? <MessageCircle className="size-4" /> : share ? <Share2 className="size-4" /> : <Send className="size-4" />}>{wa ? 'Send + WhatsApp' : share ? 'Send + share' : 'Send nudge'}</Button></>}
    >
      <div className="flex flex-col gap-4 pt-1">
        <Segmented<NudgeKind> value={kind} onChange={setKind} className="w-full [&>button]:flex-1" options={[
          { value: 'todo', label: <span className="inline-flex items-center gap-1.5"><Hand className="size-4" /> Please do</span> },
          { value: 'done', label: <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4" /> Done</span> },
          { value: 'fyi', label: <span className="inline-flex items-center gap-1.5"><Info className="size-4" /> FYI</span> },
        ]} />
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus placeholder={kind === 'todo' ? `What should ${who} do?` : kind === 'done' ? 'What got done?' : 'What should they know?'} aria-label="Message" />
        <div className="-mt-1 flex flex-wrap gap-1.5">
          {chips.map((s) => (
            <button key={s} type="button" onClick={() => applyChip(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
              {s}
            </button>
          ))}
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Deliver</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-soft px-3.5 text-sm font-medium text-primary-text"><Send className="size-4" /> In the app</span>
            <button type="button" onClick={toggleWa} aria-pressed={wa} className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors', wa ? 'border-sage bg-sage-soft text-sage-text' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink')}>
              <MessageCircle className="size-4" /> WhatsApp
            </button>
            {canWebShare() && (
              <button type="button" onClick={() => { const v = !share; setShare(v); if (v) setWa(false) }} aria-pressed={share} className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors', share ? 'border-sky bg-sky-soft text-sky-text' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink')}>
                <Share2 className="size-4" /> Share…
              </button>
            )}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            {wa
              ? partner?.phone ? `Opens WhatsApp to ${partner.display_name} with the note and a link.` : `Opens WhatsApp with the note — pick ${who} from your chats. Add their number in Settings to skip that step.`
              : share ? 'Opens your phone’s share sheet with the note and a link.' : `Shows on ${who}’s Hub with a badge, and pops up if they’re in the app.`}
          </p>
        </div>
      </div>
    </Sheet>
  )
}
