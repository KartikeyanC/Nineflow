// What a phone WebView gives the app, for the test.
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), _store: store }
globalThis.window = globalThis
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
