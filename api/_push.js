// Shared by the reminder endpoints (files starting with "_" are not routes).
//
// How a reminder reaches a closed browser or phone:
//   1. The planner subscribes this device to Web Push and sends its upcoming reminders
//      to /api/reminders.
//   2. /api/reminders hands each one to Upstash QStash, timed for the minute it is due.
//      The reminder (title, device subscription) is encrypted with REMINDER_SECRET
//      first, so QStash only ever holds ciphertext.
//   3. At that minute QStash calls /api/push, which checks QStash's signature, decrypts
//      the reminder and sends it to the device with Web Push (VAPID keys).
// Nothing is stored on this server.

import crypto from 'node:crypto'

export const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function readRaw(req, max) {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > max) throw Object.assign(new Error('Too large.'), { status: 413 }) }
  return raw
}

export const env = () => ({
  qstashToken: process.env.QSTASH_TOKEN,
  qstashUrl: (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, ''),
  signingKeys: [process.env.QSTASH_CURRENT_SIGNING_KEY, process.env.QSTASH_NEXT_SIGNING_KEY].filter(Boolean),
  secret: process.env.REMINDER_SECRET,
  vapidPublic: process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY,
  vapidPrivate: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:support@nineflow.app',
  // Where QStash delivers: the site's own /api/push. Never taken from the request's Host header.
  appUrl: (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, ''),
})

// ---- encryption (AES-256-GCM, key derived from REMINDER_SECRET) ---------------------
const keyOf = (secret) => crypto.createHash('sha256').update(String(secret)).digest()
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export function seal(obj, secret) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv)
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()])
  return b64u(Buffer.concat([iv, c.getAuthTag(), data]))
}

export function open(token, secret) {
  const buf = unb64u(token)
  if (buf.length < 29) throw new Error('bad token')
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'))
}

// ---- QStash ---------------------------------------------------------------------------
// Upstash-Signature is a JWT (HS256) signed with the current or the next signing key;
// its `body` claim is the SHA-256 of the exact request body.
export function verifyQstash(signature, rawBody, keys, now = Date.now()) {
  if (!signature || !keys.length) return false
  const parts = String(signature).split('.')
  if (parts.length !== 3) return false
  const [h, p, sig] = parts
  let claims
  try { claims = JSON.parse(unb64u(p).toString('utf8')) } catch { return false }
  const signedOk = keys.some((k) => {
    const expect = b64u(crypto.createHmac('sha256', k).update(`${h}.${p}`).digest())
    return expect.length === sig.length && crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))
  })
  if (!signedOk) return false
  const secs = Math.floor(now / 1000)
  if (claims.iss !== 'Upstash') return false
  if (Number.isFinite(claims.exp) && secs > claims.exp + 60) return false
  if (Number.isFinite(claims.nbf) && secs < claims.nbf - 60) return false
  const bodyHash = b64u(crypto.createHash('sha256').update(rawBody).digest())
  return String(claims.body || '').replace(/=+$/, '') === bodyHash
}

export async function qstashPublish({ qstashUrl, qstashToken }, destination, body, notBeforeSecs) {
  const r = await fetch(`${qstashUrl}/v2/publish/${destination}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${qstashToken}`,
      // text/plain, so /api/push receives the exact bytes QStash signed
      'content-type': 'text/plain',
      'upstash-not-before': String(notBeforeSecs),
      'upstash-retries': '2',
    },
    body,
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`qstash ${r.status}`)
  const data = await r.json()
  return data.messageId
}

export async function qstashCancel({ qstashUrl, qstashToken }, messageId) {
  const r = await fetch(`${qstashUrl}/v2/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${qstashToken}` }, signal: AbortSignal.timeout(8000),
  })
  return r.ok || r.status === 404 // already delivered or gone counts as done
}

// Push services browsers use. A subscription for anywhere else is refused, so this
// server can't be used to send requests to arbitrary addresses.
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/]
export function cleanSubscription(sub) {
  if (!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string') return null
  let url
  try { url = new URL(sub.endpoint) } catch { return null }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(url.hostname))) return null
  const { p256dh, auth } = sub.keys || {}
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) return null
  return { endpoint: sub.endpoint.slice(0, 1000), keys: { p256dh, auth } }
}
