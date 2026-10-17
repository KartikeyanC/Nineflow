// Credentials for the tools connected in Settings → Connections (Todoist, Trello, GitHub, Clockify,
// Toggl, Notion, Telegram). A token gives access to the other service, so these are kept on this
// device only: under a key outside the planner's own namespace, which is what lib/cloud.js mirrors to
// Google Drive / Supabase. They are entered once per device and never leave it, except in the request
// to that service itself (Toggl's goes through /api/toggl, which does not keep it).
import { useSyncExternalStore } from 'react'
import { currentProfileId } from './profiles'

const KEY = () => `nineflow:conn:${currentProfileId() || 'default'}`
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())

let lastKey = ''
let lastRaw = null
let lastSnap = {}
function snapshot() {
  const k = KEY()
  let raw = null
  try { raw = localStorage.getItem(k) } catch { /* private mode: nothing saved */ }
  if (k !== lastKey || raw !== lastRaw) {
    lastKey = k; lastRaw = raw
    try { lastSnap = raw ? JSON.parse(raw) || {} : {} } catch { lastSnap = {} }
  }
  return lastSnap
}
const subscribe = (f) => { listeners.add(f); window.addEventListener('storage', f); return () => { listeners.delete(f); window.removeEventListener('storage', f) } }

export const useConnections = () => useSyncExternalStore(subscribe, snapshot)
export const getConn = (name) => snapshot()[name] || null

function write(all) {
  try { Object.keys(all).length ? localStorage.setItem(KEY(), JSON.stringify(all)) : localStorage.removeItem(KEY()) } catch { /* ignore */ }
  emit()
}
// Replace one service's saved details (null removes it).
export function setConn(name, value) {
  const all = { ...snapshot() }
  if (value) all[name] = value; else delete all[name]
  write(all)
}
// Change part of one service's details (e.g. the Telegram update offset) without touching the rest.
export function patchConn(name, patch) {
  const cur = snapshot()[name]
  if (cur) setConn(name, { ...cur, ...patch })
}
export function forgetAllConnections() { write({}) }

// Which time entries / tasks were already sent to which service, so a second send skips them.
// Kept small: only the newest 600 keys per service.
export const wasSent = (name, key) => !!snapshot().sent?.[name]?.includes(key)
export function markSent(name, keys) {
  const all = { ...snapshot() }
  const sent = { ...(all.sent || {}) }
  sent[name] = [...new Set([...(sent[name] || []), ...keys])].slice(-600)
  all.sent = sent
  write(all)
}
