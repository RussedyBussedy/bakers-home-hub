import { useEffect, useState } from 'react'
import { Check, ImagePlus } from 'lucide-react'
import type { BoardItem, BoardItemData, BoardItemType, ColorData, LabelData, LinkData, NoteData, PhotoData, ProductData } from '../../data/types'
import { CURATED_PALETTES, isHex, nameColor, normaliseHex, textOn } from '../../lib/colors'
import { cn, domainOf, normaliseUrl } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Sheet } from '../ui/Sheet'
import { NOTE_TINTS } from './Pins'

export interface PinDraft { type: BoardItemType; data: BoardItemData; imageFile?: File | null }

const TITLES: Record<BoardItemType, string> = { photo: 'Photo', color: 'Colour swatch', note: 'Note', link: 'Link', product: 'Product', label: 'Label' }

export function PinEditor({ open, onOpenChange, type, item, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; type: BoardItemType; item?: BoardItem | null; onSave: (draft: PinDraft) => Promise<void> | void }) {
  const [data, setData] = useState<BoardItemData>(() => blank(type))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null); setFile(null)
    setData(item ? { ...item.data } : blank(type))
  }, [open, item, type])

  const save = async () => {
    const e = validate(type, data)
    if (e) { setErr(e); return }
    setBusy(true)
    try {
      let d = data
      if (type === 'link') { const l = d as LinkData; d = { ...l, url: normaliseUrl(l.url), domain: domainOf(l.url), title: l.title.trim() || domainOf(l.url) } }
      if (type === 'color') { const c = d as ColorData; const hex = normaliseHex(c.hex); d = { ...c, hex, name: c.name.trim() || nameColor(hex) } }
      await onSave({ type, data: d, imageFile: file })
      onOpenChange(false)
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={item ? `Edit ${TITLES[type].toLowerCase()}` : `Add a ${TITLES[type].toLowerCase()}`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} loading={busy}>{item ? 'Save' : 'Pin it'}</Button></>}>
      <div className="flex flex-col gap-4 pt-2">
        {type === 'note' && <NoteFields data={data as NoteData} onChange={setData} error={err} />}
        {type === 'link' && <LinkFields data={data as LinkData} onChange={setData} error={err} />}
        {type === 'product' && <ProductFields data={data as ProductData} onChange={setData} error={err} file={file} setFile={setFile} />}
        {type === 'label' && <LabelFields data={data as LabelData} onChange={setData} error={err} />}
        {type === 'color' && <ColorFields data={data as ColorData} onChange={setData} error={err} />}
        {type === 'photo' && <PhotoFields data={data as PhotoData} onChange={setData} />}
      </div>
    </Sheet>
  )
}

export function blank(type: BoardItemType): BoardItemData {
  switch (type) {
    case 'photo': return { path: '', caption: '' }
    case 'color': return { hex: '#7A8F6E', name: 'Dusty Sage' }
    case 'note': return { text: '', tint: 'butter' }
    case 'link': return { url: '', title: '', domain: '' }
    case 'product': return { title: '', price: null, supplier: '', url: '' }
    case 'label': return { text: '', style: 'tag' }
  }
}

function validate(type: BoardItemType, d: BoardItemData): string | null {
  if (type === 'note' && !(d as NoteData).text.trim()) return 'Write something first.'
  if (type === 'link' && !(d as LinkData).url.trim()) return 'Paste a link.'
  if (type === 'product' && !(d as ProductData).title.trim()) return 'What is it?'
  if (type === 'label' && !(d as LabelData).text.trim()) return 'Type the label.'
  if (type === 'color' && !isHex((d as ColorData).hex)) return 'That doesn’t look like a colour code (e.g. #7A8F6E).'
  return null
}

