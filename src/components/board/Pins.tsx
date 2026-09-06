import { ExternalLink, Globe, Ruler, Tag, ArrowRight, ImageOff, ShoppingBag } from 'lucide-react'
import { openExternal } from '../../lib/share'
import type { BoardItem, ColorData, LabelData, LinkData, NoteData, PhotoData, ProductData } from '../../data/types'
import { useMediaUrl } from '../../data/hooks'
import { textOn } from '../../lib/colors'
import { cn, money, normaliseUrl } from '../../lib/utils'

export const NOTE_TINTS: Record<NoteData['tint'], { bg: string; ink: string; label: string }> = {
  butter: { bg: '#FBEBB5', ink: '#4A3A0F', label: 'Butter' },
  blush: { bg: '#F8D6CB', ink: '#5A2E22', label: 'Blush' },
  mint: { bg: '#D6EBD4', ink: '#254427', label: 'Mint' },
  sky: { bg: '#D6E6F2', ink: '#1F3A52', label: 'Sky' },
  lilac: { bg: '#E6DCF0', ink: '#3E2B4F', label: 'Lilac' },
  paper: { bg: '#FBF7EF', ink: '#2A2420', label: 'Paper' },
}

/** Default sizes for freshly added pins (world units). */
export const DEFAULT_SIZES: Record<BoardItem['type'], { w: number; h: number }> = {
  photo: { w: 320, h: 240 },
  color: { w: 150, h: 150 },
  note: { w: 240, h: 170 },
  link: { w: 280, h: 120 },
  product: { w: 240, h: 300 },
  label: { w: 190, h: 56 },
}

export function Pin({ item, preview }: { item: BoardItem; preview?: boolean }) {
  switch (item.type) {
    case 'photo': return <PhotoPin data={item.data as PhotoData} preview={preview} />
    case 'color': return <ColorPin data={item.data as ColorData} />
    case 'note': return <NotePin data={item.data as NoteData} />
    case 'link': return <LinkPin data={item.data as LinkData} preview={preview} />
    case 'product': return <ProductPin data={item.data as ProductData} preview={preview} />
    case 'label': return <LabelPin data={item.data as LabelData} />
  }
}

function Tape({ className }: { className?: string }) {
  return <span className={cn('pointer-events-none absolute left-1/2 top-0 h-6 w-20 -translate-x-1/2 -translate-y-1/2 rotate-[-2deg] rounded-[2px] bg-[#f3e6c2]/80 shadow-[0_1px_2px_rgba(0,0,0,0.12)] backdrop-blur-[1px]', className)} aria-hidden style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 6px)' }} />
}

export function PhotoPin({ data, preview }: { data: PhotoData; preview?: boolean }) {
  const url = useMediaUrl(data.path)
  return (
    <div className="relative flex h-full w-full flex-col bg-[#fffdfa] p-[3.5%] shadow-pin">
      {!preview && <Tape />}
      <div className="min-h-0 flex-1 overflow-hidden bg-[#efe7db]">
        {url ? <img src={url} alt={data.caption ?? ''} className="h-full w-full object-cover" draggable={false} /> : <div className="grid h-full w-full place-items-center text-[#b7a891]"><ImageOff className="size-8" /></div>}
      </div>
      {data.caption ? <p className="mt-[3%] shrink-0 truncate px-1 font-display text-[13px] italic leading-tight text-[#4a4038]">{data.caption}</p> : <div className="mt-[3%] h-2 shrink-0" />}
    </div>
  )
}

export function ColorPin({ data }: { data: ColorData }) {
  const ink = textOn(data.hex)
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[10px] bg-[#fffdfa] shadow-pin">
      <div className="min-h-0 flex-1" style={{ background: data.hex }}>
        <div className="flex h-full items-end p-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] opacity-70" style={{ color: ink }}>{data.source ?? ''}</div>
      </div>
      <div className="flex h-[46px] shrink-0 flex-col justify-center px-2.5 leading-tight">
        <p className="truncate text-[12px] font-medium text-[#1e1a16]">{data.name}</p>
        <p className="truncate text-[10px] text-[#8a8078]"><span className="uppercase tabular">{data.hex}</span>{data.ral ? ` · ${data.ral.replace(/^RAL (\d+).*$/, 'RAL $1')}` : ''}</p>
      </div>
    </div>
  )
}

