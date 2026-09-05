import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

export function Checkbox({ checked, onChange, label, className, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string; size?: 'md' | 'lg' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!checked) }}
      className={cn(
        'grid shrink-0 place-items-center rounded-lg border-2 transition-colors duration-200',
        size === 'lg' ? 'size-7' : 'size-6',
        checked ? 'border-sage bg-sage' : 'border-line-strong bg-surface hover:border-sage',
        className,
      )}
    >
      <motion.svg viewBox="0 0 24 24" className={cn('text-on-dark', size === 'lg' ? 'size-4.5' : 'size-4')} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={false} animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 24 }}>
        <motion.path d="M5 13l4 4L19 7" initial={false} animate={{ pathLength: checked ? 1 : 0 }} transition={{ duration: 0.25 }} />
      </motion.svg>
    </button>
  )
}
