import { create } from 'zustand'
import { uid } from '../lib/utils'

export type Theme = 'light' | 'dark' | 'system'

export interface Toast {
  id: string
  title: string
  description?: string
  tone?: 'neutral' | 'success' | 'danger' | 'xp'
  actionLabel?: string
  onAction?: () => void
  duration?: number
}

export interface XpPop {
  id: string
  points: number
  label: string
}

export interface Celebration {
  id: string
  kind: 'level_up' | 'achievement' | 'project_done'
  title: string
  subtitle?: string
  achievementKey?: string
  level?: number
}

interface UiState {
  theme: Theme
  setTheme: (t: Theme) => void
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => string
  dismissToast: (id: string) => void
  xpPops: XpPop[]
  popXp: (points: number, label: string) => void
  removeXpPop: (id: string) => void
  celebrations: Celebration[]
  celebrate: (c: Omit<Celebration, 'id'>) => void
  dismissCelebration: (id: string) => void
  reduceMotion: boolean
}

function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null
  if (meta) meta.content = dark ? '#15110E' : '#F6F1E9'
}

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem('hub-theme') as Theme | null
    return t === 'light' || t === 'dark' || t === 'system' ? t : 'system'
  } catch {
    return 'system'
  }
}

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  setTheme: (t) => {
    try { localStorage.setItem('hub-theme', t) } catch { /* ignore */ }
    applyTheme(t)
    set({ theme: t })
  },
  toasts: [],
  toast: (t) => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, duration: 4000, ...t }] }))
    const duration = t.duration ?? 4000
    if (duration > 0) setTimeout(() => get().dismissToast(id), duration)
    return id
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  xpPops: [],
  popXp: (points, label) => {
    const id = uid()
    set((s) => ({ xpPops: [...s.xpPops, { id, points, label }] }))
    setTimeout(() => get().removeXpPop(id), 2600)
  },
  removeXpPop: (id) => set((s) => ({ xpPops: s.xpPops.filter((x) => x.id !== id) })),
  celebrations: [],
  celebrate: (c) => set((s) => ({ celebrations: [...s.celebrations, { id: uid(), ...c }] })),
  dismissCelebration: (id) => set((s) => ({ celebrations: s.celebrations.filter((c) => c.id !== id) })),
  reduceMotion: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
}))

// Apply on load and follow system changes.
if (typeof window !== 'undefined') {
  applyTheme(useUi.getState().theme)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useUi.getState().theme === 'system') applyTheme('system')
  })
}
