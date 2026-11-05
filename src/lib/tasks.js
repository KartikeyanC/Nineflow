// Pure helpers over the task array. No React, no storage.
import { addDays, differenceInCalendarDays, differenceInMinutes, eachDayOfInterval, endOfDay, isSameDay, max as maxDate, min as minDate, parseISO, startOfDay, startOfWeek, subDays } from 'date-fns'
import { clock, format } from './dateFormat'
import { uid } from './storage'

// In review: handed over and waiting on someone else. Its timer is stopped (see
// withStatus, which only opens a session for Working) and the planner never
// schedules it, but it is still open work: not done, and not yours to pick up.
export const STATUSES = ['todo', 'working', 'review', 'completed']
export const STATUS_LABEL = { todo: 'To do', working: 'Working', review: 'In review', completed: 'Completed' }
export const PRIORITIES = ['high', 'medium', 'low']
export const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

// `required` steps must be ticked before the task can be completed (see checkGate). It has to be
// exactly `true`: callers also pass this to .map(), which hands over the index as 2nd argument.
export const newSubtask = (title, required) => ({ id: uid(), title: String(title).slice(0, 120), done: false, required: required === true })
export const subProgress = (task) => {
  const subs = task.subtasks || []
  return { done: subs.filter((s) => s.done).length, total: subs.length }
}
// "Before you finish": a task with a checklist can't become Completed until its steps are ticked.
// When some steps are locked as required, only those count, and task.requireRule is 'all'
// (every required step) or 'any' (at least one). Otherwise every step counts (`explicit` false).
export const requiredSteps = (task) => (task.subtasks || []).filter((s) => s.required)
export function checkGate(task) {
  const locked = requiredSteps(task)
  const explicit = locked.length > 0
  const req = explicit ? locked : task.subtasks || []
  const rule = explicit && task.requireRule === 'any' ? 'any' : 'all'
  const ticked = req.filter((s) => s.done).length
  const needed = req.length === 0 ? 0 : rule === 'any' ? 1 : req.length
  return { required: req.length, explicit, ticked, needed, rule, blocked: ticked < needed, missing: req.filter((s) => !s.done), steps: req }
}
export const todayKey = () => format(new Date(), 'yyyy-MM-dd')
export const dateKey = (d) => format(d, 'yyyy-MM-dd')

export function createTask(fields = {}) {
  const task = {
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
    subtasks: [], // [{ id, title, done, required }]: the steps inside the task
    requireRule: 'all', // 'all' | 'any': how many of the required steps must be ticked to finish
    skippedChecks: null, // { at, reason, missing: [titles] } when it was finished with "Finish anyway"
    column: null, // a custom Board column id (see lib/columns.js), or null: the original column of its status
    reminders: null, // null = the Settings default; [] = none; [10, 1440] = minutes before the start
    nagEvery: null, // keep reminding after the start: null = the Settings default; 0 = once; 5/10/15/30 = every N minutes
    files: [], // Drive files attached to the task: [{ id, name, url, icon }] (lib/taskFiles.js)
    tags: [], // ['client-a', 'q4']: free labels, any number per task (up to 6)
    client: null, // who the work is for, e.g. 'Acme' (Charts: Hours by client)
    billable: false, // the time on it can be charged to the client
    seriesId: null,
    recurrence: null, // { freq, until, skip } | null
    interruption: null, // { by, at, resume, resumeMode, resolved } | null
    trail: [], // the days it was on before it moved on unfinished: [{ date, status, column }] (see leaveTrail)
    hold: null, // paused on purpose: { reason, since, until: 'yyyy-MM-dd' | null } | null (see Paused)
    dropped: null, // let go, kept 30 days: { reason, at } | null
    ...fields,
  }
  // The day it started: the day it was first planned for. Fixed here, and read-only everywhere.
  // Carrying a task forward or finishing it changes its `date`, never this.
  return { ...task, startDate: task.startDate ?? task.date ?? null }
}

// ---- Start day and end day ---------------------------------------------------------
// A task has one planned day (`date`), which moves as unfinished work is carried forward, and a start
// day that never moves. Both days are worked out for you and shown read-only in the task panel.
export const startDayOf = (task) => task.startDate ?? task.date ?? null
// The day it was finished (the local day of completedAt); null while it is still open.
export const endDayOf = (task) => (task.status === 'completed' && task.completedAt ? dateKey(parseISO(task.completedAt)) : null)
// Calendar days from the start to the end (or to today while it is open), counting both ends:
// started and finished on the same day is 1. Null before it has started.
export function daysOnPlan(task, now = new Date()) {
  const start = startDayOf(task)
  if (!start) return null
  const span = differenceInCalendarDays(parseISO(endDayOf(task) || dateKey(now)), parseISO(start)) + 1
  return span >= 1 ? span : null
}

// Editing a task's planned day. A task you have not touched yet and that has not arrived (its start day is
// today or later) takes its new start day with it; once it has been worked on, or carried over from an
// earlier day, its start day stays where it was.
// ---- the day trail ------------------------------------------------------------------
// When an unfinished task leaves a day that has already come (carried forward, or moved by
// hand), that day keeps a frozen record of it: the date, and the status (and Board column) it
// had there. Past days on the Board show these as read-only cards ("moved on"), and the task
// panel shows the trail, so it's always easy to see which day something started and where it
// has been. One entry per day; the latest status that day wins.
export const TRAIL_MAX = 60
export function leaveTrail(task, now = new Date()) {
  if (!task.date || task.date > dateKey(now) || task.status === 'completed') return task
  const entry = { date: task.date, status: task.status, column: task.column ?? null }
  const rest = (task.trail || []).filter((e) => e.date !== task.date)
  return { ...task, trail: [...rest, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-TRAIL_MAX) }
}
// The tasks that were on `day` and have since moved on, with what they were that day.
export function frozenOn(tasks, day) {
  const out = []
  for (const t of tasks) {
    if (t.date === day) continue
    const e = (t.trail || []).find((x) => x.date === day)
    if (e) out.push({ task: t, entry: e })
  }
  return out
}

