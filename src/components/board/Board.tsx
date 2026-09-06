import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownToLine, ArrowUpToLine, Copy, ExternalLink, Image as ImageIcon, Link2, LayoutGrid, Maximize2, Minus, Palette, Pencil, Pipette, Plus, ShoppingBag, StickyNote, Tag, Trash2, X,
} from 'lucide-react'
import type { BoardItem, BoardItemType, ColorData, NewBoardItem, PhotoData, Presence, ProductData, Project } from '../../data/types'
import { useActions } from '../../data/hooks'
import { useAuth, useDb } from '../../data/session'
import { readImageSize } from '../../lib/images'
import { isHex, nameColor, normaliseHex } from '../../lib/colors'
import { bestName, colorNamesReady, loadColorNames, nearestRal, ralLabel } from '../../lib/colorNames'
import { clamp, cn, throttle, uid } from '../../lib/utils'
import { Avatar } from '../ui/Bits'
import { useConfirm } from '../ui/Sheet'
import { Tooltip } from '../ui/Menu'
import { Eyedropper, type PickedColor } from './Eyedropper'
import { PinEditor, type PinDraft } from './PinEditor'
import { DEFAULT_SIZES, Pin, pinUrl } from './Pins'
import { openExternal } from '../../lib/share'
import { useUi } from '../../store/ui'

interface View { x: number; y: number; scale: number }
type Draft = Pick<BoardItem, 'x' | 'y' | 'w' | 'h' | 'rotation'>
type Mode = 'idle' | 'pan' | 'pinch' | 'drag' | 'resize' | 'rotate'

const MIN_SCALE = 0.12
const MAX_SCALE = 3
const HANDLE = 14