function NoteFields({ data, onChange, error }: { data: NoteData; onChange: (d: NoteData) => void; error: string | null }) {
  return (
    <>
      <Field label="Note" required error={error ?? undefined}>{(id) => <Textarea id={id} value={data.text} onChange={(e) => onChange({ ...data, text: e.target.value })} rows={4} placeholder="Handles: brushed brass, 160mm centres…" autoFocus />}</Field>
      <div>
        <p className="mb-2 text-[13px] font-medium text-ink-2">Colour</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(NOTE_TINTS) as NoteData['tint'][]).map((t) => (
            <button key={t} type="button" onClick={() => onChange({ ...data, tint: t })} aria-pressed={data.tint === t} aria-label={NOTE_TINTS[t].label}
              className={cn('grid size-10 place-items-center rounded-xl border transition-transform hover:scale-105', data.tint === t ? 'border-ink ring-2 ring-ink/20' : 'border-line')} style={{ background: NOTE_TINTS[t].bg, color: NOTE_TINTS[t].ink }}>
              {data.tint === t && <Check className="size-4" />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function LinkFields({ data, onChange, error }: { data: LinkData; onChange: (d: LinkData) => void; error: string | null }) {
  return (
    <>
      <Field label="Link" required error={error ?? undefined} hint="Pinterest, a supplier page, a YouTube how-to — anything.">{(id) => <Input id={id} type="url" inputMode="url" value={data.url} onChange={(e) => onChange({ ...data, url: e.target.value })} placeholder="https://" autoFocus />}</Field>
      <Field label="Title" hint="Leave blank to use the site name.">{(id) => <Input id={id} value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} placeholder="Sage shaker kitchens" />}</Field>
      <Field label="Preview image URL (optional)">{(id) => <Input id={id} type="url" inputMode="url" value={data.image_url ?? ''} onChange={(e) => onChange({ ...data, image_url: e.target.value || undefined })} placeholder="https://…/image.jpg" />}</Field>
    </>
  )
}

function ProductFields({ data, onChange, error, file, setFile }: { data: ProductData; onChange: (d: ProductData) => void; error: string | null; file: File | null; setFile: (f: File | null) => void }) {
  return (
    <>
      <Field label="Product" required error={error ?? undefined}>{(id) => <Input id={id} value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} placeholder="Brass bar handle 160mm" autoFocus />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price">{(id) => <Input id={id} prefix="R" inputMode="decimal" value={data.price ?? ''} onChange={(e) => onChange({ ...data, price: e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} placeholder="0" />}</Field>
        <Field label="Supplier">{(id) => <Input id={id} value={data.supplier ?? ''} onChange={(e) => onChange({ ...data, supplier: e.target.value })} placeholder="Builders" />}</Field>
      </div>
      <Field label="Link (optional)">{(id) => <Input id={id} type="url" inputMode="url" value={data.url ?? ''} onChange={(e) => onChange({ ...data, url: e.target.value })} placeholder="https://" />}</Field>
      <Field label="Photo">
        {(id) => (
          <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-3.5 text-sm text-ink-2 hover:text-ink">
            <ImagePlus className="size-4" /> {file ? file.name : data.image_path ? 'Photo attached — tap to replace' : 'Add a product photo'}
            <input id={id} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </Field>
    </>
  )
}

function LabelFields({ data, onChange, error }: { data: LabelData; onChange: (d: LabelData) => void; error: string | null }) {
  return (
    <>
      <Field label="Label" required error={error ?? undefined}>{(id) => <Input id={id} value={data.text} onChange={(e) => onChange({ ...data, text: e.target.value })} placeholder="Wall run 3.6 m" autoFocus />}</Field>
      <Field label="Style">
        {(id) => (
          <Select id={id} value={data.style} onChange={(e) => onChange({ ...data, style: e.target.value as LabelData['style'] })}>
            <option value="tag">Tag</option>
            <option value="measure">Measurement</option>
            <option value="arrow">Callout</option>
          </Select>
        )}
      </Field>
    </>
  )
}

function ColorFields({ data, onChange, error }: { data: ColorData; onChange: (d: ColorData) => void; error: string | null }) {
  const valid = isHex(data.hex)
  const hex = valid ? normaliseHex(data.hex) : '#888888'
  return (
    <>
      <div className="flex items-center gap-4">
        <label className="relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl shadow-sm" style={{ background: hex, color: textOn(hex) }}>
          <span className="text-[11px] font-semibold uppercase">Pick</span>
          <input type="color" value={hex} onChange={(e) => onChange({ ...data, hex: e.target.value, name: nameColor(e.target.value) })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Colour picker" />
        </label>
        <div className="flex flex-1 flex-col gap-3">
          <Field label="Hex code" error={error ?? undefined}>{(id) => <Input id={id} value={data.hex} onChange={(e) => { const v = e.target.value; onChange({ ...data, hex: v, name: isHex(v) ? nameColor(v) : data.name }) }} placeholder="#7A8F6E" className="uppercase tabular" />}</Field>
          <Field label="Name">{(id) => <Input id={id} value={data.name} onChange={(e) => onChange({ ...data, name: e.target.value })} placeholder="Dusty Sage" />}</Field>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium text-ink-2">Or start from a palette</p>
        <div className="flex flex-col gap-2">
          {CURATED_PALETTES.map((p) => (
            <div key={p.name} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-xs text-ink-3">{p.name}</span>
              <div className="flex flex-1 gap-1.5">
                {p.colors.map((c) => (
                  <button key={c} type="button" onClick={() => onChange({ ...data, hex: c, name: nameColor(c) })} aria-label={`${nameColor(c)} ${c}`} className={cn('h-9 flex-1 rounded-lg transition-transform hover:scale-105', hex.toLowerCase() === c.toLowerCase() && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')} style={{ background: c }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function PhotoFields({ data, onChange }: { data: PhotoData; onChange: (d: PhotoData) => void }) {
  return <Field label="Caption">{(id) => <Input id={id} value={data.caption ?? ''} onChange={(e) => onChange({ ...data, caption: e.target.value })} placeholder="Sage + oak + brass" autoFocus />}</Field>
}