export function withDate(task, date, now = new Date()) {
  if (task.date === date) return task
  task = leaveTrail(task, now)
  const start = task.startDate ?? task.date
  const untouched = task.status === 'todo' && !task.startedAt && task.sessions.length === 0
  const notArrived = start == null || start >= dateKey(now)
  const atStart = task.startDate == null || task.startDate === task.date
  return { ...task, date, startDate: untouched && notArrived && atStart ? date : start }
}

// The only place status changes. Keeps sessions / startedAt / completedAt consistent.
//  - entering Working opens a session and sets startedAt (first time only)
//  - leaving Working closes the open session
//  - entering Completed sets completedAt; leaving it clears completedAt
//  - entering Completed also makes today the task's day (its end day), so it is not shown on any other day
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

  // A new status puts the task in that status's own column; moveTask picks a custom one afterwards.
  // Finishing a task makes today its last day: it stops showing on every other day. A repeating task's
  // occurrence belongs to its own day, so it stays where it is.
  const finishedElsewhere = status === 'completed' && task.date !== dateKey(now) && !(task.seriesId && task.recurrence)
  const day = finishedElsewhere ? { date: dateKey(now), startDate: task.startDate ?? task.date ?? dateKey(now) } : null
  return { ...task, status, column: null, sessions, startedAt, completedAt, ...day }
}

// An open session counts up to `now`, capped at 8h so a forgotten timer
// doesn't inflate the stats.
const OPEN_SESSION_CAP_MS = 8 * 60 * 60 * 1000
export const sessionEnd = (s, start, now) =>
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

// A missed occurrence of a repeating task doesn't count: the series comes round
// again, so it shouldn't pile up as unfinished work.
export const isOverdue = (task, now = new Date()) =>
  !!task.date && task.status !== 'completed' && task.date < dateKey(now) && !(task.seriesId && task.recurrence) && !isParked(task)

// ---- paused and dropped ------------------------------------------------------------------
// A task can be stopped on purpose (paused, with a reason and maybe a day to check again)
// or let go (dropped, with a reason; kept 30 days, then deleted). Either way it leaves every
// plan, list, board and reminder until it is resumed or restored (see views/Paused.jsx).
export const isParked = (task) => !!(task?.hold || task?.dropped)
export const PAUSE_REASONS = ['Waiting on someone', 'Blocked', 'Need more info', 'Not now', 'Other']
export const DROP_REASONS = ['Not needed any more', 'Done another way', 'Someone else did it', 'Too big as it is', 'Lost interest', 'Other']
export const DROP_KEEP_DAYS = 30

// Keeps slipping: still to do, never started, first planned SLIP_DAYS or more days ago, and
// still on the plan (carried or moved along). Repeating tasks don't count. Longest first.
export const SLIP_DAYS = 3
export function slipping(tasks, now = new Date()) {
  const today = dateKey(now)
  const out = []
  for (const t of tasks) {
    if (isParked(t) || t.status !== 'todo' || t.startedAt || (t.sessions || []).length || !t.date || (t.seriesId && t.recurrence)) continue
    const first = t.startDate ?? t.date
    const days = differenceInCalendarDays(parseISO(today), parseISO(first))
    if (days >= SLIP_DAYS && t.date <= dateKey(addDays(now, 1))) out.push({ task: t, days })
  }
  return out.sort((a, b) => b.days - a.days)
}

export const isDueToday = (task, now = new Date()) => task.date === dateKey(now)

// Unfinished work continues by itself. A task left open (To do, Working or In review) on an earlier day moves
// to today, and its start day stays. Only the last few days are carried this way, enough for a weekend: after
// a longer absence the older ones wait in "Carried over" and the Welcome back prompt instead of all piling
// into today. Repeating tasks are not carried (each occurrence belongs to its own day).
export const CARRY_FORWARD_DAYS = 3
export function carryForward(tasks, now = new Date()) {
  const today = dateKey(now)
  let moved = 0
  const next = tasks.map((t) => {
    if (!isOverdue(t, now) || differenceInCalendarDays(parseISO(today), parseISO(t.date)) > CARRY_FORWARD_DAYS) return t
    moved++
    const left = leaveTrail(t, now)
    return { ...left, date: today, startDate: t.startDate ?? t.date }
  })
  return { tasks: moved ? next : tasks, moved }
}

// "Today 11:00", "Tomorrow 16:00", a weekday within the next week, else "Sep 12".
export function dueLabel(task, now = new Date()) {
  if (!task.date) return null
  const d = parseISO(task.date)
  const time = task.startTime ? ` ${clock(task.startTime)}` : ''
  const diff = differenceInCalendarDays(d, now)
  if (diff === 0) return `Today${time}`
  if (diff === 1) return `Tomorrow${time}`
  if (diff > 1 && diff < 7) return `${format(d, 'EEEE')}${time}`
  return `${format(d, 'MMM d')}${time}`
}

// Calm label for unfinished work from an earlier day: "from Tue" within the
// last week, else "from Sep 28". Used instead of a red "OVERDUE".
export function carriedLabel(key, now = new Date()) {
  const d = parseISO(key)
  return differenceInCalendarDays(now, d) <= 6 ? `from ${format(d, 'EEE')}` : `from ${format(d, 'MMM d')}`
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
