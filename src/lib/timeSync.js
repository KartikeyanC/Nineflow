// Send the person's finished focus sessions to a time tracker as time entries: Clockify (called
// straight from the app) or Toggl Track (through /api/toggl, because Toggl refuses requests made
// by a web page). Each session is sent once: lib/connections.js remembers which ones went.
import { format } from 'date-fns'
import { markSent, wasSent } from './connections'
import { hasNoSite } from './platform'

// Finished sessions that began on `dayKey` and ran at least a minute:
// [{ key: 'taskId|start', title, start: Date, end: Date }]
export function sessionsForDay(tasks, dayKey) {
  const out = []
  for (const t of tasks) {
    for (const s of t.sessions || []) {
      if (!s.end) continue
      const start = new Date(s.start)
      const end = new Date(s.end)
      if (Number.isNaN(start.getTime()) || !(end - start >= 60_000)) continue
      if (format(start, 'yyyy-MM-dd') !== dayKey) continue
      out.push({ key: `${t.id}|${s.start}`, title: (t.title || 'Untitled').slice(0, 200), start, end })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

// The sessions not yet sent to `service`, and how many minutes they add up to.
export function pending(service, sessions) {
  const list = sessions.filter((s) => !wasSent(service, s.key))
  return { list, minutes: Math.round(list.reduce((m, s) => m + (s.end - s.start) / 60_000, 0)) }
}

// Runs `work` over `items`, a few at a time. Resolves to the keys that worked and the first error.
async function pool(items, size, work) {
  const queue = [...items]
  const done = []
  let error = null
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (queue.length && !error) {
      const item = queue.shift()
      try { await work(item); done.push(item.key) } catch (e) { error = error || e }
    }
  }))
  return { done, error }
}

async function request(service, url, opts) {
  let r
  try { r = await fetch(url, opts) } catch { throw new Error(`Couldn't reach ${service}. Check your connection and try again.`) }
  if (r.status === 401 || r.status === 403) throw new Error(`${service} didn't accept that key. Check that you copied all of it.`)
  if (r.status === 429) throw new Error(`${service} says to slow down. Try again in a minute.`)
  if (!r.ok) throw new Error(`${service} returned an error (${r.status}).`)
  return r
}

// ---- Clockify ---------------------------------------------------------------------------------
const CLOCKIFY = 'https://api.clockify.me/api/v1'
const clockifyHeaders = (key) => ({ 'X-Api-Key': key, 'Content-Type': 'application/json' })

export async function testClockify({ key }) {
  const me = await (await request('Clockify', `${CLOCKIFY}/user`, { headers: clockifyHeaders(key) })).json()
  return me.name || me.email || 'your Clockify account'
}

export async function sendToClockify({ key }, sessions) {
  const me = await (await request('Clockify', `${CLOCKIFY}/user`, { headers: clockifyHeaders(key) })).json()
  const workspace = me.activeWorkspace || me.defaultWorkspace
  if (!workspace) throw new Error('Clockify has no workspace for this key.')
  const { done, error } = await pool(sessions, 3, (s) => request('Clockify', `${CLOCKIFY}/workspaces/${workspace}/time-entries`, {
    method: 'POST', headers: clockifyHeaders(key),
    body: JSON.stringify({ start: s.start.toISOString(), end: s.end.toISOString(), description: s.title, billable: false }),
  }))
  if (done.length) markSent('clockify', done)
  return { sent: done.length, error }
}

// ---- Toggl Track (through the site's /api/toggl) ----------------------------------------------
const base = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

async function toggl(body) {
  const root = base()
  if (hasNoSite()) throw new Error('Toggl needs the NineFlow site. Set VITE_API_BASE for the desktop or phone app.')
  let res
  try { res = await fetch(`${root}/api/toggl`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
  catch { throw new Error("Couldn't reach NineFlow's server. Check your connection and try again.") }
  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) throw new Error(data?.error || 'Could not reach Toggl.')
  return data
}

export async function testToggl({ token }) {
  return (await toggl({ token, action: 'test' })).name || 'your Toggl account'
}

export async function sendToToggl({ token }, sessions) {
  // The server takes up to 40 at a time.
  let sent = 0
  let error = null
  for (let i = 0; i < sessions.length && !error; i += 40) {
    const chunk = sessions.slice(i, i + 40)
    try {
      const r = await toggl({ token, action: 'push', entries: chunk.map((s) => ({ description: s.title, start: s.start.toISOString(), stop: s.end.toISOString() })) })
      // The server says which entries of the chunk were created; only those are marked as sent.
      const ok = chunk.filter((_, n) => r.results?.[n])
      if (ok.length) { markSent('toggl', ok.map((s) => s.key)); sent += ok.length }
      if (ok.length < chunk.length) error = new Error('Toggl accepted only some of the entries. Press send again to retry the rest.')
    } catch (e) { error = e }
  }
  return { sent, error }
}
