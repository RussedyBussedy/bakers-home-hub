import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gauge, ListChecks, ShoppingBasket } from 'lucide-react'
import { Page } from '../components/layout/AppShell'
import { useHouse } from '../data/hooks'
import { useAuth } from '../data/session'
import { useCalm } from '../store/ui'
import { readingDue } from '../lib/meters'
import { cn, homeTitle } from '../lib/utils'
import { ShoppingPanel } from '../components/house/ShoppingPanel'
import { TodoPanel } from '../components/house/TodoPanel'
import { MetersPanel } from '../components/house/MetersPanel'

type Tab = 'shopping' | 'todo' | 'meters'
const TABS: { value: Tab; label: string; icon: typeof Gauge }[] = [
  { value: 'shopping', label: 'Shopping', icon: ShoppingBasket },
  { value: 'todo', label: 'To-do', icon: ListChecks },
  { value: 'meters', label: 'Meters', icon: Gauge },
]
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.value === v)

/**
 * The house itself.
 *
 * Projects come and go; the shopping, the chores and the meters carry on
 * regardless. They share a page because they share a rhythm — things you glance
 * at on the way out of the door, not things you sit down to plan.
 */
export default function HousePage() {
  const data = useHouse()
  const { household } = useAuth()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const calm = useCalm()
  const paramTab = params.get('tab')
  const [tab, setTab] = useState<Tab>(isTab(paramTab) ? paramTab : 'shopping')

  // A nudge arrives as /house?tab=todo — follow it, then tidy the URL.
  useEffect(() => {
    if (isTab(paramTab)) { setTab(paramTab); setParams({}, { replace: true }) }
  }, [paramTab, setParams])

  // Opened from the Hub's "read the meter" card.
  useEffect(() => {
    const wanted = (location.state as { tab?: Tab } | null)?.tab
    if (wanted && isTab(wanted)) { setTab(wanted); navigate(location.pathname, { replace: true, state: null }) }
  }, [location, navigate])

  const openShopping = data.shopping.filter((s) => !s.done).length
  const openTodo = data.houseTasks.filter((t) => !t.done).length
  const metersDue = useMemo(() => {
    const w = readingDue(data.readings, 'water')
    const e = readingDue(data.readings, 'electricity')
    return [w, e].some((d) => d.state === 'due' || d.state === 'overdue')
  }, [data.readings])

  const counts: Record<Tab, number> = { shopping: openShopping, todo: openTodo, meters: 0 }

  if (data.loading) {
    return <Page title="The house"><div className="skeleton h-64 w-full rounded-3xl" /></Page>
  }

  return (
    <Page
      wide
      title="The house"
    >
      <p className="-mt-3 mb-5 text-[15px] text-ink-2">
        Everything at {homeTitle(household?.name).replace(/ Hub$/, '')} that isn’t a project — what to buy, what needs doing, and what the meters say.
      </p>

      <div className="sticky top-0 z-20 -mx-4 bg-bg/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div role="tablist" className="flex gap-1 overflow-x-auto scrollbar-none">
          {TABS.map((t) => {
            const active = tab === t.value
            const count = counts[t.value]
            const flag = t.value === 'meters' && metersDue
            return (
              <button key={t.value} role="tab" aria-selected={active} onClick={() => setTab(t.value)} className={cn('relative flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors sm:gap-2 sm:px-4', active ? 'text-ink' : 'text-ink-2 hover:text-ink')}>
                {active && <motion.span layoutId="house-tab" className="absolute inset-0 rounded-full bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <t.icon className="relative size-4" />
                <span className="relative">{t.label}</span>
                {count > 0 && <span className={cn('relative rounded-full px-1.5 text-[11px] tabular', active ? 'bg-primary-soft text-primary-text' : 'bg-surface-3 text-ink-2')}>{count}</span>}
                {flag && <span className="relative size-2 rounded-full bg-ochre" aria-label="A reading is due" />}
              </button>
            )
          })}
        </div>
      </div>

      <motion.div
        key={tab}
        className="mt-4 pb-8 [overflow-anchor:none]"
        initial={calm ? false : { opacity: 0.3, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      >
        {tab === 'shopping' && <ShoppingPanel items={data.shopping} />}
        {tab === 'todo' && <TodoPanel tasks={data.houseTasks} />}
        {tab === 'meters' && <MetersPanel readings={data.readings} purchases={data.purchases} />}
      </motion.div>
    </Page>
  )
}
