// POST /api/inbox  { key }              → { items: [{ id, from, fromName, subject, text, attachments, receivedAt }] }
// POST /api/inbox  { key, done: [id] }  → { removed: n }
// The planner's emailed tasks (see _inbox.js). The key travels in the body, not the URL,
// so it never lands in access logs. Items are removed only once the planner says it has
// added them (`done`), so nothing is lost if it closes halfway.
import { env, open, queueName, readJson, redis, send, validKey } from './_inbox.js'

const hits = new Map()
function tooMany(ip) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < 6e4)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > 30
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*') // the desktop app calls the deployed site
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST'); return send(res, 204, {}) }
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })
  const cfg = env()
  if (!cfg.redisUrl || !cfg.redisToken) return send(res, 503, { error: 'Email to NineFlow is not set up on this server.' })
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  if (tooMany(ip)) return send(res, 429, { error: 'Too many requests. Try again in a minute.' })

  let body
  try { body = await readJson(req, 20000) } catch (e) { return send(res, e.status || 400, { error: 'Bad request.' }) }
  const key = String(body.key || '')
  if (!validKey(key)) return send(res, 400, { error: 'Bad inbox key.' })
  const q = queueName(key)

  try {
    const [raw] = await redis(cfg, [['LRANGE', q, 0, 99]])
    const stored = (raw || []).map((token) => { try { return { token, item: open(token, key) } } catch { return { token, item: null } } })

    if (Array.isArray(body.done)) {
      const done = new Set(body.done.filter((x) => typeof x === 'string').slice(0, 100))
      // Remove the confirmed ones, and any that can't be read (not for this key).
      const gone = stored.filter((s) => !s.item || done.has(s.item.id))
      if (gone.length) await redis(cfg, gone.map((s) => ['LREM', q, 1, s.token]))
      return send(res, 200, { removed: gone.length })
    }
    return send(res, 200, { items: stored.filter((s) => s.item).map((s) => s.item) })
  } catch {
    return send(res, 502, { error: 'The email inbox is unavailable right now.' })
  }
}
