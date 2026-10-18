// RRB NTPC: the numbers. Pure functions over the stored progress (store.js) and the planner's tasks,
// so every figure on the dashboard comes from what the person recorded. Tested in scripts/ntpc-test.
import { addDays, format, parseISO } from 'date-fns'
import { totalMinutes } from '../../lib/tasks'
import { EXAM_ID } from './syllabus'

export const CHECKPOINTS = [
  { id: 'concept', label: 'Concept learning' },
  { id: 'notes', label: 'Notes and formulas' },
  { id: 'basic', label: 'Basic practice' },
  { id: 'moderate', label: 'Moderate practice' },
  { id: 'advanced', label: 'Advanced practice' },
  { id: 'pyq', label: 'Previous year questions' },
  { id: 'test', label: 'Topic-wise test' },
  { id: 'revision', label: 'Revision' },
]
export const CHECKPOINT_IDS = CHECKPOINTS.map((c) => c.id)
// What "Completed" means until the person changes it in the module's settings.
export const DEFAULT_REQUIRED = ['concept', 'notes', 'basic', 'moderate', 'pyq', 'test']
export const DEFAULT_INTERVALS = [1, 3, 7, 14, 30]

export const STATUSES = [
  { id: 'not-started', label: 'Not started' },
  { id: 'progress', label: 'In progress' },
  { id: 'revise', label: 'Needs revision' },
  { id: 'done', label: 'Completed' },
]
export const statusLabel = (id) => (id === 'ongoing' ? 'Ongoing' : STATUSES.find((s) => s.id === id)?.label || id)

// A topic is weak when enough questions have been tried and too few were right.
export const WEAK_MIN_ATTEMPTED = 10
export const WEAK_BELOW = 60

const key = (d) => format(d, 'yyyy-MM-dd')

// Accuracy = correct ÷ attempted × 100. Unanswered questions are not attempted, so they never count.
export function accuracy(correct, attempted) {
  return attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null
}

// Totals over practice entries: { attempted, correct, incorrect, unanswered, minutes, accuracy }.
export function practiceTotals(entries = []) {
  const t = { attempted: 0, correct: 0, incorrect: 0, unanswered: 0, minutes: 0 }
  for (const e of entries) {
    t.attempted += e.attempted || 0
    t.correct += e.correct || 0
    t.incorrect += e.incorrect || 0
    t.unanswered += e.unanswered || 0
    t.minutes += e.minutes || 0
  }
  return { ...t, accuracy: accuracy(t.correct, t.attempted) }
}

export const isWeak = (totals) => totals.attempted >= WEAK_MIN_ATTEMPTED && totals.accuracy !== null && totals.accuracy < WEAK_BELOW

// The planner's tasks that belong to this exam (dropped ones don't count), optionally for one topic.
export const examTasks = (tasks, topicId) =>
  tasks.filter((t) => t.exam?.id === EXAM_ID && !t.dropped && (!topicId || t.exam.topic === topicId))

// Where a topic stands. `required` is the person's own definition of finished (a list of checkpoints).
//   not-started - nothing ticked, practised or worked on
//   revise      - flagged by the person, weak accuracy, or finished with a revision now overdue
//   done        - every required checkpoint ticked
//   progress    - anything else that has begun
// Current affairs topics are never finished: 'ongoing' once begun.
export function topicStatus(topic, state = {}, linked = [], required = DEFAULT_REQUIRED, today = key(new Date())) {
  const checks = state.checks || {}
  const totals = practiceTotals(state.practice)
  const begun = Object.values(checks).some(Boolean) || totals.attempted > 0 || (state.practice || []).length > 0
    || linked.some((t) => t.status !== 'todo' || (t.sessions || []).length > 0)
  if (topic.recurring) return begun ? 'ongoing' : 'not-started'
  if (!begun && !state.flag) return 'not-started'
  const allDone = required.length > 0 && required.every((c) => checks[c])
  const overdueRevision = linked.some((t) => t.exam.kind === 'revision' && t.status !== 'completed' && t.date && t.date < today)
  if (state.flag === 'revise' || isWeak(totals) || (allDone && overdueRevision)) return 'revise'
  if (allDone) return 'done'
  return 'progress'
}

// Share of the required checkpoints ticked, 0..1 (current affairs topics left out).
export function topicCompletion(topic, state = {}, required = DEFAULT_REQUIRED) {
  if (topic.recurring || !required.length) return null
  const checks = state.checks || {}
  return required.filter((c) => checks[c]).length / required.length
}

// Everything the dashboard shows, for a list of topics.
export function summarize(topics, progress, tasks, required = DEFAULT_REQUIRED, now = new Date()) {
  const today = key(now)
  const counts = { 'not-started': 0, progress: 0, revise: 0, done: 0, ongoing: 0 }
  let share = 0, measured = 0
  const totalsAll = practiceTotals(topics.flatMap((t) => progress[t.id]?.practice || []))
  const weak = []
  for (const t of topics) {
    const st = progress[t.id] || {}
    const s = topicStatus(t, st, examTasks(tasks, t.id), required, today)
    counts[s] += 1
    const c = topicCompletion(t, st, required)
    if (c !== null) { share += c; measured += 1 }
    const tot = practiceTotals(st.practice)
    if (isWeak(tot)) weak.push({ topic: t, accuracy: tot.accuracy, attempted: tot.attempted })
  }
  weak.sort((a, b) => a.accuracy - b.accuracy)
  return {
    counts,
    completion: measured ? share / measured : 0,
    finished: counts.done,
    measured,
    accuracy: totalsAll.accuracy,
    attempted: totalsAll.attempted,
    weak,
  }
}

// Minutes of study already planned on a day (open exam tasks plus any extra planned now).
const plannedOn = (tasks, day) => examTasks(tasks)
  .filter((t) => t.date === day && t.status !== 'completed')
  .reduce((m, t) => m + Math.max(0, (t.durationMinutes || 0) - totalMinutes(t)), 0)

// Stable id of a topic's nth revision task, so the same revision is never created twice.
export const revisionTaskId = (topicId, n) => `ntpc-rev-${topicId.replace(/[^a-z0-9-]/gi, '-')}-${n}`

// The revision tasks to create for a topic finished on `from`: one per interval, skipping any that
// already exist (done, open or dropped). Each lands on its day, or the next day with room in the daily
// study time, looking at most two weeks ahead, then takes the original day anyway.
export function planRevisions({ topicId, from, intervals = DEFAULT_INTERVALS, minutes = 30, dailyMinutes = 240, tasks, existingIds }) {
  const have = existingIds || new Set(tasks.map((t) => t.id))
  const extra = {}
  const out = []
  intervals.forEach((days, i) => {
    const id = revisionTaskId(topicId, i + 1)
    if (have.has(id)) return
    const first = key(addDays(parseISO(from), days))
    let day = first
    for (let shift = 0; shift <= 14; shift += 1) {
      const d = key(addDays(parseISO(first), shift))
      if (plannedOn(tasks, d) + (extra[d] || 0) + minutes <= dailyMinutes) { day = d; break }
    }
    extra[day] = (extra[day] || 0) + minutes
    out.push({ id, n: i + 1, date: day })
  })
  return out
}

// Study time on a topic: time logged on its tasks plus practice minutes recorded by hand.
export function studyMinutes(state = {}, linked = [], now = new Date()) {
  return linked.reduce((m, t) => m + totalMinutes(t, now), 0) + practiceTotals(state.practice).minutes
}
