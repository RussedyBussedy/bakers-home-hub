// Procedurally generated illustrations used by the demo data so the app looks
// alive without a backend. They are simple, flat, geometric "room" scenes.

function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`
}

export interface Scene {
  wall: string
  wall2: string
  floor: string
  accent: string
  light: string
  variant: 'sofa' | 'kitchen' | 'bath' | 'garden' | 'pool' | 'bed' | 'lapa' | 'study'
}

const GRAIN = `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0"/></filter>`

function furniture(v: Scene['variant'], s: Scene): string {
  switch (v) {
    case 'sofa':
      return `<rect x="150" y="360" width="500" height="150" rx="28" fill="${s.accent}"/>
        <rect x="120" y="400" width="60" height="120" rx="20" fill="${s.accent}"/>
        <rect x="620" y="400" width="60" height="120" rx="20" fill="${s.accent}"/>
        <rect x="190" y="330" width="420" height="60" rx="18" fill="${s.light}" opacity="0.55"/>
        <rect x="700" y="300" width="70" height="230" rx="10" fill="${s.wall2}"/>
        <ellipse cx="735" cy="270" rx="70" ry="60" fill="#5C7C5A"/><ellipse cx="710" cy="235" rx="45" ry="50" fill="#6E8F6B"/>`
    case 'kitchen':
      return `<rect x="60" y="120" width="680" height="120" rx="10" fill="${s.wall2}"/>
        <rect x="60" y="380" width="680" height="160" rx="10" fill="${s.accent}"/>
        <rect x="60" y="360" width="680" height="24" rx="6" fill="${s.light}"/>
        ${[0, 1, 2, 3, 4].map((i) => `<rect x="${80 + i * 134}" y="400" width="118" height="120" rx="8" fill="${s.wall}" opacity="0.18"/>`).join('')}
        <rect x="330" y="290" width="140" height="70" rx="6" fill="${s.wall2}" opacity="0.6"/>
        <path d="M420 320 q0 -40 40 -40" stroke="${s.light}" stroke-width="6" fill="none" stroke-linecap="round"/>`
    case 'bath':
      return `<rect x="120" y="360" width="560" height="150" rx="70" fill="${s.light}"/>
        <rect x="140" y="340" width="520" height="40" rx="20" fill="#ffffff" opacity="0.7"/>
        <rect x="380" y="150" width="8" height="200" fill="${s.accent}"/>
        <circle cx="384" cy="150" r="14" fill="${s.accent}"/>
        ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${60 + i * 88}" y="160" width="80" height="80" rx="4" fill="${s.wall2}" opacity="0.5"/>`).join('')}`
    case 'garden':
      return `<ellipse cx="400" cy="520" rx="420" ry="90" fill="${s.accent}"/>
        <ellipse cx="180" cy="330" rx="90" ry="110" fill="#5C7C5A"/><ellipse cx="230" cy="290" rx="70" ry="90" fill="#7A9A77"/>
        <ellipse cx="620" cy="300" rx="100" ry="130" fill="#4F6B4C"/><ellipse cx="560" cy="330" rx="60" ry="80" fill="#6E8F6B"/>
        <rect x="380" y="360" width="16" height="150" fill="#8B6D4B"/>
        <ellipse cx="388" cy="330" rx="110" ry="80" fill="#6E8F6B"/><ellipse cx="420" cy="290" rx="70" ry="60" fill="#8DAA88"/>
        <circle cx="120" cy="120" r="60" fill="${s.light}" opacity="0.9"/>`
    case 'pool':
      return `<rect x="60" y="330" width="680" height="190" rx="40" fill="#2F7F97"/>
        <rect x="80" y="350" width="640" height="150" rx="30" fill="#5DB1C6" opacity="0.8"/>
        <path d="M100 420 q60 -20 120 0 t120 0 t120 0 t120 0 t120 0" stroke="#D8EEF0" stroke-width="6" fill="none" opacity="0.8"/>
        <path d="M120 470 q60 -18 120 0 t120 0 t120 0 t120 0" stroke="#D8EEF0" stroke-width="5" fill="none" opacity="0.6"/>
        <ellipse cx="120" cy="290" rx="70" ry="80" fill="#5C7C5A"/><rect x="660" y="180" width="18" height="150" fill="#8B6D4B"/>
        <ellipse cx="670" cy="170" rx="80" ry="55" fill="#6E8F6B"/>`
    case 'bed':
      return `<rect x="140" y="230" width="520" height="60" rx="14" fill="${s.accent}"/>
        <rect x="120" y="290" width="560" height="220" rx="30" fill="${s.light}"/>
        <rect x="120" y="360" width="560" height="150" rx="26" fill="${s.accent}" opacity="0.9"/>
        <rect x="180" y="300" width="180" height="60" rx="16" fill="#ffffff" opacity="0.85"/>
        <rect x="420" y="300" width="180" height="60" rx="16" fill="#ffffff" opacity="0.85"/>
        <circle cx="90" cy="250" r="30" fill="${s.wall2}"/><rect x="60" y="280" width="60" height="230" rx="8" fill="${s.wall2}" opacity="0.7"/>`
    case 'lapa':
      return `<path d="M60 300 L400 90 L740 300 Z" fill="#B08D57"/>
        <path d="M100 300 L400 120 L700 300 Z" fill="#C8A46B"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${140 + i * 90} 300 L400 ${130 + i * 6}" stroke="#8B6D4B" stroke-width="3" opacity="0.5"/>`).join('')}
        <rect x="120" y="300" width="18" height="220" fill="#7A5A3A"/><rect x="662" y="300" width="18" height="220" fill="#7A5A3A"/>
        <rect x="200" y="420" width="400" height="70" rx="18" fill="${s.accent}"/>
        <circle cx="620" cy="110" r="50" fill="${s.light}" opacity="0.9"/>`
    case 'study':
      return `<rect x="120" y="340" width="560" height="26" rx="8" fill="${s.accent}"/>
        <rect x="140" y="366" width="24" height="150" fill="${s.accent}"/><rect x="636" y="366" width="24" height="150" fill="${s.accent}"/>
        <rect x="330" y="240" width="140" height="100" rx="8" fill="${s.wall2}"/><rect x="345" y="252" width="110" height="70" rx="4" fill="${s.light}"/>
        ${[0, 1, 2, 3].map((i) => `<rect x="${80 + i * 170}" y="120" width="150" height="70" rx="6" fill="${s.wall2}" opacity="0.75"/>`).join('')}
        <ellipse cx="620" cy="300" rx="40" ry="45" fill="#5C7C5A"/>`
  }
}

export function roomScene(s: Scene, w = 800, h = 560): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" width="${w}" height="${h}">
    <defs>${GRAIN}
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.wall}"/><stop offset="1" stop-color="${s.wall2}"/></linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.light}" stop-opacity="0.55"/><stop offset="1" stop-color="${s.light}" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="800" height="560" fill="url(#wall)"/>
    <rect y="500" width="800" height="60" fill="${s.floor}"/>
    <rect y="496" width="800" height="6" fill="#ffffff" opacity="0.25"/>
    <path d="M0 0 L420 0 L260 560 L0 560 Z" fill="url(#sun)"/>
    ${furniture(s.variant, s)}
    <rect width="800" height="560" filter="url(#g)" opacity="0.6"/>
  </svg>`
  return svgUri(svg)
}

