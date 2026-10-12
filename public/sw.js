// NineFlow service worker: lets the installed app open without a
// connection. Pages are network-first (so a new version shows up on the next
// visit) with the cached copy as the offline fallback; the app's own files
// (hashed /assets, icons) are cache-first. Google sign-in and Drive requests
// go to other origins and are never touched here. Bump VERSION to drop old
// caches.

const VERSION = 'v3'
const CACHE = `daily-planner-${VERSION}`
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('daily-planner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// On the very first visit the page's scripts and styles load before this
// worker is in charge; the page sends their URLs so they're cached too.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return
  const urls = (event.data.urls || []).filter((u) => new URL(u).origin === self.location.origin)
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.match(u, { ignoreVary: true }).then((hit) => hit || c.add(u).catch(() => {}))))))
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res })
        .catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || caches.match('/', { ignoreVary: true }))),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
})
