import { useEffect, useSyncExternalStore } from 'react'
import { usePlanner } from '../store/PlannerContext'
import { clearCalendar, loadMap, syncCalendar } from '../lib/gcal'
import { clearCalendarToken, getCalendarToken, isDesktop, rememberedAccount, requestCalendarToken } from '../lib/google'
import { AuthError, OfflineError } from '../lib/syncErrors'
import { storageKey } from '../lib/profiles'
import { loadRange, useShowEvents } from '../lib/gcalEvents'
import { addDays, parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'

const listeners = new Set()

// Whether sync is on is per account (not per workspace): connecting once covers
// every workspace, each syncing its own tasks while you are in it.
const ON_KEY = () => storageKey('gcal-on')
const readOn = () => { try { return localStorage.getItem(ON_KEY()) === '1' } catch { return false } }
const writeOn = (on) => { try { on ? localStorage.setItem(ON_KEY(), '1') : localStorage.removeItem(ON_KEY()) } catch { /* ignore */ } listeners.forEach((f) => f()) }
export const useCalendarOn = () => useSyncExternalStore(
  (f) => { listeners.add(f); window.addEventListener('storage', f); return () => { listeners.delete(f); window.removeEventListener('storage', f) } },
  readOn,
)

// Keeps Google Calendar in step with the planner (see lib/gcal.js). Mounted once
// in the app; Settings reads its state through useCalendarStatus() and drives it
// with connectCalendar / disconnectCalendar / syncNow.
//
// A browser token lasts about an hour. When it runs out while sync is on, the
// next click anywhere asks Google for a fresh one (a quick window flash, no
// extra consent), because browsers only allow that window from a click.

// ---- shared status -----------------------------------------------------------------
// state: 'off' | 'idle' | 'syncing' | 'ok' | 'needs-auth' | 'offline' | 'error'
let status = { state: 'off', last: null, message: '', counts: null }
const set = (patch) => { status = { ...status, ...patch }; listeners.forEach((f) => f()) }
export const useCalendarStatus = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, () => status)

let latest = { tasks: [], categories: [] } // what the next sync should send
let running = false
let again = false

export async function syncNow() {
  if (running) { again = true; return }
  const token = getCalendarToken()
  if (!token) { set({ state: 'needs-auth', message: '' }); return }
  running = true
  set({ state: 'syncing', message: '' })
  try {
    const counts = await syncCalendar({ tasks: latest.tasks, categories: latest.categories, token })
    set({ state: 'ok', last: new Date().toISOString(), counts, message: '' })
  } catch (e) {
    if (e instanceof AuthError) { clearCalendarToken(); set({ state: 'needs-auth', message: '' }) }
    else if (e instanceof OfflineError) set({ state: 'offline', message: 'No connection. It will retry.' })
    else set({ state: 'error', message: e.message || 'Could not sync.' })
  } finally {
    running = false
    if (again) { again = false; syncNow() }
  }
}

export async function connectCalendar() {
  const token = await requestCalendarToken({ hint: rememberedAccount()?.email })
  writeOn(true)
  set({ state: 'idle', message: '' })
  return token
}

export async function disconnectCalendar({ removeEvents }) {
  let clean = true
  try { clean = await clearCalendar({ removeEvents }) } catch { clean = false }
  clearCalendarToken()
  writeOn(false)
  set({ state: 'off', last: null, counts: null, message: clean ? '' : 'Some events could not be removed. You can delete them from Google Calendar.' })
  return clean
}

export const syncedEvents = () => Object.keys(loadMap()).length

// ---- the worker ----------------------------------------------------------------------
export default function CalendarSync() {
  const { tasks, settings, dashboardDate } = usePlanner()
  const on = useCalendarOn()
  const show = useShowEvents()
  const sync = useCalendarStatus().state
  latest = { tasks, categories: settings.categories }

  // Your calendar's events around the day being looked at, when "Show my calendar events" is on.
  useEffect(() => {
    if (!(on && show)) return undefined
    const day = parseISO(dashboardDate)
    const go = (force) => loadRange(format(addDays(day, -10), 'yyyy-MM-dd'), format(addDays(day, 14), 'yyyy-MM-dd'), { force })
    go(false)
    const id = setInterval(() => go(true), 5 * 60_000)
    return () => clearInterval(id)
  }, [on, show, dashboardDate, sync])

  // Changes (and the first run after opening the app) sync a few seconds later.
  useEffect(() => {
    if (!on) { if (status.state !== 'off') set({ state: 'off' }); return undefined }
    const id = setTimeout(syncNow, 3000)
    return () => clearTimeout(id)
  }, [on, tasks, settings.categories])

  // A browser token that ran out: renew it on the next click. (The desktop app
  // renews its own token in the background, so it never needs this.)
  useEffect(() => {
    if (!on) return undefined
    if (!getCalendarToken()) set({ state: 'needs-auth' })
    if (isDesktop) return undefined
    let busy = false
    const onClick = async () => {
      if (busy || getCalendarToken()) return
      busy = true
      try { await requestCalendarToken({ hint: rememberedAccount()?.email }); syncNow() } catch { set({ state: 'needs-auth' }) } finally { busy = false }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [on])

  return null
}
