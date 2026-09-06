import { useEffect, useState } from 'react'
import { Check, KeyRound, LogOut, Minus, Monitor, Moon, RotateCcw, Smartphone, Sparkles, Sun } from 'lucide-react'
import { Page } from '../components/layout/AppShell'
import { useAuth, useDb } from '../data/session'
import { useUi, type Theme } from '../store/ui'
import { cn } from '../lib/utils'
import { textOn } from '../lib/colors'
import { normalisePhone, prettyPhone } from '../lib/share'
import { Avatar } from '../components/ui/Bits'
import { Button } from '../components/ui/Button'
import { Field, Input, Segmented } from '../components/ui/Field'
import { LeaveHome, People } from '../components/settings/People'
import type { Motion as MotionPref } from '../store/ui'
import { useConfirm, usePrompt } from '../components/ui/Sheet'
import { useQueryClient } from '@tanstack/react-query'
import { resetDemo } from '../data/demoDb'
import { ACCENTS } from '../components/project/ProjectForm'

const COLORS = ['#B84D24', '#7F5A9E', '#4F7291', '#5C7C5A', '#D19A2C', '#2F7F97', '#C9748F', '#8B6D4B']

export default function SettingsPage() {
  const { me, signOut } = useAuth()
  const { db, isDemo, canUseSupabase, leaveDemo } = useDb()
  const theme = useUi((s) => s.theme)
  const motion = useUi((s) => s.motion)
  const setMotion = useUi((s) => s.setMotion)
  const setTheme = useUi((s) => s.setTheme)
  const toast = useUi((s) => s.toast)
  const confirm = useConfirm()
  const prompt = usePrompt()
  const qc = useQueryClient()
  const [name, setName] = useState(me?.display_name ?? '')
  const [color, setColor] = useState(me?.color ?? COLORS[0]!)
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [installHint, setInstallHint] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const recovery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('recovery') === '1'

  useEffect(() => { if (me) { setName(me.display_name); setColor(me.color); setPhone(me.phone ?? '') } }, [me])
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
    setInstallHint(!standalone)
  }, [])

  const save = async () => {
    if (!me || !name.trim()) return
    setBusy(true)
    try {
      await db.updateProfile(me.id, { display_name: name.trim(), color, phone: normalisePhone(phone) })
      await qc.invalidateQueries({ queryKey: ['bundle'] })
      toast({ title: 'Saved', tone: 'success' })
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : '', tone: 'danger' })
    } finally { setBusy(false) }
  }

  const editMember = async (id: string, field: 'display_name' | 'phone', current: string) => {
    const value = await prompt(field === 'display_name'
      ? { title: 'Their name', description: 'How it shows across the app.', label: 'Display name', initial: current, confirmLabel: 'Save' }
      : { title: 'Their WhatsApp number', description: 'Lets the Nudge button open WhatsApp straight to them.', label: 'Number', placeholder: '082 555 0141', initial: prettyPhone(current) || current, confirmLabel: 'Save' })
    if (value === null) return
    if (field === 'display_name' && !value.trim()) return
    try {
      await db.updateProfile(id, field === 'display_name' ? { display_name: value.trim() } : { phone: normalisePhone(value) })
      await qc.invalidateQueries({ queryKey: ['bundle'] })
      toast({ title: 'Saved', tone: 'success' })
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : '', tone: 'danger' })
    }
  }
  const dirty = name.trim() !== me?.display_name || color !== me?.color || normalisePhone(phone) !== (me?.phone ?? '')

  return (
    <Page title="Settings" className="max-w-3xl">
      <div className="flex flex-col gap-5">
        <section className="card p-5">
          <h2 className="text-xl">You</h2>
          <div className="mt-4 flex items-center gap-4">
            <Avatar name={name || '?'} color={color} size="xl" />
            <div className="flex-1">
              <Field label="Display name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            </div>
          </div>
          <div className="mt-4">
            <Field label="WhatsApp number" hint="So a nudge can open WhatsApp straight to you. Kept between the two of you.">
              {(id) => <Input id={id} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 555 0141" />}
            </Field>
          </div>
          <p className="mt-4 mb-2 text-[13px] font-medium text-ink-2">Your colour</p>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...COLORS, ...ACCENTS])].slice(0, 12).map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c} className={cn('grid size-10 place-items-center rounded-full transition-transform hover:scale-110', color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')} style={{ background: c }}>
                {color === c && <Check className="size-4" style={{ color: textOn(c) }} />}
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-end"><Button onClick={save} loading={busy} disabled={!name.trim() || !dirty}>Save</Button></div>
        </section>

        <People onEditMember={editMember} />

        <section className="card p-5">
          <h2 className="text-xl">Appearance</h2>
          <div className="mt-3">
            <Segmented<Theme> value={theme} onChange={setTheme} options={[
              { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="size-4" /> Light</span> },
              { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="size-4" /> Dark</span> },
              { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-4" /> Auto</span> },
            ]} />
          </div>
          <div className="mt-5">
            <p className="text-[13px] font-medium text-ink-2">Movement</p>
            <div className="mt-2">
              <Segmented<MotionPref> value={motion} onChange={setMotion} options={[
                { value: 'full', label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-4" /> Full</span> },
                { value: 'calm', label: <span className="inline-flex items-center gap-1.5"><Minus className="size-4" /> Calm</span> },
              ]} />
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Calm switches off the fades and slides. Worth trying if pages look like they flicker on your Mac — and it's what the app uses anyway when your device asks for reduced motion.</p>
          </div>
        </section>

        {installHint && (
          <section className="card flex items-start gap-4 p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-soft text-sky-text"><Smartphone className="size-5" /></span>
            <div>
              <h2 className="text-xl">Put it on your home screen</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">On iPhone: open this page in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. On Android: Chrome menu → <b>Install app</b>. It then opens full-screen like a real app.</p>
            </div>
          </section>
        )}

        {!isDemo && (
          <section className={cn('card p-5', recovery && 'ring-2 ring-primary')}>
            <h2 className="text-xl">{recovery ? 'Set a new password' : 'Change password'}</h2>
            {recovery && <p className="mt-1 text-[13px] text-ink-2">You arrived from a reset link — choose a new password below.</p>}
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
              e.preventDefault()
              if (pw.length < 8) { toast({ title: 'Use at least 8 characters', tone: 'danger' }); return }
              if (pw !== pw2) { toast({ title: "Passwords don't match", tone: 'danger' }); return }
              setPwBusy(true)
              const res = await db.updatePassword(pw)
              setPwBusy(false)
              if (res.error) toast({ title: "Couldn't change password", description: res.error, tone: 'danger' })
              else { toast({ title: 'Password updated', tone: 'success' }); setPw(''); setPw2('') }
            }}>
              <Field label="New password">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
              <Field label="Repeat it">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
              <div className="sm:col-span-2 flex justify-end"><Button type="submit" variant="secondary" leading={<KeyRound className="size-4" />} loading={pwBusy} disabled={!pw}>Update password</Button></div>
            </form>
          </section>
        )}

        <section className="card p-5">
          <h2 className="text-xl">Account</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" leading={<LogOut className="size-4" />} onClick={async () => { if (await confirm({ title: 'Sign out?', confirmLabel: 'Sign out' })) signOut() }}>Sign out</Button>
            {isDemo && (
              <>
                <Button variant="ghost" leading={<RotateCcw className="size-4" />} onClick={async () => { if (await confirm({ title: 'Reset the demo data?', description: 'Everything goes back to the sample projects.', confirmLabel: 'Reset' })) { resetDemo(); window.location.reload() } }}>Reset demo data</Button>
                {canUseSupabase && <Button variant="ghost" onClick={leaveDemo}>Leave demo mode</Button>}
              </>
            )}
          </div>
          {!isDemo && <div className="mt-4 border-t border-line pt-4"><LeaveHome /></div>}
          <p className="mt-4 text-[12px] text-ink-3">{isDemo ? 'Demo mode — data lives only in this browser.' : 'Synced live with Supabase.'} · Home Hub v1.2</p>
        </section>
      </div>
    </Page>
  )
}
