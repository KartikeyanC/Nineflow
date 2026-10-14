// Single storage module. Two keys: the `tasks` array and the `settings` object.
// Every view and statistic is derived from `tasks`; nothing is stored twice.

import { storageKey } from './profiles'
import { cleanTags } from './taskMeta'
import { COLUMNS_VERSION, DEFAULT_COLUMNS, LEGACY_REVIEW_ID, cleanColumns, migrateColumns } from './columns'

// Keys live inside the signed-in profile's namespace (see profiles.js).
const TASKS_KEY = () => storageKey('tasks')
const SETTINGS_KEY = () => storageKey('settings')

export const DEFAULT_CATEGORIES = [
  { id: 'work', name: 'Work', color: 'sky' },
  { id: 'design', name: 'Design', color: 'lav' },
  { id: 'personal', name: 'Personal', color: 'butter' },
  { id: 'health', name: 'Health', color: 'mint' },
  { id: 'learning', name: 'Learning', color: 'coral' },
]

export const DEFAULT_SETTINGS = {
  categories: DEFAULT_CATEGORIES,
  weekStart: 1, // 0 Sun | 1 Mon
  heatmapMeasure: 'hours', // 'hours' | 'count'
  theme: 'light', // 'light' | 'dark'
  pomodoro: { focus: 25, short: 5, long: 15, every: 4 }, // minutes; long break every N focus blocks
  quickList: { position: 'right', collapsed: false, filter: 'today' }, // position: 'right' | 'top' | 'bottom' | 'off'
  calendar: { promptOnAdd: true }, // offer an "Add to Google Calendar" link after adding a task
  columns: DEFAULT_COLUMNS, // Board columns (see lib/columns.js)
  views: [], // saved Board filters: [{ id, name, text, crit }] (see lib/views.js)
  templates: [], // reusable tasks: [{ id, name, title, steps, ... }]
  modules: { work: true }, // which optional sections show in the navigation
  workHours: { start: '09:00', end: '18:00', breakMinutes: 60 }, // capacity and "Plan my day" use these
  reminders: { enabled: false, minutes: 5 }, // browser notification before a timed task starts
  sidebarMin: false, // keep the sidebar an icon rail even where its labels would fit (see lib/sidebarRail.js)
}

const FOCUS_KEY = () => storageKey('focus')
const HABITS_KEY = () => storageKey('habits')

// Storage keys a change in another tab should reload (see PlannerContext).
export const syncedKeys = () => ({ tasks: TASKS_KEY(), settings: SETTINGS_KEY(), habits: HABITS_KEY(), focus: FOCUS_KEY() })
// Running pomodoro: { taskId, phase: 'focus'|'short'|'long', running, endsAt, remainingMs, completed, open }
export const loadFocus = () => read(FOCUS_KEY(), null)
// Returns nothing: it runs as a React effect, where a return value means cleanup.
export const saveFocus = (f) => {
  if (f) { write(FOCUS_KEY(), f); return }
  try { localStorage.removeItem(FOCUS_KEY()) } catch { /* ignore */ }
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

// Save status listeners. A failed write (quota full, private mode) used to be
// swallowed, so edits silently lived only in memory until the next reload.
// Now every write reports success or failure so the app can warn the user.
const saveListeners = new Set()
let lastSaveOk = true
export function onSaveStatus(cb) {
  saveListeners.add(cb)
  return () => saveListeners.delete(cb)
}
export function reportSave(ok, key) {
  if (ok === lastSaveOk && ok) return
  lastSaveOk = ok
  saveListeners.forEach((cb) => cb(ok, key))
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    reportSave(true, key)
    return true
  } catch {
    // Quota or private mode: the in-memory state keeps working, but say so.
    reportSave(false, key)
    return false
  }
}

export function loadTasks() {
  const tasks = read(TASKS_KEY(), [])
  return Array.isArray(tasks) ? tasks.map(normalizeTask) : []
}

export function saveTasks(tasks) {
  write(TASKS_KEY(), tasks)
}

// Habits: [{ id, name, createdAt, done: ['yyyy-MM-dd', ...], rest: ['yyyy-MM-dd', ...] }]
// A rest day keeps a streak going without counting towards it.
export function loadHabits() {
  const habits = read(HABITS_KEY(), [])
  return Array.isArray(habits)
    ? habits.map((h) => ({ id: h.id, name: h.name ?? '', createdAt: h.createdAt ?? new Date().toISOString(), done: Array.isArray(h.done) ? h.done : [], rest: Array.isArray(h.rest) ? h.rest : [] }))
    : []
}

export function saveHabits(habits) {
  write(HABITS_KEY(), habits)
}

