// Keeps the installed app current. Every deploy produces a new service worker;
// this makes sure it's picked up promptly, reloads when that's harmless, and
// otherwise offers a "Reload" toast instead of silently running stale code.
import { registerSW } from 'virtual:pwa-register'
import { useUi } from '../store/ui'

const FRESH_MS = 30_000

function dialogOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"]'))
}

export function setupUpdates() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  let offered = false
  const applyNow = () => window.location.reload()
  const offer = () => {
    if (offered) return
    offered = true
    useUi.getState().toast({
      title: 'A new version is ready',
      description: 'Reload when you have a second — it takes a moment.',
      actionLabel: 'Reload',
      duration: 0,
      onAction: applyNow,
    })
  }

  registerSW({
    immediate: true,
    // A new worker has taken over. Reload straight away on a fresh load (the
    // person hasn't started anything yet); otherwise never yank a form away.
    onNeedReload() {
      if (performance.now() < FRESH_MS && !dialogOpen()) applyNow()
      else offer()
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => { void reg.update().catch(() => {}) }
      // Phones keep the app open for days: look for updates when it comes back to the front, and hourly.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
      window.setInterval(check, 60 * 60 * 1000)
    },
  })

  // A page-load chunk that no longer exists (old build, new deploy) — reload rather than show a broken page.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    applyNow()
  })
}