export function Board({ project, items, chrome = true, onExit }: { project: Project; items: BoardItem[]; chrome?: boolean; onExit?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, scale: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [selected, setSelected] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const [editor, setEditor] = useState<{ open: boolean; type: BoardItemType; item?: BoardItem | null }>({ open: false, type: 'note' })
  const [eyedrop, setEyedrop] = useState<{ src: string; title: string } | null>(null)
  const [presence, setPresence] = useState<Presence[]>([])
  const [fitted, setFitted] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { addBoardItem, updateBoardItem, updateBoardItems, deleteBoardItem, uploadFile } = useActions()
  const { db } = useDb()
  const { me } = useAuth()
  const confirm = useConfirm()
  const toast = useUi((s) => s.toast)

  const gesture = useRef<{
    mode: Mode
    pointers: Map<number, { x: number; y: number }>
    start: { x: number; y: number }
    startView: View
    item: BoardItem | null
    startDraft: Draft | null
    pinch: { dist: number; mid: { x: number; y: number }; scale: number; view: View } | null
    moved: boolean
  }>({ mode: 'idle', pointers: new Map(), start: { x: 0, y: 0 }, startView: view, item: null, startDraft: null, pinch: null, moved: false })

  // ---- presence -------------------------------------------------------------
  useEffect(() => {
    if (!me) return
    const off = db.presence(`board-${project.id}`, { user_id: me.id, name: me.display_name, color: me.color }, setPresence)
    return off
  }, [db, me, project.id])

  // ---- helpers ------------------------------------------------------------------
  const rect = () => containerRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 800, 600)
  const toWorld = useCallback((sx: number, sy: number, v = viewRef.current) => {
    const r = rect()
    return { x: (sx - r.left - v.x) / v.scale, y: (sy - r.top - v.y) / v.scale }
  }, [])

  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    setView((v) => {
      const r = rect()
      const px = sx - r.left, py = sy - r.top
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const wx = (px - v.x) / v.scale, wy = (py - v.y) / v.scale
      return { scale, x: px - wx * scale, y: py - wy * scale }
    })
  }, [])

  const fit = useCallback((animate = true) => {
    const r = rect()
    if (items.length === 0) { setView({ x: r.width / 2 - 200, y: r.height / 2 - 150, scale: 1 }); return }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    items.forEach((i) => { minX = Math.min(minX, i.x); minY = Math.min(minY, i.y); maxX = Math.max(maxX, i.x + i.w); maxY = Math.max(maxY, i.y + i.h) })
    const pad = 48
    const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2
    const scale = clamp(Math.min(r.width / bw, r.height / bh), MIN_SCALE, 1)
    const x = (r.width - (maxX - minX) * scale) / 2 - minX * scale
    const y = (r.height - (maxY - minY) * scale) / 2 - minY * scale
    if (!animate) setView({ x, y, scale })
    else setView({ x, y, scale })
  }, [items])

  useEffect(() => {
    if (!fitted && containerRef.current) { fit(false); setFitted(true) }
  }, [fitted, fit, items.length])

  // ---- wheel (non-passive so we can prevent page zoom/scroll) -------------------
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // ---- persistence helpers ------------------------------------------------------
  const liveSync = useMemo(() => throttle((item: BoardItem, patch: Partial<BoardItem>) => { void updateBoardItem(item, patch, { silent: true }) }, 160), [updateBoardItem])

  // Swatches named by the old hue-bucket namer ("Dusty Ochre" for two different
  // browns) get a real name once the name list is in; hand-typed names are kept
  // and only gain their RAL code. Idempotent, so both phones can run it.
  const [namesReady, setNamesReady] = useState(colorNamesReady())
  useEffect(() => { void loadColorNames().then(() => setNamesReady(true)) }, [])
  useEffect(() => {
    if (!namesReady) return
    for (const item of items) {
      if (item.type !== 'color' || item.id.startsWith('temp-')) continue
      const d = item.data as ColorData
      if (!isHex(d.hex)) continue
      const hex = normaliseHex(d.hex)
      const autoNamed = !d.name.trim() || d.name === nameColor(hex)
      const next: ColorData = { ...d, name: autoNamed ? bestName(hex) : d.name, ral: ralLabel(nearestRal(hex)) }
      if (next.name === d.name && next.ral === d.ral) continue
      void updateBoardItem(item, { data: next }, { silent: true })
    }
  }, [namesReady, items, updateBoardItem])

  const maxZ = useMemo(() => items.reduce((m, i) => Math.max(m, i.z), 0), [items])
  const minZ = useMemo(() => items.reduce((m, i) => Math.min(m, i.z), 1), [items])

  // ---- pointer handling -----------------------------------------------------------
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    const g = gesture.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()]
      g.mode = 'pinch'
      g.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, scale: viewRef.current.scale, view: viewRef.current }
      g.item = null
      setDrafts({})
      return
    }
    g.mode = 'pan'
    g.start = { x: e.clientX, y: e.clientY }
    g.startView = viewRef.current
    g.moved = false
  }

  const startItemGesture = (e: React.PointerEvent, item: BoardItem, mode: 'drag' | 'resize' | 'rotate') => {
    e.stopPropagation()
    const g = gesture.current
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(containerRef.current as HTMLElement).setPointerCapture(e.pointerId)
    g.mode = mode
    g.item = item
    g.start = { x: e.clientX, y: e.clientY }
    g.startDraft = { x: item.x, y: item.y, w: item.w, h: item.h, rotation: item.rotation }
    g.moved = false
    setSelected(item.id)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g.pointers.has(e.pointerId)) return
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const v = viewRef.current

    if (g.mode === 'pinch' && g.pinch && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()]
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }
      const scale = clamp(g.pinch.scale * (dist / g.pinch.dist), MIN_SCALE, MAX_SCALE)
      const r = rect()
      const p0 = g.pinch
      // world point under the initial midpoint
      const wx = (p0.mid.x - r.left - p0.view.x) / p0.view.scale
      const wy = (p0.mid.y - r.top - p0.view.y) / p0.view.scale
      setView({ scale, x: mid.x - r.left - wx * scale, y: mid.y - r.top - wy * scale })
      return
    }
    const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y
    if (Math.hypot(dx, dy) > 3) g.moved = true

    if (g.mode === 'pan') {
      setView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy })
      return
    }
    if (!g.item || !g.startDraft) return
    const item = g.item, s = g.startDraft
    let draft: Draft | null = null
    if (g.mode === 'drag') {
      draft = { ...s, x: s.x + dx / v.scale, y: s.y + dy / v.scale }
    } else if (g.mode === 'resize') {
      const rad = (-s.rotation * Math.PI) / 180
      const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / v.scale
      const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / v.scale
      const lockAspect = item.type === 'photo' || item.type === 'product' || item.type === 'color'
      const min = item.type === 'label' ? 100 : 80
      let w = Math.max(min, s.w + lx)
      let h = lockAspect ? Math.max(min, w * (s.h / s.w)) : Math.max(item.type === 'label' ? 44 : 60, s.h + ly)
      if (item.type === 'label') h = s.h
      if (item.type === 'color') h = w
      draft = { ...s, w, h }
    } else if (g.mode === 'rotate') {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2
      const p = toWorld(e.clientX, e.clientY)
      let angle = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90
      if (e.shiftKey) angle = Math.round(angle / 15) * 15
      if (Math.abs(angle) < 3) angle = 0
      draft = { ...s, rotation: angle }
    }
    if (draft) {
      setDrafts((d) => ({ ...d, [item.id]: draft! }))
      liveSync(item, draft)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    g.pointers.delete(e.pointerId)
    if (g.mode === 'pinch') {
      if (g.pointers.size < 2) { g.mode = g.pointers.size === 1 ? 'pan' : 'idle'; g.pinch = null; if (g.mode === 'pan') { const p = [...g.pointers.values()][0]!; g.start = { x: p.x, y: p.y }; g.startView = viewRef.current } }
      return
    }
    if (g.mode === 'pan') {
      if (!g.moved) setSelected(null)
      g.mode = 'idle'
      return
    }
    if (g.item) {
      const item = g.item
      const draft = draftsRef.current[item.id]
      if (draft && g.moved) {
        void updateBoardItem(item, draft).finally(() => setDrafts((d) => { const { [item.id]: _omit, ...rest } = d; return rest }))
      } else {
        setDrafts((d) => { const { [item.id]: _omit, ...rest } = d; return rest })
      }
    }
    g.mode = 'idle'
    g.item = null
  }

  // ---- keyboard -------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!selected) return
      const item = items.find((i) => i.id === selected)
      if (!item) return
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); void deleteBoardItem(item); setSelected(null) }
      const step = e.shiftKey ? 20 : 4
      if (e.key === 'ArrowLeft') updateBoardItem(item, { x: item.x - step })
      if (e.key === 'ArrowRight') updateBoardItem(item, { x: item.x + step })
      if (e.key === 'ArrowUp') updateBoardItem(item, { y: item.y - step })
      if (e.key === 'ArrowDown') updateBoardItem(item, { y: item.y + step })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, items, deleteBoardItem, updateBoardItem])

  // ---- adding pins ------------------------------------------------------------------
  const centerFor = (w: number, h: number) => {
    const r = rect()
    const c = toWorld(r.left + r.width / 2, r.top + r.height / 2)
    // Scatter new pins around the centre so consecutive additions don't stack.
    const n = items.length
    const angle = (n * 137.5 * Math.PI) / 180
    const radius = 120 + (n % 5) * 48
    return { x: c.x - w / 2 + Math.cos(angle) * radius, y: c.y - h / 2 + Math.sin(angle) * radius * 0.7 }
  }
  const jitter = () => Math.round((Math.random() - 0.5) * 6)

  const add = async (type: BoardItemType, data: BoardItem['data'], size?: { w: number; h: number }) => {
    const { w, h } = size ?? DEFAULT_SIZES[type]
    const pos = centerFor(w, h)
    const input: NewBoardItem = { project_id: project.id, type, x: pos.x, y: pos.y, w, h, rotation: jitter(), z: maxZ + 1, data }
    const b = await addBoardItem(input)
    setSelected(b.id)
    return b
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    let i = 0
    for (const f of Array.from(files)) {
      try {
        const size = await readImageSize(f)
        const path = await uploadFile(f, `${project.id}/board`)
        const w = 320
        const ratio = size.width && size.height ? size.height / size.width : 0.75
        const h = Math.round(w * ratio) + 44
        const pos = centerFor(w, h)
        const b = await addBoardItem({ project_id: project.id, type: 'photo', x: pos.x + i * 24, y: pos.y + i * 24, w, h, rotation: jitter(), z: maxZ + 1 + i, data: { path, caption: '', natural_w: size.width, natural_h: size.height } })
        setSelected(b.id)
        i++
      } catch { /* toast shown */ }
    }
  }

  const onEditorSave = async (draft: PinDraft) => {
    let data = draft.data
    if (draft.type === 'product' && draft.imageFile) {
      const image_path = await uploadFile(draft.imageFile, `${project.id}/board`)
      data = { ...(data as ProductData), image_path }
    }
    if (editor.item) await updateBoardItem(editor.item, { data })
    else await add(draft.type, data)
  }

  const onColorsPicked = async (colors: PickedColor[], source?: string) => {
    setEyedrop(null)
    let i = 0
    for (const c of colors) {
      const { w, h } = DEFAULT_SIZES.color
      const pos = centerFor(w, h)
      const data: ColorData = { hex: c.hex, name: c.name, source, ral: c.ral }
      await addBoardItem({ project_id: project.id, type: 'color', x: pos.x + i * 40, y: pos.y + i * 18, w, h, rotation: jitter(), z: maxZ + 1 + i, data })
      i++
    }
    if (colors.length > 1) toast({ title: `${colors.length} swatches pinned`, tone: 'success' })
  }

  const tidy = async () => {
    // Masonry-ish grid: sort by z, lay out in columns of ~3 with a gutter.
    const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const cols = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(sorted.length))))
    const gutter = 36
    const colW = 320
    const heights = new Array(cols).fill(0) as number[]
    const patches = sorted.map((it) => {
      const col = heights.indexOf(Math.min(...heights))
      const scale = Math.min(1, colW / it.w)
      const w = it.w * scale, h = it.h * scale
      const patch = { x: col * (colW + gutter), y: heights[col]!, w, h, rotation: 0 }
      heights[col]! += h + gutter
      return { id: it.id, patch }
    })
    await updateBoardItems(project.id, patches)
    setTimeout(() => fit(), 50)
  }

  const selectedItem = items.find((i) => i.id === selected) ?? null

  const duplicate = async (item: BoardItem) => {
    await addBoardItem({ project_id: project.id, type: item.type, x: item.x + 28, y: item.y + 28, w: item.w, h: item.h, rotation: item.rotation, z: maxZ + 1, data: { ...item.data } })
  }

  const openEyedropForPhoto = async (item: BoardItem) => {
    const d = item.data as PhotoData
    const src = await db.resolveUrl(d.path)
    setEyedrop({ src, title: d.caption ? `Colours from “${d.caption}”` : 'Pick a colour from this photo' })
  }

  // ---- render --------------------------------------------------------------------------
  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <div
        ref={containerRef}
        className="board-dots absolute inset-0 touch-none"
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${dotSpacing(view.scale)}px ${dotSpacing(view.scale)}px` }}
        // Every fresh press clears the "was a drag" flag, even one on a button inside a pin (which stops
        // propagation before the board sees it) — otherwise the guard below would swallow the next click.
        onPointerDownCapture={() => { gesture.current.moved = false }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => { if (e.target === e.currentTarget) zoomAt(e.clientX, e.clientY, 1.4) }}
      >
        <div className="absolute left-0 top-0 will-change-transform" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}>
          {items.length === 0 && (
            <div className="pointer-events-none absolute left-0 top-0 w-[420px] rounded-3xl border-2 border-dashed border-line-strong p-8 text-center text-ink-3">
              <Palette className="mx-auto size-8" />
              <p className="mt-3 font-display text-xl text-ink">An empty board is a promise.</p>
              <p className="mt-1 text-sm">Pin photos, colours, notes and products. Drag them around like a real pin board.</p>
            </div>
          )}
          {items.map((item) => {
            const d = drafts[item.id]
            const x = d?.x ?? item.x, y = d?.y ?? item.y, w = d?.w ?? item.w, h = d?.h ?? item.h, rot = d?.rotation ?? item.rotation
            const isSel = selected === item.id
            const active = Boolean(d)
            return (
              <div
                key={item.id}
                className={cn('absolute left-0 top-0', !active && 'transition-transform duration-300 ease-out')}
                style={{ width: w, height: h, transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, zIndex: isSel ? 10000 : item.z, transformOrigin: 'center center' }}
                onPointerDown={(e) => startItemGesture(e, item, 'drag')}
                onClickCapture={(e) => { if (gesture.current.moved) { e.preventDefault(); e.stopPropagation() } }}
                onDoubleClick={(e) => { e.stopPropagation(); setEditor({ open: true, type: item.type, item }) }}
              >
                <div className={cn('h-full w-full cursor-grab active:cursor-grabbing', active && 'scale-[1.02] transition-transform')}>
                  <Pin item={item} />
                </div>
                {isSel && (
                  <>
                    <div className="pointer-events-none absolute inset-0 rounded-[6px] ring-2 ring-primary ring-offset-2 ring-offset-transparent" style={{ boxShadow: `0 0 0 ${2 / view.scale}px var(--surface)` }} />
                    {/* rotate handle */}
                    <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center" style={{ transform: `translate(-50%, -100%) scale(${1 / view.scale})`, transformOrigin: 'bottom center' }}>
                      <button aria-label="Rotate" onPointerDown={(e) => startItemGesture(e, item, 'rotate')} className="grid size-7 cursor-grab place-items-center rounded-full border-2 border-primary bg-surface text-primary shadow-md">
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
                      </button>
                      <span className="h-3 w-0.5 bg-primary" />
                    </div>
                    {/* resize handle */}
                    <button aria-label="Resize" onPointerDown={(e) => startItemGesture(e, item, 'resize')} className="absolute bottom-0 right-0 cursor-nwse-resize rounded-full border-2 border-primary bg-surface shadow-md" style={{ width: HANDLE * 1.6, height: HANDLE * 1.6, transform: `translate(50%, 50%) scale(${1 / view.scale})`, transformOrigin: 'center' }} />
                    {/* open-link pill for pins that point somewhere */}
                    {pinUrl(item) && (
                      <div className="absolute bottom-0 left-1/2" style={{ transform: `translate(-50%, calc(100% + 10px)) scale(${1 / view.scale})`, transformOrigin: 'top center' }}>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); openExternal(pinUrl(item)!) }}
                          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-4 text-[13px] font-medium text-bg shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97]"
                        >
                          <ExternalLink className="size-4" /> Open {item.type === 'product' ? 'shop' : 'link'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Presence + top chrome */}
      {chrome && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 safe-top">
          <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2">
            {onExit && (
              <button onClick={onExit} className="glass grid size-11 place-items-center rounded-full border border-line text-ink shadow-md" aria-label="Back to project">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
            )}
            <div className="glass min-w-0 rounded-full border border-line px-4 py-2 shadow-md">
              <p className="truncate font-display text-[15px] leading-tight text-ink sm:max-w-xs">{project.title}</p>
              <p className="text-[11px] text-ink-3">{items.length} pin{items.length === 1 ? '' : 's'} · {Math.round(view.scale * 100)}%</p>
            </div>
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <div className="glass flex items-center rounded-full border border-line p-1 shadow-md">
              <AnimatePresence>
                {presence.map((p) => (
                  <motion.span key={p.user_id} initial={{ scale: 0, width: 0 }} animate={{ scale: 1, width: 'auto' }} exit={{ scale: 0, width: 0 }} className="-ml-1 first:ml-0" title={`${p.name} is here`}>
                    <Avatar name={p.name} color={p.color} size="sm" ring />
                  </motion.span>
                ))}
              </AnimatePresence>
              {presence.length > 1 && <span className="hidden whitespace-nowrap px-2 text-xs text-ink-2 sm:inline">{presence.filter((p) => p.user_id !== me?.id).map((p) => p.name).join(', ')} here too</span>}
            </div>
            <Tooltip label="Fit to board"><button onClick={() => fit()} className="glass grid size-11 place-items-center rounded-full border border-line text-ink shadow-md" aria-label="Fit to board"><Maximize2 className="size-5" /></button></Tooltip>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-3 safe-bottom">
        <AnimatePresence mode="wait">
          {selectedItem ? (
            <motion.div key="sel" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="pointer-events-auto glass flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line p-1.5 shadow-lg scrollbar-none">
              {pinUrl(selectedItem) && <ToolButton label={selectedItem.type === 'product' ? 'Open the shop page' : 'Open the link'} onClick={() => openExternal(pinUrl(selectedItem)!)}><ExternalLink /></ToolButton>}
              <ToolButton label="Edit" onClick={() => setEditor({ open: true, type: selectedItem.type, item: selectedItem })}><Pencil /></ToolButton>
              {selectedItem.type === 'photo' && <ToolButton label="Pick colours" onClick={() => openEyedropForPhoto(selectedItem)}><Pipette /></ToolButton>}
              <ToolButton label="Duplicate" onClick={() => duplicate(selectedItem)}><Copy /></ToolButton>
              <ToolButton label="Bring to front" onClick={() => updateBoardItem(selectedItem, { z: maxZ + 1 })}><ArrowUpToLine /></ToolButton>
              <ToolButton label="Send to back" onClick={() => updateBoardItem(selectedItem, { z: minZ - 1 })}><ArrowDownToLine /></ToolButton>
              <ToolButton label="Remove" danger onClick={async () => { if (await confirm({ title: 'Remove this pin?', confirmLabel: 'Remove', danger: true })) { await deleteBoardItem(selectedItem); setSelected(null) } }}><Trash2 /></ToolButton>
              <span className="mx-1 h-6 w-px bg-line" />
              <ToolButton label="Done" onClick={() => setSelected(null)}><X /></ToolButton>
            </motion.div>
          ) : (
            <motion.div key="add" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="pointer-events-auto flex max-w-full items-center gap-2">
              <div className="glass flex items-center gap-0.5 overflow-x-auto rounded-full border border-line p-1.5 shadow-lg scrollbar-none">
                <AddButton label="Photo" onClick={() => fileRef.current?.click()}><ImageIcon /></AddButton>
                <AddButton label="Colour" onClick={() => setEditor({ open: true, type: 'color', item: null })}><Palette /></AddButton>
                <AddButton label="Note" onClick={() => setEditor({ open: true, type: 'note', item: null })}><StickyNote /></AddButton>
                <AddButton label="Link" onClick={() => setEditor({ open: true, type: 'link', item: null })}><Link2 /></AddButton>
                <AddButton label="Product" onClick={() => setEditor({ open: true, type: 'product', item: null })}><ShoppingBag /></AddButton>
                <AddButton label="Label" onClick={() => setEditor({ open: true, type: 'label', item: null })}><Tag /></AddButton>
              </div>
              <div className="glass hidden items-center rounded-full border border-line p-1.5 shadow-lg sm:flex">
                <ToolButton label="Zoom out" onClick={() => { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8) }}><Minus /></ToolButton>
                <ToolButton label="Zoom in" onClick={() => { const r = rect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25) }}><Plus /></ToolButton>
                <ToolButton label="Tidy up" onClick={tidy}><LayoutGrid /></ToolButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }} />

      <PinEditor open={editor.open} type={editor.type} item={editor.item} onOpenChange={(o) => setEditor((s) => ({ ...s, open: o }))} onSave={onEditorSave} />

      <AnimatePresence>
        {eyedrop && <Eyedropper key={uid()} src={eyedrop.src} title={eyedrop.title} onCancel={() => setEyedrop(null)} onDone={(cols) => onColorsPicked(cols, 'from photo')} />}
      </AnimatePresence>
    </div>
  )
}

function dotSpacing(scale: number) {
  let s = 28
  while (s * scale < 22) s *= 2
  while (s * scale > 64 && s > 28) s /= 2
  return s * scale
}

function ToolButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <Tooltip label={label}>
      <button onClick={onClick} onPointerDown={(e) => e.stopPropagation()} aria-label={label} className={cn('grid size-11 shrink-0 place-items-center rounded-full transition-colors [&>svg]:size-5', danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-2')}>
        {children}
      </button>
    </Tooltip>
  )
}

function AddButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} onPointerDown={(e) => e.stopPropagation()} className="flex h-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full px-3 text-ink transition-colors hover:bg-surface-2 [&>svg]:size-5 sm:h-11 sm:flex-row sm:gap-2 sm:px-3.5">
      {children}
      <span className="text-[10px] font-medium sm:text-sm">{label}</span>
    </button>
  )
}
