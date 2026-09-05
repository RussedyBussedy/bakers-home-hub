import { useEffect, useRef, useState } from 'react'
import type { BoardItem } from '../../data/types'
import { Pin } from './Pins'

/** A non-interactive, fit-to-box rendering of a board — used as a thumbnail. */
export function BoardPreview({ items, className, height = 260 }: { items: BoardItem[]; className?: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => { if (e) setWidth(e.contentRect.width) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (items.length === 0) {
    return (
      <div ref={ref} className={`board-dots grid place-items-center rounded-2xl text-sm text-ink-3 ${className ?? ''}`} style={{ height }}>
        Nothing pinned yet
      </div>
    )
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  items.forEach((i) => { minX = Math.min(minX, i.x); minY = Math.min(minY, i.y); maxX = Math.max(maxX, i.x + i.w); maxY = Math.max(maxY, i.y + i.h) })
  const pad = 40
  const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2
  const scale = Math.min(width / bw, height / bh)
  const ox = (width - bw * scale) / 2, oy = (height - bh * scale) / 2

  return (
    <div ref={ref} className={`board-dots relative overflow-hidden rounded-2xl ${className ?? ''}`} style={{ height }} aria-hidden>
      <div className="absolute left-0 top-0" style={{ transform: `translate(${ox}px, ${oy}px) scale(${scale})`, transformOrigin: '0 0' }}>
        {[...items].sort((a, b) => a.z - b.z).map((item) => (
          <div key={item.id} className="absolute left-0 top-0" style={{ width: item.w, height: item.h, transform: `translate(${item.x - minX + pad}px, ${item.y - minY + pad}px) rotate(${item.rotation}deg)` }}>
            <Pin item={item} preview />
          </div>
        ))}
      </div>
    </div>
  )
}
