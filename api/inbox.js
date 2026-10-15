// POST /api/inbox  { key }              → { items: [{ id, from, fromName, subject, text, attachments, receivedAt }] }
// POST /api/inbox  { key, done: [id] }  → { removed: n }
// The planner's emailed tasks (see _inbox.js). The key travels in the body, not the URL,
// so it never lands in access logs. Items are removed only once the planner says it has
// added them (`done`), so nothing is lost if it closes halfway.
import { env, open, queueName, readJson, redis, send, validKey } from './_inbox.js'
import { clientIp, cors, limit, securityLog, tooManyBody } from './_security.js'


export default async function handler(req, res) {
  if (!cors(req, res)) return // the site itself and the desktop app (see _security.js)
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })
  const cfg = env()
  if (!cfg.redisUrl || !cfg.redisToken) return send(res, 503, { error: 'Email to NineFlow is not set up on this server.' })
  if (await limit(req, [{ name: 'inbox-min', key: clientIp(req), max: 30, windowSec: 60 }])) return send(res, 429, tooManyBody)

  let body
  try { body = await readJson(req, 20000) } catch (e) { return send(res, e.status || 400, { error: 'Bad request.' }) }
  const key = String(body.key || '')
  if (!validKey(key)) { securityLog('inbox_bad_key', req); return send(res, 400, { error: 'Bad inbox key.' }) }
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
