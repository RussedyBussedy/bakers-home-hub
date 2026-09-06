import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../data/session'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { homeTitle } from '../../lib/utils'

/**
 * Registering, used both for "start your own home" on the login screen and for accepting an
 * invite. The invite code rides along with the signup; the database decides which home they
 * land in, so nothing here can put somebody somewhere they weren't invited.
 */
export function RegisterForm({ inviteCode, joining, onDone }: { inviteCode?: string | null; joining?: string; onDone?: () => void }) {
  const { signUp } = useAuth()
  const [name, setName] = useState('')
  const [home, setHome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { setError('Pick a password of at least six characters.'); return }
    setBusy(true); setError(null)
    const res = await signUp({ email: email.trim(), password, displayName: name.trim(), householdName: joining ? null : home.trim(), inviteCode })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    if (res.needsConfirmation) setCheck(true)
    else onDone?.()
  }

  if (check) {
    return (
      <div className="rounded-2xl border border-sage/40 bg-sage-soft p-5">
        <h3 className="text-xl text-ink">Check your email</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          We've sent a link to <b className="text-ink">{email.trim()}</b>. Follow it to finish setting up your account
          {joining ? <> and join <b className="text-ink">{joining}</b></> : null}, then come back and sign in.
        </p>
        <p className="mt-3 text-[13px] text-ink-3">Nothing arrived? Give it a minute and check the junk folder.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Your name" hint="What the others in the home will see.">
        {(id) => <Input id={id} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Russel" />}
      </Field>
      {!joining && (
        <Field label="What's your home called" hint={`It shows across the app as "${homeTitle(home.trim() || 'The Bakers')}". You can change it later.`}>
          {(id) => <Input id={id} value={home} onChange={(e) => setHome(e.target.value)} placeholder="The Bakers" maxLength={60} />}
        </Field>
      )}
      <Field label="Email">
        {(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
      </Field>
      <Field label="Password" hint="Six characters or more.">
        {(id) => (
          <div className="relative">
            <Input id={id} type={show ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        )}
      </Field>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" loading={busy} trailing={<ArrowRight className="size-4" />}>
        {joining ? `Join ${joining}` : 'Create my home'}
      </Button>
    </form>
  )
}
