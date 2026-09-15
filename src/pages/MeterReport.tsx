import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { UTILITIES, type MeterReading, type Utility } from '../data/types'
import { useHouse } from '../data/hooks'
import { useAuth, useDb } from '../data/session'
import { meterPeriods, perDayLabel, readingLabel, readingsFor, usedLabel } from '../lib/meters'
import { fmtDate, homeTitle, pluralise } from '../lib/utils'
import { Button } from '../components/ui/Button'
import './meterReport.css'

/**
 * The evidence pack.
 *
 * A council reading is disputed with a record, not an argument: dated numbers,
 * the photographs they were read off, and the daily rate between each pair so
 * the pattern is visible to somebody who has never seen the property. It prints
 * on white paper in black ink and says who compiled it and when — a screen
 * design would only get in the way.
 */
export default function MeterReportPage() {
  const { utility: raw } = useParams()
  const utility: Utility = raw === 'electricity' ? 'electricity' : 'water'
  const meta = UTILITIES[utility]
  const navigate = useNavigate()
  const { household, me, profileById } = useAuth()
  const { db } = useDb()
  const data = useHouse()

  const rs = useMemo(() => readingsFor(data.readings, utility), [data.readings, utility])
  const periods = useMemo(() => meterPeriods(data.readings, data.purchases, utility), [data.readings, data.purchases, utility])
  const withPhotos = rs.filter((r) => r.photo_path)

  // Every picture is fetched up front. A signed URL that resolves after the print
  // dialog opens is a blank plate in the middle of the evidence.
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(0)
  const [failed, setFailed] = useState(0)
  useEffect(() => {
    let alive = true
    const paths = withPhotos.map((r) => r.photo_path!).filter(Boolean)
    if (!paths.length) return
    void Promise.all(paths.map(async (p) => {
      try { return [p, await db.resolveUrl(p)] as const } catch { return [p, ''] as const }
    })).then((pairs) => { if (alive) setUrls(Object.fromEntries(pairs.filter(([, u]) => u))) })
    return () => { alive = false }
  }, [db, data.readings]) // eslint-disable-line react-hooks/exhaustive-deps

  const expected = withPhotos.length
  const ready = expected === 0 || loaded + failed >= expected

  const first = rs[0], last = rs[rs.length - 1]
  const good = periods.filter((p) => !p.suspect)
  const totalDays = good.reduce((s, p) => s + p.days, 0)
  const totalUsed = good.reduce((s, p) => s + p.used, 0)
  const average = totalDays > 0 ? totalUsed / totalDays : null
  const peak = good.length ? good.reduce((a, b) => (b.perDay > a.perDay ? b : a)) : null
  const quietest = good.length ? good.reduce((a, b) => (b.perDay < a.perDay ? b : a)) : null
  const meterNo = utility === 'water' ? household?.water_meter_no : household?.electricity_meter_no
  const decimals = (utility === 'water' ? household?.water_meter_decimals : household?.electricity_meter_decimals) ?? (utility === 'water' ? 3 : 0)
  const dial = (v: number) => readingLabel(v, utility, decimals).replace(` ${meta.unit}`, '')
  const compiled = new Date()

  if (data.loading) {
    return <div className="grid min-h-dvh place-items-center bg-bg text-ink-2"><Loader2 className="size-6 animate-spin" /></div>
  }

  return (
    <div className="report-root">
      {/* Screen-only toolbar */}
      <div className="report-bar">
        <Button variant="ghost" size="sm" leading={<ArrowLeft className="size-4" />} onClick={() => navigate('/house', { state: { tab: 'meters' } })}>Back</Button>
        <p className="report-bar-hint">
          {ready ? 'Print it, or choose “Save as PDF” in the print dialog.' : `Fetching ${expected} ${expected === 1 ? 'photo' : 'photos'}…`}
        </p>
        <Button size="sm" leading={ready ? <Printer className="size-4" /> : <Loader2 className="size-4 animate-spin" />} disabled={!ready} onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>

      <article className="sheet">
        {/* ---- Cover -------------------------------------------------- */}
        <header className="sheet-head">
          <p className="eyebrow">{meta.label} consumption record</p>
          <h1>{homeTitle(household?.name)}</h1>
          {household?.address && <p className="addr">{household.address}</p>}
          <dl className="facts">
            {meterNo && <><dt>Meter number</dt><dd>{meterNo}</dd></>}
            {household?.municipal_account && <><dt>Municipal account</dt><dd>{household.municipal_account}</dd></>}
            {first && last && <><dt>Period covered</dt><dd>{fmtDate(first.read_on, 'd MMMM yyyy')} – {fmtDate(last.read_on, 'd MMMM yyyy')}</dd></>}
            <dt>Readings on record</dt><dd>{rs.length}, of which {withPhotos.length} {withPhotos.length === 1 ? 'has' : 'have'} a photograph of the meter</dd>
            <dt>Compiled</dt><dd>{fmtDate(compiled.toISOString(), 'd MMMM yyyy')} by {me?.display_name ?? '—'}</dd>
          </dl>
        </header>

        {rs.length === 0 ? (
          <p className="note">No readings have been logged yet, so there is nothing to report.</p>
        ) : (
          <>
            {/* ---- Summary ---------------------------------------------- */}
            <section className="block">
              <h2>Summary</h2>
              <p className="lede">
                {first && last && (
                  <>The meter read <strong>{dial(Number(first.reading))} {meta.unit}</strong> on {fmtDate(first.read_on, 'd MMMM yyyy')} and{' '}
                  <strong>{dial(Number(last.reading))} {meta.unit}</strong> on {fmtDate(last.read_on, 'd MMMM yyyy')}
                  {average !== null && <> — {usedLabel(totalUsed, utility)} over {pluralise(totalDays, 'day')}, an average of <strong>{perDayLabel(average, utility)}</strong></>}.</>
                )}
                {peak && quietest && peak !== quietest && (
                  <> Consumption ranged from {perDayLabel(quietest.perDay, utility)} in the {fmtDate(quietest.from.read_on, 'd MMM')}–{fmtDate(quietest.to.read_on, 'd MMM')} period
                  to {perDayLabel(peak.perDay, utility)} in the {fmtDate(peak.from.read_on, 'd MMM')}–{fmtDate(peak.to.read_on, 'd MMM')} period.</>
                )}
              </p>
              {/* The document must not claim more than the record holds: a pack with no
                  photographs says so, rather than asserting every dial was photographed. */}
              <p className="fineprint">
                Each reading below was taken from the meter face on the date shown, except where the source column says
                otherwise.{' '}
                {withPhotos.length === 0
                  ? 'No photographs of the meter were taken for these readings.'
                  : withPhotos.length === rs.length
                    ? 'Every reading was photographed at the time; the photographs appear as numbered plates below.'
                    : `${withPhotos.length} of the ${rs.length} readings were photographed at the time; those photographs appear as numbered plates below, and the table says which.`}{' '}
                The daily figures are arithmetic: the difference between two consecutive readings divided by the calendar
                days between them.
                {utility === 'electricity' && ' Units purchased within a period are added back before the difference is taken.'}
              </p>
            </section>

            {/* ---- Chart ------------------------------------------------- */}
            {good.length > 1 && <ConsumptionChart periods={good} utility={utility} />}

            {/* ---- Table ------------------------------------------------- */}
            <section className="block">
              <h2>Readings</h2>
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th className="num">Reading ({meta.unit})</th>
                    <th className="num">Used ({meta.usageUnit})</th>
                    <th className="num">Days</th>
                    <th className="num">Per day</th>
                    <th>Source</th>
                    <th>Photo</th>
                  </tr>
                </thead>
                <tbody>
                  {rs.map((r, i) => {
                    const p = periods.find((x) => x.to.id === r.id)
                    return (
                      <tr key={r.id}>
                        <td className="num muted">{i + 1}</td>
                        <td>{fmtDate(r.read_on, 'd MMM yyyy')}</td>
                        <td className="num strong">{dial(Number(r.reading))}</td>
                        <td className="num">{p && !p.suspect ? Math.round(p.used).toLocaleString() : '—'}</td>
                        <td className="num muted">{p ? p.days : '—'}</td>
                        <td className="num strong">{p && !p.suspect ? Math.round(p.perDay).toLocaleString() : '—'}</td>
                        <td className="muted">{r.source === 'self' ? 'Read at meter' : r.source === 'council' ? 'Council statement' : 'Estimated'}</td>
                        <td className="muted">{r.photo_path ? `Plate ${withPhotos.findIndex((w) => w.id === r.id) + 1}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rs.some((r) => r.notes) && (
                <>
                  <h3>Notes recorded at the time</h3>
                  <ul className="notes">
                    {rs.filter((r) => r.notes).map((r) => (
                      <li key={r.id}><strong>{fmtDate(r.read_on, 'd MMM yyyy')}</strong> — {r.notes}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {/* ---- Photographic plates ------------------------------------ */}
            {withPhotos.length > 0 && (
              <section className="block plates">
                <h2>Photographs of the meter</h2>
                <div className="plate-grid">
                  {withPhotos.map((r, i) => (
                    <figure key={r.id} className="plate">
                      {urls[r.photo_path!] ? (
                        <img
                          src={urls[r.photo_path!]}
                          alt={`Meter reading ${dial(Number(r.reading))} ${meta.unit} on ${fmtDate(r.read_on, 'd MMMM yyyy')}`}
                          onLoad={() => setLoaded((n) => n + 1)}
                          onError={() => setFailed((n) => n + 1)}
                        />
                      ) : (
                        <div className="plate-missing">Photograph could not be loaded</div>
                      )}
                      <figcaption>
                        <strong>Plate {i + 1}</strong> · {fmtDate(r.read_on, 'd MMMM yyyy')} · {dial(Number(r.reading))} {meta.unit}
                        {profileById(r.created_by) ? ` · photographed by ${profileById(r.created_by)!.display_name}` : ''}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            <footer className="sheet-foot">
              <p>
                Compiled from {homeTitle(household?.name)} on {fmtDate(compiled.toISOString(), 'd MMMM yyyy')} at {compiled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                Readings and photographs were recorded on the dates shown and have not been altered since.
              </p>
              <div className="sign">
                <div><span className="rule" /><span>Signature</span></div>
                <div><span className="rule" /><span>Date</span></div>
              </div>
            </footer>
          </>
        )}
      </article>
    </div>
  )
}

/**
 * A hand-drawn SVG rather than the charting library: it prints at whatever size
 * the paper is, needs no layout measurement, and carries no animation that could
 * be caught half-finished by the print dialog.
 */
function ConsumptionChart({ periods, utility }: { periods: ReturnType<typeof meterPeriods>; utility: Utility }) {
  const w = 720, h = 240, padL = 52, padR = 12, padT = 14, padB = 44
  const max = Math.max(...periods.map((p) => p.perDay), 1)
  const niceMax = Math.ceil(max / 10 ** Math.max(0, String(Math.round(max)).length - 2)) * 10 ** Math.max(0, String(Math.round(max)).length - 2)
  const innerW = w - padL - padR, innerH = h - padT - padB
  const barW = Math.max(6, Math.min(64, (innerW / periods.length) * 0.62))
  const step = innerW / periods.length
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f))

  return (
    <section className="block">
      <h2>Consumption between readings</h2>
      <p className="fineprint">{UTILITIES[utility].usageUnit} per day. Each bar is the period ending on the date beneath it.</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Consumption per day between readings">
        {ticks.map((t) => {
          const y = padT + innerH - (t / niceMax) * innerH
          return (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#d9d4cc" strokeWidth={t === 0 ? 1.2 : 0.6} />
              <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill="#6b6560">{t.toLocaleString()}</text>
            </g>
          )
        })}
        {periods.map((p, i) => {
          const bh = (p.perDay / niceMax) * innerH
          const x = padL + i * step + (step - barW) / 2
          const y = padT + innerH - bh
          const hot = p.perDay >= max * 0.75 && periods.length > 2
          return (
            <g key={p.to.id}>
              <rect x={x} y={y} width={barW} height={Math.max(1, bh)} fill={hot ? '#9c3b2a' : '#5b7f9c'} rx={2} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={9.5} fill="#3c3835">{Math.round(p.perDay).toLocaleString()}</text>
              <text x={x + barW / 2} y={h - padB + 14} textAnchor="middle" fontSize={9.5} fill="#6b6560">{fmtDate(p.to.read_on, 'd MMM')}</text>
              <text x={x + barW / 2} y={h - padB + 26} textAnchor="middle" fontSize={8.5} fill="#948d86">{p.days}d</text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}

export type { MeterReading }
