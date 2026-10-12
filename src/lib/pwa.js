// Installing the planner as an app (phone, tablet or computer).
// Chrome, Edge and Android offer an install prompt, which we keep and show
// from our own button; iPhone and iPad have no prompt, so the person is told
// to use Share → Add to Home Screen. The service worker (public/sw.js) is
// only registered in production builds, so the dev server never serves stale
// files.

import { useEffect, useState } from 'react'

let deferred = null // the browser's saved install prompt
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify() })
  window.addEventListener('appinstalled', () => { deferred = null; notify() })
  // The desktop app (app://) ships its files, so it needs no service worker.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
      // Hand the worker the files this page already loaded, so the app opens offline after the first visit.
      navigator.serviceWorker.ready.then((reg) => {
        const urls = performance.getEntriesByType('resource').map((e) => e.name)
          .filter((u) => { const p = new URL(u); return p.origin === location.origin && (p.pathname.startsWith('/assets/') || p.pathname.startsWith('/icons/')) })
        reg.active?.postMessage({ type: 'cache-urls', urls: [location.href, ...urls] })
      })
    })
  }
}

export const isStandalone = () =>
  !!window.nineflowDesktop ||
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// iPadOS reports itself as a Mac; touch support tells them apart.
export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export async function promptInstall() {
  if (!deferred) return false
  const e = deferred
  deferred = null
  notify()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome === 'accepted'
}

// 'installed' | 'prompt' (our button works) | 'ios' (Share → Add to Home Screen)
// | 'manual' (use the browser's own menu)
export function useInstall() {
  const read = () => (isStandalone() ? 'installed' : deferred ? 'prompt' : isIOS() ? 'ios' : 'manual')
  const [state, setState] = useState(read)
  useEffect(() => {
    const fn = () => setState(read())
    listeners.add(fn)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', fn)
    return () => { listeners.delete(fn); mq?.removeEventListener?.('change', fn) }
  }, [])
  return state
}
