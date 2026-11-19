// Two-way sync between this workspace's tasks and one Google Tasks list (the person's default list).
//
// What is kept the same on both sides: the title, the notes (NineFlow's description), the day
// (Google Tasks keeps a date only, no time) and whether it is done. Everything else stays NineFlow's own.
//
// Each linked NineFlow task carries `gtask: { id, h }`: its twin's id, and a fingerprint of the four
// fields as they were when the two last matched. Because the link lives on the task it reaches the
// person's other devices with the task, so a second device doesn't make a second copy.
//
// One run:
//   - a linked pair where only one side changed since `h` takes the change from that side;
//     both changed: NineFlow's version wins (its edit was made here, where the person is working);
//   - deleted (or let go) in NineFlow: deleted in Google Tasks; deleted in Google Tasks: let go in
//     NineFlow (it can be brought back from the Dropped list);
//   - a new open task in Google Tasks comes into NineFlow; a new open NineFlow task (no day, or a day
//     up to two weeks ahead) goes to Google Tasks. Tasks already finished before sync was turned on
//     stay where they are. Google's subtasks are left out (NineFlow keeps steps inside a task).
//
// The ids this device has linked are remembered (per workspace) so a NineFlow task deleted for good
// (not just let go) can be told apart from a Google task that is simply new.
import { addDays } from 'date-fns'
import { getExtraToken } from './google'
import { storageKey } from './profiles'
import { AuthError, OfflineError } from './syncErrors'
import { createTask, dateKey, withDate, withStatus } from './tasks'

const API = 'https://tasks.googleapis.com/tasks/v1'
export const LIST = '@default'
const AHEAD_DAYS = 14
const MAX_PAGES = 20 // 2,000 tasks

// ---- fingerprints ------------------------------------------------------------------------
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) } return (h >>> 0).toString(36) }
const tidy = (s, n) => String(s || '').replace(/\r\n?/g, '\n').trim().slice(0, n)
export const localFields = (t) => ({ title: tidy(t.title, 1000) || 'Untitled', notes: tidy(t.description, 8000), due: t.date || null, done: t.status === 'completed' })
export const remoteFields = (r) => ({ title: tidy(r.title, 1000) || 'Untitled', notes: tidy(r.notes, 8000), due: r.due ? String(r.due).slice(0, 10) : null, done: r.status === 'completed' })
const hashOf = (f) => fnv(JSON.stringify([f.title, f.notes, f.due, f.done]))
const bodyOf = (f) => ({ title: f.title, notes: f.notes || null, due: f.due ? `${f.due}T00:00:00.000Z` : null, status: f.done ? 'completed' : 'needsAction', ...(f.done ? {} : { completed: null }) })

// A NineFlow task with Google's values for the four shared fields.
export function applyRemote(t, f, now = new Date()) {
  let next = { ...t, title: f.title, description: f.notes }
  if ((next.date || null) !== f.due) next = withDate(next, f.due, now)
  if ((next.status === 'completed') !== f.done) next = withStatus(next, f.done ? 'completed' : 'todo', now)
  return next
}

// ---- remembered ids (per workspace, this device) ----------------------------------------------
const KNOWN_KEY = () => storageKey('gtasks-known')
const loadKnown = () => { try { const a = JSON.parse(localStorage.getItem(KNOWN_KEY()) || '[]'); return new Set(Array.isArray(a) ? a : []) } catch { return new Set() } }
const saveKnown = (s) => { try { localStorage.setItem(KNOWN_KEY(), JSON.stringify([...s].slice(-5000))) } catch { /* ignore */ } }

// ---- Google Tasks API ----------------------------------------------------------------------
async function call(token, path, opts = {}) {
  let r
  try { r = await fetch(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }) }
  catch { throw new OfflineError('No connection to Google Tasks.') }
  if (r.status === 401 || r.status === 403) throw new AuthError('Google Tasks access expired.')
  if (r.status === 429 || r.status >= 500) throw new Error('Google Tasks is busy. It will try again.')
  return r
}
async function json(r, what) {
  if (!r.ok) throw new Error(`Google Tasks could not ${what} (${r.status}).`)
  return r.status === 204 ? null : r.json()
}

export async function listName(token = getExtraToken('tasks')) {
  if (!token) return ''
  const r = await call(token, `/users/@me/lists/${LIST}`)
  return r.ok ? (await r.json()).title || '' : ''
}

async function remoteTasks(token) {
  const all = []
  let page = ''
  for (let i = 0; i < MAX_PAGES; i++) {
    const q = new URLSearchParams({ maxResults: '100', showCompleted: 'true', showHidden: 'true', showDeleted: 'true', ...(page ? { pageToken: page } : {}) })
    const d = await json(await call(token, `/lists/${LIST}/tasks?${q}`), 'read your list')
    all.push(...(d.items || []))
    page = d.nextPageToken
    if (!page) break
  }
  return all
}

