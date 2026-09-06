import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, ChevronLeft, ChevronRight, ImagePlus, MoreHorizontal, Star, Trash2, X } from 'lucide-react'
import type { ImageKind, Project, ProjectImage } from '../../data/types'
import { useActions, useMediaUrl } from '../../data/hooks'
import { useAuth } from '../../data/session'
import { readImageSize } from '../../lib/images'
import { cn, fmtDate } from '../../lib/utils'
import { useCalm } from '../../store/ui'
import { Avatar, EmptyState, Pill } from '../ui/Bits'
import { Button, IconButton } from '../ui/Button'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'
import { useConfirm, usePrompt } from '../ui/Sheet'
import { useUi } from '../../store/ui'

const KINDS: { value: ImageKind; label: string; tone: 'sky' | 'ochre' | 'sage' | 'neutral' }[] = [
  { value: 'before', label: 'Before', tone: 'sky' },
  { value: 'space', label: 'The space', tone: 'ochre' },
  { value: 'after', label: 'After', tone: 'sage' },
  { value: 'other', label: 'Other', tone: 'neutral' },
]

export function PhotosPanel({ project, images }: { project: Project; images: ProjectImage[] }) {
  const { addImage, deleteImage, updateImage, updateProject } = useActions()
  const { profileById } = useAuth()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const toast = useUi((s) => s.toast)
  const inputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<ImageKind>('space')
  const [uploading, setUploading] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setUploading(list.length)
    for (const f of list) {
      const size = await readImageSize(f)
      try {
        await addImage({ project_id: project.id, caption: '', kind, width: size.width || null, height: size.height || null, file: f })
      } catch { /* toast already shown */ }
      setUploading((n) => n - 1)
    }
    if (list.length > 1) toast({ title: `${list.length} photos added`, tone: 'success' })
  }

  const grouped = KINDS.map((k) => ({ ...k, items: images.filter((i) => i.kind === k.value) })).filter((g) => g.items.length > 0)

  return (
    <div>
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="text-sm text-ink-2">Add as</span>
          {KINDS.map((k) => (
            <button key={k.value} type="button" onClick={() => setKind(k.value)} aria-pressed={kind === k.value}
              className={cn('h-8 rounded-full border px-3 text-[13px] font-medium transition-colors', kind === k.value ? 'border-ink bg-ink text-bg' : 'border-line text-ink-2 hover:border-line-strong')}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" leading={<Camera className="size-4" />} onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment'); i.onchange = () => onFiles(i.files); i.click() }} className="sm:hidden">Camera</Button>
          <Button leading={<ImagePlus className="size-4" />} onClick={() => inputRef.current?.click()} loading={uploading > 0}>{uploading > 0 ? `Uploading ${uploading}…` : 'Add photos'}</Button>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
        </div>
      </div>

      {images.length === 0 ? (
        <div className="card mt-4">
          <EmptyState icon={<Camera />} title="No photos yet" description="Snap the space as it is now. A before-and-after pair earns a badge." />
        </div>
      ) : (
        grouped.map((g) => (
          <section key={g.value} className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-lg">{g.label}</h3>
              <Pill tone={g.tone} size="sm">{g.items.length}</Pill>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.items.map((img, i) => (
                <PhotoTile key={img.id} img={img} index={i} isCover={project.cover_path === img.path}
                  onOpen={() => setLightbox(images.indexOf(img))}
                  onCover={() => updateProject(project.id, { cover_path: img.path })}
                  onKind={(k) => updateImage(img.id, { kind: k })}
                  onCaption={async () => { const c = await prompt({ title: 'Caption', initial: img.caption, placeholder: 'e.g. Before the new doors' }); if (c !== null) updateImage(img.id, { caption: c }) }}
                  onDelete={async () => { if (await confirm({ title: 'Delete this photo?', confirmLabel: 'Delete', danger: true })) deleteImage(img) }}
                  by={profileById(img.created_by)?.display_name}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <AnimatePresence>
        {lightbox !== null && images[lightbox] && (
          <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
        )}
      </AnimatePresence>
    </div>
  )
}

function PhotoTile({ img, index, isCover, onOpen, onCover, onKind, onCaption, onDelete, by }: { img: ProjectImage; index: number; isCover: boolean; onOpen: () => void; onCover: () => void; onKind: (k: ImageKind) => void; onCaption: () => void; onDelete: () => void; by?: string }) {
  const calm = useCalm()
  const url = useMediaUrl(img.path)
  return (
    <motion.div initial={calm ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: calm ? 0 : Math.min(index, 8) * 0.04 }} className="group relative overflow-hidden rounded-2xl bg-surface-2 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full" aria-label={img.caption || 'Open photo'}>
        {url ? <img src={url} alt={img.caption} className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" /> : <div className="skeleton aspect-square rounded-none" />}
      </button>
      {isCover && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-bg"><Star className="size-3 fill-gold text-gold" /> Cover</span>}
      <div className="absolute right-1.5 top-1.5">
        <Menu trigger={<IconButton label="Photo actions" size="icon-sm" className="bg-ink/60 text-bg hover:bg-ink/75 hover:text-bg"><MoreHorizontal className="size-4" /></IconButton>}>
          <MenuItem icon={<Star />} onSelect={onCover}>Use as cover</MenuItem>
          <MenuItem onSelect={onCaption}>Edit caption</MenuItem>
          <MenuSeparator />
          {KINDS.filter((k) => k.value !== img.kind).map((k) => <MenuItem key={k.value} onSelect={() => onKind(k.value)}>Move to “{k.label}”</MenuItem>)}
          <MenuSeparator />
          <MenuItem danger icon={<Trash2 />} onSelect={onDelete}>Delete</MenuItem>
        </Menu>
      </div>
      {(img.caption || by) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-3 pb-2 pt-6 text-bg">
          {img.caption && <p className="truncate text-[13px] font-medium">{img.caption}</p>}
          <p className="text-[11px] opacity-80">{by ? `${by} · ` : ''}{fmtDate(img.created_at, 'd MMM')}</p>
        </div>
      )}
    </motion.div>
  )
}

export function Lightbox({ images, index, onClose, onIndex }: { images: ProjectImage[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const calm = useCalm()
  const img = images[index]!
  const url = useMediaUrl(img.path)
  const { profileById } = useAuth()
  const by = profileById(img.created_by)
  const prev = () => onIndex((index - 1 + images.length) % images.length)
  const next = () => onIndex((index + 1) % images.length)
  return (
    <motion.div className="fixed inset-0 z-[110] flex flex-col bg-ink/95 text-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal="true"
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); if (e.key === 'Escape') onClose() }} tabIndex={-1}>
      <div className="flex items-center justify-between p-3 safe-top">
        <p className="text-sm text-bg/80">{index + 1} / {images.length}</p>
        <IconButton label="Close" className="text-bg hover:bg-bg/10 hover:text-bg" onClick={onClose}><X className="size-5" /></IconButton>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => e.stopPropagation()}>
        <AnimatePresence mode="wait">
          {url && <motion.img key={img.id} src={url} alt={img.caption} className="max-h-full max-w-full rounded-xl object-contain shadow-lg" initial={calm ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: calm ? 0 : 0.25 }} drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(_, i) => { if (i.offset.x < -60) next(); else if (i.offset.x > 60) prev() }} />}
        </AnimatePresence>
        {images.length > 1 && (
          <>
            <button onClick={prev} className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-bg/10 text-bg hover:bg-bg/20 sm:grid" aria-label="Previous"><ChevronLeft className="size-6" /></button>
            <button onClick={next} className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-bg/10 text-bg hover:bg-bg/20 sm:grid" aria-label="Next"><ChevronRight className="size-6" /></button>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 p-4 safe-bottom" onClick={(e) => e.stopPropagation()}>
        {by && <Avatar name={by.display_name} color={by.color} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{img.caption || KINDS.find((k) => k.value === img.kind)?.label}</p>
          <p className="text-xs text-bg/70">{by?.display_name ? `${by.display_name} · ` : ''}{fmtDate(img.created_at)}</p>
        </div>
      </div>
    </motion.div>
  )
}
