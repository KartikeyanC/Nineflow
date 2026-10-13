// Two-way-free, one-way sync: NineFlow tasks → the person's Google Calendar.
//
// Every dated task becomes an event on their primary calendar (timed when the
// task has a start time, all-day when it doesn't). Editing a task updates its
// event, deleting or un-dating it removes the event. Nothing is ever read from
// the calendar. A small map { taskId: { eventId, hash } } (saved per workspace
// and synced with the rest of the planner) remembers which event belongs to
// which task, so a second device doesn't create duplicates and unchanged tasks
// cost no requests.
import { addDays, addMinutes, format, parseISO, subDays } from 'date-fns'
import { storageKey } from './profiles'
import { AuthError, OfflineError } from './syncErrors'
import { getCalendarToken } from './google'

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const MAP_KEY = () => storageKey('gcal')
const dayKey = (d) => format(d, 'yyyy-MM-dd')
const localStamp = (d) => format(d, "yyyy-MM-dd'T'HH:mm:ss")
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

export const loadMap = () => {
  try { const m = JSON.parse(localStorage.getItem(MAP_KEY()) || '{}'); return m && typeof m === 'object' ? m : {} } catch { return {} }
}
const saveMap = (m) => { try { localStorage.setItem(MAP_KEY(), JSON.stringify(m)) } catch { /* ignore */ } }
export const syncedCount = () => Object.keys(loadMap()).length

// What goes to Google for one task.
export function eventFor(task, categoryName) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const day = parseISO(task.date)
  const done = task.status === 'completed'
  const tags = (task.tags || []).length ? task.tags.map((g) => `#${g}`).join(' ') : null
  const steps = (task.subtasks || []).length ? (task.subtasks).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join(String.fromCharCode(10)) : null
  const details = [task.description, steps, tags ? `Tags: ${tags}` : null, categoryName ? `Category: ${categoryName}` : null, `Priority: ${task.priority}`, 'From NineFlow'].filter(Boolean).join('\n')
  const when = task.startTime
    ? (() => {
        const start = addMinutes(day, toMin(task.startTime))
        const end = addMinutes(start, task.durationMinutes || 30)
        return { start: { dateTime: localStamp(start), timeZone: tz }, end: { dateTime: localStamp(end), timeZone: tz } }
      })()
    : { start: { date: dayKey(day) }, end: { date: dayKey(addDays(day, 1)) } }
  return {
    summary: `${done ? '✓ ' : ''}${task.title || 'Untitled'}`,
    description: details,
    ...when,
    // A task's own reminders become popups on timed events; otherwise the calendar's defaults apply.
    ...(task.startTime && Array.isArray(task.reminders) && task.reminders.length
      ? { reminders: { useDefault: false, overrides: task.reminders.slice(0, 5).map((minutes) => ({ method: 'popup', minutes })) } }
      : {}),
    extendedProperties: { private: { nineflow: '1', taskId: task.id } },
  }
}

const hashOf = (ev) => JSON.stringify([ev.summary, ev.description, ev.start, ev.end, ev.reminders])

async function call(token, url, opts = {}) {
  let r
  try {
    r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  } catch {
    throw new OfflineError('No connection to Google Calendar.')
  }
  if (r.status === 401 || r.status === 403) throw new AuthError('Google Calendar access expired.')
  if (r.status === 429 || r.status >= 500) throw new Error('Google Calendar is busy. It will retry.')
  return r
}

// Runs `work` over `items` a few at a time; stops at the first auth/offline failure.
async function pool(items, size, work) {
  const queue = [...items]
  let stop = null
  const worker = async () => {
    while (queue.length && !stop) {
      const item = queue.shift()
      try { await work(item) } catch (e) { if (e instanceof AuthError || e instanceof OfflineError) stop = e; else throw e }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  if (stop) throw stop
}

// Brings the calendar in line with `tasks`. Returns { created, updated, removed }.
export async function syncCalendar({ tasks, categories = [], now = new Date(), token = getCalendarToken() }) {
  if (!token) throw new AuthError('Google Calendar is not connected on this device.')
  const catName = (id) => categories.find((c) => c.id === id)?.name
  const map = loadMap()
  // Older than yesterday is left alone unless it already has an event.
  const cutoff = dayKey(subDays(now, 1))
  const wanted = tasks.filter((t) => t.date && (t.date >= cutoff || map[t.id]))
  const wantedIds = new Set(wanted.map((t) => t.id))
  const out = { created: 0, updated: 0, removed: 0 }

  const stale = Object.keys(map).filter((id) => !wantedIds.has(id))
  const todo = []
  for (const t of wanted) {
    const ev = eventFor(t, catName(t.category))
    const hash = hashOf(ev)
    if (!map[t.id]) todo.push({ t, ev, hash, kind: 'create' })
    else if (map[t.id].hash !== hash) todo.push({ t, ev, hash, kind: 'update' })
  }

  try {
    await pool(todo, 3, async ({ t, ev, hash, kind }) => {
      if (kind === 'update') {
        const r = await call(token, `${API}/${encodeURIComponent(map[t.id].eventId)}`, { method: 'PATCH', body: JSON.stringify(ev) })
        if (r.ok) { map[t.id] = { eventId: map[t.id].eventId, hash }; out.updated += 1; return }
        // Deleted from the calendar by hand: put it back.
      }
      const r = await call(token, API, { method: 'POST', body: JSON.stringify(ev) })
      if (!r.ok) throw new Error(`Google Calendar error ${r.status}`)
      const made = await r.json()
      map[t.id] = { eventId: made.id, hash }
      out.created += 1
    })
    await pool(stale, 3, async (id) => {
      const r = await call(token, `${API}/${encodeURIComponent(map[id].eventId)}`, { method: 'DELETE' })
      if (r.ok || r.status === 404 || r.status === 410) { delete map[id]; out.removed += 1 }
    })
  } finally {
    saveMap(map) // keep what was done even if a later request failed
  }
  return out
}

// Disconnecting: take every NineFlow event off the calendar (or just forget them).
export async function clearCalendar({ removeEvents, token = getCalendarToken() }) {
  const map = loadMap()
  if (removeEvents && token) {
    await pool(Object.keys(map), 3, async (id) => {
      const r = await call(token, `${API}/${encodeURIComponent(map[id].eventId)}`, { method: 'DELETE' })
      if (r.ok || r.status === 404 || r.status === 410) delete map[id]
    }).finally(() => saveMap(map))
    return Object.keys(map).length === 0
  }
  saveMap({})
  return true
}
