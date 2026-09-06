import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { PROJECT_STATUSES, type ProjectStatus, type Tone } from '../../data/types'
import { cn, initials, money, num } from '../../lib/utils'
import { textOn } from '../../lib/colors'
import { useCalm, useUi } from '../../store/ui'

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export function Avatar({ name, color, size = 'md', className, ring }: { name: string; color: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string; ring?: boolean }) {
  const dims = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-20 text-2xl' }[size]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide select-none', dims, ring && 'ring-2 ring-surface', className)}
      style={{ background: color, color: textOn(color) }}
      aria-label={name}
      title={name}
    >
      {initials(name)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Pills
// ---------------------------------------------------------------------------
const toneClass: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-text',
  sage: 'bg-sage-soft text-sage-text',
  ochre: 'bg-ochre-soft text-ochre-text',
  sky: 'bg-sky-soft text-sky-text',
  plum: 'bg-plum-soft text-plum-text',
  gold: 'bg-gold-soft text-ochre-text',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-3 text-ink-2',
}

export function Pill({ tone = 'neutral', children, className, dot, size = 'md' }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap', size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs', toneClass[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  )
}

export function StatusPill({ status, size }: { status: ProjectStatus; size?: 'sm' | 'md' }) {
  const s = PROJECT_STATUSES.find((x) => x.value === status)!
  return <Pill tone={s.tone} dot size={size}>{s.label}</Pill>
}

// ---------------------------------------------------------------------------
// Progress ring (draws in)
// ---------------------------------------------------------------------------
export function ProgressRing({
  value, size = 64, stroke = 7, color = 'var(--primary)', track = 'var(--surface-3)', children, className, delay = 0,
}: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; className?: string; delay?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  const reduce = useUi((s) => s.reduceMotion)
  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - v) : c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  )
}

export function ProgressBar({ value, color = 'var(--primary)', className, height = 8, delay = 0 }: { value: number; color?: string; className?: string; height?: number; delay?: number }) {
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-surface-3', className)} style={{ height }} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay }} />
    </div>
  )
}

/** A bar that can overflow its budget: shows the over-run in a second colour. */
export function BudgetBar({ budget, real, className, height = 10 }: { budget: number; real: number; className?: string; height?: number }) {
  const max = Math.max(budget, real, 1)
  const budgetW = budget / max
  const realW = Math.min(real, budget) / max
  const overW = Math.max(0, real - budget) / max
  return (
    <div className={cn('relative w-full overflow-hidden rounded-full bg-surface-3', className)} style={{ height }} aria-hidden>
      <motion.div className="absolute inset-y-0 left-0 rounded-full bg-line-strong/60" initial={{ width: 0 }} animate={{ width: `${budgetW * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
      <motion.div className="absolute inset-y-0 left-0 rounded-full bg-sage" initial={{ width: 0 }} animate={{ width: `${realW * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }} />
      {overW > 0 && (
        <motion.div className="absolute inset-y-0 rounded-r-full bg-danger" style={{ left: `${realW * 100}%` }} initial={{ width: 0 }} animate={{ width: `${overW * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------
const SESSION_START = typeof performance !== 'undefined' ? performance.now() : 0
/** Numbers count up on the first screen of a session; after that they appear settled and only animate when they change. */
export function CountUp({ value, format = (n) => num(n), className, duration = 0.9 }: { value: number; format?: (n: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useUi((s) => s.reduceMotion)
  const settled = useRef(reduce || performance.now() - SESSION_START > 6000)
  const mv = useMotionValue(settled.current ? value : 0)
  const text = useTransform(mv, (v) => format(v))
  useEffect(() => {
    if (reduce) { mv.set(value); return }
    const ctrl = animate(mv, value, { duration: settled.current ? 0.5 : duration, ease: [0.16, 1, 0.3, 1] })
    return () => ctrl.stop()
  }, [value, mv, duration, reduce])
  useEffect(() => text.on('change', (t) => { if (ref.current) ref.current.textContent = t }), [text])
  return <span ref={ref} className={className}>{format(settled.current ? value : 0)}</span>
}

export function Money({ value, className, compact }: { value: number; className?: string; compact?: boolean }) {
  return <CountUp value={value} format={(n) => money(n, { compact })} className={className} />
}

// ---------------------------------------------------------------------------
// Empty state, skeleton, section header
// ---------------------------------------------------------------------------
export function EmptyState({ icon, title, description, action, className, compact }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-8 px-4' : 'gap-3 py-14 px-6', className)}>
      {icon && <div className="grid size-14 place-items-center rounded-3xl bg-surface-2 text-ink-2 [&>svg]:size-6">{icon}</div>}
      <p className="font-display text-xl text-ink">{title}</p>
      {description && <p className="max-w-xs text-sm text-ink-2 text-balance">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('skeleton', className)} style={style} aria-hidden />
}

export function SectionTitle({ children, action, className, sub }: { children: ReactNode; action?: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[22px] leading-tight text-ink sm:text-2xl">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Stat({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <div className="mt-1.5 font-display-tight text-2xl text-ink sm:text-[28px]">{children}</div>
      {hint && <p className="mt-1 text-[13px] text-ink-2">{hint}</p>}
    </div>
  )
}

/** Fade + rise in, staggered by index. */
export function Reveal({ children, index = 0, className, as = 'div' }: { children: ReactNode; index?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const Comp = motion[as]
  const calm = useCalm()
  return (
    <Comp
      className={className}
      initial={calm ? false : { opacity: 0.3, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 12) * 0.025 }}
    >
      {children}
    </Comp>
  )
}
