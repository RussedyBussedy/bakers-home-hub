import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Settings2 } from 'lucide-react'
import { Suspense, type ReactNode } from 'react'
import { PAGE_SCROLL_ID } from '../../lib/scroll'
import { useUi } from '../../store/ui'
import { PageFlip } from './PageFlip'

/**
 * The leather ring binder every screen is a page of. Desktop: rings down the left, section tabs poking out
 * of the page's right edge. Phone: a flip pad — rings across the top, tabs hanging off the bottom.
 * Only the page scrolls (see lib/scroll.ts); the binder itself never moves.
 */
const SECTIONS: { to: string; label: string; key: 'hub' | 'projects' | 'contacts' | 'insights' | 'rewards'; end?: boolean }[] = [
  { to: '/', label: 'Hub', key: 'hub', end: true },
  { to: '/projects', label: 'Projects', key: 'projects' },
  { to: '/contacts', label: 'Contacts', key: 'contacts' },
  { to: '/insights', label: 'Insights', key: 'insights' },
  { to: '/rewards', label: 'Rewards', key: 'rewards' },
]

export function Binder({ children, badges }: { children: ReactNode; badges?: Partial<Record<(typeof SECTIONS)[number]['key'], number>> }) {
  const grain = useUi((s) => s.paperGrain)
  const navigate = useNavigate()
  const location = useLocation()
  const showNew = location.pathname === '/' || location.pathname === '/projects'

  return (
    <div className="binder">
      <div className="binder-cover" />
      <div className="binder-stitch" />

      {/* phone: the pages already flipped over the top, and the edge of the stack under the spiral */}
      <div className="binder-fold-1" />
      <div className="binder-fold-2" />
      <div className="binder-topstack" />
      {/* desktop: the pages already flipped over, stacked on the other side of the rings */}
      <div className="binder-leftstack" />

      <div className="binder-under-2" />
      <div className="binder-under-1" />

      <nav className="binder-tabs" aria-label="Primary">
        {SECTIONS.map((s) => {
          const n = badges?.[s.key] ?? 0
          return (
            <NavLink key={s.to} to={s.to} end={s.end} className={`binder-tab binder-tab--${s.key}`} aria-label={s.label}>
              {s.label}
              {n > 0 && <span className="binder-tab-badge" aria-label={`${n} unread`}>{n}</span>}
            </NavLink>
          )
        })}
        {/* phone only: the fine print gets a small tab of its own */}
        <NavLink to="/settings" className="binder-tab binder-tab--settings" aria-label="Settings">
          <Settings2 aria-hidden />
        </NavLink>
      </nav>

      <div className="binder-page">
        <div id={PAGE_SCROLL_ID} className="page-scroll">
          <div className="page-content">
            <PageFlip>
              <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>{children}</Suspense>
            </PageFlip>
          </div>
        </div>
        <span className="binder-holes" />
        {grain && <div className="binder-grain" />}
      </div>

      <NavLink to="/settings" className="binder-fineprint">the fine print</NavLink>

      {showNew && (
        <motion.div className="binder-newproject" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
          <button type="button" className="scrap-button" onClick={() => navigate('/projects/new')}>
            <Plus className="size-4" /> Start a new project
          </button>
        </motion.div>
      )}
      {showNew && (
        <motion.button
          type="button"
          aria-label="New project"
          className="binder-fab"
          onClick={() => navigate('/projects/new')}
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: -3 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.2 }}
        >
          <Plus className="size-6" />
        </motion.button>
      )}

      <div className="binder-rings" />
    </div>
  )
}
