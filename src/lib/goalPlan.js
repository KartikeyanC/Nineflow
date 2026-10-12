// Turns a goal and a deadline (an exam, a launch, a trip) into a spread-out
// list of tasks. No AI and no network: it divides what has to be covered over
// the days that are actually free, puts revision at the end and keeps the day
// before the deadline clear. Pure, so it can be tried on its own.
import { addDays, differenceInCalendarDays, format, getDay, parseISO, startOfDay } from 'date-fns'

export const MAX_TASKS = 80
const key = (d) => format(d, 'yyyy-MM-dd')

// One topic per line; a single line with commas or semicolons is split too.
// Bullets and numbering are dropped, repeats are removed.
export function parseTopics(text) {
  let parts = String(text || '').split(/\r?\n/)
  if (parts.length === 1) parts = parts[0].split(/[;,]/)
  const seen = new Set()
  return parts
    .map((p) => p.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()))
}

// Splits `topics` over `slots` sessions. More topics than sessions: they are
// grouped. Fewer: each topic gets several sessions, numbered (1/2, 2/2).
function spread(topics, slots) {
  const T = topics.length
  if (slots <= 0) return []
  if (T === 0) return Array.from({ length: slots }, () => ({ topics: [], part: null }))
  if (T >= slots) {
    return Array.from({ length: slots }, (_, i) => ({ topics: topics.slice(Math.floor((i * T) / slots), Math.floor(((i + 1) * T) / slots)), part: null }))
  }
  const owner = Array.from({ length: slots }, (_, i) => Math.floor((i * T) / slots))
  const total = owner.reduce((m, o) => ((m[o] = (m[o] || 0) + 1), m), {})
  const seen = {}
  return owner.map((o) => ({ topics: [topics[o]], part: total[o] > 1 ? [(seen[o] = (seen[o] || 0) + 1), total[o]] : null }))
}

const label = (topics) => {
  if (topics.length === 0) return ''
  const joined = topics.join(' · ')
  return joined.length <= 60 ? joined : `${topics[0]} … ${topics[topics.length - 1]}`
}

/**
 * planGoal({
 *   name, deadline ('yyyy-MM-dd'), topics: string[], minutesPerDay,
 *   days: number[] (0 = Sunday … 6 = Saturday), startTime: 'HH:mm' | null,
 *   revision, restDayBefore, deadlineTask, from: Date, isFull: (dateKey) => boolean,
 * })
 * → { items, studyDays, revisionDays, skippedFull, totalMinutes, problem }
 * Each item: { date, title, description, startTime, durationMinutes, priority, kind }
 */
export function planGoal(o) {
  const name = String(o.name || '').trim()
  const empty = { items: [], studyDays: 0, revisionDays: 0, skippedFull: 0, totalMinutes: 0, problem: null }
  if (!name) return { ...empty, problem: 'Give the goal a name.' }
  if (!o.deadline) return { ...empty, problem: 'Pick the deadline or exam date.' }

  const from = startOfDay(o.from || new Date())
  const deadline = startOfDay(parseISO(o.deadline))
  if (!(differenceInCalendarDays(deadline, from) > 0)) return { ...empty, problem: 'The deadline has to be after today.' }
  const days = new Set(o.days || [])
  if (days.size === 0) return { ...empty, problem: 'Pick at least one day of the week to work on it.' }
  const minutes = Math.max(5, Math.round(o.minutesPerDay || 60))

  // Free days: chosen weekdays from today until the deadline (minus the rest day).
  const last = addDays(deadline, o.restDayBefore ? -2 : -1)
  const candidates = []
  for (let d = from; d <= last; d = addDays(d, 1)) if (days.has(getDay(d))) candidates.push(d)
  const open = candidates.filter((d) => !(o.isFull && o.isFull(key(d))))
  const skippedFull = candidates.length - open.length
  if (open.length === 0) {
    return { ...empty, skippedFull, problem: candidates.length ? 'Every day before the deadline is already full. Move the deadline or free up some days.' : 'There are no free days before the deadline on the days you picked. Add more days or move the deadline.' }
  }

  const topics = o.topics || []
  const S = open.length
  const R = o.revision && S >= 4 ? Math.max(1, Math.round(S * 0.2)) : 0
  const studySlots = S - R
  const study = spread(topics, studySlots)
  const revise = R > 1 ? spread(topics, R - 1) : []

  const base = { startTime: o.startTime || null, durationMinutes: minutes }
  const items = []
  study.forEach((s, i) => {
    const what = label(s.topics)
    const title = what ? `${name}: ${what}${s.part ? ` (${s.part[0]}/${s.part[1]})` : ''}` : `${name}: study ${i + 1} of ${studySlots}`
    items.push({ ...base, date: key(open[i]), title, description: s.topics.length > 1 ? s.topics.join('\n') : '', priority: 'medium', kind: 'study' })
  })
  revise.forEach((s, i) => {
    const what = label(s.topics)
    items.push({ ...base, date: key(open[studySlots + i]), title: what ? `${name}: revise ${what}` : `${name}: revision ${i + 1}`, description: s.topics.length > 1 ? s.topics.join('\n') : '', priority: 'high', kind: 'revision' })
  })
  if (R > 0) {
    items.push({ ...base, date: key(open[S - 1]), title: `${name}: final revision`, description: topics.join('\n'), priority: 'high', kind: 'revision' })
  }
  if (o.deadlineTask) {
    items.push({ date: o.deadline, title: name, description: 'The deadline.', startTime: null, durationMinutes: 60, priority: 'high', kind: 'deadline' })
  }

  if (items.length > MAX_TASKS) {
    return { ...empty, skippedFull, problem: `That makes ${items.length} tasks, more than ${MAX_TASKS}. Pick fewer days, or plan a nearer deadline first.` }
  }
  return {
    items,
    studyDays: studySlots,
    revisionDays: R,
    skippedFull,
    totalMinutes: items.filter((i) => i.kind !== 'deadline').reduce((s, i) => s + i.durationMinutes, 0),
    problem: null,
  }
}
