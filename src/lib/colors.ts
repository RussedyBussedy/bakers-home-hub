// Colour utilities: conversion, contrast, evocative naming and palette extraction.

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

export function isHex(s: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim())
}

export function normaliseHex(s: string): string {
  return rgbToHex(hexToRgb(s))
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let [r, g, b]: RGB = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrast(a: string, b: string): number {
  const l1 = luminance(a), l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** Ink or paper text colour, whichever reads better on the given colour. */
export function textOn(hex: string): string {
  return contrast(hex, '#1e1a16') >= contrast(hex, '#fffdfa') ? '#1e1a16' : '#fffdfa'
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b)
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t])
}

/** Distance in a perceptually-weighted RGB space (good enough for de-duplication). */
export function colorDistance(a: RGB, b: RGB): number {
  const rm = (a[0] + b[0]) / 2
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
}

// ---------------------------------------------------------------------------
// Naming — evocative, interiors-flavoured names generated from HSL.
// ---------------------------------------------------------------------------
const HUE_FAMILIES: { max: number; names: [string, string, string] }[] = [
  // [pale, mid, deep]
  { max: 12, names: ['Rosewater', 'Brick Red', 'Oxblood'] },
  { max: 25, names: ['Apricot', 'Terracotta', 'Rust'] },
  { max: 38, names: ['Peach', 'Ochre', 'Cognac'] },
  { max: 50, names: ['Cream', 'Amber', 'Toffee'] },
  { max: 65, names: ['Butter', 'Mustard', 'Olive Gold'] },
  { max: 90, names: ['Pear', 'Chartreuse', 'Moss'] },
  { max: 150, names: ['Mint', 'Sage', 'Forest'] },
  { max: 185, names: ['Sea Glass', 'Teal', 'Deep Teal'] },
  { max: 215, names: ['Sky', 'Cornflower', 'Marine'] },
  { max: 250, names: ['Periwinkle', 'Cobalt', 'Midnight'] },
  { max: 280, names: ['Lilac', 'Violet', 'Aubergine'] },
  { max: 315, names: ['Orchid', 'Plum', 'Mulberry'] },
  { max: 345, names: ['Blush', 'Rose', 'Wine'] },
  { max: 361, names: ['Rosewater', 'Brick Red', 'Oxblood'] },
]

export function nameColor(hex: string): string {
  const rgb = hexToRgb(hex)
  const [h, s, l] = rgbToHsl(rgb)
  const warm = h < 70 || h > 330
  if (s < 0.09) {
    if (l > 0.94) return warm ? 'Bone White' : 'Paper White'
    if (l > 0.82) return warm ? 'Linen' : 'Mist'
    if (l > 0.66) return warm ? 'Oat' : 'Pebble'
    if (l > 0.48) return warm ? 'Stone' : 'Slate Grey'
    if (l > 0.3) return warm ? 'Taupe' : 'Graphite'
    if (l > 0.14) return 'Charcoal'
    return 'Ink Black'
  }
  const fam = HUE_FAMILIES.find((f) => h < f.max) ?? HUE_FAMILIES[0]!
  const [pale, mid, deep] = fam.names
  let base = mid
  if (l > 0.78) base = pale
  else if (l < 0.3) base = deep
  const dusty = s < 0.28 && l > 0.3 && l < 0.78
  const vivid = s > 0.72 && l > 0.35 && l < 0.65
  if (dusty) return `Dusty ${base}`
  if (vivid) return `Vivid ${base}`
  if (l > 0.9) return `Pale ${base}`
  return base
}

// ---------------------------------------------------------------------------
// Palette extraction — k-means on a down-sampled image.
// ---------------------------------------------------------------------------
export interface Swatch { hex: string; share: number }

