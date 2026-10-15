// Reminders while NineFlow is closed, on the website and the installed phone/tablet app.
// This device subscribes to Web Push; its upcoming reminders are sent to /api/reminders,
// which times each one with QStash (see api/_push.js). Only changes are sent: each
// scheduled reminder's QStash message id is kept here so it can be cancelled when the
// reminder changes or goes away. All of this is per device, in this browser only.
// (The desktop app fires reminders itself and doesn't use this.)

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const STORE = 'nineflow:push' // { on, sub, sent: { [id]: { m: messageId, at, h } } }
export const PUSH_HOURS = 24 // how far ahead reminders are handed over
export const PUSH_MAX = 50 // and at most this many at a time

const apiUrl = (path) => `${(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')}${path}`
const read = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {} } catch { return {} } }
const write = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)) } catch { /* private mode: stays off */ } }

export const pushSupported = () =>
  !!KEY && typeof window !== 'undefined' && !window.nineflowDesktop &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && import.meta.env.PROD

export const pushEnabled = () => pushSupported() && read().on === true

const fromB64u = (s) => {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}
const hashOf = (r) => `${r.at}|${r.title}|${r.body}`

// What to send to the server so it matches `schedule`: pure, so it can be tested.
export function diffSchedule(sent, schedule, now = Date.now()) {
  const want = new Map(schedule.map((r) => [r.id, r]))
  const cancel = []
  const keep = {}
  for (const [id, s] of Object.entries(sent || {})) {
    const next = want.get(id)
    if (next && hashOf(next) === s.h) { keep[id] = s; continue }
    if (s.at > now) cancel.push(s.m) // still waiting at QStash: cancel it; a past one already went out
  }
  const add = schedule.filter((r) => !keep[r.id] && r.at > now - 60_000)
  return { add, cancel, keep }
}

async function post(body) {
  const r = await fetch(apiUrl('/api/reminders'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Reminders could not be set up.')
  return data
}

// One sync at a time; a newer schedule waits for the running one.
let chain = Promise.resolve()
export function syncPush(schedule) {
  chain = chain.then(() => doSync(schedule)).catch(() => {})
  return chain
}
async function doSync(all) {
  const st = read()
  if (!st.on || !st.sub) return
  const now = Date.now()
  const schedule = all.filter((r) => r.at <= now + PUSH_HOURS * 3600_000).slice(0, PUSH_MAX)
  const { add, cancel, keep } = diffSchedule(st.sent, schedule, now)
  if (!add.length && !cancel.length) {
    if (Object.keys(keep).length !== Object.keys(st.sent || {}).length) write({ ...st, sent: keep })
    return
  }
  const data = await post({ subscription: st.sub, add, cancel })
  const sent = { ...keep }
  for (const r of add) if (data.scheduled?.[r.id]) sent[r.id] = { m: data.scheduled[r.id], at: r.at, h: hashOf(r) }
  write({ ...read(), sent })
}

// Turn on for this device: asks for permission and subscribes. Throws a readable message.
export async function enablePush(schedule) {
  if (!pushSupported()) throw new Error('This browser can’t show reminders while NineFlow is closed.')
  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error("Notifications are blocked for this site. Allow them in the browser's site settings, then try again.")
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(KEY) })
  write({ on: true, sub: sub.toJSON(), sent: read().sent || {} })
  await post({ cancel: [] }) // fails early with a clear message if the server isn't set up
  await syncPush(schedule)
}

// Turn off for this device: cancels what is waiting and unsubscribes.
export async function disablePush() {
  const st = read()
  const waiting = Object.values(st.sent || {}).filter((s) => s.at > Date.now()).map((s) => s.m)
  write({ on: false, sent: {} })
  if (waiting.length) await post({ cancel: waiting }).catch(() => {})
  try { const reg = await navigator.serviceWorker.ready; await (await reg.pushManager.getSubscription())?.unsubscribe() } catch { /* already gone */ }
}

// A click on a reminder opens its task: the service worker posts a message to an open
// tab, or opens a new one with ?task=<id>.
export function onPushOpenTask(fn) {
  if (typeof window === 'undefined') return () => {}
  const q = new URLSearchParams(location.search).get('task')
  if (q) {
    setTimeout(() => fn(q), 0)
    const url = new URL(location.href); url.searchParams.delete('task'); history.replaceState(null, '', url)
  }
  if (!('serviceWorker' in navigator)) return () => {}
  const listener = (e) => { if (e.data?.type === 'open-task' && typeof e.data.id === 'string') fn(e.data.id) }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
