import { useEffect, useRef, useState } from 'react'
import { ClipboardPaste, Contact as ContactIcon, FileUp, MapPin, Smartphone, Star } from 'lucide-react'
import type { Contact, NewContact } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useUi } from '../../store/ui'
import { cn } from '../../lib/utils'
import { canPickFromPhone, mapsSearchUrl, parsePastedDetails, parseVCards, pickFromPhone, readFileText, type ParsedContact } from '../../lib/contacts'
import { isIOS, openExternal } from '../../lib/share'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Sheet, usePrompt } from '../ui/Sheet'

export function emptyContact(): NewContact {
  return { name: '', company: '', role: 'contractor', phone: '', email: '', whatsapp: '', notes: '', rating: null }
}

export function ContactSheet({ open, onOpenChange, contact, onSaved, initial }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  contact?: Contact | null
  onSaved?: (c: Contact) => void
  /** Prefill for a brand-new contact (e.g. the name typed into a search box). */
  initial?: Partial<NewContact>
}) {
  const { createContact, updateContact } = useActions()
  const toast = useUi((s) => s.toast)
  const prompt = usePrompt()
  const [v, setV] = useState<NewContact>(emptyContact)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const phonePicker = canPickFromPhone()

  useEffect(() => {
    if (open) {
      setErr(null)
      setPasteOpen(false); setPasted('')
      setV(contact
        ? { name: contact.name, company: contact.company, role: contact.role, phone: contact.phone, email: contact.email, whatsapp: contact.whatsapp, notes: contact.notes, rating: contact.rating }
        : { ...emptyContact(), ...initial })
    }
  }, [open, contact, initial])

  const set = <K extends keyof NewContact>(k: K, val: NewContact[K]) => setV((s) => ({ ...s, [k]: val }))

  const vRef = useRef(v)
  vRef.current = v

  /** Merge parsed details in — fills blanks, never overwrites what's already typed. */
  const fill = (p: ParsedContact, source: string) => {
    const s = vRef.current
    const n = { ...s }
    let filled = 0
    const put = (k: 'name' | 'company' | 'phone' | 'whatsapp' | 'email' | 'notes', val: string | undefined) => {
      if (val && !n[k].trim()) { n[k] = val; filled++ }
    }
    put('name', p.name); put('company', p.company); put('phone', p.phone); put('whatsapp', p.whatsapp); put('email', p.email); put('notes', p.notes)
    if (p.role && !s.company && !s.name) n.role = p.role
    setV(n)
    setErr(null)
    toast({ title: filled ? `Filled in from ${source}` : `Nothing new to fill from ${source}`, description: filled ? 'Check the details, then save.' : 'Every field already had something in it.', tone: filled ? 'success' : 'neutral' })
  }

  const fromPhone = async () => {
    try {
      const p = await pickFromPhone()
      if (p) fill(p, 'your phone')
    } catch (e) {
      toast({ title: "Couldn't open your contacts", description: e instanceof Error ? e.message : '', tone: 'danger' })
    }
  }

  const fromFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const cards = parseVCards(await readFileText(file))
      if (!cards.length) { toast({ title: 'No contact found in that file', description: 'It should be a .vcf contact card.', tone: 'danger' }); return }
      fill(cards[0]!, 'the contact card')
    } catch (e) {
      toast({ title: "Couldn't read that file", description: e instanceof Error ? e.message : '', tone: 'danger' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const fromMaps = async () => {
    const seed = v.company || v.name
    const q = seed || (await prompt({ title: 'Find on Google Maps', label: 'Business, trade or area', placeholder: 'Plumber Fourways', confirmLabel: 'Search' }))
    if (!q) return
    openExternal(mapsSearchUrl(q))
    toast({ title: 'Opened Google Maps', description: 'Copy the number or address there, then use “Paste details” here.', duration: 7000 })
  }

  const applyPaste = () => {
    if (!pasted.trim()) return
    fill(parsePastedDetails(pasted), 'the pasted text')
    setPasted(''); setPasteOpen(false)
  }

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
        {/* Fill from… */}
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Fill in from</p>
          <div className="flex flex-wrap gap-2">
            {phonePicker && <Button size="sm" variant="secondary" leading={<Smartphone className="size-4" />} onClick={fromPhone}>Phone contacts</Button>}
            <Button size="sm" variant="secondary" leading={<MapPin className="size-4" />} onClick={fromMaps}>Google Maps</Button>
            <Button size="sm" variant="secondary" leading={<ClipboardPaste className="size-4" />} onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>Paste details</Button>
            <Button size="sm" variant="secondary" leading={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>Contact card</Button>
            <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard,text/directory" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
          </div>
          {pasteOpen && (
            <div className="mt-3">
              <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={4} autoFocus placeholder={'Paste a WhatsApp message, email signature or Maps listing — e.g.\nJoe Mahlangu · Joe’s Joinery\n082 555 0141 · joe@example.co.za'} aria-label="Pasted details" />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setPasted(''); setPasteOpen(false) }}>Cancel</Button>
                <Button size="sm" onClick={applyPaste} disabled={!pasted.trim()}>Pull out the details</Button>
              </div>
            </div>
          )}
          {!phonePicker && !pasteOpen && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              {isIOS()
                ? <>Phone contacts on iPhone: switch on <b>Settings → Safari → Advanced → Feature Flags → Contact Picker API</b>, or share the contact as a card and use “Contact card”.</>
                : <>On an Android phone a “Phone contacts” button appears here too. Anywhere else, share the contact as a card (.vcf) and import it.</>}
            </p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Name" required error={err ?? undefined}>{(id) => <Input id={id} value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Joe Mahlangu" autoFocus={!initial?.name} />}</Field>
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
        <p className="flex items-center gap-1.5 text-[12px] text-ink-3"><ContactIcon className="size-3.5" /> Contacts are shared — whatever you save here, the other one of you sees too.</p>
      </div>
    </Sheet>
  )
}
