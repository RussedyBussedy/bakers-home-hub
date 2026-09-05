import { motion } from 'framer-motion'
import { HouseMark } from './HouseMark'
import { Button } from '../ui/Button'
import { useDb } from '../../data/session'

export function Splash({ error }: { error?: string }) {
  const { db, isDemo, leaveDemo } = useDb()
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <motion.div animate={error ? {} : { y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>
          <HouseMark className="size-16" />
        </motion.div>
        {error ? (
          <>
            <p className="font-display text-2xl text-ink">Hmm, we couldn't load your home.</p>
            <p className="max-w-sm text-sm text-ink-2">{error}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>
              <Button variant="ghost" onClick={() => db.signOut()}>Sign out</Button>
              {isDemo && <Button variant="ghost" onClick={leaveDemo}>Leave demo</Button>}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-3">Opening the hub…</p>
        )}
      </div>
    </div>
  )
}
