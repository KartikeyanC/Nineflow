// NineFlow service worker: lets the installed app open without a
// connection. Pages are network-first (so a new version shows up on the next
// visit) with the cached copy as the offline fallback; the app's own files
// (hashed /assets, icons) are cache-first. Google sign-in and Drive requests
// go to other origins and are never touched here. Bump VERSION to drop old
// caches. It also shows reminders pushed while NineFlow is closed (src/lib/webPush.js).

const VERSION = 'v4'
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
  // Never keep a copy of these: the Microsoft sign-in return page (its address holds a one-time code) and
  // /api/ links opened in a tab (the calendar link).
  if (url.pathname === '/ms-callback.html' || url.pathname.startsWith('/api/')) return

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

// ---- reminders pushed while NineFlow is closed (api/push.js) -------------------------
self.addEventListener('push', (event) => {
  let r = {}
  try { r = event.data ? event.data.json() : {} } catch { r = { title: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(r.title || 'NineFlow reminder', {
    body: r.body || '',
    tag: r.id || undefined, // the same reminder twice replaces itself
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-48.png',
    data: { taskId: r.taskId || null },
  }))
})

// Clicking one opens its task: in a NineFlow tab that is already open, or a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const id = event.notification.data?.taskId
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin)
    if (tab) {
      await tab.focus()
      if (id) tab.postMessage({ type: 'open-task', id })
      return
    }
    await self.clients.openWindow(id ? `/?task=${encodeURIComponent(id)}` : '/')
  })())
})
