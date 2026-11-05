// Read-only: the person's Google Calendar events, shown next to their tasks.
//
// Fetched (the primary calendar, plus any others chosen in Settings) for a window around the day being looked at,
// kept in memory only (never saved by NineFlow), and refreshed every few
// minutes. NineFlow's own events (sent by lib/gcal.js) are left out so a task
// isn't shown twice. Needs the Calendar permission from "Connect Google
// Calendar" and the "Show my calendar events" switch in Settings.
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { getCalendarToken, getExtraToken } from './google'
import { storageKey } from './profiles'
import { AuthError } from './syncErrors'
import { useSyncExternalStore } from 'react'

const API_BASE = 'https://www.googleapis.com/calendar/v3/calendars'
const STALE_MS = 5 * 60_000
const dayKey = (d) => format(d, 'yyyy-MM-dd')
const minOf = (d) => d.getHours() * 60 + d.getMinutes()

// ---- the on/off switch (per account, like the sync switch) --------------------------
const SHOW_KEY = () => storageKey('gcal-show')
const readShow = () => { try { return localStorage.getItem(SHOW_KEY()) === '1' } catch { return false } }
export function setShowEvents(on) {
  try { on ? localStorage.setItem(SHOW_KEY(), '1') : localStorage.removeItem(SHOW_KEY()) } catch { /* ignore */ }
  if (!on) set({ events: [], from: null, to: null, state: 'idle', fetchedAt: 0 })
  emit()
}

// ---- store -------------------------------------------------------------------------------
// state: 'idle' | 'loading' | 'ok' | 'needs-auth' | 'offline' | 'error'
let snap = { events: [], from: null, to: null, state: 'idle', fetchedAt: 0, message: '', otherNeedsAuth: false }
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())
const set = (patch) => { snap = { ...snap, ...patch }; emit() }
// Another workspace has its own calendar choices: start from nothing and load again.
export function resetCalendarEvents() { snap = { events: [], from: null, to: null, state: 'idle', fetchedAt: 0, message: '', otherNeedsAuth: false }; emit() }
const subscribe = (f) => { listeners.add(f); window.addEventListener('storage', f); return () => { listeners.delete(f); window.removeEventListener('storage', f) } }
export const useShowEvents = () => useSyncExternalStore(subscribe, readShow)
export const useCalendarEvents = () => useSyncExternalStore(subscribe, () => snap)

// One event can span days: it is stored as one segment per day.
// { id, key: 'yyyy-MM-dd', title, allDay, startMin, endMin, free, link }
export function segmentsOf(ev) {
  if (ev.status === 'cancelled') return []
  if (ev.extendedProperties?.private?.nineflow === '1') return []
  if (ev.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return []
  if (ev.eventType === 'workingLocation') return [] // "Home" / "Office" markers aren't events
  const title = ev.summary || '(No title)'
  const free = ev.transparency === 'transparent'
  const base = { id: ev.id, title, free, link: ev.htmlLink || null }

  if (ev.start?.date) { // all-day, end is exclusive
    const out = []
    const first = parseISO(ev.start.date)
    const days = Math.min(14, Math.max(1, differenceInCalendarDays(parseISO(ev.end?.date || ev.start.date), first)))
    for (let i = 0; i < days; i += 1) out.push({ ...base, key: dayKey(addDays(first, i)), allDay: true, startMin: 0, endMin: 24 * 60 })
    return out
  }
  if (!ev.start?.dateTime || !ev.end?.dateTime) return []
  const start = new Date(ev.start.dateTime)
  const end = new Date(ev.end.dateTime)
  if (!(end > start)) return []
  const out = []
  let day = startOfDay(start)
  for (let i = 0; i < 14 && day < end; i += 1) {
    const next = addDays(day, 1)
    const s = start > day ? start : day
    const e = end < next ? end : next
    out.push({ ...base, key: dayKey(day), allDay: false, startMin: minOf(s), endMin: e >= next ? 24 * 60 : minOf(e) })
    day = next
  }
  return out
}

// ---- other calendars (chosen in Settings → Google Calendar) ------------------------------------------
// The primary calendar always shows (with the Calendar permission). Others the person ticks are read
// with the extra "see my list of calendars" permission, which is asked for only then (lib/google.js).
const CALS_KEY = () => storageKey('gcal-cals')
const readCalsRaw = () => { try { return localStorage.getItem(CALS_KEY()) || '' } catch { return '' } }
export function parseCals(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string' && c.id).slice(0, 8).map((c) => ({ id: c.id, name: String(c.name || c.id).slice(0, 60) })) : []
  } catch { return [] }
}
export function setOtherCalendars(list) {
  try { list.length ? localStorage.setItem(CALS_KEY(), JSON.stringify(list)) : localStorage.removeItem(CALS_KEY()) } catch { /* ignore */ }
  set({ fetchedAt: 0, from: null, to: null }) // load again with the new choice
}
export const useOtherCalendarsRaw = () => useSyncExternalStore(subscribe, readCalsRaw)

