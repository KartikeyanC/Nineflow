// Shared security for the API functions (files starting with "_" are not routes).
// See docs/SECURITY.md. In short:
//   cors()        allowlist of origins: the site itself, the desktop app, ALLOWED_ORIGINS
//   clientIp()    the IP Vercel saw (not a client-supplied X-Forwarded-For value)
//   limit()       rate limits shared by every instance through Upstash Redis when it is
//                 configured, per-instance memory otherwise; fails open if Redis is down
//   securityLog() one JSON line per refused request, category "security", ids only
// Request and response bodies are never logged.

import crypto from 'node:crypto'

// ---- origins --------------------------------------------------------------------------
const DESKTOP_ORIGIN = 'app://nineflow'
function allowedOrigins() {
  const own = [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`]
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',')
  return new Set([DESKTOP_ORIGIN, ...own, ...extra].map((o) => String(o || '').trim().replace(/\/$/, '')).filter(Boolean))
}

// A request from a page on another site is refused. Requests without an Origin header are
// not from a browser page (curl, QStash, Postmark): CORS doesn't apply to them, and each
// endpoint has its own protection (rate limits, signatures, a password).
// Returns false when the request was answered (preflight or refused) and must stop.
export function cors(req, res, { methods = 'POST' } = {}) {
  const origin = req.headers.origin
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const sameSite = origin && host && (origin === `https://${host}` || origin === `http://${host}`)
  if (origin && !sameSite) {
    if (!allowedOrigins().has(origin.replace(/\/$/, ''))) {
      securityLog('origin_refused', req, { origin: origin.slice(0, 100) })
      res.statusCode = 403
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'This site may not use the NineFlow API.' }))
      return false
    }
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`)
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return false }
  return true
}

// ---- client IP --------------------------------------------------------------------------
// On Vercel, x-vercel-forwarded-for / x-real-ip are set by the platform from the actual
// connection. The first X-Forwarded-For value can be typed by the client, so it is the last resort.
export function clientIp(req) {
  const h = req.headers
  const ip = h['x-vercel-forwarded-for'] || h['x-real-ip'] || req.socket?.remoteAddress || String(h['x-forwarded-for'] || '').split(',').pop()
  return String(ip || 'unknown').split(',')[0].trim().slice(0, 64)
}

// ---- security log ----------------------------------------------------------------------
// One JSON line on stdout. Never bodies, never personal data: the event, the route and, at
// most, a short hash of the IP (enough to see one source repeating, not who it is).
const ipTag = (ip) => crypto.createHash('sha256').update(`${process.env.LOG_SALT || 'nineflow'}|${ip}`).digest('hex').slice(0, 12)
export function securityLog(event, req, extra = {}) {
  try {
    console.warn(JSON.stringify({ category: 'security', event, route: String(req?.url || '').split('?')[0], ip: req ? ipTag(clientIp(req)) : undefined, at: new Date().toISOString(), ...extra }))
  } catch { /* logging never breaks a request */ }
}

// ---- rate limits ---------------------------------------------------------------------------
const memory = new Map()
function memoryHit(key, windowSec) {
  const now = Date.now()
  const w = Math.floor(now / (windowSec * 1000))
  const k = `${key}|${w}`
  const n = (memory.get(k) || 0) + 1
  memory.set(k, n)
  if (memory.size > 20000) memory.clear()
  return n
}

async function redisHits(keys) {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const cmds = keys.flatMap(([k, sec]) => [['INCR', k], ['EXPIRE', k, sec + 5, 'NX']])
  const r = await fetch(`${url}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(1500) })
  if (!r.ok) throw new Error(`redis ${r.status}`)
  const out = await r.json()
  return keys.map((_, i) => Number(out[i * 2]?.result) || 0)
}

// rules: [{ name, key, max, windowSec }]. Every rule is counted; the first one over its max
// is returned (or null when all are within limits). Shared through Redis when configured.
export async function limit(req, rules) {
  const now = Date.now()
  const keyed = rules.map((r) => [`rl:${r.name}:${r.key}:${Math.floor(now / (r.windowSec * 1000))}`, r.windowSec])
  let counts = null
  try { counts = await redisHits(keyed) } catch { securityLog('rate_limit_store_down', req) } // fail open to memory
  if (!counts) counts = keyed.map(([k, sec]) => memoryHit(k, sec))
  const over = rules.find((r, i) => counts[i] > r.max)
  if (over) securityLog('rate_limited', req, { rule: over.name })
  return over || null
}

export const tooManyBody = { error: "That's a lot of requests in a short time. Try again in a minute." }