function loadOnce(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/**
 * Loads an image for pixel sampling. A photo that was first shown by a plain
 * <img> may sit in the browser cache without CORS headers, which makes the
 * same URL fail when loaded with crossOrigin — so retry with a cache-buster.
 */
export async function loadImage(src: string): Promise<HTMLImageElement> {
  try {
    return await loadOnce(src)
  } catch (e) {
    if (!/^https?:/.test(src)) throw e
    const busted = `${src}${src.includes('?') ? '&' : '?'}cors=${Date.now()}`
    return loadOnce(busted)
  }
}

export function samplePixels(img: CanvasImageSource, width: number, height: number, size = 72): RGB[] {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, size / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px: RGB[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue
    px.push([data[i]!, data[i + 1]!, data[i + 2]!])
  }
  return px
}

export function kmeansPalette(pixels: RGB[], k = 5, iterations = 12): Swatch[] {
  if (pixels.length === 0) return []
  // k-means++ seeding
  const centers: RGB[] = [pixels[Math.floor(Math.random() * pixels.length)]!]
  while (centers.length < k) {
    const dists = pixels.map((p) => Math.min(...centers.map((c) => colorDistance(p, c))) ** 2)
    const total = dists.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < dists.length - 1; idx++) {
      r -= dists[idx]!
      if (r <= 0) break
    }
    centers.push(pixels[idx]!)
  }
  let assign = new Array<number>(pixels.length).fill(0)
  for (let it = 0; it < iterations; it++) {
    let changed = false
    for (let i = 0; i < pixels.length; i++) {
      let best = 0, bd = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = colorDistance(pixels[i]!, centers[c]!)
        if (d < bd) { bd = d; best = c }
      }
      if (assign[i] !== best) { assign[i] = best; changed = true }
    }
    const sums = centers.map(() => [0, 0, 0, 0])
    for (let i = 0; i < pixels.length; i++) {
      const s = sums[assign[i]!]!
      s[0]! += pixels[i]![0]; s[1]! += pixels[i]![1]; s[2]! += pixels[i]![2]; s[3]! += 1
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c]!
      if (s[3]! > 0) centers[c] = [s[0]! / s[3]!, s[1]! / s[3]!, s[2]! / s[3]!]
    }
    if (!changed) break
  }
  const counts = centers.map(() => 0)
  assign.forEach((a) => counts[a]!++)
  const swatches = centers
    .map((c, i) => ({ hex: rgbToHex(c), share: counts[i]! / pixels.length, rgb: c }))
    .filter((s) => s.share > 0.01)
    .sort((a, b) => b.share - a.share)
  // de-duplicate near-identical swatches
  const out: Swatch[] = []
  for (const s of swatches) {
    if (out.every((o) => colorDistance(hexToRgb(o.hex), s.rgb) > 38)) out.push({ hex: s.hex, share: s.share })
  }
  return out
}

export async function extractPalette(src: string, k = 5): Promise<Swatch[]> {
  const img = await loadImage(src)
  const px = samplePixels(img, img.naturalWidth, img.naturalHeight)
  return kmeansPalette(px, k)
}

/** A handful of ready-made interior palettes for the colour picker. */
export const CURATED_PALETTES: { name: string; colors: string[] }[] = [
  { name: 'Highveld dusk', colors: ['#C4552B', '#D9A441', '#7A8F6E', '#4F7291', '#F1E5D3'] },
  { name: 'Coastal calm', colors: ['#EAE3D2', '#B8C4B1', '#7BA3B0', '#3E5C6B', '#D9A38F'] },
  { name: 'Terracotta & sage', colors: ['#B5563A', '#E1B08E', '#8DA07E', '#5C7255', '#F6EFE4'] },
  { name: 'Moody study', colors: ['#2E3A3F', '#4A5A5A', '#8B6D4B', '#C9B79C', '#E7DFD2'] },
  { name: 'Sunset lapa', colors: ['#F3C77B', '#E48B5C', '#B34C3D', '#6B3A4B', '#F8EEDF'] },
  { name: 'Pool day', colors: ['#2F7F97', '#7FC2CF', '#D8EEF0', '#F4E6C4', '#E9A23B'] },
]
