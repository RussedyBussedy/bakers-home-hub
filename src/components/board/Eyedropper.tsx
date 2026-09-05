import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Pipette, Sparkles, X } from 'lucide-react'
import { kmeansPalette, loadImage, nameColor, rgbToHex, samplePixels, textOn, type RGB, type Swatch } from '../../lib/colors'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'

export interface PickedColor { hex: string; name: string }

export function Eyedropper({ src, onDone, onCancel, title }: { src: string; onDone: (colors: PickedColor[]) => void; onCancel: () => void; title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<{ hex: string; x: number; y: number; touch: boolean } | null>(null)
  const [picked, setPicked] = useState<PickedColor | null>(null)
  const [palette, setPalette] = useState<Swatch[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'drop' | 'palette'>('drop')

  useEffect(() => {
    let alive = true
    setReady(false)
    loadImage(src)
      .then((img) => {
        if (!alive) return
        const max = 1600
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
        const c = document.createElement('canvas')
        c.width = Math.round(img.naturalWidth * scale)
        c.height = Math.round(img.naturalHeight * scale)
        c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, c.width, c.height)
        sourceRef.current = c
        const vis = canvasRef.current!
        vis.width = c.width
        vis.height = c.height
        vis.getContext('2d')!.drawImage(c, 0, 0)
        setReady(true)
      })
      .catch(() => alive && setError("This photo can't be sampled — try re-uploading it."))
    return () => { alive = false }
  }, [src])

  const sampleAt = useCallback((clientX: number, clientY: number): { hex: string; sx: number; sy: number } | null => {
    const vis = canvasRef.current, srcC = sourceRef.current
    if (!vis || !srcC) return null
    const rect = vis.getBoundingClientRect()
    const sx = Math.round(((clientX - rect.left) / rect.width) * srcC.width)
    const sy = Math.round(((clientY - rect.top) / rect.height) * srcC.height)
    if (sx < 0 || sy < 0 || sx >= srcC.width || sy >= srcC.height) return null
    const ctx = srcC.getContext('2d', { willReadFrequently: true })!
    const r = 1
    const d = ctx.getImageData(Math.max(0, sx - r), Math.max(0, sy - r), r * 2 + 1, r * 2 + 1).data
    let R = 0, G = 0, B = 0, n = 0
    for (let i = 0; i < d.length; i += 4) { R += d[i]!; G += d[i + 1]!; B += d[i + 2]!; n++ }
    const rgb: RGB = [R / n, G / n, B / n]
    // loupe
    const lp = loupeRef.current
    if (lp) {
      const lctx = lp.getContext('2d')!
      lctx.imageSmoothingEnabled = false
      lctx.clearRect(0, 0, lp.width, lp.height)
      const span = 13
      lctx.drawImage(srcC, sx - Math.floor(span / 2), sy - Math.floor(span / 2), span, span, 0, 0, lp.width, lp.height)
      const cell = lp.width / span
      lctx.strokeStyle = 'rgba(255,255,255,0.9)'
      lctx.lineWidth = 2
      lctx.strokeRect(Math.floor(span / 2) * cell, Math.floor(span / 2) * cell, cell, cell)
    }
    return { hex: rgbToHex(rgb), sx, sy }
  }, [])

  const onPointer = (e: React.PointerEvent) => {
    if (!ready) return
    if (e.type === 'pointerdown') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (e.type !== 'pointerdown' && e.buttons === 0 && e.pointerType !== 'mouse') return
    if (e.type === 'pointermove' && e.pointerType === 'mouse' && e.buttons === 0 && picked) return
    const s = sampleAt(e.clientX, e.clientY)
    if (s) setLive({ hex: s.hex, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' })
  }
  const onPointerUp = () => {
    if (live) setPicked({ hex: live.hex, name: nameColor(live.hex) })
  }

  const extract = () => {
    const srcC = sourceRef.current
    if (!srcC) return
    const px = samplePixels(srcC, srcC.width, srcC.height, 80)
    const pal = kmeansPalette(px, 6)
    setPalette(pal)
    setChosen(new Set(pal.slice(0, 5).map((p) => p.hex)))
    setMode('palette')
  }

  const finish = () => {
    if (mode === 'palette' && palette) onDone(palette.filter((p) => chosen.has(p.hex)).map((p) => ({ hex: p.hex, name: nameColor(p.hex) })))
    else if (picked) onDone([picked])
  }

  return (
    <motion.div className="fixed inset-0 z-[120] flex flex-col bg-[#15110E] text-[#F2EAE0]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 safe-top">
        <div className="min-w-0">
          <p className="truncate font-display text-lg">{title ?? 'Pick a colour'}</p>
          <p className="text-xs text-[#F2EAE0]/60">{mode === 'drop' ? 'Touch and drag over the photo. Lift to lock the colour.' : 'Tap swatches to choose which ones to keep.'}</p>
        </div>
        <button onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Cancel"><X className="size-5" /></button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {error ? (
          <p className="max-w-xs text-center text-sm text-[#F2EAE0]/70">{error}</p>
        ) : (
          <canvas
            ref={canvasRef}
            className={cn('max-h-full max-w-full touch-none select-none rounded-lg shadow-lg', ready ? 'cursor-crosshair' : 'opacity-0')}
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
        {!ready && !error && <div className="absolute text-sm text-[#F2EAE0]/60">Loading photo…</div>}
        {live && mode === 'drop' && (
          <div className="pointer-events-none fixed z-10" style={{ left: live.x, top: live.y, transform: `translate(-50%, ${live.touch ? 'calc(-100% - 28px)' : '-50%'})` }}>
            <div className="relative size-[124px] overflow-hidden rounded-full border-[5px] shadow-lg" style={{ borderColor: live.hex, background: '#000' }}>
              <canvas ref={loupeRef} width={130} height={130} className="h-full w-full" />
            </div>
            <div className="mt-2 flex justify-center">
              <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold uppercase tabular text-white">{live.hex}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10 bg-[#1C1714] p-4 safe-bottom">
        {mode === 'palette' && palette ? (
          <div>
            <div className="flex flex-wrap gap-2">
              {palette.map((p) => {
                const on = chosen.has(p.hex)
                return (
                  <button key={p.hex} onClick={() => setChosen((s) => { const n = new Set(s); if (n.has(p.hex)) n.delete(p.hex); else n.add(p.hex); return n })}
                    className={cn('flex h-14 min-w-[92px] flex-1 items-center gap-2 rounded-2xl px-3 text-left transition-transform', on ? 'ring-2 ring-white scale-[1.02]' : 'opacity-70')} style={{ background: p.hex, color: textOn(p.hex) }}>
                    {on && <Check className="size-4 shrink-0" />}
                    <span className="min-w-0"><span className="block truncate text-[12px] font-semibold">{nameColor(p.hex)}</span><span className="block text-[10px] uppercase opacity-80">{p.hex}</span></span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => setMode('drop')} leading={<Pipette className="size-4" />}>Back to eyedropper</Button>
              <Button className="flex-1" onClick={finish} disabled={chosen.size === 0}>Add {chosen.size} swatch{chosen.size === 1 ? '' : 'es'}</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="size-12 shrink-0 rounded-2xl border border-white/20 shadow-inner transition-colors" style={{ background: picked?.hex ?? live?.hex ?? '#333' }} />
              <div className="min-w-0">
                <p className="truncate font-medium">{picked ? picked.name : live ? nameColor(live.hex) : 'No colour yet'}</p>
                <p className="text-xs uppercase tabular text-[#F2EAE0]/60">{picked?.hex ?? live?.hex ?? '—'}</p>
              </div>
            </div>
            <Button variant="secondary" size="icon" onClick={extract} disabled={!ready} aria-label="Auto palette" title="Auto palette"><Sparkles className="size-5" /></Button>
            <Button onClick={finish} disabled={!picked}>Add swatch</Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
