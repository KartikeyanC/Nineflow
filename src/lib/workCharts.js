// Working charts: how much was worked and finished over a chosen stretch of time.
// "Worked" is the time tasks spent in Working (their sessions), the same measure as Focus time
// on the Dashboard. "Done" counts tasks by the day they were finished.
import {
  addDays, addMonths, differenceInCalendarDays, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format,
  isValid, parseISO, startOfDay, startOfMonth, subDays, subMonths,
} from 'date-fns'
import { sessionEnd } from './tasks'

export const RANGES = [
  { id: 'day', label: 'Day', days: 1 },
  { id: 'week', label: 'Week', days: 7 },
  { id: '15d', label: '15 days', days: 15 },
  { id: 'month', label: '1 month', days: 30 },
  { id: '6m', label: '6 months', months: 6 },
  { id: 'year', label: '1 year', months: 12 },
  { id: 'custom', label: 'Custom' },
]
export const MAX_CUSTOM_DAYS = 366 * 3

// The stretch a preset covers, ending on `endDay` (that whole day included).
export function rangeWindow(id, endDay) {
  const r = RANGES.find((x) => x.id === id) || RANGES[1]
  const to = endOfDay(endDay)
  const from = r.months ? startOfDay(addDays(subMonths(endDay, r.months), 1)) : startOfDay(subDays(endDay, r.days - 1))
  return { from, to }
}

// The end day one whole stretch earlier (dir -1) or later (dir 1).
export function shiftEnd(id, endDay, dir) {
  const r = RANGES.find((x) => x.id === id) || RANGES[1]
  return r.months ? addMonths(endDay, dir * r.months) : addDays(endDay, dir * r.days)
}

// How the stretch is split into bars: hours for one day, days up to a month, weeks up to about
// six and a half months, months beyond that. Weeks start on Monday; the first and last are cut to the stretch.
// Each bar has `to` (its last moment, for labels) and `end` (where the next one starts, for counting).
export function bucketsFor(from, to) {
  const span = differenceInCalendarDays(to, from) + 1
  const out = []
  if (span <= 1) {
    for (let h = 0; h < 24; h++) {
      const a = new Date(from.getTime() + h * 3600_000)
      out.push({ from: a, to: new Date(a.getTime() + 3600_000), end: new Date(a.getTime() + 3600_000), tick: format(a, 'h a'), title: `${format(a, 'h a')} – ${format(new Date(a.getTime() + 3600_000), 'h a')}` })
    }
    return { unit: 'hour', buckets: out }
  }
  if (span <= 31) {
    for (const d of eachDayOfInterval({ start: from, end: to })) {
      out.push({ from: startOfDay(d), to: endOfDay(d), end: startOfDay(addDays(d, 1)), tick: span <= 7 ? format(d, 'EEE d') : format(d, 'd MMM'), title: format(d, 'EEEE d MMMM yyyy') })
    }
    return { unit: 'day', buckets: out }
  }
  if (span <= 200) {
    let a = from
    while (a <= to) {
      const b = endOfWeek(a, { weekStartsOn: 1 }) < to ? endOfWeek(a, { weekStartsOn: 1 }) : to
      out.push({ from: a, to: b, end: startOfDay(addDays(b, 1)), tick: format(a, 'd MMM'), title: `Week of ${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}` })
      a = startOfDay(addDays(b, 1))
    }
    return { unit: 'week', buckets: out }
  }
  let a = from
  while (a <= to) {
    const b = endOfMonth(a) < to ? endOfMonth(a) : to
    out.push({ from: a, to: b, end: startOfDay(addDays(b, 1)), tick: format(a, span > 400 ? 'MMM yy' : 'MMM'), title: format(a, 'MMMM yyyy') })
    a = startOfMonth(addMonths(a, 1))
  }
  return { unit: 'month', buckets: out }
}

const finishedAt = (t) => {
  if (t.status !== 'completed' || !t.completedAt) return null
  const d = parseISO(t.completedAt)
  return isValid(d) ? d : null
}

// Everything the charts show for one stretch. Each work session is read once, as plain numbers, and
// spread over the bars and days it touches, so a year of history still draws at once.
export function workSeries(tasks, from, to, categories = [], now = new Date()) {
  const { unit, buckets } = bucketsFor(from, to)
  const lo = from.getTime(), hi = to.getTime() + 1 // `to` is the stretch's last millisecond
  const rows = buckets.map((b) => ({ ...b, ms: 0, done: 0 }))
  const starts = rows.map((r) => r.from.getTime())
  // The bar a moment falls in (bars are in order and meet end to start).
  const barAt = (ms) => { let a = 0, b = rows.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (starts[m] <= ms) a = m; else b = m - 1 } return a }
  const dayMs = new Set() // local midnights of days with any work
  const byCat = new Map()
  const fromKey = format(from, 'yyyy-MM-dd'), toKey = format(to, 'yyyy-MM-dd')
  let totalMs = 0, planned = 0, plannedMs = 0, done = 0

  for (const t of tasks) {
    let taskMs = 0
    for (const s of t.sessions || []) {
      const start = parseISO(s.start)
      if (!isValid(start)) continue
      const a = Math.max(start.getTime(), lo)
      const b = Math.min(sessionEnd(s, start, now).getTime(), hi)
      if (b <= a) continue
      taskMs += b - a
      for (let i = barAt(a); i < rows.length && starts[i] < b; i++) {
        const end = rows[i].end.getTime()
        rows[i].ms += Math.min(b, end) - Math.max(a, starts[i])
      }
      for (let d = startOfDay(new Date(a)); d.getTime() < b; d = addDays(d, 1)) dayMs.add(d.getTime())
    }
    if (taskMs > 0) {
      totalMs += taskMs
      const cat = categories.find((c) => c.id === t.category)
      const key = cat ? cat.id : 'other'
      const cur = byCat.get(key) || { id: key, name: cat ? cat.name : 'Other', color: cat ? cat.color : null, ms: 0 }
      cur.ms += taskMs
      byCat.set(key, cur)
    }
    // Time planned for tasks dated in the stretch, against the time worked on those same tasks.
    if (t.date && t.date >= fromKey && t.date <= toKey && t.durationMinutes) { planned += t.durationMinutes; plannedMs += taskMs }
    const f = finishedAt(t)
    if (f && f.getTime() >= lo && f.getTime() < hi) { done++; rows[barAt(f.getTime())].done++ }
  }

  const toMin = (ms) => Math.round(ms / 60000)
  for (const r of rows) { r.minutes = toMin(r.ms); delete r.ms }
  // The total is the bars added up, so the headline and the chart always agree.
  const minutes = rows.reduce((s, r) => s + r.minutes, 0)
  // Tasks in a category that no longer exists count as Other; largest first.
  const categoriesWorked = [...byCat.values()].map(({ ms, ...c }) => ({ ...c, minutes: toMin(ms) })).sort((a, b) => b.minutes - a.minutes)
  const best = rows.reduce((m, r) => (r.minutes > (m?.minutes || 0) ? r : m), null)
  return { unit, rows, minutes, done, activeDays: dayMs.size, planned, workedOnPlanned: toMin(plannedMs), categories: categoriesWorked, best }
}
