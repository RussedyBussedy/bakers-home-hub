import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import type { Contact, NewContact } from '../../data/types'
import { useActions } from '../../data/hooks'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Sheet } from '../ui/Sheet'

export function emptyContact(): NewContact {
  return { name: '', company: '', role: 'contractor', phone: '', email: '', whatsapp: '', notes: '', rating: null }
}

export function ContactSheet({ open, onOpenChange, contact, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; contact?: Contact | null; onSaved?: (c: Contact) => void }) {
  const { createContact, updateContact } = useActions()
  const [v, setV] = useState<NewContact>(emptyContact)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setErr(null)
      setV(contact ? { name: contact.name, company: contact.company, role: contact.role, phone: contact.phone, email: contact.email, whatsapp: contact.whatsapp, notes: contact.notes, rating: contact.rating } : emptyContact())
    }
  }, [open, contact])

  const set = <K extends keyof NewContact>(k: K, val: NewContact[K]) => setV((s) => ({ ...s, [k]: val }))

  const save = async () => {
    if (!v.name.trim()) { setErr('Give them a name.'); return }
    setBusy(true)
    try {
      const payload = { ...v, name: v.name.trim(), whatsapp: v.whatsapp.replace(/[^\d]/g, '') }
      const saved = contact ? await updateContact(contact.id, payload) : await createContact(payload)
      onSaved?.(saved)
      onOpenChange(false)
    } catch {
      /* toast shown by actions */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? 'Edit contact' : 'New contact'}
      description="A supplier, contractor or designer you'd call again (or never again)."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} loading={busy}>{contact ? 'Save' : 'Add contact'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Name" required error={err ?? undefined}>{(id) => <Input id={id} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Joe Mahlangu" autoFocus />}</Field>
          <Field label="Role">
            {(id) => (
              <Select id={id} value={v.role} onChange={(e) => set('role', e.target.value as NewContact['role'])} className="w-36">
                <option value="contractor">Contractor</option>
                <option value="supplier">Supplier</option>
                <option value="designer">Designer</option>
                <option value="other">Other</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Company">{(id) => <Input id={id} value={v.company} onChange={(e) => set('company', e.target.value)} placeholder="Joe's Joinery" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">{(id) => <Input id={id} type="tel" inputMode="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} placeholder="082 555 0141" />}</Field>
          <Field label="WhatsApp" hint="With country code, e.g. 27825550141">{(id) => <Input id={id} type="tel" inputMode="tel" value={v.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="27…" />}</Field>
        </div>
        <Field label="Email">{(id) => <Input id={id} type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} placeholder="joe@example.co.za" />}</Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Rating</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => set('rating', v.rating === n ? null : n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="grid size-10 place-items-center rounded-xl hover:bg-surface-2">
                <Star className={cn('size-6 transition-colors', v.rating && n <= v.rating ? 'fill-gold text-gold' : 'text-line-strong')} />
              </button>
            ))}
          </div>
        </div>
        <Field label="Notes">{(id) => <Textarea id={id} value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Turned up on time, quote included VAT, brought his own primer…" />}</Field>
      </div>
    </Sheet>
  )
}
