import { useEffect, useState, type FormEvent } from 'react'
import { Check, ClipboardPaste, TriangleAlert } from 'lucide-react'
import { type UtilityPurchase, type Utility } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { blendedRate, parseTopUpSms, type TopUpSms } from '../../lib/meters'
import { money, nowTime, todayISO } from '../../lib/utils'
import { Button } from '../ui/Button'
import { DateInput, Field, Input, Textarea, TimeInput } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

/**
 * A prepaid top-up: what left the bank, and what landed on the meter.
 *
 * Both halves are needed. The rand alone can't tell you what a unit cost, and
 * the units alone can't tell you what a day of living costs — and the gap
 * between them is where a monthly service fee hides.
 *
 * The bank already sends all of it. So the form starts with the message rather
 * than with an empty box: paste it and the fields fill themselves, which also
 * means the token is never mistyped and the fee is never quietly dropped.
 */
export function TopUpSheet({ open, onOpenChange, utility = 'electricity', purchases, edit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  utility?: Utility
  purchases: UtilityPurchase[]
  edit?: UtilityPurchase | null
}) {
  const { logPurchase, updatePurchase, updateHomeDetails } = useActions()
  const { household } = useAuth()
  const [amount, setAmount] = useState('')
  const [units, setUnits] = useState('')
  const [when, setWhen] = useState(todayISO())
  const [at, setAt] = useState(nowTime())
  const [token, setToken] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const [sms, setSms] = useState('')
  const [read, setRead] = useState<TopUpSms | null>(null)
  const [clipFailed, setClipFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount(edit ? String(edit.amount) : '')
    setUnits(edit ? String(edit.units) : '')
    setWhen(edit?.bought_on ?? todayISO())
    // Now, unless the message says otherwise — it is what tells a token loaded
    // this evening apart from the reading taken this morning.
    setAt(edit ? (edit.bought_time ?? '') : nowTime())
    setToken(edit?.token ?? '')
    setNotes(edit?.notes ?? '')
    setSms(''); setRead(null); setClipFailed(false)
  }, [open, edit])

  /** Take the message apart and put it in the form. */
  const applySms = (raw: string) => {
    setSms(raw)
    const r = parseTopUpSms(raw)
    setRead(r)
    if (!r) return
    if (r.amount !== null) setAmount(String(r.amount))
    if (r.units !== null) setUnits(String(r.units))
    if (r.token) setToken(r.token)
    if (r.boughtOn) setWhen(r.boughtOn)
    if (r.boughtAt) setAt(r.boughtAt)
    if (r.serviceFee) {
      // Worth writing down: it is why this token bought fewer units per rand.
      const line = `Service fee ${money(r.serviceFee, { cents: true })} came off this one.`
      setNotes((n) => (n.trim() ? n : line))
    }
  }

  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t && t.trim()) { applySms(t); setClipFailed(false); return }
      setClipFailed(true)
    } catch { setClipFailed(true) }
  }

  const a = Number(amount), u = Number(units)
  const rate = a > 0 && u > 0 ? a / u : null
  const usual = blendedRate(purchases.filter((p) => p.id !== edit?.id), utility)
  // A first token of the month carries the service fee, so it buys noticeably less.
  const dearer = rate !== null && usual !== null && rate > usual * 1.12

  const houseMeter = (household?.electricity_meter_no ?? '').replace(/\D/g, '')
  const smsMeter = read?.meter ?? ''
  const meterWrong = !!smsMeter && !!houseMeter && smsMeter !== houseMeter
  const meterUnknown = !!smsMeter && !houseMeter
  // The message stated a total of its own and it doesn't match the parts: one of
  // the two numbers was read wrong, and guessing which would be worse than saying so.
  const totalOdd = read?.stated != null && read.amount != null && Math.abs(read.stated - read.amount) > 0.05

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!(a > 0)) return
    setBusy(true)
    try {
      const payload = { bought_on: when, bought_time: at.trim() || null, amount: a, units: u || 0, token: token.trim(), notes: notes.trim() }
      if (edit) await updatePurchase(edit.id, payload)
      else await logPurchase({ ...payload, utility, receipt_path: null })
      onOpenChange(false)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={edit ? 'Edit the top-up' : 'New top-up'}
      description="Straight off the token SMS."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!(a > 0)}>{edit ? 'Save' : 'Log it'}</Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4 pt-1">
        {/* The message from the bank, which already knows everything below. */}
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-ink-2">Paste the payment SMS</p>
            <Button type="button" size="sm" variant="secondary" leading={<ClipboardPaste className="size-4" />} onClick={fromClipboard} className="shrink-0">
              Paste
            </Button>
          </div>
          <Textarea
            value={sms}
            onChange={(e) => applySms(e.target.value)}
            rows={sms ? 3 : 2}
            className="mt-2 text-[13px]"
            placeholder="FNB :-) Prepaid Electricity… Elec Amt R2 904.54, Service Fee R95.46, Units 774.1kWh, Token…"
            aria-label="Payment SMS"
          />
          {clipFailed && (
            <p className="mt-1.5 text-[13px] text-ink-3">Couldn’t reach the clipboard — paste into the box instead.</p>
          )}
          {sms.trim() && !read && (
            <p className="mt-1.5 text-[13px] text-ink-3">Nothing in that reads like a top-up. Fill it in below and it’ll save just the same.</p>
          )}

          {read && (
            <div className="mt-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-sage-text">
                <Check className="size-3.5" aria-hidden /> Read from the message
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                {read.amount !== null && (
                  <><strong className="text-ink">{money(read.amount, { cents: true })}</strong>
                    {read.units !== null && <> for <strong className="text-ink">{read.units.toLocaleString()} kWh</strong></>}. </>
                )}
                {read.elec !== null && read.serviceFee !== null && (
                  <>{money(read.elec, { cents: true })} of electricity plus a {money(read.serviceFee, { cents: true })} service fee
                    {read.vat !== null && <>, {money(read.vat, { cents: true })} of it VAT</>}. </>
                )}
                {read.token && <>Token ending {read.token.slice(-4)}. </>}
                {!read.boughtOn && <>No date in the message, so it’s dated today — change it below if that’s wrong.</>}
                {read.boughtOn && read.boughtAt && <>Bought at {read.boughtAt}.</>}
              </p>
              {totalOdd && (
                <p className="mt-2 flex gap-1.5 border-t border-line pt-2 text-[13px] text-danger">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>The message says {money(read!.stated!, { cents: true })}, but the parts add to {money(read!.amount!, { cents: true })}. Check which one left your account.</span>
                </p>
              )}
              {meterWrong && (
                <p className="mt-2 flex gap-1.5 border-t border-line pt-2 text-[13px] text-danger">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>That token is for meter {smsMeter}, not your {houseMeter}. Worth a second look before you punch it in.</span>
                </p>
              )}
              {meterUnknown && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-[13px] text-ink-2">
                  <span>Meter {smsMeter}.</span>
                  <Button type="button" size="sm" variant="secondary"
                    onClick={() => void updateHomeDetails({ electricity_meter_no: smsMeter })}>
                    Save as ours
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid" required>
          {(id) => (
            <Input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" type="number" step="any" placeholder="500" />
          )}
          </Field>
          <Field label="Units received (kWh)" required>
          {(id) => (
            <Input id={id} value={units} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" type="number" step="any" placeholder="128.9" />
          )}
          </Field>
        </div>

        {rate !== null && (
          <div className="rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
            <strong className="text-ink">{money(rate, { cents: true })}</strong> a unit.
            {usual !== null && (dearer
              ? <> That’s dearer than your usual {money(usual, { cents: true })} — the monthly service fee comes off the first token of the month.</>
              : <> About your usual {money(usual, { cents: true })}.</>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bought on" required>
          {(id) => (
            <DateInput id={id} value={when} onChange={(e) => setWhen(e.target.value)} max={todayISO()} />
          )}
          </Field>
          <Field label="At" hint="Settles it against the day's reading.">
          {(id) => (
            <TimeInput id={id} value={at} onChange={(e) => setAt(e.target.value)} />
          )}
          </Field>
        </div>

        <Field label="Token" hint="Optional — handy if the meter ever refuses one.">
          {(id) => (
            <Input id={id} value={token} onChange={(e) => setToken(e.target.value)} inputMode="numeric" placeholder="0000 0000 0000 0000 0000" />
          )}
          </Field>

        <Field label="Notes">
          {(id) => (
            <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Service fee came off this one." />
          )}
          </Field>
      </form>
    </Sheet>
  )
}
