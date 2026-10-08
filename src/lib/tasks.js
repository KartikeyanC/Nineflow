// Pure helpers over the task array. No React, no storage.
import {
  addDays,
  differenceInCalendarDays,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  format,
  isSameDay,
  max as maxDate,
  min as minDate,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from 'date-fns'
import { uid } from './storage'

export const STATUSES = ['todo', 'working', 'completed']
export const STATUS_LABEL = { todo: 'To do', working: 'Working', completed: 'Completed' }
export const PRIORITIES = ['high', 'medium', 'low']
export const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

export const todayKey = () => format(new Date(), 'yyyy-MM-dd')
export const dateKey = (d) => format(d, 'yyyy-MM-dd')

export function createTask(fields = {}) {
  return {
    id: uid(),
    title: '',
    description: '',
    date: todayKey(),
    startTime: null,
    durationMinutes: 30,
    category: 'work',
    priority: 'medium',
    status: 'todo',
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    sessions: [],
    seriesId: null,
    recurrence: null, // { freq, until, skip } | null
    ...fields,
  }
}

// The only place status changes. Keeps sessions / startedAt / completedAt consistent.
//  - entering Working opens a session and sets startedAt (first time only)
//  - leaving Working closes the open session
//  - entering Completed sets completedAt; leaving it clears completedAt
export function withStatus(task, status, now = new Date()) {
  if (task.status === status) return task
  const iso = now.toISOString()
  let sessions = task.sessions
  let startedAt = task.startedAt
  let completedAt = task.completedAt

  if (task.status === 'working') {
    sessions = sessions.map((s, i) =>
      i === sessions.length - 1 && s.end == null ? { ...s, end: iso } : s,
    )
  }
  if (status === 'working') {
    sessions = [...sessions, { start: iso, end: null }]
    if (!startedAt) startedAt = iso
  }
  if (status === 'completed') completedAt = iso
  else if (task.status === 'completed') completedAt = null

  return { ...task, status, sessions, startedAt, completedAt }
}

// An open session counts up to `now`, capped at 8h so a forgotten timer
// doesn't inflate the stats.
const OPEN_SESSION_CAP_MS = 8 * 60 * 60 * 1000
const sessionEnd = (s, start, now) =>
  s.end ? parseISO(s.end) : new Date(Math.min(now.getTime(), start.getTime() + OPEN_SESSION_CAP_MS))

// Close the open session without changing status (pomodoro breaks/pauses).
export function withSessionPaused(task, now = new Date()) {
  const last = task.sessions[task.sessions.length - 1]
  if (!last || last.end != null) return task
  const iso = now.toISOString()
  return { ...task, sessions: task.sessions.map((s, i) => (i === task.sessions.length - 1 ? { ...s, end: iso } : s)) }
}

// Open a new session on a task that is in Working but has none open.
export function withSessionResumed(task, now = new Date()) {
  if (task.status !== 'working') return task
  const last = task.sessions[task.sessions.length - 1]
  if (last && last.end == null) return task
  return { ...task, sessions: [...task.sessions, { start: now.toISOString(), end: null }] }
}

// Minutes a task's sessions overlap a [from, to] range.
export function minutesInRange(task, from, to, now = new Date()) {
  let total = 0
  for (const s of task.sessions) {
    const start = parseISO(s.start)
    const end = sessionEnd(s, start, now)
    const a = maxDate([start, from])
    const b = minDate([end, to])
    if (b > a) total += differenceInMinutes(b, a)
  }
  return total
}

export function minutesOnDay(task, day, now) {
  return minutesInRange(task, startOfDay(day), endOfDay(day), now)
}

// Focus minutes per hour of a day: [{hour: 0..23, minutes}]
export function focusByHour(tasks, day, now = new Date()) {
  const base = startOfDay(day)
  return Array.from({ length: 24 }, (_, hour) => {
    const from = new Date(base.getTime() + hour * 3600_000)
    const to = new Date(from.getTime() + 3600_000)
    const minutes = tasks.reduce((s, t) => s + minutesInRange(t, from, to, now), 0)
    return { hour, minutes }
  })
}

export const totalMinutes = (task, now) =>
  minutesInRange(task, new Date(0), new Date(8.64e15), now)

export const tasksOn = (tasks, key) => tasks.filter((t) => t.date === key)

export function sortByTime(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
    if (a.startTime) return -1
    if (b.startTime) return 1
    const p = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)
    return p !== 0 ? p : a.createdAt.localeCompare(b.createdAt)
  })
}

