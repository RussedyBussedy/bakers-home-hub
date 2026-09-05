// Real names for sampled colours: the nearest of ~5 000 hand-picked colour
// names (meodai/color-names, MIT) and the nearest RAL Classic paint code —
// both matched in CIE Lab with the CIEDE2000 formula, so "nearest" means
// nearest to the eye rather than nearest in RGB numbers.
import { RAL_CLASSIC } from '../data/ral'
import { hexToRgb, nameColor, normaliseHex, type RGB } from './colors'

export type Lab = [number, number, number]

// ---------------------------------------------------------------------------
// sRGB → CIE Lab (D65)
// ---------------------------------------------------------------------------
function lin(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function rgbToLab([r, g, b]: RGB): Lab {
  const R = lin(r), G = lin(g), B = lin(b)
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X), fy = f(Y), fz = f(Z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export const hexToLab = (hex: string): Lab => rgbToLab(hexToRgb(hex))

/** CIEDE2000 colour difference. ~1 is the smallest difference most people notice; under ~2.3 reads as the same colour. */
export function deltaE2000(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a, [L2, a2, b2] = b
  const rad = Math.PI / 180, deg = 180 / Math.PI
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const h = (x: number, y: number) => { if (x === 0 && y === 0) return 0; const d = Math.atan2(y, x) * deg; return d < 0 ? d + 360 : d }
  const h1p = h(a1p, b1), h2p = h(a2p, b2)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p
    dhp = Math.abs(diff) <= 180 ? diff : diff > 180 ? diff - 360 : diff + 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad)
  const Lm = (L1 + L2) / 2
  const Cmp = (C1p + C2p) / 2
  let Hm = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) Hm += Hm < 360 ? 360 : -360
    Hm /= 2
  }
  const T = 1 - 0.17 * Math.cos((Hm - 30) * rad) + 0.24 * Math.cos(2 * Hm * rad) + 0.32 * Math.cos((3 * Hm + 6) * rad) - 0.2 * Math.cos((4 * Hm - 63) * rad)
  const dTheta = 30 * Math.exp(-Math.pow((Hm - 275) / 25, 2))
  const Rc = 2 * Math.sqrt(Math.pow(Cmp, 7) / (Math.pow(Cmp, 7) + Math.pow(25, 7)))
  const Sl = 1 + (0.015 * Math.pow(Lm - 50, 2)) / Math.sqrt(20 + Math.pow(Lm - 50, 2))
  const Sc = 1 + 0.045 * Cmp
  const Sh = 1 + 0.015 * Cmp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh))
}

// ---------------------------------------------------------------------------
// The name list — loaded on demand (≈ 95 KB), cached for the session.
// ---------------------------------------------------------------------------
interface Named { name: string; hex: string; lab: Lab }

let names: Named[] | null = null
let loading: Promise<Named[]> | null = null
const listeners = new Set<() => void>()

export function colorNamesReady(): boolean {
  return names !== null
}

export function loadColorNames(): Promise<Named[]> {
  if (names) return Promise.resolve(names)
  if (!loading) {
    loading = import('../data/colornames.txt?raw').then((m) => {
      names = m.default.split('\n').filter(Boolean).map((line) => {
        const i = line.lastIndexOf('|')
        const hex = `#${line.slice(i + 1).toLowerCase()}`
        return { name: line.slice(0, i), hex, lab: hexToLab(hex) }
      })
      listeners.forEach((l) => l())
      return names
    })
  }
  return loading
}

/** Subscribe to "names are loaded" — for components that want to re-render once. */
export function onColorNamesLoaded(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export interface NameMatch { name: string; hex: string; dE: number }
export interface RalMatch { code: string; name: string; hex: string; dE: number }

/** The closest real names. Empty until the list has loaded. */
export function nearestNames(hex: string, count = 3): NameMatch[] {
  if (!names) return []
  const lab = hexToLab(hex)
  const best: NameMatch[] = []
  for (const n of names) {
    // Cheap pre-filter on lightness before the full formula.
    if (Math.abs(n.lab[0] - lab[0]) > 25) continue
    const dE = deltaE2000(lab, n.lab)
    if (best.length < count) { best.push({ name: n.name, hex: n.hex, dE }); best.sort((a, b) => a.dE - b.dE); continue }
    if (dE < best[count - 1]!.dE) { best[count - 1] = { name: n.name, hex: n.hex, dE }; best.sort((a, b) => a.dE - b.dE) }
  }
  return best
}

const ral = RAL_CLASSIC.map(([code, name, hex]) => ({ code, name, hex, lab: hexToLab(hex) }))

/** The closest RAL Classic paint code — always available. */
export function nearestRal(hex: string): RalMatch {
  const lab = hexToLab(hex)
  let best = ral[0]!, bestD = Infinity
  for (const r of ral) {
    const d = deltaE2000(lab, r.lab)
    if (d < bestD) { bestD = d; best = r }
  }
  return { code: best.code, name: best.name, hex: best.hex, dE: bestD }
}

export const ralLabel = (m: RalMatch) => `RAL ${m.code} ${m.name}`

/** The best name we can give right now: a real one if the list is loaded, else the built-in guess. */
export function bestName(hex: string): string {
  const h = normaliseHex(hex)
  return nearestNames(h, 1)[0]?.name ?? nameColor(h)
}

/** Words for how close a match is. */
export function closeness(dE: number): 'exact' | 'close' | 'nearest' {
  return dE < 2.3 ? 'exact' : dE < 6 ? 'close' : 'nearest'
}