// The person's calendars (for the picker): [{ id, name, primary }]. Needs the extra permission.
export async function listCalendars(token) {
  let r
  try { r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=50&fields=items(id,summary,summaryOverride,primary,selected)', { headers: { Authorization: `Bearer ${token}` } }) }
  catch { throw new Error("Couldn't reach Google Calendar. Check your connection and try again.") }
  if (r.status === 401 || r.status === 403) throw new Error('Google did not allow reading your list of calendars. Press the button again and tick the box.')
  if (!r.ok) throw new Error(`Google Calendar returned an error (${r.status}).`)
  return ((await r.json()).items || []).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary }))
}

// One calendar's events in [from, to]: { status: 'ok' | 'auth' | 'offline' | 'error', events: segments, message }.
// `idPrefix` keeps event ids from different calendars apart.
async function fetchEvents(calId, token, from, to, idPrefix = '') {
  const events = []
  let pageToken = ''
  for (let page = 0; page < 4; page += 1) {
    const q = new URLSearchParams({
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250', showDeleted: 'false',
      timeMin: addDays(parseISO(from), 0).toISOString(), timeMax: addDays(parseISO(to), 1).toISOString(),
      fields: 'nextPageToken,items(id,summary,status,start,end,transparency,htmlLink,eventType,attendees(self,responseStatus),extendedProperties/private)',
      ...(pageToken ? { pageToken } : {}),
    })
    let r
    try { r = await fetch(`${API_BASE}/${encodeURIComponent(calId)}/events?${q}`, { headers: { Authorization: `Bearer ${token}` } }) } catch { return { status: 'offline', events, message: 'No connection to Google Calendar.' } }
    if (r.status === 401 || r.status === 403) return { status: 'auth', events }
    if (!r.ok) return { status: 'error', events, message: `Google Calendar error ${r.status}` }
    const d = await r.json()
    for (const it of d.items || []) events.push(...segmentsOf(idPrefix ? { ...it, id: `${idPrefix}${it.id}` } : it))
    pageToken = d.nextPageToken || ''
    if (!pageToken) break
  }
  return { status: 'ok', events }
}

// Loads [fromKey, toKey] unless the data we already have covers it and is fresh.
let loading = null
export async function loadRange(fromKey, toKey, { force = false } = {}) {
  if (!readShow()) return
  const covered = snap.from && snap.from <= fromKey && snap.to >= toKey
  if (!force && covered && Date.now() - snap.fetchedAt < STALE_MS && snap.state === 'ok') return
  const token = getCalendarToken()
  if (!token) { set({ state: 'needs-auth' }); return }
  if (loading) return loading
  // Ask for a little more than needed, so paging through weeks doesn't refetch each time.
  const from = dayKey(addDays(parseISO(fromKey), -7))
  const to = dayKey(addDays(parseISO(toKey), 21))
  set({ state: snap.events.length ? snap.state : 'loading' })
  loading = (async () => {
    try {
      const main = await fetchEvents('primary', token, from, to)
      if (main.status === 'offline') { set({ state: 'offline', message: main.message }); return }
      if (main.status === 'auth') throw new AuthError('Google Calendar access expired.')
      if (main.status !== 'ok') throw new Error(main.message)
      const events = [...main.events]
      // The calendars they ticked in Settings. One that fails is skipped, so it can't hide the rest.
      const others = parseCals(readCalsRaw())
      const extra = others.length ? getExtraToken('calendars') : null
      if (extra) {
        for (const cal of others) {
          const r = await fetchEvents(cal.id, extra, from, to, `${cal.id}:`)
          if (r.status === 'ok') events.push(...r.events)
        }
      }
      set({ events, from, to, state: 'ok', fetchedAt: Date.now(), message: '', otherNeedsAuth: others.length > 0 && !extra })
    } catch (e) {
      if (e instanceof AuthError) set({ state: 'needs-auth', message: '' })
      else set({ state: 'error', message: e.message || 'Could not load your calendar.' })
    } finally {
      loading = null
    }
  })()
  return loading
}

export const eventsOn = (events, key) => events.filter((e) => e.key === key)

// Busy time ([startMin, endMin] pairs) on a day, for "Plan my day": meetings you
// are attending block the slot; all-day and "free" events don't.
export function busyFor(key) {
  if (!readShow()) return []
  return snap.events.filter((e) => e.key === key && !e.allDay && !e.free).map((e) => [e.startMin, e.endMin])
}
