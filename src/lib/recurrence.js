// Recurring tasks. A series is a set of ordinary tasks sharing `seriesId`;
// each carries the same `recurrence` = { freq, until, skip }.
// Occurrences are materialized lazily for a rolling horizon so every view
// keeps deriving from the single tasks array.
import { addDays, addMonths, format, parseISO } from 'date-fns'
import { createTask, dateKey, newSubtask } from './tasks'

export const FREQS = ['daily', 'weekdays', 'weekly', 'monthly']
export const FREQ_LABEL = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' }
export const HORIZON_DAYS = 14

export function nextDate(key, freq) {
  const d = parseISO(key)
  if (freq === 'daily') return dateKey(addDays(d, 1))
  if (freq === 'weekly') return dateKey(addDays(d, 7))
  if (freq === 'monthly') return dateKey(addMonths(d, 1))
  // weekdays: skip Sat/Sun
  let n = addDays(d, 1)
  while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1)
  return dateKey(n)
}

// Occurrence keys of a series starting at `startKey`, within [fromKey, toKey].
export function occurrences(startKey, freq, fromKey, toKey, until = null, skip = []) {
  const out = []
  let k = startKey
  let guard = 0
  while (k <= toKey && guard++ < 1000) {
    if (until && k > until) break
    if (k >= fromKey && !skip.includes(k)) out.push(k)
    k = nextDate(k, freq)
  }
  return out
}

export function describe(rec) {
  if (!rec) return 'Does not repeat'
  const base = FREQ_LABEL[rec.freq] || rec.freq
  return rec.until ? `${base} until ${format(parseISO(rec.until), 'MMM d')}` : base
}

// Returns new task objects needed so each series covers today..today+horizon.
export function ensureRecurrences(tasks, now = new Date(), horizon = HORIZON_DAYS) {
  const today = dateKey(now)
  const toKey = dateKey(addDays(now, horizon))
  const bySeries = new Map()
  for (const t of tasks) {
    if (!t.seriesId || !t.recurrence || !t.date) continue
    if (!bySeries.has(t.seriesId)) bySeries.set(t.seriesId, [])
    bySeries.get(t.seriesId).push(t)
  }

  const extra = []
  for (const [seriesId, list] of bySeries) {
    list.sort((a, b) => a.date.localeCompare(b.date))
    const start = list[0].date
    const template = list[list.length - 1]
    const rec = template.recurrence
    const existing = new Set(list.map((t) => t.date))
    for (const key of occurrences(start, rec.freq, today, toKey, rec.until, rec.skip || [])) {
      if (existing.has(key)) continue
      extra.push(createTask({
        title: template.title,
        description: template.description,
        date: key,
        startTime: template.startTime,
        durationMinutes: template.durationMinutes,
        category: template.category,
        priority: template.priority,
        // Each day starts with the same steps, all unticked.
        subtasks: (template.subtasks || []).map((s) => newSubtask(s.title, s.required === true)),
        requireRule: template.requireRule === 'any' ? 'any' : 'all',
        reminders: template.reminders ?? null,
        tags: template.tags || [],
        seriesId,
        recurrence: rec,
      }))
    }
  }
  return extra
}
