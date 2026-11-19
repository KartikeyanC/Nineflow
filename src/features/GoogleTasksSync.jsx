import { useEffect, useSyncExternalStore } from 'react'
import { usePlanner } from '../store/PlannerContext'
import { getConn, patchConn, useConnections } from '../lib/connections'
import { TASKS_SCOPE, getExtraToken, isDesktop, requestExtraToken, rememberedAccount } from '../lib/google'
import { syncGoogleTasks } from '../lib/gtasksSync'
import { AuthError, OfflineError } from '../lib/syncErrors'

// Keeps Google Tasks and the planner in step both ways (lib/gtasksSync.js) while "Keep in sync" is
// on for Google Tasks in Settings → Connections (saved on this device with the connection).
// Mounted once in the app. It runs a few seconds after a change here, every minute for changes
// made in Google Tasks, and when the window comes back into focus.
//
// A browser token lasts about an hour; when it runs out the next click anywhere asks Google for a
// fresh one (a quick window flash, no new consent), as the Calendar sync does.

// state: 'off' | 'idle' | 'syncing' | 'ok' | 'needs-auth' | 'offline' | 'error'
let status = { state: 'off', last: null, message: '', counts: null }
const listeners = new Set()
const set = (patch) => { status = { ...status, ...patch }; listeners.forEach((f) => f()) }
export const useGoogleTasksStatus = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, () => status)

export const googleTasksSyncOn = () => !!getConn('gtasks')?.sync
export function setGoogleTasksSync(on) {
  patchConn('gtasks', { sync: !!on })
  if (!on) set({ state: 'off', counts: null, message: '' })
}

let latest = { tasks: [], apply: null, category: null }
let running = false
let again = false

export async function syncGoogleTasksNow() {
  if (!googleTasksSyncOn() || !latest.apply) return
  if (running) { again = true; return }
  const token = getExtraToken('tasks')
  if (!token) { set({ state: 'needs-auth', message: '' }); return }
  running = true
  set({ state: 'syncing', message: '' })
  try {
    const counts = await syncGoogleTasks({ tasks: latest.tasks, apply: latest.apply, token, defaultCategory: latest.category })
    set({ state: 'ok', last: new Date().toISOString(), counts, message: '' })
  } catch (e) {
    if (e instanceof AuthError) set({ state: 'needs-auth', message: '' })
    else if (e instanceof OfflineError) set({ state: 'offline', message: 'No connection. It will try again.' })
    else set({ state: 'error', message: e.message || 'Could not sync.' })
  } finally {
    running = false
    if (again) { again = false; setTimeout(syncGoogleTasksNow, 500) }
  }
}

export default function GoogleTasksSync() {
  // Every task in the workspace: let-go and paused ones, and those for a company not being shown,
  // all still have their twin (a task missing from this list would look deleted and be deleted there).
  const { allTasks: tasks, applySync, settings } = usePlanner()
  const on = !!useConnections().gtasks?.sync
  latest = { tasks, apply: applySync, category: settings.categories?.[0]?.id || null }

  // A change here goes over a few seconds later (and the first run after turning it on or opening the app).
  useEffect(() => {
    if (!on) { if (status.state !== 'off') set({ state: 'off', counts: null }); return undefined }
    const id = setTimeout(syncGoogleTasksNow, 3000)
    return () => clearTimeout(id)
  }, [on, tasks])

  // Changes made in Google Tasks: checked every minute, and when the window is back in focus.
  useEffect(() => {
    if (!on) return undefined
    const id = setInterval(syncGoogleTasksNow, 60_000)
    const onFocus = () => syncGoogleTasksNow()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [on])

  // A browser token that ran out: renew it on the next click. (The desktop app renews its own.)
  useEffect(() => {
    if (!on || isDesktop) return undefined
    let busy = false
    const onClick = async () => {
      if (busy || getExtraToken('tasks')) return
      busy = true
      try { await requestExtraToken('tasks', TASKS_SCOPE, { hint: rememberedAccount()?.email }); syncGoogleTasksNow() } catch { set({ state: 'needs-auth' }) } finally { busy = false }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [on])

  return null
}