// ---- one run ---------------------------------------------------------------------------------
// `tasks`: every task in the workspace (let-go and paused ones too). `apply({ added, updates })`
// writes the result into the planner: `added` are new tasks, `updates` maps a task id to a
// function from the task as it is then to the task it becomes (so an edit made while this ran is kept).
// Resolves to { pushed, pulled, created, imported, removed, dropped }.
export async function syncGoogleTasks({ tasks, apply, now = new Date(), token = getExtraToken('tasks'), defaultCategory }) {
  if (!token) throw new AuthError('Google Tasks is not connected on this device.')
  const out = { pushed: 0, pulled: 0, created: 0, imported: 0, removed: 0, dropped: 0 }
  const known = loadKnown()
  for (const t of tasks) if (t.gtask?.id) known.add(t.gtask.id)

  const remote = (await remoteTasks(token)).filter((r) => !r.parent) // subtasks stay in Google
  const byId = new Map(remote.map((r) => [r.id, r]))
  const linkedIds = new Set(tasks.filter((t) => t.gtask?.id).map((t) => t.gtask.id))

  const updates = new Map() // task id → (task) => task
  const added = []
  const setLink = (id, link, change) => updates.set(id, (t) => ({ ...(change ? change(t) : t), gtask: link }))

  try {
    // 1. Pairs that already exist.
    for (const t of tasks) {
      if (!t.gtask?.id) continue
      const r = byId.get(t.gtask.id)
      if (!r || r.deleted) { // gone from Google Tasks
        if (!t.dropped) { setLink(t.id, null, (x) => (x.dropped ? x : { ...withStatus(x, x.status === 'working' ? 'todo' : x.status, now), dropped: { reason: 'Deleted in Google Tasks', at: now.toISOString() }, hold: null })); out.dropped += 1 }
        else setLink(t.id, null)
        known.delete(t.gtask.id)
        continue
      }
      if (t.dropped) { // let go here: delete it there
        const res = await call(token, `/lists/${LIST}/tasks/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
        if (res.ok || res.status === 404 || res.status === 410) { setLink(t.id, null); known.delete(r.id); out.removed += 1 }
        continue
      }
      const lf = localFields(t)
      const rf = remoteFields(r)
      const lh = hashOf(lf)
      const rh = hashOf(rf)
      const h = t.gtask.h
      if (lh === rh) { if (h !== lh) setLink(t.id, { id: r.id, h: lh }); continue }
      if (rh !== h && lh === h) { // changed in Google only: take it
        const next = applyRemote(t, rf, now)
        const nh = hashOf(localFields(next))
        if (nh !== rh) await json(await call(token, `/lists/${LIST}/tasks/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: JSON.stringify(bodyOf(localFields(next))) }), 'update a task')
        setLink(t.id, { id: r.id, h: nh }, (x) => applyRemote(x, rf, now))
        out.pulled += 1
        continue
      }
      // changed here (or on both sides: this side wins)
      await json(await call(token, `/lists/${LIST}/tasks/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: JSON.stringify(bodyOf(lf)) }), 'update a task')
      setLink(t.id, { id: r.id, h: lh })
      out.pushed += 1
    }

    // 2. The same open task on both sides, not linked yet (sent earlier with "Send a day's tasks", or
    //    added on both): link them instead of making copies. Same title and day.
    const matchKey = (f) => `${f.title.toLowerCase()}|${f.due || ''}`
    const unlinkedLocal = new Map()
    for (const t of tasks) {
      if (t.gtask?.id || t.dropped || t.status === 'completed') continue
      const k = matchKey(localFields(t))
      if (!unlinkedLocal.has(k)) unlinkedLocal.set(k, t)
    }
    for (const r of remote) {
      if (r.deleted || linkedIds.has(r.id) || known.has(r.id) || r.status === 'completed') continue
      const rf = remoteFields(r)
      const t = unlinkedLocal.get(matchKey(rf))
      if (!t) continue
      unlinkedLocal.delete(matchKey(rf))
      const lf = localFields(t)
      if (hashOf(lf) !== hashOf(rf)) await json(await call(token, `/lists/${LIST}/tasks/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: JSON.stringify(bodyOf(lf)) }), 'update a task')
      setLink(t.id, { id: r.id, h: hashOf(lf) })
      linkedIds.add(r.id)
      known.add(r.id)
    }

    // 3. Google tasks with no NineFlow twin.
    for (const r of remote) {
      if (r.deleted || linkedIds.has(r.id)) continue
      if (known.has(r.id)) { // its NineFlow task was deleted for good: delete it there too
        const res = await call(token, `/lists/${LIST}/tasks/${encodeURIComponent(r.id)}`, { method: 'DELETE' })
        if (res.ok || res.status === 404 || res.status === 410) { known.delete(r.id); out.removed += 1 }
        continue
      }
      if (r.status === 'completed' || !String(r.title || '').trim()) continue
      const rf = remoteFields(r)
      const t = createTask({ title: rf.title, description: rf.notes, date: rf.due, ...(defaultCategory ? { category: defaultCategory } : {}) })
      added.push({ ...t, gtask: { id: r.id, h: hashOf(localFields(t)) } })
      known.add(r.id)
      out.imported += 1
    }

    // 4. Open NineFlow tasks with no Google twin.
    const until = dateKey(addDays(now, AHEAD_DAYS))
    const fresh = tasks.filter((t) => !t.gtask?.id && !updates.has(t.id) && !t.dropped && !t.hold && t.status !== 'completed' && (!t.date || t.date <= until))
    for (const t of fresh) {
      const lf = localFields(t)
      const made = await json(await call(token, `/lists/${LIST}/tasks`, { method: 'POST', body: JSON.stringify(bodyOf(lf)) }), 'add a task')
      setLink(t.id, { id: made.id, h: hashOf(lf) })
      known.add(made.id)
      out.created += 1
    }
  } finally {
    // Keep what was done even when a later request failed.
    saveKnown(known)
    if (added.length || updates.size) apply({ added, updates })
  }
  return out
}