export function NotePin({ data }: { data: NoteData }) {
  const t = NOTE_TINTS[data.tint] ?? NOTE_TINTS.butter
  return (
    <div className="relative h-full w-full overflow-hidden p-4 shadow-pin" style={{ background: t.bg, color: t.ink }}>
      <p className="whitespace-pre-wrap font-display text-[17px] leading-snug" style={{ fontVariationSettings: "'opsz' 24, 'SOFT' 100, 'WONK' 1" }}>{data.text || 'Empty note'}</p>
      <span className="pointer-events-none absolute bottom-0 right-0 size-6" style={{ background: `linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.08) 50%)` }} aria-hidden />
    </div>
  )
}

/** The web address a pin points at, if it has one (link pins, and products with a shop link). */
export function pinUrl(item: BoardItem): string | null {
  const raw = item.type === 'link' ? (item.data as LinkData).url : item.type === 'product' ? (item.data as ProductData).url : null
  const url = normaliseUrl(raw ?? '')
  return url || null
}

/** The little ↗ on a pin. Swallows the pointer so the board doesn't read the press as the start of a drag. */
function OpenButton({ url, label, className }: { url: string; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); openExternal(url) }}
      className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[#8a8078] transition-colors hover:bg-[#f4ede3] hover:text-[#1e1a16]', className)}
    >
      <ExternalLink className="size-4" />
    </button>
  )
}

// Not an <a>: a tap selects the pin (so it can be dragged like everything else) and the board shows an
// "Open" button for it — a plain link would either navigate on every touch or never fire under drag handling.
export function LinkPin({ data, preview }: { data: LinkData; preview?: boolean }) {
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(data.domain)}&sz=64`
  const url = normaliseUrl(data.url ?? '')
  return (
    <div className="flex h-full w-full items-center gap-3 overflow-hidden rounded-2xl border border-[#e6dccf] bg-[#fffdfa] p-3.5 shadow-pin">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f4ede3] text-[#8a8078]">
        {data.image_url ? <img src={data.image_url} alt="" className="h-full w-full object-cover" draggable={false} /> : <img src={favicon} alt="" className="size-6" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement).style.display = 'block' }} draggable={false} />}
        <Globe className="hidden size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1e1a16]">{data.title || data.domain}</span>
        <span className="mt-0.5 block truncate text-[11px] text-[#8a8078]">{data.domain}</span>
      </span>
      {preview || !url ? <ExternalLink className="size-4 shrink-0 text-[#b3a79a]" /> : <OpenButton url={url} label={`Open ${data.domain}`} />}
    </div>
  )
}

export function ProductPin({ data, preview }: { data: ProductData; preview?: boolean }) {
  const url = useMediaUrl(data.image_path ?? null)
  const shop = normaliseUrl(data.url ?? '')
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#e6dccf] bg-[#fffdfa] shadow-pin">
      <div className="min-h-0 flex-1 bg-[#f4ede3]">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" draggable={false} /> : <div className="grid h-full place-items-center text-[#b7a891]"><ShoppingBag className="size-8" /></div>}
      </div>
      {shop && !preview && <OpenButton url={shop} label="Open the shop page" className="absolute right-1.5 top-1.5 bg-[#fffdfa]/90 shadow-sm hover:bg-[#fffdfa]" />}
      <div className="shrink-0 p-3">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-[#1e1a16]">{data.title}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display-tight text-[17px] text-[#1e1a16] tabular">{data.price != null ? money(data.price) : '—'}</span>
          {data.supplier && <span className="truncate text-[11px] text-[#8a8078]">{data.supplier}</span>}
        </div>
      </div>
    </div>
  )
}

export function LabelPin({ data }: { data: LabelData }) {
  const Icon = data.style === 'measure' ? Ruler : data.style === 'arrow' ? ArrowRight : Tag
  return (
    <div className={cn('flex h-full w-full items-center gap-2 overflow-hidden rounded-full px-4 shadow-pin', data.style === 'measure' ? 'bg-[#1e1a16] text-[#f6f1e9]' : data.style === 'arrow' ? 'bg-[#B84D24] text-[#fffdfa]' : 'bg-[#D9A441] text-[#1e1a16]')}>
      <Icon className="size-4 shrink-0" />
      <span className="truncate text-[14px] font-semibold tracking-tight">{data.text}</span>
    </div>
  )
}