// ---- derived statistics -------------------------------------------------

export function dayStats(tasks, day = new Date(), now = new Date()) {
  const key = dateKey(day)
  const planned = tasksOn(tasks, key)
  const done = planned.filter((t) => t.status === 'completed')
  const working = planned.filter((t) => t.status === 'working')
  const minutes = tasks.reduce((sum, t) => sum + minutesOnDay(t, day, now), 0)
  const plannedMinutes = planned.reduce((s, t) => s + (t.durationMinutes || 0), 0)
  return {
    key,
    planned,
    total: planned.length,
    done: done.length,
    working: working.length,
    minutes,
    plannedMinutes,
    progress: planned.length ? done.length / planned.length : 0,
  }
}

// One row per day, oldest first.
export function hoursPerDay(tasks, days = 7, now = new Date()) {
  const end = startOfDay(now)
  const start = subDays(end, days - 1)
  return eachDayOfInterval({ start, end }).map((day) => {
    const minutes = tasks.reduce((s, t) => s + minutesOnDay(t, day, now), 0)
    const completed = tasks.filter(
      (t) => t.completedAt && isSameDay(parseISO(t.completedAt), day),
    ).length
    return { date: day, key: dateKey(day), hours: minutes / 60, completed }
  })
}

// Minutes spent per category across all tasks (optionally only in a date range).
export function minutesByCategory(tasks, from, to, now = new Date()) {
  const map = new Map()
  for (const t of tasks) {
    const m = from && to ? minutesInRange(t, from, to, now) : totalMinutes(t, now)
    if (m > 0) map.set(t.category, (map.get(t.category) || 0) + m)
  }
  return map
}

// Last `weeks` weeks of cells, each {date, key, value}, aligned to weekStart.
export function heatmapCells(tasks, { weeks = 16, weekStart = 1, measure = 'hours' }, now = new Date()) {
  const end = startOfDay(now)
  const firstWeek = startOfWeek(subDays(end, (weeks - 1) * 7), { weekStartsOn: weekStart })
  const lastDay = addDays(startOfWeek(end, { weekStartsOn: weekStart }), 6)
  return eachDayOfInterval({ start: firstWeek, end: lastDay }).map((day) => {
    let value
    if (measure === 'count') {
      value = tasks.filter(
        (t) => t.completedAt && isSameDay(parseISO(t.completedAt), day),
      ).length
    } else {
      value = tasks.reduce((s, t) => s + minutesOnDay(t, day, now), 0) / 60
    }
    return { date: day, key: dateKey(day), value, future: day > end }
  })
}

export function streak(tasks, now = new Date()) {
  let n = 0
  let day = startOfDay(now)
  // Today counts only if something is already done; otherwise start from yesterday.
  const doneOn = (d) =>
    tasks.some((t) => t.completedAt && isSameDay(parseISO(t.completedAt), d))
  if (!doneOn(day)) day = subDays(day, 1)
  while (doneOn(day)) {
    n += 1
    day = subDays(day, 1)
  }
  return n
}

// ---- due dates --------------------------------------------------------

export const isOverdue = (task, now = new Date()) =>
  !!task.date && task.status !== 'completed' && task.date < dateKey(now)

export const isDueToday = (task, now = new Date()) => task.date === dateKey(now)

// "Today 11:00", "Tomorrow 16:00", a weekday within the next week, else "Sep 12".
export function dueLabel(task, now = new Date()) {
  if (!task.date) return null
  const d = parseISO(task.date)
  const time = task.startTime ? ` ${task.startTime}` : ''
  const diff = differenceInCalendarDays(d, now)
  if (diff === 0) return `Today${time}`
  if (diff === 1) return `Tomorrow${time}`
  if (diff > 1 && diff < 7) return `${format(d, 'EEEE')}${time}`
  return `${format(d, 'MMM d')}${time}`
}

// Days ago, for relative chips: "yesterday", "3 days ago".
export function daysAgoLabel(key, now = new Date()) {
  const n = differenceInCalendarDays(now, parseISO(key))
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
}

export function fmtMinutes(min) {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

export function fmtHours(h) {
  return fmtMinutes(h * 60)
}

export function fmtTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}
