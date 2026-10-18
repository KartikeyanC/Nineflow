// What a phone WebView gives the app, for the test.
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), _store: store }
globalThis.window = globalThis
// Window events (the Back button talks to the app through them) and just enough of the page:
// the open dialogs, each with a size (a hidden one has width 0).
const events = new EventTarget()
globalThis.addEventListener = events.addEventListener.bind(events)
globalThis.removeEventListener = events.removeEventListener.bind(events)
globalThis.dispatchEvent = events.dispatchEvent.bind(events)
globalThis.KeyboardEvent = class extends Event { constructor(type, init = {}) { super(type, init); this.key = init.key } }
globalThis.__dialogs = []
globalThis.document = {
  querySelectorAll: (sel) => (sel === '[role=dialog]' ? __dialogs.map((width) => ({ getBoundingClientRect: () => ({ width }) })) : []),
  activeElement: null,
  body: { dispatchEvent: (e) => globalThis.dispatchEvent(e) }, // as if it bubbled up to the window
}
globalThis.__fetchLog = []
globalThis.__tokenReply = null
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  __fetchLog.push({ url: u, method: opts.method || 'GET', body: opts.body ? Object.fromEntries(new URLSearchParams(String(opts.body))) : null })
  if (u.startsWith('https://oauth2.googleapis.com/token')) {
    const r = globalThis.__tokenReply
    return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response('{}', { status: 200 })
}
