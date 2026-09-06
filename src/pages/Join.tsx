import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, TriangleAlert } from 'lucide-react'
import type { InvitePreview } from '../data/types'
import { useAuth, useDb } from '../data/session'
import { RegisterForm } from '../components/auth/RegisterForm'
import { HouseMark } from '../components/layout/HouseMark'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Bits'
import { roomScene, SCENES } from '../lib/demoImages'
import { useCalm } from '../store/ui'
import { cn } from '../lib/utils'

const DEAD: Record<InvitePreview['state'], string> = {
  live: '',
  used: 'Somebody has already used this invite.',
  cancelled: 'This invite was cancelled.',
  expired: 'This invite has run out — they only last a week.',
}

/** /join/:code — what somebody sees when they tap the link out of WhatsApp. */
export default function JoinPage() {
  const { code = '' } = useParams()
  const { db } = useDb()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const calm = useCalm()
  const [preview, setPreview] = useState<InvitePreview | null | 'missing'>(null)

  useEffect(() => {
    let alive = true
    db.previewInvite(code)
      .then((p) => { if (alive) setPreview(p ?? 'missing') })
      .catch(() => { if (alive) setPreview('missing') })
    return () => { alive = false }
  }, [db, code])

  // Already signed in: an invite is only ever redeemed when an account is made, so there is
  // nothing to do here but say so.
  if (userId) {
    return (
      <Shell>
        <h2 className="text-[30px]">You're already signed in</h2>
        <p className="mt-2 text-[15px] text-ink-2">
          An invite can only be used when you make a new account. If you want to join this home instead of your own,
          leave yours first in Settings — everything in it stays with the home.
        </p>
        <Button className="mt-5" onClick={() => navigate('/')}>Back to the hub</Button>
      </Shell>
    )
  }

  if (preview === null) {
    return <Shell><Skeleton className="h-8 w-3/4" /><Skeleton className="mt-3 h-5 w-1/2" /><Skeleton className="mt-6 h-11 w-full" /></Shell>
  }

  if (preview === 'missing' || preview.state !== 'live') {
    const why = preview === 'missing' ? "We don't recognise that link. Check you copied the whole thing." : DEAD[preview.state]
    return (
      <Shell>
        <span className="grid size-12 place-items-center rounded-2xl bg-ochre-soft text-ochre-text"><TriangleAlert className="size-6" /></span>
        <h2 className="mt-4 text-[30px]">This invite won't work</h2>
        <p className="mt-2 text-[15px] text-ink-2">
          {why}
        </p>
        <p className="mt-2 text-[15px] text-ink-2">Ask them to send you a fresh one.</p>
        <Link to="/login" className="mt-5 inline-block"><Button variant="secondary">Go to sign in</Button></Link>
      </Shell>
    )
  }

  return (
    <Shell>
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-text"><Home className="size-6" /></span>
      <motion.div initial={calm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {preview.invited_name && <p className="mt-4 text-[15px] text-ink-2">Hi {preview.invited_name} —</p>}
        <h2 className={cn('text-[30px] leading-tight', preview.invited_name ? 'mt-1' : 'mt-4')}>
          {preview.invited_by} invited you to join<br /><span className="italic text-primary-text">{preview.household_name}</span>
        </h2>
        <p className="mt-2 text-[15px] text-ink-2">
          Make yourself an account and you'll land straight in their home — the projects, quotes and boards
          are all shared from there.
        </p>
      </motion.div>
      <div className="mt-6">
        <RegisterForm inviteCode={code} joining={preview.household_name} onDone={() => navigate('/')} />
      </div>
      <p className="mt-5 text-[13px] text-ink-3">
        Already have an account? <Link to="/login" className="font-medium text-primary-text hover:underline">Sign in</Link> — an invite only works on a new one.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <div className="grain relative hidden flex-col justify-between overflow-hidden bg-[#1E1A16] p-10 text-[#F6F1E9] lg:flex">
        <img src={roomScene({ ...SCENES.lounge!, wall: '#E9D9C3', wall2: '#C9AE8E', floor: '#7A5A3A', accent: '#B5563A', light: '#F3D9A4' })} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1E1A16] via-[#1E1A16]/70 to-[#1E1A16]/10" aria-hidden />
        <div className="relative flex items-center gap-3"><HouseMark className="size-11" /><span className="font-display text-xl">Home Hub</span></div>
        <p className="relative max-w-sm text-[15px] text-[#F6F1E9]/75">Projects, quotes, prices and inspiration — kept together, for everyone who lives there.</p>
      </div>
      <div className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden"><HouseMark className="size-9" /><span className="font-display text-lg text-ink">Home Hub</span></div>
          {children}
        </div>
      </div>
    </div>
  )
}