export function materialSwatch(color: string, kind: 'wood' | 'tile' | 'fabric' | 'stone' | 'plain' = 'plain'): string {
  let pattern = ''
  if (kind === 'wood') pattern = [0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M0 ${20 + i * 26} q100 ${i % 2 ? 10 : -10} 200 0" stroke="#000" stroke-opacity="0.12" stroke-width="2" fill="none"/>`).join('')
  if (kind === 'tile') pattern = [0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].map((j) => `<rect x="${i * 50 + 3}" y="${j * 50 + 3}" width="44" height="44" rx="3" fill="#fff" fill-opacity="${(i + j) % 2 ? 0.12 : 0.04}"/>`)).join('')
  if (kind === 'fabric') pattern = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<line x1="${i * 22}" y1="0" x2="${i * 22 + 200}" y2="200" stroke="#000" stroke-opacity="0.08" stroke-width="6"/>`).join('')
  if (kind === 'stone') pattern = [[40, 50, 34], [130, 40, 26], [90, 130, 40], [160, 150, 22], [30, 160, 18]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="0.08"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400"><defs>${GRAIN}</defs><rect width="200" height="200" fill="${color}"/>${pattern}<rect width="200" height="200" filter="url(#g)"/></svg>`
  return svgUri(svg)
}

export const SCENES: Record<string, Scene> = {
  kitchen: { wall: '#F4E9D8', wall2: '#E7D5BD', floor: '#B08D57', accent: '#5C7C5A', light: '#F8E7B8', variant: 'kitchen' },
  lounge: { wall: '#EFE3D3', wall2: '#D9C6AE', floor: '#8B6D4B', accent: '#C4552B', light: '#F5E1C2', variant: 'sofa' },
  bath: { wall: '#E6EEF0', wall2: '#C9DADF', floor: '#9AA7AB', accent: '#4F7291', light: '#F3F7F7', variant: 'bath' },
  garden: { wall: '#DCEBF5', wall2: '#BFD8EA', floor: '#7A9A77', accent: '#A6C48A', light: '#F9E4A8', variant: 'garden' },
  pool: { wall: '#E4F0F5', wall2: '#C4DDE9', floor: '#D9C6AE', accent: '#2F7F97', light: '#FBE7B5', variant: 'pool' },
  bed: { wall: '#EDE4DE', wall2: '#D9C8C0', floor: '#A88A6A', accent: '#7F5A9E', light: '#F6EEE7', variant: 'bed' },
  lapa: { wall: '#F0DEC2', wall2: '#E4C79E', floor: '#C8A46B', accent: '#B5563A', light: '#FBE2A8', variant: 'lapa' },
  study: { wall: '#E4E1DA', wall2: '#C7C2B8', floor: '#8B6D4B', accent: '#2E3A3F', light: '#F5F1E8', variant: 'study' },
}
