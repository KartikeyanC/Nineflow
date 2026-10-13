// Read-only: the person's Google Calendar events, shown next to their tasks.
//
// Fetched (primary calendar only) for a window around the day being looked at,
// kept in memory only (never saved by NineFlow), and refreshed every few
// minutes. NineFlow's own events (sent by lib/gcal.js) are left out so a task
// isn't shown twice. Needs the Calendar permission from "Connect Google
// Calendar" and the "Show my calendar events" switch in Settings.
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { getCalendarToken } from './google'
import { storageKey } from './profiles'
import { AuthError } from './syncErrors'
import { useSyncExternalStore } from 'react'

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
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
let snap = { events: [], from: null, to: null, state: 'idle', fetchedAt: 0, message: '' }
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())
const set = (patch) => { snap = { ...snap, ...patch }; emit() }
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
        try { r = await fetch(`${API}?${q}`, { headers: { Authorization: `Bearer ${token}` } }) } catch { set({ state: 'offline', message: 'No connection to Google Calendar.' }); return }
        if (r.status === 401 || r.status === 403) throw new AuthError('Google Calendar access expired.')
        if (!r.ok) throw new Error(`Google Calendar error ${r.status}`)
        const d = await r.json()
        for (const it of d.items || []) events.push(...segmentsOf(it))
        pageToken = d.nextPageToken || ''
        if (!pageToken) break
      }
      set({ events, from, to, state: 'ok', fetchedAt: Date.now(), message: '' })
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
