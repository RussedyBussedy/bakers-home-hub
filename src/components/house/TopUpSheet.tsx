import { useEffect, useState, type FormEvent } from 'react'
import { type UtilityPurchase, type Utility } from '../../data/types'
import { useActions } from '../../data/hooks'
import { blendedRate } from '../../lib/meters'
import { money, todayISO } from '../../lib/utils'
import { Button } from '../ui/Button'
import { DateInput, Field, Input, Textarea } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

/**
 * A prepaid top-up: what left the bank, and what landed on the meter.
 *
 * Both halves are needed. The rand alone can't tell you what a unit cost, and
 * the units alone can't tell you what a day of living costs — and the gap
 * between them is where a monthly service fee hides.
 */
export function TopUpSheet({ open, onOpenChange, utility = 'electricity', purchases, edit }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  utility?: Utility
  purchases: UtilityPurchase[]
  edit?: UtilityPurchase | null
}) {
  const { logPurchase, updatePurchase } = useActions()
  const [amount, setAmount] = useState('')
  const [units, setUnits] = useState('')
  const [when, setWhen] = useState(todayISO())
  const [token, setToken] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount(edit ? String(edit.amount) : '')
    setUnits(edit ? String(edit.units) : '')
    setWhen(edit?.bought_on ?? todayISO())
    setToken(edit?.token ?? '')
    setNotes(edit?.notes ?? '')
  }, [open, edit])

  const a = Number(amount), u = Number(units)
  const rate = a > 0 && u > 0 ? a / u : null
  const usual = blendedRate(purchases.filter((p) => p.id !== edit?.id), utility)
  // A first token of the month carries the service fee, so it buys noticeably less.
  const dearer = rate !== null && usual !== null && rate > usual * 1.12

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!(a > 0)) return
    setBusy(true)
    try {
      const payload = { bought_on: when, amount: a, units: u || 0, token: token.trim(), notes: notes.trim() }
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid" required>
          {(id) => (
            <Input id={id} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" type="number" step="any" placeholder="500" autoFocus />
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

        <Field label="Bought on" required>
          {(id) => (
            <DateInput id={id} value={when} onChange={(e) => setWhen(e.target.value)} max={todayISO()} />
          )}
          </Field>

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
