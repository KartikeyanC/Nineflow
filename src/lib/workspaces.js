// Workspaces: up to six separate planners under one sign-in (Personal,
// Client A, a side project…). Each has its own tasks, habits, settings and
// Work OS data; nothing is shared between them.
//
// Storage. Everything an account has lives under `daily-planner:<id>:` and
// is synced as one bundle (see cloud.js). The first workspace ("main") keeps
// the plain key names it always had, so nobody's data moves. Every other
// workspace prefixes its keys with `ws_<id>.` (tasks → ws_k3f9.tasks), which
// puts them in the same bundle and so in the same Drive file / account row.
// Three names are account-wide rather than per workspace: `onboarded` (setup is
// done once), `workspaces` (the list below) and `gcal-on` (Google Calendar sync).
//
// The workspace in use is per device (a phone can be on Client A while the
// laptop is on Personal), so it is kept outside the synced namespace.

export const MAIN = 'main'
export const WORKSPACE_LIMIT = 6
export const NAME_MAX = 24
export const ACCOUNT_LEVEL = new Set(['onboarded', 'workspaces', 'gcal-on', 'gcal-show'])

const COLORS = ['lav', 'sky', 'mint', 'peach', 'coral', 'butter', 'rose', 'teal']
const listKey = (pid) => `daily-planner:${pid}:workspaces`
const currentKey = (pid) => `daily-planner:workspace:${pid}`
const DEFAULT_MAIN = { id: MAIN, name: 'My planner', color: 'lav' }

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

// Subscribers: this tab's own changes, plus syncs from another device
// (cloud.js sends a 'storage' event for each key it writes).
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())
export const onWorkspacesChange = (f) => {
  listeners.add(f)
  const onStorage = (e) => { if (!e.key || e.key.endsWith(':workspaces') || e.key.startsWith('daily-planner:workspace:')) f() }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(f); window.removeEventListener('storage', onStorage) }
}

// The saved list, cleaned up: main first, no duplicates, at most six.
export function listWorkspaces(pid) {
  let saved = []
  try { saved = JSON.parse(read(listKey(pid)) || '[]') } catch { /* ignore */ }
  const seen = new Set()
  const list = (Array.isArray(saved) ? saved : []).filter((w) => w && typeof w.id === 'string' && /^[a-z0-9]+$/.test(w.id) && !seen.has(w.id) && seen.add(w.id))
  const main = list.find((w) => w.id === MAIN) || DEFAULT_MAIN
  return [main, ...list.filter((w) => w.id !== MAIN)].slice(0, WORKSPACE_LIMIT).map((w) => ({ id: w.id, name: String(w.name || 'Workspace').slice(0, NAME_MAX), color: COLORS.includes(w.color) ? w.color : 'lav' }))
}
const saveList = (pid, list) => { write(listKey(pid), JSON.stringify(list)); emit() }

// Which workspace this device is in. Called on every storage read, so it
// only looks at the one key; whether the workspace still exists is checked
// separately (the switcher moves to main when it doesn't).
export function currentWorkspaceId(pid) {
  const id = read(currentKey(pid))
  return id && /^[a-z0-9]+$/.test(id) ? id : MAIN
}
export const workspacePrefix = (pid) => {
  const id = currentWorkspaceId(pid)
  return id === MAIN ? '' : `ws_${id}.`
}
export function switchWorkspace(pid, id) {
  write(currentKey(pid), id)
  emit()
}

// Opens the workspace this device is now in. The planner reads its data when it starts, so the app is
// started again (main.jsx draws it afresh on this event) rather than the whole page reloaded.
export const WORKSPACE_EVENT = 'nineflow:workspace'
export function reopenPlanner() {
  try { window.dispatchEvent(new Event(WORKSPACE_EVENT)) } catch { window.location.reload() }
}

export class WorkspaceError extends Error {}
const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim()
function checkName(list, name, exceptId) {
  const n = cleanName(name)
  if (!n) throw new WorkspaceError('Give the workspace a name.')
  if (n.length > NAME_MAX) throw new WorkspaceError(`Keep the name to ${NAME_MAX} characters or fewer.`)
  if (list.some((w) => w.id !== exceptId && w.name.toLowerCase() === n.toLowerCase())) throw new WorkspaceError('You already have a workspace with that name.')
  return n
}

export function addWorkspace(pid, name) {
  const list = listWorkspaces(pid)
  if (list.length >= WORKSPACE_LIMIT) throw new WorkspaceError(`You can have up to ${WORKSPACE_LIMIT} workspaces.`)
  const clean = checkName(list, name)
  const id = `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`
  const color = COLORS.find((c) => !list.some((w) => w.color === c)) || COLORS[list.length % COLORS.length]
  const workspace = { id, name: clean, color }
  saveList(pid, [...list, workspace])
  return workspace
}

export function renameWorkspace(pid, id, name) {
  const list = listWorkspaces(pid)
  const clean = checkName(list, name, id)
  saveList(pid, list.map((w) => (w.id === id ? { ...w, name: clean } : w)))
}

// Removes the workspace and everything in it. The first workspace can't be
// removed (use Settings → Clear all data to empty it).
export function removeWorkspace(pid, id) {
  if (id === MAIN) throw new WorkspaceError("The first workspace can't be deleted. You can rename it, or clear its data in Settings.")
  const list = listWorkspaces(pid)
  const mine = `daily-planner:${pid}:ws_${id}.`
  for (const k of Object.keys(localStorage)) if (k.startsWith(mine)) localStorage.removeItem(k)
  saveList(pid, list.filter((w) => w.id !== id))
  if (currentWorkspaceId(pid) === id) switchWorkspace(pid, MAIN)
}

// ---- moving tasks between workspaces -------------------------------------------
// Writes straight into the other workspace's saved tasks (it is read when you
// switch to it), so nothing has to be open. A recurring task moves as a single
// task, and one whose category the other workspace doesn't have takes that
// workspace's first category.
const keyIn = (pid, id, name) => `daily-planner:${pid}:${id === MAIN ? '' : `ws_${id}.`}${name}`
const readJson = (k, fallback) => { try { const v = JSON.parse(read(k)); return v ?? fallback } catch { return fallback } }

export function sendTasksToWorkspace(pid, targetId, tasks) {
  const tKey = keyIn(pid, targetId, 'tasks')
  const existing = readJson(tKey, [])
  if (!Array.isArray(existing)) return null
  const taken = new Set(existing.map((t) => t?.id))
  const cats = (readJson(keyIn(pid, targetId, 'settings'), {}).categories || []).map((c) => c.id)
  const moved = tasks.map((t) => {
    let id = t.id
    while (taken.has(id)) id = `${t.id}-${Math.random().toString(36).slice(2, 6)}`
    taken.add(id)
    return { ...t, id, category: !cats.length || cats.includes(t.category) ? t.category : cats[0] }
  })
  try { localStorage.setItem(tKey, JSON.stringify([...existing, ...moved])) } catch { return null }
  return moved.map((t) => t.id)
}

// Undo of the above: takes those tasks back out of the other workspace.
export function removeTasksFromWorkspace(pid, targetId, ids) {
  const tKey = keyIn(pid, targetId, 'tasks')
  const gone = new Set(ids)
  const existing = readJson(tKey, [])
  if (Array.isArray(existing)) write(tKey, JSON.stringify(existing.filter((t) => !gone.has(t?.id))))
}

// After signing out: this device forgets which workspace it was in.
export function forgetWorkspace(pid) {
  try { localStorage.removeItem(currentKey(pid)) } catch { /* ignore */ }
}
