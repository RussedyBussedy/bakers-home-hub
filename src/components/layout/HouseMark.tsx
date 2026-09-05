import { cn } from '../../lib/utils'

/** The Hub mark — a little house with a warm window, drawn in the brand palette. */
export function HouseMark({ className, mono }: { className?: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id="hm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mono ? 'currentColor' : '#C4552B'} />
          <stop offset="1" stopColor={mono ? 'currentColor' : '#A8441F'} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#hm-bg)" />
      <path d="M32 15 L50 30 V47 a3 3 0 0 1 -3 3 H17 a3 3 0 0 1 -3 -3 V30 Z" fill="#F6F1E9" />
      <path d="M12.5 31.5 L32 15 L51.5 31.5" fill="none" stroke="#F6F1E9" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="27" y="35" width="10" height="15" rx="2" fill="#D9A441" />
      <circle cx="41" cy="37" r="3" fill="#7A8F6E" />
    </svg>
  )
}
