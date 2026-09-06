import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useEffect } from 'react'
import { CheckCircle2, Sparkles, Trophy, X, Zap } from 'lucide-react'
import { useUi } from '../../store/ui'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import { AchievementIcon } from '../game/AchievementIcon'
import { achievementDef } from '../../lib/xp'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[150] flex flex-col items-center gap-2 px-4 safe-top sm:top-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg',
              t.tone === 'danger' ? 'border-danger/30 bg-danger-soft text-ink' : t.tone === 'xp' ? 'border-gold/40 bg-gold-soft text-ink' : t.tone === 'success' ? 'border-sage/30 bg-sage-soft text-ink' : 'border-line bg-surface/95 text-ink',
            )}
            role="status"
          >
            <span className="mt-0.5 shrink-0 [&>svg]:size-4">
              {t.tone === 'xp' ? <Zap className="text-ochre-text" /> : t.tone === 'success' ? <CheckCircle2 className="text-sage-text" /> : t.tone === 'danger' ? <X className="text-danger" /> : <Sparkles className="text-ink-2" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-ink-2">{t.description}</p>}
            </div>
            {t.actionLabel && (
              <Button size="sm" variant="soft" onClick={() => { t.onAction?.(); dismiss(t.id) }}>{t.actionLabel}</Button>
            )}
            <button className="-mr-1 grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-black/5 hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** Floating "+25 XP" chips that drift up from the bottom of the screen. */
export function XpPops() {
  const pops = useUi((s) => s.xpPops)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[140] flex flex-col items-center gap-2 sm:bottom-10">
      <AnimatePresence>
        {pops.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 24, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            className="flex items-center gap-2 rounded-full border border-gold/50 bg-gold-soft px-4 py-2 text-sm font-semibold text-ink shadow-lg"
          >
            <span className="grid size-6 place-items-center rounded-full bg-gold text-ink"><Zap className="size-3.5" /></span>
            <span className="tabular">+{p.points} XP</span>
            <span className="font-normal text-ink-2">· {p.label}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function fireConfetti(kind: 'level_up' | 'achievement' | 'project_done') {
  const colors = ['#C4552B', '#D9A441', '#7A8F6E', '#4F7291', '#E7B3A0', '#F1E5D3']
  const base = { colors, disableForReducedMotion: true, zIndex: 200 }
  if (kind === 'project_done') {
    confetti({ ...base, particleCount: 140, spread: 80, startVelocity: 45, origin: { y: 0.7 } })
    setTimeout(() => confetti({ ...base, particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.8 } }), 250)
    setTimeout(() => confetti({ ...base, particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.8 } }), 400)
  } else if (kind === 'level_up') {
    confetti({ ...base, particleCount: 120, spread: 100, startVelocity: 40, origin: { y: 0.6 }, shapes: ['circle', 'square'] })
  } else {
    confetti({ ...base, particleCount: 60, spread: 70, startVelocity: 30, origin: { y: 0.65 }, scalar: 0.9 })
  }
}

export function Celebrations() {
  const list = useUi((s) => s.celebrations)
  const dismiss = useUi((s) => s.dismissCelebration)
  const current = list[0]

  useEffect(() => {
    if (current) fireConfetti(current.kind)
  }, [current])

  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => dismiss(current.id), 6500)
    return () => clearTimeout(t)
  }, [current, dismiss])

  const def = current?.achievementKey ? achievementDef(current.achievementKey) : undefined

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          className="fixed inset-0 z-[160] grid place-items-center bg-ink/55 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => dismiss(current.id)}
        >
          <motion.div
            initial={{ scale: 0.7, y: 30, opacity: 0, rotate: -3 }}
            animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.9, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="grain relative w-full max-w-sm overflow-hidden rounded-[32px] bg-surface p-8 text-center shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gold/25 blur-3xl" aria-hidden />
            <motion.div
              className="relative mx-auto grid size-24 place-items-center rounded-[28px] bg-gold-soft text-ochre-text shadow-md"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.15 }}
            >
              {def ? <AchievementIcon name={def.icon} className="size-11" /> : current.kind === 'level_up' ? <Sparkles className="size-11" /> : <Trophy className="size-11" />}
            </motion.div>
            <p className="relative mt-6 text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-3">
              {current.kind === 'level_up' ? 'Level up' : current.kind === 'achievement' ? 'Badge unlocked' : 'Quest complete'}
            </p>
            <h2 className="relative mt-2 text-[34px] leading-none text-ink">{current.title}</h2>
            {current.subtitle && <p className="relative mt-3 text-[15px] text-ink-2 text-balance">{current.subtitle}</p>}
            <Button className="relative mt-7 w-full" size="lg" onClick={() => dismiss(current.id)}>
              {current.kind === 'project_done' ? 'Onwards!' : 'Lovely'}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
