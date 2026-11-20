// A profession's day as timed tasks. Pure functions (no storage, no React), tested by
// scripts/profession-test.mjs:  npm run test:profession

const DAY = 24 * 60
const pad = (n) => String(n).padStart(2, '0')
export const toHHMM = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
export const fromHHMM = (s) => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0) }

/** Clock time of a task: start + offset, wrapped past midnight (night shifts). */
export function clockOf(startMinutes, offsetHours) {
  const total = startMinutes + Math.round(offsetHours * 60)
  return { minutes: ((total % DAY) + DAY) % DAY, dayOffset: total >= DAY ? 1 : 0 }
}

/** Length of a working day in hours, from "HH:MM" start and end (an end before the start runs past midnight). */
export const shiftHours = (start, end) => (((fromHHMM(end) - fromHHMM(start)) + DAY) % DAY || DAY) / 60

/**
 * The generated day for a profession and its setup.
 * setup = { optionIndex, startMinutes, hours }
 *
 * 1. Base tasks + the extra tasks of the chosen setup option.
 * 2. Tasks past the end of the working day (offset > hours) are dropped.
 * 3. Sorted by time in the working day: by offset, so on a night shift 7 pm comes before 1 am.
 *    Same time: config order, base tasks first.
 * 4. Each gets its clock time (wrapped past midnight) and a duration that runs to the next task
 *    (15 minutes to 4 hours; 30 minutes when nothing follows before the end of the day).
 */
export function buildDailyTasks(config, setup) {
  const templates = [...config.baseTasks, ...(config.variantTasks[setup.optionIndex] || [])]
  const kept = templates
    .filter((tpl) => tpl.offsetHours >= 0 && tpl.offsetHours <= setup.hours)
    .sort((a, b) => a.offsetHours - b.offsetHours)

  return kept.map((tpl, i) => {
    const { minutes, dayOffset } = clockOf(setup.startMinutes, tpl.offsetHours)
    const next = kept.slice(i + 1).find((n) => n.offsetHours > tpl.offsetHours)
    const gap = Math.round(((next ? next.offsetHours : setup.hours) - tpl.offsetHours) * 60)
    return {
      key: `${config.id}:${i}`,
      title: tpl.title,
      category: tpl.category,
      offsetHours: tpl.offsetHours,
      minutes,
      dayOffset,
      startTime: toHHMM(minutes),
      durationMinutes: gap > 0 ? Math.min(240, Math.max(15, gap)) : 30,
    }
  })
}

/** A task that came from a profession's routine (onboarding or a profession change), not one the user made. */
export const isRoutineTask = (t) => typeof t?.fields?.source === 'string' && t.fields.source.startsWith('profession:')

/**
 * Swap the routine for a new one. Taken out: routine tasks from `todayKey` on that are still to do.
 * Kept: the user's own tasks, every past day, and routine tasks already started, in review or done.
 * The old routine's series end at the last task kept (recurrence.until), or the app's rolling horizon
 * (lib/recurrence.js ensureRecurrences) would grow them back from what was kept.
 */
export function replaceRoutine(tasks, routine, todayKey) {
  const goes = (t) => isRoutineTask(t) && !!t.date && t.date >= todayKey && t.status === 'todo'
  const kept = tasks.filter((t) => !goes(t))
  const lastKept = new Map()
  for (const t of kept) {
    if (isRoutineTask(t) && t.seriesId && t.date && !(lastKept.get(t.seriesId) >= t.date)) lastKept.set(t.seriesId, t.date)
  }
  const ended = kept.map((t) => (isRoutineTask(t) && t.recurrence && lastKept.has(t.seriesId)
    ? { ...t, recurrence: { ...t.recurrence, until: lastKept.get(t.seriesId) } }
    : t))
  return { tasks: [...ended, ...routine], removed: tasks.length - kept.length }
}

const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const plusDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const isWeekdaysOnly = (days) => days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))

/**
 * When each generated task first happens and how it repeats, as NineFlow series (lib/recurrence.js).
 * - All 7 days → one 'daily' series per task.
 * - Monday to Friday → one 'weekdays' series per task, starting on the first weekday from today.
 * - Any other week (say Monday to Saturday) → one 'weekly' series per task per working day, so
 *   nothing lands on a day off. NineFlow has no "these days of the week" repeat.
 * - A task after midnight (night shift) lands on the next calendar day. On a Monday to Friday week
 *   those fall Tuesday to Saturday, which 'weekdays' can't say, so they get a weekly series per shift.
 */
export function scheduleOf(dayTasks, { today, workingDays = [0, 1, 2, 3, 4, 5, 6] }) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = [...new Set(workingDays)]
  const at = (list, start, freq) => list.map((t) => ({ ...t, date: keyOf(plusDays(start, t.dayOffset)), freq }))
  const perShift = (list) => days
    .map((d) => plusDays(base, (d - base.getDay() + 7) % 7))
    .sort((x, y) => x - y)
    .flatMap((s) => at(list, s, 'weekly'))
  if (days.length === 0 || days.length === 7) return at(dayTasks, base, 'daily')
  if (isWeekdaysOnly(days)) {
    let start = base
    while (start.getDay() === 0 || start.getDay() === 6) start = plusDays(start, 1)
    return [...at(dayTasks.filter((t) => !t.dayOffset), start, 'weekdays'), ...perShift(dayTasks.filter((t) => t.dayOffset))]
  }
  return perShift(dayTasks)
}
