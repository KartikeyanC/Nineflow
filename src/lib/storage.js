// Single storage module. Two keys: the `tasks` array and the `settings` object.
// Every view and statistic is derived from `tasks`; nothing is stored twice.

import { storageKey } from './profiles'

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
  modules: { work: true }, // which optional sections show in the navigation
}

const FOCUS_KEY = () => storageKey('focus')
// Running pomodoro: { taskId, phase: 'focus'|'short'|'long', running, endsAt, remainingMs, completed, open }
export const loadFocus = () => read(FOCUS_KEY(), null)
export const saveFocus = (f) => (f ? write(FOCUS_KEY(), f) : localStorage.removeItem(FOCUS_KEY()))

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or private mode: the in-memory state keeps working.
  }
}

export function loadTasks() {
  const tasks = read(TASKS_KEY(), [])
  return Array.isArray(tasks) ? tasks.map(normalizeTask) : []
}

export function saveTasks(tasks) {
  write(TASKS_KEY(), tasks)
}

const HABITS_KEY = () => storageKey('habits')

// Habits: [{ id, name, createdAt, done: ['yyyy-MM-dd', ...] }]
export function loadHabits() {
  const habits = read(HABITS_KEY(), [])
  return Array.isArray(habits)
    ? habits.map((h) => ({ id: h.id, name: h.name ?? '', createdAt: h.createdAt ?? new Date().toISOString(), done: Array.isArray(h.done) ? h.done : [] }))
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
function normalizeTask(t) {
  return {
    id: t.id,
    title: t.title ?? '',
    description: t.description ?? '',
    date: t.date ?? null,
    startTime: t.startTime ?? null,
    durationMinutes: Number.isFinite(t.durationMinutes) ? t.durationMinutes : 30,
    category: t.category ?? DEFAULT_CATEGORIES[0].id,
    priority: t.priority ?? 'medium',
    status: t.status ?? 'todo',
    startedAt: t.startedAt ?? null,
    completedAt: t.completedAt ?? null,
    createdAt: t.createdAt ?? new Date().toISOString(),
    sessions: Array.isArray(t.sessions) ? t.sessions : [],
    seriesId: t.seriesId ?? null,
    recurrence: t.recurrence && t.recurrence.freq ? { freq: t.recurrence.freq, until: t.recurrence.until ?? null, skip: t.recurrence.skip ?? [] } : null,
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
  return null
}

export const normalizeTasks = (tasks) => tasks.map(normalizeTask)

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
