import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, CloudSun, ImagePlus, Search, Tv, Unlink, Wifi, X } from 'lucide-react'
import type { TvDesired, TvDevice, TvPhoto } from '../../data/types'
import { useActions, useMediaUrl, useTvPhotos, useTvs } from '../../data/hooks'
import { cn, fmtDate, fmtRelative } from '../../lib/utils'
import { EmptyState, Pill, Skeleton } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { Input, Segmented, Select } from '../ui/Field'
import { useConfirm } from '../ui/Sheet'

/** A TV that checked in this recently counts as on (it checks in every minute or so while it is). */
const ON_MS = 3 * 60_000

/** The time, refreshed every half minute, so "On now" turns to "Off" by itself. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/**
 * The TV — the lounge TV's home screen (the My TV launcher on the Mi Box), set from here.
 *
 * The Hub can't reach the TV itself: it's a secure website and the TV a plain device on the home
 * Wi-Fi. So the two meet in the database (016_tv.sql). What's chosen here is written down for the TV,
 * which checks in while it's on and takes it; and it leaves word of how it is — what's playing, the
 * weather under its clock, which apps it has. A change made while the TV is off simply waits for it.
 */
export function TvPanel() {
  const tvs = useTvs()
  if (tvs.isPending) return <Skeleton className="h-64 w-full rounded-3xl" />
  const list = tvs.data ?? []
  if (list.length === 0) return <LinkTv />
  return <div className="space-y-4">{list.map((tv) => <TvCard key={tv.id} tv={tv} />)}</div>
}

/** No TV yet: what to press on the TV, and where to type the code it shows. */
function LinkTv() {
  const { claimTv } = useActions()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const clean = code.replace(/[^a-z0-9]/gi, '').toUpperCase()

  const link = async (e: FormEvent) => {
    e.preventDefault()
    if (clean.length !== 6) return
    setBusy(true)
    try { await claimTv(clean); setCode('') } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <div className="card p-5 sm:p-6">
      <EmptyState compact icon={<Tv />} title="Link the TV" description="Set the lounge TV from here — its look, the weather by its clock, your favourites and what the remote’s buttons open — and see what’s on." />
      <ol className="mx-auto max-w-sm list-decimal space-y-1.5 pl-5 text-[15px] text-ink-2">
        <li>On the TV, press the gear at the top right and choose <span className="font-medium text-ink">Link to Home Hub</span>.</li>
        <li>Type the code it shows.</li>
      </ol>
      <form onSubmit={link} className="mx-auto mt-4 flex max-w-sm gap-2">
        <Input
          aria-label="The code on the TV" value={code} onChange={(e) => setCode(e.target.value)} placeholder="KQ7 MX4"
          autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={8}
          className="text-center font-mono text-lg uppercase tracking-[0.3em]"
        />
        <Button type="submit" disabled={clean.length !== 6} loading={busy}>Link</Button>
      </form>
    </div>
  )
}

