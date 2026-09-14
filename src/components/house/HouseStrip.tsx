import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, Gauge, ListChecks, ShoppingBasket } from 'lucide-react'
import { UTILITIES, type Utility } from '../../data/types'
import { useHouse } from '../../data/hooks'
import { readingDue } from '../../lib/meters'
import { cn, pluralise, todayISO } from '../../lib/utils'
import { Reveal } from '../ui/Bits'

/**
 * The house, from the Hub's front page.
 *
 * Three tiles, and one of them earns its colour: a meter reading going stale is
 * the only thing here with a deadline set by somebody else, so it is the only
 * one allowed to shout.
 */
export function HouseStrip() {
  const data = useHouse()
  const today = todayISO()

  const shopping = data.shopping.filter((s) => !s.done).length
  const chores = data.houseTasks.filter((t) => !t.done)
  const overdueChores = chores.filter((t) => t.due_date && t.due_date < today).length

  const stale = useMemo(() => {
    const rows: { utility: Utility; days: number | null; state: ReturnType<typeof readingDue>['state'] }[] = []
    for (const u of ['water', 'electricity'] as Utility[]) {
      const d = readingDue(data.readings, u)
      if (d.state === 'due' || d.state === 'overdue') rows.push({ utility: u, days: d.daysSince, state: d.state })
    }
    return rows
  }, [data.readings])

  if (data.loading) return null

  const worst = stale.find((s) => s.state === 'overdue') ?? stale[0] ?? null

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile
        to="/house?tab=shopping"
        icon={<ShoppingBasket className="size-4" />}
        label="Shopping list"
        value={shopping ? `${shopping} to buy` : 'All clear'}
        hint={shopping ? 'Tick one off and it goes on both phones' : 'Nothing waiting'}
        index={0}
      />
      <Tile
        to="/house?tab=todo"
        icon={<ListChecks className="size-4" />}
        label="Round the house"
        value={chores.length ? `${chores.length} open` : 'Nothing due'}
        hint={overdueChores ? `${overdueChores} overdue` : chores.length ? 'None overdue' : 'The list is clear'}
        tone={overdueChores ? 'danger' : undefined}
        index={1}
      />
      <Tile
        to="/house?tab=meters"
        icon={worst ? <AlertTriangle className="size-4" /> : <Gauge className="size-4" />}
        label="Meters"
        value={worst ? `${UTILITIES[worst.utility].label} reading due` : 'Up to date'}
        hint={worst ? `${pluralise(worst.days ?? 0, 'day')} since the last one` : 'Both read within the month'}
        tone={worst?.state === 'overdue' ? 'danger' : worst ? 'ochre' : undefined}
        index={2}
      />
    </div>
  )
}

function Tile({ to, icon, label, value, hint, tone, index }: {
  to: string
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  tone?: 'danger' | 'ochre'
  index: number
}) {
  return (
    <Reveal index={index}>
      <Link
        to={to}
        className={cn(
          'card card-hover group flex items-center gap-3 p-4',
          tone === 'danger' && 'border-danger/40 bg-danger-soft',
          tone === 'ochre' && 'border-ochre/40 bg-ochre-soft',
        )}
      >
        <span className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          tone === 'danger' ? 'bg-danger/15 text-danger' : tone === 'ochre' ? 'bg-ochre/20 text-ochre-text' : 'bg-surface-2 text-ink-2',
        )}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</span>
          <span className="block truncate text-[15px] font-medium text-ink">{value}</span>
          <span className="block truncate text-xs text-ink-3">{hint}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Reveal>
  )
}
