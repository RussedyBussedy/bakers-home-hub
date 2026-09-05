import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart3, Compass, Home, Plus, Settings, Trophy, Users, Zap, Flame } from 'lucide-react'
import { Suspense, useEffect, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../data/session'
import { useInbox, useLevel, useRealtimeSync, useXp } from '../../data/hooks'
import { weeklyStreak } from '../../lib/xp'
import { Avatar } from '../ui/Bits'
import { Tooltip } from '../ui/Menu'
import { HouseMark } from './HouseMark'

const NAV = [
  { to: '/', label: 'Hub', icon: Home, end: true },
  { to: '/projects', label: 'Projects', icon: Compass },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/rewards', label: 'Rewards', icon: Trophy },
]

const BASE_TITLE = typeof document !== 'undefined' && document.title ? document.title : 'Home Hub'

export function AppShell() {
  useRealtimeSync()
  const { me, household } = useAuth()
  const level = useLevel()
  const { data: xp } = useXp()
  const { unread } = useInbox()
  const streak = weeklyStreak(xp ?? [])
  const navigate = useNavigate()
  const location = useLocation()
  // The floating button starts a new project, so it only belongs where projects are the subject.
  const hideFab = !(location.pathname === '/' || location.pathname === '/projects')
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

  const badge = (n: typeof NAV[number]) => (n.to === '/' && unreadCount > 0 ? unreadCount : 0)

  // Reserve the desktop scrollbar's space while the shell is up (see `html.in-shell` in index.css).
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
    <div className="min-h-dvh bg-bg">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface/70 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-6 pt-7 pb-5">
          <HouseMark className="size-10" />
          <div className="min-w-0">
            <p className="font-display text-[19px] leading-tight text-ink">{household?.name ?? 'Home'} Hub</p>
            <p className="truncate text-xs text-ink-3">Level {level.level} · {level.title}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-medium transition-colors',
                  isActive ? 'text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-primary-soft" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                  <n.icon className={cn('relative size-5', isActive ? 'text-primary-text' : 'text-ink-3 group-hover:text-ink-2')} />
                  <span className="relative flex-1">{n.label}</span>
                  {badge(n) > 0 && <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-on-primary tabular">{badge(n)}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 pt-4">
          <button onClick={() => navigate('/projects/new')} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-medium text-on-primary shadow-md transition-transform hover:bg-primary-hover active:scale-[0.98]">
            <Plus className="size-4" /> New project
          </button>
        </div>
        <div className="mx-5 mt-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between text-xs text-ink-2">
            <span className="flex items-center gap-1.5 font-medium text-ink"><Zap className="size-3.5 text-ochre-text" /> {level.current.toLocaleString('en-ZA')} XP</span>
            <span className="flex items-center gap-1 tabular"><Flame className={cn('size-3.5', streak.weeks > 0 ? 'text-primary-text' : 'text-ink-3')} /> {streak.weeks}w</span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-ochre to-primary" initial={{ width: 0 }} animate={{ width: `${level.progress * 100}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
          </div>
          <p className="mt-2 text-[11px] text-ink-3">{level.next ? `${level.toNext.toLocaleString('en-ZA')} XP to level ${level.level + 1}` : 'Max level — legends'}</p>
        </div>
        <div className="mt-auto px-3 pb-5">
          <NavLink to="/settings" className={({ isActive }) => cn('flex h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors', isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
            {me && <Avatar name={me.display_name} color={me.color} size="sm" />}
            <span className="min-w-0 flex-1 truncate">{me?.display_name}</span>
            <Settings className="size-4 text-ink-3" />
          </NavLink>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 overflow-x-clip pb-[calc(84px+env(safe-area-inset-bottom))] short:pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-10 lg:pl-[264px]">
        {/* Lazy pages resolve here, inside the shell — never by swapping the whole app for the splash screen. */}
        <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Floating add — everywhere except the board and the new-project form */}
      {!hideFab && (
        <Tooltip label="New project">
          <motion.button
            aria-label="New project"
            onClick={() => navigate('/projects/new')}
            className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 grid size-14 place-items-center rounded-full bg-primary text-on-primary shadow-lg short:bottom-[calc(58px+env(safe-area-inset-bottom))] short:size-12 lg:hidden"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.2 }}
          >
            <Plus className="size-6" />
          </motion.button>
        </Tooltip>
      )}

      {/* Bottom nav — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line glass safe-bottom lg:hidden" aria-label="Primary">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end} aria-label={n.label} className={({ isActive }) => cn('relative flex h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-medium short:h-12', isActive ? 'text-primary-text' : 'text-ink-3')}>
                {({ isActive }) => (
                  <>
                    <span className="relative grid h-7 w-12 place-items-center">
                      {isActive && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-primary-soft" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                      <n.icon className="relative size-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
                      {badge(n) > 0 && <span className="absolute -right-0.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary ring-2 ring-surface tabular">{badge(n)}</span>}
                    </span>
                    <span className="short:hidden">{n.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Page wrapper: consistent gutters, max width and an entrance animation. */
export function Page({ children, className, wide, title, back, actions }: { children: ReactNode; className?: string; wide?: boolean; title?: ReactNode; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <motion.div
      className={cn('mx-auto w-full px-4 pt-4 sm:px-6 lg:px-10 lg:pt-8', wide ? 'max-w-[1400px]' : 'max-w-6xl', className)}
      // Start visible and settle, rather than flashing blank and fading in — a blink reads as flicker on a fast desktop.
      initial={{ opacity: 0.4, y: 4 }}
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
