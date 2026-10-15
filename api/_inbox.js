// Shared by the email-to-task endpoints (files starting with "_" are not routes).
//
// Each planner that turns on "Email to NineFlow" gets a private address:
//   <INBOUND address local part>+<inbox key>@inbound.postmarkapp.com
// Postmark receives the mail and calls /api/inbound. The mail is encrypted with a key
// derived from the inbox key (which only the planner knows: it is in its settings)
// and queued in Upstash Redis under a name also derived from it. The planner fetches
// its queue from /api/inbox, adds the tasks, and confirms, which deletes them.
// So the stored mail can't be read without the address, and nothing stays longer
// than 30 days.

import crypto from 'node:crypto'

export const TTL_SECONDS = 30 * 86400
export const MAX_QUEUE = 200

export const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function readJson(req, max) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  if (!raw) for await (const chunk of req) { raw += chunk; if (raw.length > max) throw Object.assign(new Error('Too large.'), { status: 413 }) }
  if (raw.length > max) throw Object.assign(new Error('Too large.'), { status: 413 })
  return JSON.parse(raw || '{}')
}

export const env = () => ({
  redisUrl: (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''),
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  webhookUser: process.env.INBOUND_WEBHOOK_USER || 'postmark',
  webhookPassword: process.env.INBOUND_WEBHOOK_PASSWORD,
})

// The inbox key: 26 lowercase letters/digits (it sits in an email address).
export const validKey = (k) => typeof k === 'string' && /^[a-z0-9]{26,40}$/.test(k)
const derive = (key, label) => crypto.createHmac('sha256', key).update(label).digest()
export const queueName = (key) => `inbox:${derive(key, 'nineflow-inbox-name').toString('hex').slice(0, 40)}`

export function seal(obj, key) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', derive(key, 'nineflow-inbox-encrypt'), iv)
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')
}

export function open(token, key) {
  const buf = Buffer.from(token, 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', derive(key, 'nineflow-inbox-encrypt'), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'))
}

// Upstash Redis over HTTPS: several commands in one request.
export async function redis({ redisUrl, redisToken }, commands) {
  const r = await fetch(`${redisUrl}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${redisToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`redis ${r.status}`)
  const out = await r.json()
  const bad = out.find((x) => x && x.error)
  if (bad) throw new Error(`redis: ${bad.error}`)
  return out.map((x) => x.result)
}

// Plain text of an email, without long quoted threads or huge signatures.
export function cleanBody(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000)
}

// Constant-time check of the webhook's Basic auth (user:password in the URL Postmark calls).
export function basicAuthOk(header, user, password) {
  if (!password || typeof header !== 'string' || !header.startsWith('Basic ')) return false
  const got = Buffer.from(header.slice(6), 'base64')
  const want = Buffer.from(`${user}:${password}`)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}
