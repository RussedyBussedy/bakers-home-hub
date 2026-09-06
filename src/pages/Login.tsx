import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react'
import { RegisterForm } from '../components/auth/RegisterForm'
import { useAuth, useDb } from '../data/session'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'
import { HouseMark } from '../components/layout/HouseMark'
import { roomScene, SCENES } from '../lib/demoImages'
import { useUi } from '../store/ui'

export default function LoginPage() {
  const { signIn } = useAuth()
  const { db, isDemo, canUseSupabase, enterDemo, leaveDemo } = useDb()
  const toast = useUi((s) => s.toast)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'in' | 'up'>('in')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn(email.trim(), password)
    setBusy(false)
    if (res.error) setError(res.error)
  }

  const reset = async () => {
    if (!email.trim()) { setError('Type your email first, then tap “Forgot password”.'); return }
    const res = await db.resetPassword(email.trim())
    if (res.error) setError(res.error)
    else toast({ title: 'Reset email sent', description: 'Check your inbox for a link to set a new password.', tone: 'success' })
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Illustrated panel */}
      <div className="grain relative flex min-h-[38dvh] flex-col justify-between overflow-hidden bg-[#1E1A16] p-6 text-[#F6F1E9] sm:p-10 lg:min-h-dvh">
        <img src={roomScene({ ...SCENES.lounge!, wall: '#E9D9C3', wall2: '#C9AE8E', floor: '#7A5A3A', accent: '#B5563A', light: '#F3D9A4' })} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1E1A16] via-[#1E1A16]/70 to-[#1E1A16]/10" aria-hidden />
        <motion.div className="relative flex items-center gap-3" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <HouseMark className="size-11" />
          <span className="font-display text-xl">Home Hub</span>
        </motion.div>
        <motion.div className="relative" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <h1 className="max-w-md text-[40px] leading-[1.02] text-[#F6F1E9] sm:text-[56px]">
            Every project, quote and daydream — <span className="italic text-[#E7B3A0]">in one place.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] text-[#F6F1E9]/75">Plan the house together, pin your inspiration, track the real costs, and earn a little glory along the way.</p>
        </motion.div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-10 sm:px-10">
        <motion.div className="w-full max-w-sm" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          {isDemo ? (
            <>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-3">Demo mode</p>
              <h2 className="mt-2 text-[30px]">Who's home?</h2>
              <p className="mt-2 text-sm text-ink-2">
                {canUseSupabase ? 'You’re exploring with sample data — nothing here is saved to your real hub.' : 'No backend is configured yet, so the hub runs on sample data stored in this browser.'}
              </p>
              <div className="mt-6 grid gap-3">
                {[{ name: 'Russel', email: 'russel', color: '#B84D24' }, { name: 'Kay', email: 'kay', color: '#7F5A9E' }].map((p) => (
                  <button key={p.name} onClick={() => signIn(p.email, '')} className="card card-hover flex items-center gap-4 p-4 text-left">
                    <span className="grid size-12 place-items-center rounded-full text-lg font-semibold text-[#fffdfa]" style={{ background: p.color }}>{p.name[0]}</span>
                    <span className="flex-1">
                      <span className="block font-medium text-ink">Continue as {p.name}</span>
                      <span className="block text-sm text-ink-3">Open the hub with sample projects</span>
                    </span>
                    <ArrowRight className="size-5 text-ink-3" />
                  </button>
                ))}
              </div>
              {canUseSupabase && (
                <button onClick={leaveDemo} className="mt-6 text-sm font-medium text-primary-text underline-offset-4 hover:underline">← Back to real sign-in</button>
              )}
            </>
          ) : (
            mode === 'up' ? (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-3">New here</p>
                  <h2 className="mt-2 text-[30px]">Start your home</h2>
                  <p className="mt-2 text-sm text-ink-2">You'll get a home of your own, and can invite whoever you live with once you're in.</p>
                </div>
                <RegisterForm />
                <button type="button" onClick={() => { setMode('in'); setError(null) }} className="mx-auto mt-1 text-sm text-ink-3 hover:text-ink">
                  Already have an account? <span className="font-medium text-primary-text">Sign in</span>
                </button>
              </div>
            ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-3">Welcome back</p>
                <h2 className="mt-2 text-[30px]">Sign in to the hub</h2>
              </div>
              <Field label="Email">
                {(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
              </Field>
              <Field label="Password" trailing={<button type="button" onClick={reset} className="text-[13px] font-medium text-primary-text hover:underline">Forgot password?</button>}>
                {(id) => (
                  <div className="relative">
                    <Input id={id} type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pr-12" />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                )}
              </Field>
              {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" size="lg" loading={busy} trailing={<ArrowRight className="size-4" />}>Sign in</Button>
              <button type="button" onClick={() => { setMode('up'); setError(null) }} className="mx-auto text-sm text-ink-3 hover:text-ink">
                No account yet? <span className="font-medium text-primary-text">Start your home</span>
              </button>
              <button type="button" onClick={enterDemo} className="mx-auto inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
                <Sparkles className="size-3.5" /> Explore the demo instead
              </button>
            </form>
            )
          )}
        </motion.div>
      </div>
    </div>
  )
}