export function loadSettings() {
  const stored = read(SETTINGS_KEY(), {})
  const settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...(stored.pomodoro || {}) },
    quickList: { ...DEFAULT_SETTINGS.quickList, ...(stored.quickList || {}) },
    calendar: { ...DEFAULT_SETTINGS.calendar, ...(stored.calendar || {}) },
    modules: { ...DEFAULT_SETTINGS.modules, ...(stored.modules || {}) },
    workHours: { ...DEFAULT_SETTINGS.workHours, ...(stored.workHours || {}) },
    reminders: { ...DEFAULT_SETTINGS.reminders, ...(stored.reminders || {}) },
    columns: stored.columnsV === COLUMNS_VERSION ? cleanColumns(stored.columns) : migrateColumns(cleanColumns(stored.columns)),
    columnsV: COLUMNS_VERSION,
    views: Array.isArray(stored.views) ? stored.views : [],
    templates: Array.isArray(stored.templates) ? stored.templates : [],
  }
  if (!Array.isArray(settings.categories) || settings.categories.length === 0) {
    settings.categories = DEFAULT_CATEGORIES
  }
  return settings
}

export function saveSettings(settings) {
  write(SETTINGS_KEY(), settings)
}

// Fill in any field an older record may lack so the rest of the app can
// rely on the full shape.
function cleanSkipped(v) {
  if (!v || typeof v !== 'object' || typeof v.reason !== 'string') return null
  return { at: typeof v.at === 'string' ? v.at : null, reason: v.reason.slice(0, 200), missing: Array.isArray(v.missing) ? v.missing.filter((m) => typeof m === 'string').slice(0, 30).map((m) => m.slice(0, 120)) : [] }
}

function normalizeTask(t) {
  // A card left in the old "In review" column moves to the review status, which
  // is what that column meant. Idempotent: nothing keeps that column id after.
  const wasInReview = t.column === LEGACY_REVIEW_ID
  return {
    id: t.id,
    title: t.title ?? '',
    description: t.description ?? '',
    date: t.date ?? null,
    startDate: typeof t.startDate === 'string' ? t.startDate : (t.date ?? null), // the day it started; old tasks start on their planned day
    startTime: t.startTime ?? null,
    durationMinutes: Number.isFinite(t.durationMinutes) ? t.durationMinutes : 30,
    category: t.category ?? DEFAULT_CATEGORIES[0].id,
    priority: t.priority ?? 'medium',
    status: wasInReview ? 'review' : t.status ?? 'todo',
    startedAt: t.startedAt ?? null,
    completedAt: t.completedAt ?? null,
    createdAt: t.createdAt ?? new Date().toISOString(),
    sessions: Array.isArray(t.sessions) ? t.sessions : [],
    subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter((s) => s && typeof s.title === 'string').map((s) => ({ id: s.id || uid(), title: s.title, done: !!s.done, required: s.required === true })) : [],
    requireRule: t.requireRule === 'any' ? 'any' : 'all',
    skippedChecks: cleanSkipped(t.skippedChecks),
    reminders: Array.isArray(t.reminders) ? t.reminders.filter((m) => Number.isFinite(m) && m >= 0).slice(0, 6) : null,
    tags: cleanTags(t.tags),
    column: !wasInReview && typeof t.column === 'string' ? t.column : null,
    seriesId: t.seriesId ?? null,
    recurrence: t.recurrence && t.recurrence.freq ? { freq: t.recurrence.freq, until: t.recurrence.until ?? null, skip: t.recurrence.skip ?? [] } : null,
    // Work that interrupted the plan: { by, at, resume, resumeMode, resolved }
    interruption: t.interruption && typeof t.interruption === 'object' ? t.interruption : null,
  }
}

export const isOnboarded = () => {
  try { return localStorage.getItem(storageKey('onboarded')) === '1' } catch { return false }
}
export const markOnboarded = () => {
  try { localStorage.setItem(storageKey('onboarded'), '1') } catch { /* ignore */ }
}

// Shape check for an imported backup. Returns an error string or null.
export function validateBackup(data) {
  if (!data || typeof data !== 'object') return 'Not a planner backup.'
  if (!Array.isArray(data.tasks)) return 'Missing a tasks list.'
  if (data.tasks.some((t) => !t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.title !== 'string')) {
    return 'Some tasks are malformed.'
  }
  if (data.settings != null && typeof data.settings !== 'object') return 'Settings are malformed.'
  if (data.habits != null && !Array.isArray(data.habits)) return 'Habits are malformed.'
  if (data.work != null && (typeof data.work !== 'object' || Array.isArray(data.work))) return 'Work OS data is malformed.'
  return null
}

export const normalizeTasks = (tasks) => tasks.map(normalizeTask)

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
