// The planner file's shape and the task rules the MCP server needs.
//
// The file (My Drive / Daily Planner / planner-data.json) is the app's sync bundle
// (src/lib/cloud.js): { app, version, savedAt, account, data: { json, text } }.
// data.json holds the app's keys: `tasks`, `settings`, `habits`… for the main
// workspace, and `ws_<id>.tasks` and so on for the others (src/lib/workspaces.js).
//
// createTask, withStatus and withDate mirror src/lib/tasks.js. The app imports
// without file extensions, which plain Node can't load, so they are repeated here;
// the app also re-checks every task when it loads (normalizeTask in storage.js).

import crypto from 'node:crypto'

export const MAIN = 'main'
export const DEFAULT_CATEGORIES = [
  { id: 'work', name: 'Work', color: 'sky' },
  { id: 'design', name: 'Design', color: 'lav' },
  { id: 'personal', name: 'Personal', color: 'butter' },
  { id: 'health', name: 'Health', color: 'mint' },
  { id: 'learning', name: 'Learning', color: 'coral' },
]
export const STATUSES = ['todo', 'working', 'review', 'completed']
export const PRIORITIES = ['high', 'medium', 'low']

const pad = (n) => String(n).padStart(2, '0')
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` // local day, as the app uses
export const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dateKey(new Date(y, m - 1, d + n)) }
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime())
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

// ---- the bundle ----------------------------------------------------------------------
const prefixOf = (ws) => (!ws || ws === MAIN ? '' : `ws_${ws}.`)
const json = (bundle) => {
  if (!bundle || typeof bundle !== 'object' || !bundle.data || typeof bundle.data !== 'object') throw new Error('The planner file is not in the expected format.')
  bundle.data.json ||= {}
  return bundle.data.json
}

export function workspaces(bundle) {
  const list = Array.isArray(json(bundle).workspaces) ? json(bundle).workspaces : []
  const main = list.find((w) => w?.id === MAIN) || { id: MAIN, name: 'My planner' }
  return [main, ...list.filter((w) => w && typeof w.id === 'string' && w.id !== MAIN && /^[a-z0-9]+$/.test(w.id))]
    .map((w) => ({ id: w.id, name: String(w.name || 'Workspace') }))
}

// Accepts a workspace id or its name; defaults to the main one.
export function resolveWorkspace(bundle, ws) {
  if (!ws) return MAIN
  const all = workspaces(bundle)
  const hit = all.find((w) => w.id === ws) || all.find((w) => w.name.toLowerCase() === String(ws).toLowerCase())
  if (!hit) throw new Error(`No workspace "${ws}". Workspaces: ${all.map((w) => `${w.name} (${w.id})`).join(', ')}.`)
  return hit.id
}

export const getTasks = (bundle, ws) => (Array.isArray(json(bundle)[`${prefixOf(ws)}tasks`]) ? json(bundle)[`${prefixOf(ws)}tasks`] : [])
export const setTasks = (bundle, ws, tasks) => { json(bundle)[`${prefixOf(ws)}tasks`] = tasks }
export const getSettings = (bundle, ws) => { const s = json(bundle)[`${prefixOf(ws)}settings`]; return s && typeof s === 'object' ? s : {} }
export const setSettings = (bundle, ws, s) => { json(bundle)[`${prefixOf(ws)}settings`] = s }
export const getHabits = (bundle, ws) => (Array.isArray(json(bundle)[`${prefixOf(ws)}habits`]) ? json(bundle)[`${prefixOf(ws)}habits`] : [])
export const setHabits = (bundle, ws, h) => { json(bundle)[`${prefixOf(ws)}habits`] = h }
export const categories = (bundle, ws) => {
  const c = getSettings(bundle, ws).categories
  return Array.isArray(c) && c.length ? c.filter((x) => x && typeof x.id === 'string') : DEFAULT_CATEGORIES
}

// A category id or name (any case); throws with the list when unknown.
export function resolveCategory(bundle, ws, value) {
  const cats = categories(bundle, ws)
  if (value == null || value === '') return cats[0].id
  const v = String(value).toLowerCase()
  const hit = cats.find((c) => c.id.toLowerCase() === v) || cats.find((c) => String(c.name).toLowerCase() === v)
  if (!hit) throw new Error(`No category "${value}". Categories: ${cats.map((c) => c.name).join(', ')}.`)
  return hit.id
}

// ---- task rules (mirroring src/lib/tasks.js) ------------------------------------------
export const uid = () => crypto.randomUUID()

export function createTask(fields = {}, now = new Date()) {
  const task = {
    id: uid(),
    title: '',
    description: '',
    date: dateKey(now),
    startTime: null,
    durationMinutes: 30,
    category: 'work',
    priority: 'medium',
    status: 'todo',
    startedAt: null,
    completedAt: null,
    createdAt: now.toISOString(),
    sessions: [],
    subtasks: [],
    requireRule: 'all',
    skippedChecks: null,
    column: null,
    reminders: null,
    nagEvery: null,
    tags: [],
    seriesId: null,
    recurrence: null,
    interruption: null,
    ...fields,
  }
  return { ...task, startDate: task.startDate ?? task.date ?? null }
}

export function withDate(task, date, now = new Date()) {
  if (task.date === date) return task
  const start = task.startDate ?? task.date
  const untouched = task.status === 'todo' && !task.startedAt && (task.sessions || []).length === 0
  const notArrived = start == null || start >= dateKey(now)
  const atStart = task.startDate == null || task.startDate === task.date
  return { ...task, date, startDate: untouched && notArrived && atStart ? date : start }
}

export function withStatus(task, status, now = new Date()) {
  if (task.status === status) return task
  const iso = now.toISOString()
  let sessions = task.sessions || []
  let startedAt = task.startedAt
  let completedAt = task.completedAt
  if (task.status === 'working') sessions = sessions.map((s, i) => (i === sessions.length - 1 && s.end == null ? { ...s, end: iso } : s))
  if (status === 'working') { sessions = [...sessions, { start: iso, end: null }]; if (!startedAt) startedAt = iso }
  if (status === 'completed') completedAt = iso
  else if (task.status === 'completed') completedAt = null
  const finishedElsewhere = status === 'completed' && task.date !== dateKey(now) && !(task.seriesId && task.recurrence)
  const day = finishedElsewhere ? { date: dateKey(now), startDate: task.startDate ?? task.date ?? dateKey(now) } : null
  return { ...task, status, column: null, sessions, startedAt, completedAt, ...day }
}

// Steps that must be ticked before a task can be finished (src/lib/tasks.js checkGate).
export function missingRequired(task) {
  const req = (task.subtasks || []).filter((s) => s.required)
  if (!req.length) return []
  const ticked = req.filter((s) => s.done).length
  const needed = task.requireRule === 'any' ? 1 : req.length
  return ticked >= needed ? [] : req.filter((s) => !s.done).map((s) => s.title)
}

export const cleanTags = (list) => [...new Set((Array.isArray(list) ? list : [])
  .map((x) => String(x ?? '').toLowerCase().replace(/^[#@]+/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 24))
  .filter(Boolean))].slice(0, 6)

// What Claude sees for a task: short, readable, no internal fields.
export function view(task, cats) {
  const cat = cats.find((c) => c.id === task.category)
  const steps = task.subtasks || []
  return {
    id: task.id,
    title: task.title,
    date: task.date ?? null, // null: Someday (no day yet)
    start_time: task.startTime ?? null,
    duration_minutes: task.durationMinutes,
    status: task.status,
    priority: task.priority,
    category: cat ? cat.name : task.category,
    ...(task.tags?.length ? { tags: task.tags } : {}),
    ...(task.description ? { description: task.description } : {}),
    ...(steps.length ? { steps: steps.map((s) => ({ title: s.title, done: !!s.done, ...(s.required ? { required: true } : {}) })) } : {}),
    ...(task.recurrence ? { repeats: task.recurrence.freq } : {}),
    ...(task.completedAt ? { completed_at: task.completedAt } : {}),
    ...(task.hold ? { paused: { reason: task.hold.reason, until: task.hold.until } } : {}),
    ...(task.dropped ? { dropped: { reason: task.dropped.reason } } : {}),
  }
}

// Paused or dropped on purpose (NineFlow's Paused screen): off every plan, so not open work.
const parked = (t) => !!(t.hold || t.dropped)
const isOverdue = (t, today) => !!t.date && t.status !== 'completed' && t.date < today && !(t.seriesId && t.recurrence) && !parked(t)

export function filterTasks(tasks, { from, to, date, status = 'open', query, category, tag, include_someday = false } = {}, now = new Date()) {
  const today = dateKey(now)
  const q = query ? String(query).toLowerCase() : null
  return tasks.filter((t) => {
    if (status !== 'all' && parked(t)) return false
    if (status === 'open' && t.status === 'completed') return false
    if (status === 'done' && t.status !== 'completed') return false
    if (status === 'overdue' && !isOverdue(t, today)) return false
    if (date && t.date !== date) return false
    if (!t.date && !include_someday && (from || to || date)) return false
    if (from && t.date && t.date < from) return false
    if (to && t.date && t.date > to) return false
    if (category && t.category !== category) return false
    if (tag && !(t.tags || []).includes(String(tag).toLowerCase().replace(/^#/, ''))) return false
    if (q && !`${t.title} ${t.description || ''} ${(t.tags || []).join(' ')}`.toLowerCase().includes(q)) return false
    return true
  }).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.startTime || '99').localeCompare(b.startTime || '99') || PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority))
}

export function overview(bundle, ws, now = new Date()) {
  const today = dateKey(now)
  const tasks = getTasks(bundle, ws)
  const todays = tasks.filter((t) => t.date === today && !parked(t))
  return {
    today,
    workspace: workspaces(bundle).find((w) => w.id === ws)?.name || 'My planner',
    workspaces: workspaces(bundle),
    today_tasks: { total: todays.length, done: todays.filter((t) => t.status === 'completed').length, working: todays.filter((t) => t.status === 'working').length },
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    someday: tasks.filter((t) => !t.date && t.status !== 'completed' && !parked(t)).length,
    paused: tasks.filter((t) => t.hold && !t.dropped).length,
    categories: categories(bundle, ws).map((c) => c.name),
    habits: getHabits(bundle, ws).map((h) => ({ id: h.id, name: h.name, done_today: (h.done || []).includes(today) })),
  }
}
