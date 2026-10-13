// Shared by the AI endpoints in this folder (files starting with "_" are not
// routes). The Anthropic key lives only here, as ANTHROPIC_API_KEY on the
// server; it never reaches the browser. Each endpoint says how much it may be
// used (per IP, per minute and per day, best effort: it resets when the
// function cold-starts) and what it sends to Claude.

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'
const hits = new Map()

function tooMany(bucket, ip, limit) {
  const now = Date.now()
  const key = `${bucket}|${ip}`
  const list = (hits.get(key) || []).filter((t) => now - t < 864e5)
  list.push(now)
  hits.set(key, list)
  if (hits.size > 5000) hits.clear()
  return list.length > limit.perDay || list.filter((t) => now - t < 6e4).length > limit.perMinute
}

export const send = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req, max) {
  if (req.body && typeof req.body === 'object') return req.body
  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > max) break }
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

export class Bad extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

export const cleanCategories = (list) => (Array.isArray(list) ? list : [])
  .filter((c) => c && typeof c.id === 'string').slice(0, 20)
  .map((c) => ({ id: c.id.slice(0, 40), name: String(c.name || c.id).slice(0, 40) }))

export const validToday = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10))
export const weekdayOf = (today) => new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

// Wraps an endpoint: method, CORS, key, rate limit, body.
// `run(body)` returns { system, messages, maxTokens, tool? } or throws a Bad.
// With a tool, Claude's reply is that tool's input (an object); without one it
// is plain text. `shape` turns the reply into the JSON sent back (may throw).
export function endpoint({ name, limit, maxBody = 20000, run, shape }) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*') // the desktop app calls the deployed site
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST'); return send(res, 204, {}) }
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })

    const key = process.env.ANTHROPIC_API_KEY
    if (!key) return send(res, 503, { error: "The AI helper isn't set up yet: ANTHROPIC_API_KEY is missing on the server." })

    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
    if (tooMany(name, ip, limit)) return send(res, 429, { error: "That's a lot of requests in a short time. Try again in a minute." })

    let job
    try { job = run(await readBody(req, maxBody)) } catch (e) { return send(res, e.status || 400, { error: e.message || 'Bad request.' }) }

    let r
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: job.maxTokens || 1500,
          system: job.system,
          messages: job.messages,
          ...(job.tool ? { tools: [job.tool], tool_choice: { type: 'tool', name: job.tool.name } } : {}),
        }),
        signal: AbortSignal.timeout(25000),
      })
    } catch {
      return send(res, 504, { error: 'The AI helper took too long. Try again.' })
    }
    if (!r.ok) return send(res, r.status === 429 ? 429 : 502, { error: r.status === 429 ? 'The AI helper is busy. Try again in a moment.' : 'The AI helper had a problem. Try again.' })
    const data = await r.json()
    const out = job.tool ? data.content?.find((b) => b.type === 'tool_use')?.input : data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
    try {
      if (!out) throw new Error('empty')
      return send(res, 200, shape ? shape(out) : { text: out })
    } catch {
      return send(res, 502, { error: "The AI helper didn't return a usable answer. Try rewording." })
    }
  }
}
