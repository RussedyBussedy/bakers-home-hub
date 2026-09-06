import { Outlet, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useInbox, useRealtimeSync } from '../../data/hooks'
import { Binder } from './Binder'
import { useUi } from '../../store/ui'

const BASE_TITLE = typeof document !== 'undefined' && document.title ? document.title : 'Home Hub'

export function AppShell() {
  useRealtimeSync()
  const { unread } = useInbox()
  const unreadCount = unread.length

  // Unread nudges show in the tab title and, when installed, on the app icon.
  useEffect(() => {
    document.title = unreadCount ? `(${unreadCount}) ${BASE_TITLE}` : BASE_TITLE
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    try {
      if (unreadCount) void nav.setAppBadge?.(unreadCount)?.catch(() => {})
      else void nav.clearAppBadge?.()?.catch(() => {})
    } catch { /* not supported */ }
  }, [unreadCount])

  // The binder fills the viewport and the page scrolls inside it; the document itself must not (see index.css).
  useEffect(() => {
    document.documentElement.classList.add('in-shell')
    return () => document.documentElement.classList.remove('in-shell')
  }, [])

  // Fetch the lazy pages while the person is reading, so tapping Insights or a board never waits on a download.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    const preload = () => { void import('../../pages/Insights'); void import('../../pages/Board') }
    if (w.requestIdleCallback) w.requestIdleCallback(preload)
    else window.setTimeout(preload, 1200)
  }, [])

  return (
    <Binder badges={{ hub: unreadCount }}>
      <Outlet />
    </Binder>
  )
}

/** Page wrapper: consistent gutters, max width and an entrance animation. */
export function Page({ children, className, wide, title, back, actions }: { children: ReactNode; className?: string; wide?: boolean; title?: ReactNode; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate()
  // With page turns on, the page arrives on a sheet of paper and needs no entrance of its own.
  const flips = useUi((s) => s.pageFlip && !s.reduceMotion)
  return (
    <motion.div
      className={cn('mx-auto w-full px-4 pt-4 sm:px-6 lg:px-10 lg:pt-7', wide ? 'max-w-[1400px]' : 'max-w-6xl', className)}
      // Start visible and settle, rather than flashing blank and fading in — a blink reads as flicker on a fast desktop.
      initial={flips ? false : { opacity: 0.4, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {(title || back || actions) && (
        <div className="mb-5 flex items-center gap-2">
          {back && (
            <button onClick={() => navigate(-1)} className="-ml-2 grid size-10 place-items-center rounded-xl text-ink-2 hover:bg-surface-2" aria-label="Back">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          {title && <h1 className="min-w-0 flex-1 truncate text-[28px] sm:text-[32px]">{title}</h1>}
          {actions}
        </div>
      )}
      {children}
    </motion.div>
  )
}
