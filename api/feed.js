// The calendar subscription link: a private https address that Google Calendar, Outlook or Apple
// Calendar can subscribe to, and that stays in step with the planner.
//
//   POST /api/feed  { token, ics }            the planner stores its current calendar file
//   POST /api/feed  { token, remove: true }   the planner deletes it
//   GET  /api/feed?k=<token>                  a calendar app reads it (text/calendar)
//
// There is no NineFlow user database, so the calendar file is kept the same way queued email is
// (see _inbox.js): encrypted (AES-256-GCM) with a key derived from the token, under a name also
// derived from it, in Upstash Redis. The token lives only in the person's settings and in the link
// they gave their calendar app, so the stored file can't be read without that link. It is kept
// 90 days and the clock restarts each time a calendar app reads it or the planner updates it.
// The calendar file passes through this function in the clear while it is stored and served.
import crypto from 'node:crypto'
import { cors, clientIp, limit, tooManyBody } from './_security.js'
import { env, readJson, redis, send } from './_inbox.js'

const TTL = 90 * 86400
const MAX_ICS = 400_000
export const validToken = (t) => typeof t === 'string' && /^[a-z0-9]{32,48}$/.test(t)

const derive = (token, label) => crypto.createHmac('sha256', token).update(label).digest()
export const feedName = (token) => `feed:${derive(token, 'nineflow-feed-name').toString('hex').slice(0, 40)}`

export function sealText(text, token) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', derive(token, 'nineflow-feed-encrypt'), iv)
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')
}
export function openText(sealed, token) {
  const buf = Buffer.from(sealed, 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', derive(token, 'nineflow-feed-encrypt'), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}

export default async function handler(req, res) {
  // Calendar apps send no Origin header, so cors() lets them through; the planner's own page is
  // checked as for every other endpoint.
  if (!cors(req, res, { methods: 'GET, POST' })) return
  const cfg = env()
  if (!cfg.redisUrl || !cfg.redisToken) return send(res, 503, { error: "The calendar link isn't set up on this server yet." })

  if (req.method === 'GET') {
    if (await limit(req, [{ name: 'feed-read', key: clientIp(req), max: 60, windowSec: 60 }])) return send(res, 429, tooManyBody)
    const token = new URL(req.url, 'http://x').searchParams.get('k')
    if (!validToken(token)) return send(res, 404, { error: 'Not found.' })
    let sealed
    try {
      const [value] = await redis(cfg, [['GET', feedName(token)], ['EXPIRE', feedName(token), TTL]])
      sealed = value
    } catch { return send(res, 502, { error: 'The calendar is unavailable right now.' }) }
    if (!sealed) return send(res, 404, { error: 'Not found.' })
    let ics
    try { ics = openText(sealed, token) } catch { return send(res, 404, { error: 'Not found.' }) }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="nineflow.ics"')
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.end(ics)
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' })
  if (await limit(req, [
    { name: 'feed-write-min', key: clientIp(req), max: 20, windowSec: 60 },
    { name: 'feed-write-day', key: clientIp(req), max: 600, windowSec: 86400 },
  ])) return send(res, 429, tooManyBody)

  let body
  try { body = await readJson(req, MAX_ICS + 2000) } catch (e) { return send(res, e.status || 400, { error: 'Bad request.' }) }
  if (!validToken(body.token)) return send(res, 400, { error: 'That calendar link is not valid.' })
  try {
    if (body.remove === true) {
      await redis(cfg, [['DEL', feedName(body.token)]])
      return send(res, 200, { ok: true })
    }
    const ics = typeof body.ics === 'string' ? body.ics : ''
    if (!ics.startsWith('BEGIN:VCALENDAR') || ics.length > MAX_ICS) return send(res, 400, { error: 'That is not a calendar file, or it is too large.' })
    await redis(cfg, [['SET', feedName(body.token), sealText(ics, body.token), 'EX', TTL]])
    return send(res, 200, { ok: true })
  } catch {
    return send(res, 502, { error: 'Could not save the calendar. Try again in a moment.' })
  }
}
