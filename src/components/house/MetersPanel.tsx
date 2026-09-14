import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, BatteryLow, CalendarClock, Camera, Droplets, FileText, Gauge, MoreHorizontal, Pencil, Plus, Trash2, Wallet, Zap } from 'lucide-react'
import { UTILITIES, type MeterReading, type Utility, type UtilityPurchase } from '../../data/types'
import { useActions, useMediaUrl } from '../../data/hooks'
import { useAuth } from '../../data/session'
import {
  blendedRate, meterPeriods, perDayLabel, prepaidOutlook, purchaseRate, purchasesFor, readingDue, readingsFor, usedLabel,
} from '../../lib/meters'
import { cn, fmtDate, money, pluralise } from '../../lib/utils'
import { EmptyState, Pill, Reveal, Stat } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { Segmented } from '../ui/Field'
import { Menu, MenuItem } from '../ui/Menu'
import { useConfirm } from '../ui/Sheet'
import { ReadingSheet } from './ReadingSheet'
import { TopUpSheet } from './TopUpSheet'

export function MetersPanel({ readings, purchases }: { readings: MeterReading[]; purchases: UtilityPurchase[] }) {
  const { deleteReading, deletePurchase } = useActions()
  const { household } = useAuth()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [utility, setUtility] = useState<Utility>('water')
  const [sheet, setSheet] = useState(false)
  const [topUp, setTopUp] = useState(false)
  const [editing, setEditing] = useState<MeterReading | null>(null)
  const [editingBuy, setEditingBuy] = useState<UtilityPurchase | null>(null)

  const meta = UTILITIES[utility]
  const rs = useMemo(() => readingsFor(readings, utility), [readings, utility])
  const ps = useMemo(() => purchasesFor(purchases, utility), [purchases, utility])
  const periods = useMemo(() => meterPeriods(readings, purchases, utility), [readings, purchases, utility])
  const due = useMemo(() => readingDue(readings, utility), [readings, utility])
  const outlook = useMemo(() => (utility === 'electricity' ? prepaidOutlook(readings, purchases, utility) : null), [readings, purchases, utility])
  const rate = useMemo(() => blendedRate(purchases, utility), [purchases, utility])

  const latest = rs.length ? rs[rs.length - 1]! : null
  const lastPeriod = periods.filter((p) => !p.suspect).slice(-1)[0] ?? null
  const prevPeriod = periods.filter((p) => !p.suspect).slice(-2)[0] ?? null
  const trend = lastPeriod && prevPeriod && prevPeriod.perDay > 0 ? lastPeriod.perDay / prevPeriod.perDay - 1 : null

  const chart = useMemo(() => periods.filter((p) => !p.suspect).map((p) => ({
    label: fmtDate(p.to.read_on, 'd MMM'),
    full: `${fmtDate(p.from.read_on, 'd MMM')} – ${fmtDate(p.to.read_on, 'd MMM yyyy')}`,
    perDay: Math.round(p.perDay * 10) / 10,
    used: p.used,
    days: p.days,
  })), [periods])

  const meterNo = utility === 'water' ? household?.water_meter_no : household?.electricity_meter_no

  const removeReading = async (r: MeterReading) => {
    const ok = await confirm({ title: 'Delete this reading?', description: `The ${fmtDate(r.read_on, 'd MMM yyyy')} reading and its photo go for good. The record will have a gap where it was.`, confirmLabel: 'Delete', danger: true })
    if (ok) void deleteReading(r)
  }

  return (
    <div className="min-w-0 space-y-5">
      {/* Which meter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Utility>
          value={utility}
          onChange={setUtility}
          options={[
            { value: 'water', label: <span className="inline-flex items-center gap-1.5"><Droplets className="size-4" /> Water</span> },
            { value: 'electricity', label: <span className="inline-flex items-center gap-1.5"><Zap className="size-4" /> Electricity</span> },
          ]}
        />
        <div className="flex w-full gap-2 sm:w-auto">
          {utility === 'electricity' && <Button variant="secondary" className="flex-1 sm:flex-none" leading={<Wallet className="size-4" />} onClick={() => { setEditingBuy(null); setTopUp(true) }}>Top-up</Button>}
          <Button className="flex-1 sm:flex-none" leading={<Camera className="size-4" />} onClick={() => { setEditing(null); setSheet(true) }}>Log a reading</Button>
        </div>
      </div>

      {/* Nothing logged yet, or the record is going stale */}
      <DueBanner state={due.state} daysSince={due.daysSince} utility={utility} onLog={() => { setEditing(null); setSheet(true) }} />

      {/* The numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Last reading" hint={latest ? `${fmtDate(latest.read_on, 'EEE d MMM')}${meterNo ? ` · meter ${meterNo}` : ''}` : 'Nothing logged yet'}>
          <span className="tabular">{latest ? `${Number(latest.reading).toLocaleString()} ` : '—'}<span className="text-base text-ink-3">{latest ? meta.unit : ''}</span></span>
        </Stat>
        <Stat
          label="Using now"
          hint={lastPeriod ? `over the ${pluralise(lastPeriod.days, 'day')} to ${fmtDate(lastPeriod.to.read_on, 'd MMM')}` : 'Two readings needed'}
        >
          <span className="tabular">{lastPeriod ? perDayLabel(lastPeriod.perDay, utility) : '—'}</span>
        </Stat>
        {utility === 'water' ? (
          <>
            <Stat label="Versus the period before" hint={prevPeriod ? `was ${perDayLabel(prevPeriod.perDay, utility)}` : 'Three readings needed'}>
              <span className={cn('tabular', trend !== null && (trend > 0.15 ? 'text-danger' : trend < -0.15 ? 'text-sage-text' : ''))}>
                {trend === null ? '—' : `${trend > 0 ? '+' : ''}${Math.round(trend * 100)}%`}
              </span>
            </Stat>
            <Stat label="Readings on file" hint={rs.filter((r) => r.photo_path).length ? `${rs.filter((r) => r.photo_path).length} with a photo` : 'None with a photo yet'}>
              <span className="tabular">{rs.length}</span>
            </Stat>
          </>
        ) : (
          <>
            <Stat label="Left on the meter" hint={outlook?.daysLeft !== null && outlook?.daysLeft !== undefined ? `about ${pluralise(outlook.daysLeft, 'day')} at this rate` : 'Estimated from the last reading'}>
              <span className={cn('tabular', outlook && outlook.daysLeft !== null && outlook.daysLeft <= 5 && 'text-danger')}>
                {outlook?.estimatedNow !== null && outlook?.estimatedNow !== undefined ? `${Math.round(outlook.estimatedNow).toLocaleString()} ` : latest ? `${Number(latest.reading).toLocaleString()} ` : '—'}
                <span className="text-base text-ink-3">{latest ? 'kWh' : ''}</span>
              </span>
            </Stat>
            <Stat label="Costing you" hint={rate ? `at ${money(rate, { cents: true })} a unit` : 'Log a top-up to get a rate'}>
              <span className="tabular">{outlook?.costPerDay ? `${money(outlook.costPerDay)}/day` : '—'}</span>
            </Stat>
          </>
        )}
      </div>

      {/* Running out */}
      {outlook && outlook.daysLeft !== null && outlook.daysLeft <= 7 && (
        <Reveal className="card flex items-center gap-3 border-ochre/40 bg-ochre-soft p-4">
          <BatteryLow className="size-5 shrink-0 text-ochre-text" />
          <p className="flex-1 text-[15px] text-ink">
            About <strong>{pluralise(outlook.daysLeft, 'day')}</strong> of electricity left at {perDayLabel(outlook.perDay, 'electricity')}. Worth buying before the weekend.
          </p>
          <Button size="sm" variant="secondary" onClick={() => { setEditingBuy(null); setTopUp(true) }}>Log a top-up</Button>
        </Reveal>
      )}

      {/* Consumption */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-[20px] leading-tight text-ink">Consumption</h3>
            <p className="mt-0.5 text-sm text-ink-2">{meta.usageUnit} a day between each pair of readings.</p>
          </div>
          {utility === 'water' && rs.length > 1 && (
            <Button variant="secondary" size="sm" leading={<FileText className="size-4" />} onClick={() => navigate('/house/report/water')}>Evidence pack</Button>
          )}
        </div>
        {chart.length < 1 ? (
          <EmptyState compact icon={<Gauge />} title="Not enough readings yet" description="Two readings make a rate. That rate is what shows a leak, or proves the council's figure wrong." />
        ) : (
          <div className="mt-4 h-56 w-full sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="meterFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={utility === 'water' ? 'var(--sky)' : 'var(--ochre)'} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={utility === 'water' ? 'var(--sky)' : 'var(--ochre)'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 12 }} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} width={48} tickFormatter={(v: number) => v.toLocaleString()} />
                <RTooltip cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]!.payload as (typeof chart)[number]
                  return (
                    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-md">
                      <p className="text-[11px] uppercase tracking-wider text-ink-3">{d.full}</p>
                      <p className="font-semibold tabular text-ink">{perDayLabel(d.perDay, utility)}</p>
                      <p className="text-ink-2">{usedLabel(d.used, utility)} over {pluralise(d.days, 'day')}</p>
                    </div>
                  )
                }} />
                <Area type="monotone" dataKey="perDay" stroke={utility === 'water' ? 'var(--sky)' : 'var(--ochre)'} strokeWidth={2.5} fill="url(#meterFill)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* The record */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="text-[20px] leading-tight text-ink">The record</h3>
          <span className="text-xs tabular text-ink-3">{rs.length} {rs.length === 1 ? 'reading' : 'readings'}</span>
        </div>
        {rs.length === 0 ? (
          <EmptyState compact icon={<Camera />} title="No readings yet" description="Photograph the dial and type in the number. Do it again next month and the app works out the rest." />
        ) : (
          <ul className="divide-y divide-line">
            {[...rs].reverse().map((r, idx) => {
              const period = periods.find((p) => p.to.id === r.id)
              return (
                <ReadingRow
                  key={r.id}
                  reading={r}
                  utility={utility}
                  perDay={period && !period.suspect ? period.perDay : null}
                  used={period && !period.suspect ? period.used : null}
                  suspect={Boolean(period?.suspect)}
                  index={idx}
                  onEdit={() => { setEditing(r); setSheet(true) }}
                  onDelete={() => removeReading(r)}
                />
              )
            })}
          </ul>
        )}
      </div>

      {/* Top-ups */}
      {utility === 'electricity' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <h3 className="text-[20px] leading-tight text-ink">Top-ups</h3>
              {rate !== null && <p className="mt-0.5 text-sm text-ink-2">{money(rate, { cents: true })} a unit on average, service fee and all.</p>}
            </div>
            <Button size="sm" variant="secondary" leading={<Plus className="size-4" />} onClick={() => { setEditingBuy(null); setTopUp(true) }}>Add</Button>
          </div>
          {ps.length === 0 ? (
            <EmptyState compact icon={<Wallet />} title="No top-ups logged" description="Punch in what you paid and the units off the token SMS — that pair is what turns kWh into rand." />
          ) : (
            <ul className="divide-y divide-line">
              {[...ps].reverse().map((p) => {
                const r = purchaseRate(p)
                const dearer = r !== null && rate !== null && r > rate * 1.12
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ochre-soft text-ochre-text"><Zap className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ink"><span className="tabular">{money(p.amount)}</span> → <span className="tabular">{Number(p.units).toLocaleString()} kWh</span></p>
                      <p className="mt-0.5 text-xs text-ink-3">{fmtDate(p.bought_on, 'EEE d MMM yyyy')}{p.notes ? ` · ${p.notes}` : ''}</p>
                    </div>
                    {r !== null && <Pill size="sm" tone={dearer ? 'ochre' : 'neutral'}>{money(r, { cents: true })}/kWh</Pill>}
                    <Menu trigger={<IconButton label="More" size="icon-sm"><MoreHorizontal className="size-4" /></IconButton>}>
                      <MenuItem icon={<Pencil />} onSelect={() => { setEditingBuy(p); setTopUp(true) }}>Edit</MenuItem>
                      <MenuItem danger icon={<Trash2 />} onSelect={() => deletePurchase(p)}>Delete</MenuItem>
                    </Menu>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <ReadingSheet open={sheet} onOpenChange={setSheet} utility={utility} readings={readings} edit={editing} />
      <TopUpSheet open={topUp} onOpenChange={setTopUp} utility="electricity" purchases={purchases} edit={editingBuy} />
    </div>
  )
}

/**
 * The warning.
 *
 * A month is the council's rhythm, so it is the one worth keeping. The wording
 * escalates rather than repeating itself: a note at three weeks, a real warning
 * at four, and past a month it says plainly what the gap costs you.
 */
function DueBanner({ state, daysSince, utility, onLog }: { state: ReturnType<typeof readingDue>['state']; daysSince: number | null; utility: Utility; onLog: () => void }) {
  if (state === 'fresh') return null
  const meta = UTILITIES[utility]

  const copy = state === 'none'
    ? { tone: 'sky', icon: <Gauge className="size-5" />, text: <>No {meta.label.toLowerCase()} readings yet. The first one is just a number — the second one starts telling you something.</> }
    : state === 'soon'
      ? { tone: 'sky', icon: <CalendarClock className="size-5" />, text: <>It’s been <strong>{pluralise(daysSince!, 'day')}</strong> since the last {meta.label.toLowerCase()} reading. A month is the council’s rhythm — worth taking one this week.</> }
      : state === 'due'
        ? { tone: 'ochre', icon: <CalendarClock className="size-5" />, text: <><strong>{pluralise(daysSince!, 'day')}</strong> since the last {meta.label.toLowerCase()} reading. Take one now and the month lines up with the statement.</> }
        : { tone: 'danger', icon: <AlertTriangle className="size-5" />, text: <>It’s been <strong>{pluralise(daysSince!, 'day')}</strong> — over a month. A gap here is exactly where a disputed statement lands with nothing to answer it.</> }

  return (
    <Reveal className={cn(
      'card flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
      copy.tone === 'danger' ? 'border-danger/40 bg-danger-soft' : copy.tone === 'ochre' ? 'border-ochre/40 bg-ochre-soft' : 'border-sky/40 bg-sky-soft',
    )}>
      <span className={cn('shrink-0', copy.tone === 'danger' ? 'text-danger' : copy.tone === 'ochre' ? 'text-ochre-text' : 'text-sky-text')}>{copy.icon}</span>
      <p className="flex-1 text-[15px] leading-snug text-ink">{copy.text}</p>
      <Button size="sm" variant={copy.tone === 'danger' ? 'danger' : 'secondary'} leading={<Camera className="size-4" />} onClick={onLog} className="shrink-0">Log one now</Button>
    </Reveal>
  )
}

function ReadingRow({ reading: r, utility, perDay, used, suspect, index, onEdit, onDelete }: {
  reading: MeterReading
  utility: Utility
  perDay: number | null
  used: number | null
  suspect: boolean
  index: number
  onEdit: () => void
  onDelete: () => void
}) {
  const { profileById } = useAuth()
  const photo = useMediaUrl(r.photo_path)
  const meta = UTILITIES[utility]
  const by = profileById(r.created_by)
  const [zoom, setZoom] = useState(false)

  return (
    <Reveal as="li" index={index} className="flex items-center gap-3 px-4 py-3">
      {photo ? (
        <button onClick={() => setZoom(true)} className="size-14 shrink-0 overflow-hidden rounded-xl border border-line" aria-label="See the meter photo">
          <img src={photo} alt="" className="size-full object-cover" />
        </button>
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3"><Camera className="size-4" /></span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-ink">
          <span className="tabular font-medium">{Number(r.reading).toLocaleString()}</span> <span className="text-ink-3">{meta.unit}</span>
          {r.source !== 'self' && <Pill size="sm" tone={r.source === 'estimate' ? 'ochre' : 'neutral'} className="ml-2">{r.source === 'council' ? 'Council' : 'Estimated'}</Pill>}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">
          {fmtDate(r.read_on, 'EEE d MMM yyyy')}
          {by ? ` · ${by.display_name}` : ''}
          {!r.photo_path && <span className="text-ochre-text"> · no photo</span>}
        </p>
        {r.notes && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{r.notes}</p>}
      </div>
      <div className="shrink-0 text-right">
        {suspect ? (
          <Pill size="sm" tone="danger">Went backwards</Pill>
        ) : perDay !== null ? (
          <>
            <p className="tabular text-[15px] text-ink">{perDayLabel(perDay, utility)}</p>
            {used !== null && <p className="text-xs tabular text-ink-3">{usedLabel(used, utility)} used</p>}
          </>
        ) : (
          <p className="text-xs text-ink-3">first reading</p>
        )}
      </div>
      <Menu trigger={<IconButton label="More" size="icon-sm"><MoreHorizontal className="size-4" /></IconButton>}>
        <MenuItem icon={<Pencil />} onSelect={onEdit}>Edit</MenuItem>
        <MenuItem danger icon={<Trash2 />} onSelect={onDelete}>Delete</MenuItem>
      </Menu>

      {zoom && photo && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-ink/80 p-4" onClick={() => setZoom(false)} role="dialog">
          <figure className="max-h-full">
            <img src={photo} alt={`Meter on ${fmtDate(r.read_on, 'd MMM yyyy')}`} className="max-h-[80dvh] rounded-2xl object-contain" />
            <figcaption className="mt-3 text-center text-sm text-bg">{Number(r.reading).toLocaleString()} {meta.unit} · {fmtDate(r.read_on, 'EEE d MMMM yyyy')}</figcaption>
          </figure>
        </div>
      )}
    </Reveal>
  )
}
