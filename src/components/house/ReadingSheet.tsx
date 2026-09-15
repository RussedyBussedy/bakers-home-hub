import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { READING_SOURCES, UTILITIES, type MeterReading, type ReadingSource, type Utility } from '../../data/types'
import { useActions, useMediaUrl } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { dialInWords, latestReading, parseDial, readingsFor, usedLabel } from '../../lib/meters'
import { cn, fmtDate, todayISO } from '../../lib/utils'
import { Button } from '../ui/Button'
import { DateInput, Field, Input, Segmented, Select, Textarea } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

/**
 * Capturing a reading.
 *
 * The photograph is the part that matters — a number typed into an app proves
 * nothing, but a number next to a dated picture of the dial is evidence. So the
 * camera is the first thing on the form, not an afterthought at the bottom.
 */
export function ReadingSheet({ open, onOpenChange, utility, readings, edit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  utility: Utility
  readings: MeterReading[]
  edit?: MeterReading | null
}) {
  const { logReading, updateReading, updateHomeDetails } = useActions()
  const { household } = useAuth()
  const meta = UTILITIES[utility]
  const decimals = Math.max(0, Math.min(6,
    (utility === 'water' ? household?.water_meter_decimals : household?.electricity_meter_decimals) ?? (utility === 'water' ? 3 : 0)))

  const [value, setValue] = useState('')
  const [when, setWhen] = useState(todayISO())
  const [source, setSource] = useState<ReadingSource>('self')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const existingPhoto = useMediaUrl(edit?.photo_path)

  useEffect(() => {
    if (!open) return
    // Show it back the way it was read off the dial, red wheels and all.
    setValue(edit ? Number(edit.reading).toFixed(decimals) : '')
    setWhen(edit?.read_on ?? todayISO())
    setSource(edit?.source ?? 'self')
    setNotes(edit?.notes ?? '')
    setFile(null); setPreview(null)
  }, [open, edit, decimals])

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const previous = edit
    ? readingsFor(readings, utility).filter((r) => r.read_on <= edit.read_on && r.id !== edit.id).pop() ?? null
    : latestReading(readings, utility)

  // Typed straight across the dial, then split back into whole and fraction.
  const dial = parseDial(value, decimals)
  const n = dial ? dial.value : NaN

  // What this reading would mean, worked out as it is typed — the best moment to
  // catch a digit in the wrong place is before it is saved.
  const delta = previous && dial && isFinite(n)
    ? (meta.direction === 'rising' ? n - Number(previous.reading) : Number(previous.reading) - n) * meta.usageFactor
    : null
  const backwards = delta !== null && delta < 0
  const meterNo = utility === 'water' ? household?.water_meter_no : household?.electricity_meter_no

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!dial || !isFinite(n)) return
    setBusy(true)
    try {
      if (edit) await updateReading(edit.id, { reading: n, read_on: when, source, notes: notes.trim(), file })
      else await logReading({ utility, reading: n, read_on: when, source, notes: notes.trim(), file, photo_path: null })
      onOpenChange(false)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  const photo = preview ?? (file ? null : existingPhoto)

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit the reading' : `New ${meta.label.toLowerCase()} reading`}
      description={meterNo ? `Meter ${meterNo}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!dial}>{edit ? 'Save' : 'Log it'}</Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4 pt-1">
        {/* The photo of the dial */}
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Photo of the meter</p>
          {photo ? (
            <div className="relative overflow-hidden rounded-2xl border border-line">
              <img src={photo} alt="The meter face" className="max-h-56 w-full object-cover" />
              <button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = '' }} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-ink/70 text-bg backdrop-blur" aria-label="Remove photo">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" leading={<Camera className="size-4" />} onClick={() => {
                const i = document.createElement('input')
                i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment')
                i.onchange = () => setFile(i.files?.[0] ?? null)
                i.click()
              }}>Take one</Button>
              <Button type="button" variant="secondary" className="flex-1" leading={<ImagePlus className="size-4" />} onClick={() => inputRef.current?.click()}>Choose</Button>
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
          <p className="mt-1.5 text-xs text-ink-3">The picture is what makes the record worth anything in a dispute.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Every digit on the dial" required hint={decimals > 0 ? `Black wheels then the ${decimals} red ones — straight across, no full stop.` : 'The number on the meter.'}>
          {(id) => (
            <Input id={id} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" placeholder={decimals > 0 ? '1046' + '6205'.slice(0, decimals) : '742'} autoFocus />
          )}
          </Field>
          <Field label="Read on" required>
          {(id) => (
            <DateInput id={id} value={when} onChange={(e) => setWhen(e.target.value)} max={todayISO()} />
          )}
          </Field>
        </div>

        {/* What the app made of it. A split in the wrong place is invisible in the
            stored number but obvious here, before it is saved. */}
        {dial && (
          <div className="rounded-2xl border border-line bg-surface-2 px-3.5 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Reads as</p>
            <p className="mt-0.5 font-display-tight text-2xl tabular text-ink">
              {Math.trunc(dial.value).toLocaleString()}<span className="text-ink-3">{dial.fraction ? `.${dial.fraction}` : ''} {meta.unit}</span>
            </p>
            <p className="mt-0.5 text-[13px] text-ink-2">{dialInWords(dial, utility)}</p>
            {delta !== null && (
              <p className={cn('mt-2 border-t border-line pt-2 text-[13px]', backwards ? 'text-danger' : 'text-ink-2')}>
                {backwards
                  ? <>That’s <strong>lower</strong> than the {fmtDate(previous!.read_on, 'd MMM')} reading of {Number(previous!.reading).toLocaleString()} {meta.unit} — worth another look at the dial.</>
                  : <>{usedLabel(delta, utility)} since {fmtDate(previous!.read_on, 'd MMM')}.</>}
              </p>
            )}
          </div>
        )}

        {/* Set once per meter, but kept here because this is where being wrong shows. */}
        <Field label="Red wheels on this meter" hint="The fractional ones at the end. Change it if the split above looks wrong.">
          {() => (
            <Segmented<string>
              value={String(decimals)}
              onChange={(v) => void updateHomeDetails(utility === 'water' ? { water_meter_decimals: Number(v) } : { electricity_meter_decimals: Number(v) })}
              size="sm"
              options={[0, 1, 2, 3, 4].map((d) => ({ value: String(d), label: d === 0 ? 'None' : String(d) }))}
            />
          )}
        </Field>

        <Field label="Where the number came from">
          {(id) => (
            <Select id={id} value={source} onChange={(e) => setSource(e.target.value as ReadingSource)}>
            {READING_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
          </Select>
          )}
          </Field>

        <Field label="Notes" hint="Anything you'd want to remember a year from now.">
          {(id) => (
            <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Meter still ticking with every tap closed." />
          )}
          </Field>
      </form>
    </Sheet>
  )
}
