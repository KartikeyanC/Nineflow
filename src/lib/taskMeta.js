// Small helpers for the two optional extras on a task: reminders and tags.
import { addDays, format, parseISO } from 'date-fns'

// ---- reminders -------------------------------------------------------------------
// task.reminders is null (use the default from Settings), [] (none), or a list
// of "minutes before the start" such as [10, 1440].
export const REMINDER_CHOICES = [0, 5, 10, 30, 60, 1440]
export const ANCHOR_DEFAULT = '09:00' // tasks with a date but no start time are reminded as if they started now

export function reminderLabel(m) {
  if (m === 0) return 'At start'
  if (m < 60) return `${m} min before`
  if (m < 1440) return `${m / 60} h before`
  return `${m / 1440} day before`
}
export const reminderShort = (m) => (m === 0 ? 'At start' : m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : `${m / 1440} day`)

// The offsets that apply to a task: its own, else the Settings default when
// that is on, else none.
export function effectiveReminders(task, settings) {
  if (Array.isArray(task.reminders)) return task.reminders
  const r = settings?.reminders
  return r?.enabled ? [r.minutes] : []
}

// When the task "starts" for reminder purposes, as a Date (local time).
export function reminderAnchor(task, anchorTime = ANCHOR_DEFAULT) {
  if (!task.date) return null
  const [h, m] = (task.startTime || anchorTime).split(':').map(Number)
  const d = parseISO(task.date)
  d.setHours(h, m, 0, 0)
  return d
}

// Reminders that are due at `now`: one per offset whose time has come and whose
// start has not passed (at-start reminders get five minutes of grace, so a
// slow timer or a just-opened app still fires them).
export function dueReminders(tasks, settings, now = new Date()) {
  const out = []
  const today = format(now, 'yyyy-MM-dd')
  const horizon = format(addDays(now, 2), 'yyyy-MM-dd')
  for (const t of tasks) {
    if (t.hold || t.dropped || t.status !== 'todo' || !t.date || t.date < today || t.date > horizon) continue
    const start = reminderAnchor(t, settings?.reminders?.dayTime || ANCHOR_DEFAULT)
    if (!start) continue
    // Without a start time only custom reminders apply, so "all day" tasks aren't nagged by the default.
    if (!t.startTime && !Array.isArray(t.reminders)) continue
    for (const offset of effectiveReminders(t, settings)) {
      const at = new Date(start.getTime() - offset * 60_000)
      const late = offset === 0 ? 5 * 60_000 : 0
      if (now >= at && now.getTime() <= start.getTime() + late) {
        out.push({ id: `${t.id}@${t.date}@${t.startTime || 'day'}@${offset}`, task: t, offset, minutesLeft: Math.max(0, Math.round((start - now) / 60_000)) })
      }
    }
  }
  // Several due at once (the app was closed for a while): only the nearest one
  // is announced; the earlier ones are marked silent so they don't pile up.
  const nearest = new Map()
  for (const d of out) if (!nearest.has(d.task.id) || d.offset < nearest.get(d.task.id)) nearest.set(d.task.id, d.offset)
  return out.map((d) => ({ ...d, silent: d.offset !== nearest.get(d.task.id) }))
}

// Constant reminder: timed tasks for today that have started, are still to do and
// have a reminder. They are announced again every `repeat` minutes (Settings), for
// up to NAG_WINDOW minutes after the start, until they are begun or finished.
export const NAG_CHOICES = [5, 10, 15, 30]
export const NAG_WINDOW = 180
export function nagDue(tasks, settings, now = new Date()) {
  const fallback = settings?.reminders?.repeat
  if (!fallback && !tasks.some((t) => t.nagEvery > 0)) return []
  const today = format(now, 'yyyy-MM-dd')
  const out = []
  for (const t of tasks) {
    if (t.hold || t.dropped || t.status !== 'todo' || t.date !== today || !t.startTime) continue
    const every = t.nagEvery ?? fallback
    if (!every || !effectiveReminders(t, settings).length) continue
    const start = reminderAnchor(t, settings?.reminders?.dayTime || ANCHOR_DEFAULT)
    const late = start ? Math.floor((now - start) / 60_000) : -1
    if (late >= every && late <= NAG_WINDOW) out.push({ task: t, late, round: Math.floor(late / every) })
  }
  return out
}

// ---- tags --------------------------------------------------------------------------
export const MAX_TAGS = 6
export const TAG_MAX = 24

// "#Q4 Plan" → "q4-plan": lower case, letters/digits/-/_ only.
export function cleanTag(raw) {
  return String(raw ?? '').toLowerCase().replace(/^[#@]+/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, TAG_MAX)
}
export function cleanTags(list) {
  const seen = new Set()
  const out = []
  for (const x of Array.isArray(list) ? list : []) {
    const t = cleanTag(x)
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out.slice(0, MAX_TAGS)
}

// Every tag in use, most used first.
export function allTags(tasks) {
  const n = new Map()
  for (const t of tasks) for (const g of t.tags || []) n.set(g, (n.get(g) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }))
}

// ---- reminder schedule (desktop app) ----------------------------------------------
// Every reminder and "keep reminding" nudge due in the next `hours`, as plain data the
// desktop app's main process can fire on its own, even with the planner window closed
// (see desktop/reminders.cjs). Each entry: { id, at (ms), title, body, taskId }.
// It follows the same rules as dueReminders() and nagDue() above.
export const SCHEDULE_HOURS = 48
export function reminderSchedule(tasks, settings, now = new Date(), hours = SCHEDULE_HOURS) {
  const out = []
  const nowMs = now.getTime()
  const until = nowMs + hours * 3600_000
  const today = format(now, 'yyyy-MM-dd')
  const anchorTime = settings?.reminders?.dayTime || ANCHOR_DEFAULT
  for (const t of tasks) {
    if (t.hold || t.dropped || t.status !== 'todo' || !t.date || t.date < today) continue
    // Without a start time only custom reminders apply (as in dueReminders).
    if (!t.startTime && !Array.isArray(t.reminders)) continue
    const start = reminderAnchor(t, anchorTime)
    if (!start || start.getTime() - 1440 * 60_000 > until) continue
    const offsets = effectiveReminders(t, settings)
    const when = t.startTime ? `${t.startTime} · ` : ''
    for (const offset of offsets) {
      const at = start.getTime() - offset * 60_000
      if (at < nowMs - 5 * 60_000 || at > until) continue
      const title = offset === 0 ? `Starting now: ${t.title}` : offset >= 120 ? `Soon: ${t.title}` : `In ${offset} min: ${t.title}`
      out.push({ id: `${t.id}@${t.date}@${t.startTime || 'day'}@${offset}`, at, title, body: `${when}${t.durationMinutes} min`, taskId: t.id })
    }
    // Keep reminding: every `every` minutes after the start, up to NAG_WINDOW, while it is still to do.
    const every = t.nagEvery ?? settings?.reminders?.repeat
    if (t.startTime && every > 0 && offsets.length) {
      for (let late = every; late <= NAG_WINDOW; late += every) {
        const at = start.getTime() + late * 60_000
        if (at < nowMs - 5 * 60_000 || at > until) continue
        out.push({ id: `nag@${t.id}@${t.date}@${Math.floor(late / every)}`, at, title: `Still to do: ${t.title}`, body: `Started ${late} min ago`, taskId: t.id })
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 300)
}
