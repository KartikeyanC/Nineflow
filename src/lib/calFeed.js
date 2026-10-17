// The calendar subscription link (see api/feed.js): while it is on, the planner keeps a copy of its
// calendar file on the server, encrypted with a key made from the link's secret, and any calendar
// app can subscribe to the link. The secret is in the planner's settings (so every device shows the
// same link and keeps it up to date).
import { useSyncExternalStore } from 'react'
import { hasNoSite } from './platform'

const apiRoot = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
// Where the link points: the NineFlow site. The desktop app has none of its own, so it needs VITE_API_BASE.
const siteRoot = () => apiRoot() || (hasNoSite() || typeof location === 'undefined' ? '' : location.origin)

export const feedAvailable = () => !!siteRoot()
export const feedUrl = (token) => `${siteRoot()}/api/feed?k=${token}`

// 32 random lowercase letters and digits (the server accepts 32 to 48).
export function newFeedToken() {
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => letters[b % letters.length]).join('')
}
export const validFeedToken = (t) => typeof t === 'string' && /^[a-z0-9]{32,48}$/.test(t)

// ---- status, for Settings -----------------------------------------------------------------
let status = { state: 'idle', at: 0, message: '' } // 'idle' | 'saving' | 'ok' | 'error'
const listeners = new Set()
const set = (patch) => { status = { ...status, ...patch }; listeners.forEach((f) => f()) }
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f) }
export const useFeedStatus = () => useSyncExternalStore(subscribe, () => status)

async function post(body) {
  let res
  try { res = await fetch(`${apiRoot()}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
  catch { throw new Error("Couldn't reach NineFlow's server. It will try again when something changes.") }
  if (!res.ok) {
    let data = null
    try { data = await res.json() } catch { /* no body */ }
    throw new Error(data?.error || 'Could not update the calendar link.')
  }
}

export async function pushFeed(token, ics) {
  set({ state: 'saving', message: '' })
  try { await post({ token, ics }); set({ state: 'ok', at: Date.now(), message: '' }) } catch (e) { set({ state: 'error', message: e.message }); throw e }
}
export async function removeFeed(token) {
  await post({ token, remove: true })
  set({ state: 'idle', at: 0, message: '' })
}
