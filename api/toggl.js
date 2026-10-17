// POST /api/toggl  { token, action: 'test' }                                   → { ok, name }
//                  { token, action: 'push', entries: [{ description, start, stop }] } → { ok, name, created, results: [bool] }
// Sends finished focus sessions to the person's Toggl Track as time entries. It goes through the
// server because Toggl refuses requests made straight from a web page (CORS).
//
// Not a general relay: the host is fixed (api.track.toggl.com), the paths are fixed (the signed-in
// user and "create a time entry"), and every field sent on is built here from checked values. The
// token is the person's own; it is used for these calls only and is neither stored nor logged.
import { cors, clientIp, limit, tooManyBody } from './_security.js'
import { readRaw, send } from './_push.js'

const API = 'https://api.track.toggl.com/api/v9'
const MAX_ENTRIES = 40
const MAX_SPAN_MS = 24 * 3600 * 1000
const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

const auth = (token) => `Basic ${Buffer.from(`${token}:api_token`).toString('base64')}`

async function toggl(token, path, init = {}) {
  return fetch(`${API}${path}`, {
    ...init, redirect: 'manual', signal: AbortSignal.timeout(7000),
    headers: { Authorization: auth(token), 'Content-Type': 'application/json' },
  })
}

// An entry that is well formed and no longer than a day, or null.
export function cleanEntry(e, now = Date.now()) {
  const start = Date.parse(e?.start)
  const stop = Date.parse(e?.stop)
  if (!Number.isFinite(start) || !Number.isFinite(stop) || !(stop > start) || stop - start > MAX_SPAN_MS || stop > now + 5 * 60_000) return null
  return { description: str(e.description, 200) || 'NineFlow', start: new Date(start).toISOString(), stop: new Date(stop).toISOString(), duration: Math.round((stop - start) / 1000) }
}

export default async function handler(req, res) {
  if (!cors(req, res)) return
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })
  if (await limit(req, [
    { name: 'toggl-min', key: clientIp(req), max: 10, windowSec: 60 },
    { name: 'toggl-day', key: clientIp(req), max: 120, windowSec: 86400 },
  ])) return send(res, 429, tooManyBody)

  let body
  try { body = JSON.parse((await readRaw(req, 40000)) || '{}') } catch (e) { return send(res, e.status || 400, { error: 'Bad request.' }) }
  const token = String(body.token ?? '').trim()
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return send(res, 400, { error: "That doesn't look like a Toggl API token." })
  const action = body.action === 'push' ? 'push' : 'test'

  let me
  try {
    const r = await toggl(token, '/me')
    if (r.status === 401 || r.status === 403) return send(res, 401, { error: "Toggl didn't accept that token. Check that you copied all of it." })
    if (r.status === 429) return send(res, 429, { error: 'Toggl says to slow down. Try again in a minute.' })
    if (!r.ok) return send(res, 502, { error: `Toggl returned an error (${r.status}).` })
    me = await r.json()
  } catch {
    return send(res, 502, { error: "Couldn't reach Toggl. Try again in a moment." })
  }
  const name = str(me.fullname || me.email, 80)
  if (action === 'test') return send(res, 200, { ok: true, name })

  const workspace = Number(me.default_workspace_id)
  if (!Number.isInteger(workspace) || workspace <= 0) return send(res, 400, { error: 'Toggl has no workspace for this token.' })
  const entries = (Array.isArray(body.entries) ? body.entries : []).slice(0, MAX_ENTRIES).map((e) => cleanEntry(e)).filter(Boolean)
  if (!entries.length) return send(res, 400, { error: 'There is no finished time to send.' })

  // A few at a time. `results[i]` says whether entry i was created, so the app marks exactly those as
  // sent and a retry never duplicates one.
  const results = new Array(entries.length).fill(false)
  let next = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < entries.length) {
      const i = next++
      try {
        const r = await toggl(token, `/workspaces/${workspace}/time_entries`, { method: 'POST', body: JSON.stringify({ ...entries[i], created_with: 'NineFlow', workspace_id: workspace }) })
        results[i] = r.ok
      } catch { /* counted as not created */ }
    }
  }))
  const created = results.filter(Boolean).length
  return send(res, 200, { ok: created === entries.length, name, created, results })
}