function TvCard({ tv }: { tv: TvDevice }) {
  const { setTv, unlinkTv } = useActions()
  const confirm = useConfirm()
  const now = useNow()
  // Settings changed from here this visit: until the TV has taken them, show what was asked for.
  const [asked, setAsked] = useState<(keyof TvDesired)[]>([])
  const r = tv.report ?? {}
  const has = r.settings ?? {}
  const on = Boolean(tv.last_seen && now - Date.parse(tv.last_seen) < ON_MS)
  const waiting = tv.desired_version > (r.applied ?? 0)
  const pick = <K extends keyof TvDesired>(key: K): TvDesired[K] | undefined => (waiting && asked.includes(key) ? tv.desired[key] : undefined)

  const style = pick('style') ?? has.style ?? 'glass'
  const font = pick('font') ?? has.font ?? 'doto'
  const place = pick('weather')?.place ?? has.weather ?? null
  const favourites = pick('favourites') ?? has.favourites ?? []
  const buttons = { ...has.buttons, ...pick('buttons') }
  const apps = r.apps ?? []
  const fonts = r.fonts ?? []
  const label = (pkg: string) => apps.find((a) => a.pkg === pkg)?.label ?? pkg

  const send = (patch: TvDesired) => {
    setAsked((a) => [...new Set([...a, ...(Object.keys(patch) as (keyof TvDesired)[])])])
    void setTv(tv.id, patch).catch(() => {})
  }
  const move = (i: number, d: number) => {
    const next = favourites.slice()
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    send({ favourites: next })
  }
  const unlink = async () => {
    const ok = await confirm({
      title: `Unlink ${tv.name}?`,
      description: 'It stays just as it is, but stops checking in here. It can be linked again with a new code from its gear menu.',
      confirmLabel: 'Unlink', danger: true,
    })
    if (ok) void unlinkTv(tv.id).catch(() => {})
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line p-4 sm:p-5">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-2"><Tv className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl leading-tight text-ink">{tv.name}</p>
          <p className="text-[13px] text-ink-2">
            {on ? 'On now' : tv.last_seen ? `Off — last on ${fmtRelative(tv.last_seen)}` : 'Not seen yet'}
            {r.version ? ` · My TV ${r.version}` : ''}
          </p>
        </div>
        {waiting && <Pill tone={on ? 'primary' : 'neutral'} size="sm" dot>{on ? 'Sending to the TV' : 'Waits for the TV'}</Pill>}
        <IconButton label="Unlink this TV" onClick={unlink}><Unlink className="size-4" /></IconButton>
      </div>

      {(r.playing || r.weather || r.wifi) && (
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          {r.playing ? (
            <div className="min-w-0">
              <p className="text-[13px] text-ink-3">{on ? 'Playing' : 'Last played'} · {r.playing.app}</p>
              <p className="mt-0.5 font-display text-lg leading-snug text-ink">{r.playing.title}</p>
              {r.playing.sub && <p className="text-sm text-ink-2">{r.playing.sub}</p>}
              {r.playing.left_min != null && <p className="mt-1 text-[13px] text-ink-2">{r.playing.left_min} min left</p>}
            </div>
          ) : <p className="text-sm text-ink-2">Nothing playing.</p>}
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {r.weather && <Pill><CloudSun className="size-3.5" aria-hidden />{r.weather.replace(/\s+/g, ' ')}{place ? ` in ${place}` : ''}</Pill>}
            {r.wifi && <Pill tone={/weak/.test(r.wifi) ? 'ochre' : 'neutral'}><Wifi className="size-3.5" aria-hidden />Wi-Fi {r.wifi}</Pill>}
          </div>
        </div>
      )}

      <div className="divide-y divide-line">
        <TvPhotos onTv={r.photo_ids} />

        <Section title="Look" hint="How the home screen sits on your photos.">
          <Segmented<'glass' | 'icons'>
            value={style} onChange={(v) => send({ style: v })}
            options={[{ value: 'glass', label: 'Glass tiles' }, { value: 'icons', label: 'Icons only' }]}
          />
          {fonts.length > 0 && (
            <Select aria-label="Font" value={font} onChange={(e) => send({ font: e.target.value })} className="mt-3 max-w-xs">
              {fonts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          )}
        </Section>

        <Section title="Weather" hint={place ? `By the clock: ${place}.` : 'The town for the weather by the clock.'}>
          <PlaceSearch onPick={(p) => send({ weather: p })} />
        </Section>

        <Section title="Favourites" hint="Along the bottom of the screen, first to last. Everything else is under All apps.">
          {favourites.length === 0 ? (
            <p className="text-sm text-ink-2">None yet — until there are some, every app shows along the bottom.</p>
          ) : (
            <ul className="max-w-md space-y-1.5">
              {favourites.map((pkg, i) => (
                <li key={pkg} className="flex items-center gap-1 rounded-2xl bg-surface-2 py-1 pl-3.5 pr-1">
                  <span className="min-w-0 flex-1 truncate">{label(pkg)}</span>
                  <IconButton size="icon-sm" label={`${label(pkg)} earlier`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconButton>
                  <IconButton size="icon-sm" label={`${label(pkg)} later`} disabled={i === favourites.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconButton>
                  <IconButton size="icon-sm" label={`Take ${label(pkg)} off`} onClick={() => send({ favourites: favourites.filter((p) => p !== pkg) })}><X className="size-4" /></IconButton>
                </li>
              ))}
            </ul>
          )}
          {apps.some((a) => !favourites.includes(a.pkg)) && (
            <Select aria-label="Add a favourite" value="" onChange={(e) => e.target.value && send({ favourites: [...favourites, e.target.value] })} className="mt-2 max-w-md">
              <option value="">Add a favourite…</option>
              {apps.filter((a) => !favourites.includes(a.pkg)).map((a) => <option key={a.pkg} value={a.pkg}>{a.label}</option>)}
            </Select>
          )}
        </Section>

        <Section title="Remote buttons" hint="What the remote’s Netflix and Prime Video buttons open.">
          <div className="max-w-md space-y-2">
            {(['netflix', 'prime'] as const).map((b) => (
              <label key={b} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-ink-2">{b === 'netflix' ? 'Netflix button' : 'Prime Video button'}</span>
                <Select value={buttons[b] ?? ''} onChange={(e) => send({ buttons: { ...buttons, [b]: e.target.value } })} className="min-w-0 flex-1">
                  {!buttons[b] && <option value="">—</option>}
                  <option value="slideshow">Photo slideshow</option>
                  {apps.map((a) => <option key={a.pkg} value={a.pkg}>{a.label}</option>)}
                </Select>
              </label>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

/**
 * Photos for the TV, added from a phone: they join its slideshow and backgrounds, and one taken on this day
 * in an earlier year comes back on the day. Each says whether the TV has fetched it yet (an older TV that
 * doesn't say gets no badge).
 */
function TvPhotos({ onTv }: { onTv?: string[] }) {
  const photos = useTvPhotos()
  const { addTvPhotos, deleteTvPhoto } = useActions()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(0)
  const list = photos.data ?? []
  const arrived = onTv ? list.filter((p) => onTv.includes(p.id)).length : null

  const add = async (files: FileList | null) => {
    const picked = [...(files ?? [])]
    if (!picked.length) return
    setAdding(picked.length)
    try { await addTvPhotos(picked) } catch { /* toast */ } finally { setAdding(0) }
  }
  const remove = async (p: TvPhoto) => {
    const ok = await confirm({ title: 'Take this photo off the TV?', description: 'It goes from the TV the next time it checks in, and from the Hub.', confirmLabel: 'Take it off', danger: true })
    if (ok) void deleteTvPhoto(p).catch(() => {})
  }

  return (
    <Section title="Photos" hint="They join the TV’s slideshow and backgrounds. One taken on this day in an earlier year comes back on the day.">
      {list.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {list.map((p) => <TvThumb key={p.id} photo={p} state={onTv ? (onTv.includes(p.id) ? 'on' : 'coming') : null} onRemove={() => remove(p)} />)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" leading={<ImagePlus className="size-4" />} onClick={() => input.current?.click()} loading={adding > 0}>
          {adding > 0 ? `Adding ${adding}…` : 'Add photos'}
        </Button>
        <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="Photos for the TV" onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
        {arrived != null && list.length > 0 && <span className="text-[13px] text-ink-2">{arrived} of {list.length} on the TV</span>}
      </div>
    </Section>
  )
}

function TvThumb({ photo, state, onRemove }: { photo: TvPhoto; state: 'on' | 'coming' | null; onRemove: () => void }) {
  const url = useMediaUrl(photo.path)
  return (
    <li className="relative aspect-video overflow-hidden rounded-xl bg-surface-2" title={photo.taken_on ? `Taken ${fmtDate(photo.taken_on)}` : undefined}>
      {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
      {state && (
        <span className={cn('absolute bottom-1 left-1 rounded-full px-1.5 py-px text-[10px] font-medium text-white', state === 'on' ? 'bg-black/55' : 'bg-black/35')}>
          {state === 'on' ? 'On the TV' : 'On its way'}
        </span>
      )}
      <button type="button" onClick={onRemove} aria-label="Take this photo off the TV" className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/70">
        <X className="size-3.5" />
      </button>
    </li>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="p-4 sm:p-5">
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      {hint && <p className="mb-3 mt-0.5 text-[13px] text-ink-2">{hint}</p>}
      {children}
    </section>
  )
}

type Place = { name: string; region: string; lat: number; lon: number }

/** Finds a town with Open-Meteo's place search (free, no account; the TV gets its weather there too). */
function PlaceSearch({ onPick }: { onPick: (p: { place: string; lat: number; lon: number }) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)

  const find = async (e: FormEvent) => {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&name=${encodeURIComponent(q.trim())}`)
      const data = (await res.json()) as { results?: { name: string; admin1?: string; admin2?: string; country?: string; latitude: number; longitude: number }[] }
      setHits((data.results ?? []).map((p) => ({
        name: p.name,
        region: [p.admin2, p.admin1, p.country].filter((x, i, all): x is string => Boolean(x) && x !== p.name && all.indexOf(x) === i).join(', '),
        lat: p.latitude, lon: p.longitude,
      })))
    } catch { setHits([]) } finally { setBusy(false) }
  }

  return (
    <div>
      <form onSubmit={find} className="flex max-w-md gap-2">
        <Input aria-label="Town or suburb" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Town or suburb" enterKeyHint="search" autoComplete="off" />
        <Button type="submit" variant="secondary" loading={busy} leading={<Search className="size-4" />}>Find</Button>
      </form>
      {hits && (hits.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">Nothing by that name — try the nearest town.</p>
      ) : (
        <ul className="mt-2 max-w-md divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon}`}>
              <button type="button" onClick={() => { onPick({ place: h.name, lat: h.lat, lon: h.lon }); setHits(null); setQ('') }} className="flex w-full items-baseline gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2">
                <span className="shrink-0 font-medium text-ink">{h.name}</span>
                <span className="truncate text-sm text-ink-3">{h.region}</span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}
