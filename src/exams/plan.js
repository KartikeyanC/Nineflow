// A 40-day plan laid out from an exam's syllabus (exams/index.js), for the exams without a hand-written
// one (RRB NTPC has ntpc/plan40.js). Same daily times as the NTPC plan: mornings 05:00-07:30, evenings
// 20:00-21:25. Day 40 is the day before the exam.
//   days 1-28   three learning slots a day, every subject in turn, current affairs each evening;
//               every 7th day a full mock in the morning and a weekly revision in the evening
//   days 29-40  a full mock every second day with its review; revision by subject, timed sectional sets
// Each subject gets learning slots in proportion to its topics; when there are more topics than slots,
// neighbouring topics of a subject share one. Task ids are fixed by exam, day and order, never the
// date, so a task always matches its row. Node tests can load it (its only import, plan40, has none).
import { PLAN_DAYS, planEnd, startForExam } from './ntpc/plan40.js'

export { PLAN_DAYS, planEnd, startForExam }

const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const TEST_DAYS = new Set([7, 14, 21, 28])
const MOCK_DAYS = new Set([29, 31, 33, 35, 37, 39])
const LEARN_SLOTS = [['05:00', 90], ['06:30', 60], ['20:00', 50]]

// The learning slots in order: [{ subject, topics: [topic…] }], subjects interleaved.
function learningGroups(exam) {
  const learnDays = Array.from({ length: 28 }, (_, i) => i + 1).filter((d) => !TEST_DAYS.has(d)).length
  const slots = learnDays * LEARN_SLOTS.length
  const subjects = exam.subjects.map((s) => ({ s, topics: s.topics.filter((t) => !t.recurring) })).filter((x) => x.topics.length)
  const total = subjects.reduce((n, x) => n + x.topics.length, 0)
  const lists = subjects.map(({ s, topics }) => {
    const n = Math.max(1, Math.min(topics.length, Math.round((slots * topics.length) / total)))
    // n groups as even as possible: only as many topics share a slot as there are too few slots.
    return Array.from({ length: n }, (_, i) => ({ subject: s, topics: topics.slice(Math.floor((i * topics.length) / n), Math.floor(((i + 1) * topics.length) / n)) }))
  })
  // Interleave by how far through its subject each group is, so every subject runs through the 4 weeks.
  return lists.flatMap((groups) => groups.map((g, i) => ({ ...g, at: (i + 0.5) / groups.length })))
    .sort((a, b) => a.at - b.at).slice(0, slots)
}

export function examPlanRows(exam, start) {
  const groups = learningGroups(exam)
  const subjects = exam.subjects.filter((s) => s.topics.some((t) => !t.recurring))
  const rows = []
  let g = 0, mockNo = 0
  for (let day = 1; day <= 40; day += 1) {
    const date = addDays(start, day - 1)
    const out = []
    const add = (time, minutes, title, subject, priority, notes, topic, kind) => out.push({ day, date, time, minutes, title, subject: subject?.short || 'All subjects', subjectId: subject?.id || null, priority, notes, topic, kind })
    const ca = () => add('20:50', 35, 'Current affairs', exam.subjects.find((s) => s.id === exam.caSubject), 'medium', 'Daily news and a short quiz', exam.caTopic, 'reading')
    if (day <= 28 && TEST_DAYS.has(day)) {
      mockNo += 1
      add('05:00', 90, day === 7 ? 'Diagnostic mock test' : `Mock test ${mockNo}`, null, 'high', 'A full-length mock, timed, in one go', null, 'test')
      add('06:30', 60, `Mock ${mockNo}: review`, null, 'high', 'Go through every wrong and skipped question; note each in the error notebook', null, 'test')
      add('20:00', 50, 'Weekly revision', null, 'high', 'This week\'s topics, formula sheet and error notebook', null, 'revision')
      ca()
    } else if (day <= 28) {
      for (const [time, minutes] of LEARN_SLOTS) {
        const grp = groups[g++]
        if (!grp) { add(time, minutes, 'Practice: previous year questions', null, 'medium', 'Mixed questions from the topics done so far', null, 'practice'); continue }
        add(time, minutes, grp.topics.map((t) => t.name).join(' + '), grp.subject, 'high', `Learn the concept, then basic practice${grp.topics.length > 1 ? ' on each' : ''}`, grp.topics[0].id, 'learn')
      }
      ca()
    } else if (MOCK_DAYS.has(day)) {
      mockNo += 1
      add('05:00', 90, `Mock test ${mockNo}`, null, 'high', 'A full-length mock, timed, in one go', null, 'test')
      add('06:30', 60, `Mock ${mockNo}: review`, null, 'high', 'Every wrong and skipped question; redo them without looking', null, 'test')
      add('20:00', 50, `Mock ${mockNo}: weak topics`, null, 'high', 'The topics this mock showed up', null, 'practice')
      ca()
    } else {
      const s = subjects[(day - 29) % subjects.length]
      add('05:00', 90, day === 40 ? 'Final revision: formulas and notes' : `Revision: ${s.short}`, day === 40 ? null : s, 'high', 'Your notes, formula sheet and error notebook', null, 'revision')
      add('06:30', 60, `Timed sectional set: ${s.short}`, s, 'high', 'Previous year questions against the clock', null, 'practice')
      add('20:00', 50, 'Error notebook', null, 'medium', 'Go back over every mistake noted so far', null, 'revision')
      ca()
    }
    out.forEach((r, j) => rows.push({ ...r, id: `${exam.id}-plan40-d${String(day).padStart(2, '0')}-${j + 1}` }))
  }
  return rows
}

// As planner tasks (createTask fields); days before `fromDate` are left out.
export function examPlanTasks(exam, { category, fromDate, start }) {
  return examPlanRows(exam, start).filter((r) => !fromDate || r.date >= fromDate).map((r) => ({
    id: r.id,
    title: r.title,
    description: `${r.notes}\n\nDay ${r.day} of 40 · 40-day plan · ${exam.name}`,
    date: r.date,
    startTime: r.time,
    durationMinutes: r.minutes,
    priority: r.priority,
    category,
    tags: [exam.tag, 'plan-40'],
    exam: { id: exam.id, subject: r.subjectId, topic: r.topic || 'plan:general', kind: r.kind, deadline: null },
  }))
}
