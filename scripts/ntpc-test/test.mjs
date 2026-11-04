// Tests for the RRB NTPC module (src/exams/ntpc) and the task fields it adds:  npm run test:ntpc
import './globals.mjs'
import { BUILT_IN_TOPICS, SUBJECTS } from '../../src/exams/ntpc/syllabus.js'
import { accuracy, isWeak, planRevisions, practiceTotals, revisionTaskId, summarize, topicStatus } from '../../src/exams/ntpc/calc.js'
import { cleanNtpc, emptyNtpc, loadNtpc, saveNtpc, topicsOf } from '../../src/exams/ntpc/store.js'
import { loadTasks, saveTasks } from '../../src/lib/storage.js'
import { ensureRecurrences } from '../../src/lib/recurrence.js'
import { createTask } from '../../src/lib/tasks.js'
import { PLAN_ROWS, planRows, planTasks, startForExam } from '../../src/exams/ntpc/plan40.js'

let pass = 0, fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const link = (topic, kind = 'learn') => ({ id: 'rrb-ntpc', subject: topic.split(':')[0], topic, kind, deadline: null })

// ---- 1. the syllabus
const counts = SUBJECTS.map((s) => s.topics.length)
ok(same(counts, [16, 18, 29]), 'syllabus: 16 maths, 18 reasoning, 29 general awareness topics', counts.join(','))
ok(new Set(BUILT_IN_TOPICS.map((t) => t.id)).size === BUILT_IN_TOPICS.length, 'every topic id is unique')
ok(same(BUILT_IN_TOPICS.filter((t) => t.recurring).map((t) => t.id), ['ga:national-current-affairs', 'ga:international-current-affairs']), 'current affairs topics are recurring')
const twice = topicsOf(cleanNtpc(cleanNtpc({})))
ok(twice.flatMap((s) => s.topics).length === 63, 'opening the module again never duplicates topics (63)')

// ---- 2. accuracy
ok(accuracy(7, 10) === 70 && accuracy(0, 0) === null && accuracy(2, 3) === 66.7, 'accuracy = correct ÷ attempted × 100 (none attempted: no figure)')
const tot = practiceTotals([{ attempted: 10, correct: 7, incorrect: 3, unanswered: 5, minutes: 20 }, { attempted: 10, correct: 3, incorrect: 7, unanswered: 0, minutes: 10 }])
ok(tot.accuracy === 50 && tot.attempted === 20 && tot.unanswered === 5 && tot.minutes === 30, 'unanswered questions are not counted as attempted', JSON.stringify(tot))
ok(isWeak({ attempted: 10, accuracy: 50 }) && !isWeak({ attempted: 9, accuracy: 0 }) && !isWeak({ attempted: 40, accuracy: 60 }), 'weak: under 60% after at least 10 questions')

// ---- 3. topic status
const pct = BUILT_IN_TOPICS.find((t) => t.id === 'maths:percentage')
const today = '2026-10-19'
ok(topicStatus(pct, {}, [], undefined, today) === 'not-started', 'nothing done: Not started')
ok(topicStatus(pct, { checks: { concept: true } }, [], undefined, today) === 'progress', 'one checkpoint: In progress')
const doneTask = { ...createTask({ date: today, exam: link('maths:percentage', 'practice') }), status: 'completed' }
ok(topicStatus(pct, {}, [doneTask], undefined, today) === 'progress', 'finishing one practice task does not complete the topic')
const all = { concept: true, notes: true, basic: true, moderate: true, pyq: true, test: true }
ok(topicStatus(pct, { checks: all }, [], undefined, today) === 'done', 'all required checkpoints: Completed')
ok(topicStatus(pct, { checks: { concept: true } }, [], ['concept'], today) === 'done', 'the person decides what counts as complete')
const lateRev = createTask({ date: '2026-10-10', exam: link('maths:percentage', 'revision') })
ok(topicStatus(pct, { checks: all }, [lateRev], undefined, today) === 'revise', 'completed with an overdue revision: Needs revision')
ok(topicStatus(pct, { checks: all, practice: [{ attempted: 20, correct: 8 }] }, [], undefined, today) === 'revise', 'weak accuracy: Needs revision')
ok(topicStatus(pct, { flag: 'revise' }, [], undefined, today) === 'revise', 'marked by the person: Needs revision')
const ca = BUILT_IN_TOPICS.find((t) => t.recurring)
ok(topicStatus(ca, { checks: all }, [], undefined, today) === 'ongoing', 'current affairs is never Completed')
const sum = summarize(SUBJECTS[0].topics, { 'maths:percentage': { checks: all }, 'maths:decimals': { checks: { concept: true, notes: true, basic: true } } }, [], undefined, new Date(2026, 9, 19))
ok(sum.finished === 1 && sum.counts.progress === 1 && sum.counts['not-started'] === 14 && Math.abs(sum.completion - 1.5 / 16) < 1e-9, 'maths summary from stored progress', JSON.stringify(sum.counts))

// ---- 4. revisions
const r1 = planRevisions({ topicId: 'maths:percentage', from: today, tasks: [] })
ok(same(r1.map((r) => r.date), ['2026-10-20', '2026-10-22', '2026-10-26', '2026-11-02', '2026-11-18']), 'default revisions after 1, 3, 7, 14 and 30 days', r1.map((r) => r.date).join(','))
const existing = [createTask({ id: revisionTaskId('maths:percentage', 1), date: '2026-10-20', exam: link('maths:percentage', 'revision') })]
const r2 = planRevisions({ topicId: 'maths:percentage', from: today, tasks: existing })
ok(r2.length === 4 && !r2.some((r) => r.n === 1), 'a revision that already exists is not created again')
const fullDay = [createTask({ date: '2026-10-20', durationMinutes: 230, exam: link('maths:decimals') })]
const r3 = planRevisions({ topicId: 'maths:percentage', from: today, tasks: fullDay, dailyMinutes: 240, minutes: 30 })
ok(r3[0].date === '2026-10-21', 'a revision moves to the next day with room in the daily study time', r3[0].date)
const r4 = planRevisions({ topicId: 'maths:percentage', from: today, tasks: [], intervals: [2, 2], minutes: 150, dailyMinutes: 240 })
ok(r4[0].date === '2026-10-21' && r4[1].date === '2026-10-22', 'two revisions never overload one day together', r4.map((r) => r.date).join(','))

// ---- 5. stored progress is cleaned and survives a reload
ok(same(cleanNtpc(null), emptyNtpc()) && same(cleanNtpc('junk'), emptyNtpc()), 'missing or broken progress loads as empty')
const messy = { category: 'graduate', required: ['concept', 'bogus'], topics: { 'maths:percentage': { checks: { concept: true, hack: true }, practice: [{ attempted: '12', correct: 9 }] } },
  ca: [{ date: '2026-10-18', headline: 'Item', url: 'javascript:alert(1)' }, { date: 'bad', headline: 'x' }], revision: { intervals: [0, 3, 'x', 400] } }
const c1 = cleanNtpc(messy)
ok(same(c1.required, ['concept']) && same(Object.keys(c1.topics['maths:percentage'].checks), ['concept']) && c1.topics['maths:percentage'].practice[0].attempted === 12, 'unknown checkpoints and fields are dropped')
ok(c1.ca.length === 1 && c1.ca[0].url === '', 'news with a bad date is dropped; only http(s) source links are kept')
ok(same(c1.revision.intervals, [3]), 'revision days outside 1–365 are dropped')
ok(same(cleanNtpc(c1), c1), 'cleaning is repeatable (same result twice)')
saveNtpc(c1)
ok(same(loadNtpc(), c1), 'progress survives a reload')

// ---- 6. existing tasks are unchanged; the exam link is kept
const old = { id: 'old1', title: 'Buy milk', date: '2026-10-19', durationMinutes: 15, category: 'personal', priority: 'low', status: 'todo', sessions: [] }
const study = { ...old, id: 's1', title: 'Learn: Percentage', exam: link('maths:percentage', 'learn') }
const bad = { ...old, id: 'b1', exam: { id: 5 } }
saveTasks([old, study, bad])
const [o, s, b] = loadTasks()
ok(o.exam === null && o.title === 'Buy milk' && o.priority === 'low' && o.category === 'personal' && o.durationMinutes === 15, 'an existing task loads as before (no exam link)')
ok(same(s.exam, link('maths:percentage', 'learn')), 'a study task keeps its exam, subject and topic')
ok(b.exam === null, 'a broken exam link is ignored')
const series = { ...createTask({ id: 'ntpc-ca-daily', title: 'Read current affairs', date: '2026-10-19', recurrence: { freq: 'daily', until: null, skip: [] }, exam: link('ga:national-current-affairs', 'reading') }), seriesId: 'ntpc-ca-daily' }
const more = ensureRecurrences([series], new Date(2026, 9, 19), 3)
ok(more.length === 3 && more.every((t) => t.exam?.topic === 'ga:national-current-affairs' && t.seriesId === 'ntpc-ca-daily'), 'each day of a repeating study task stays linked to its topic')

// ---- 7. the 40-day plan follows the brief
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const days = {}
for (const r of PLAN_ROWS) (days[r.day] ||= []).push(r)
ok(Object.keys(days).length === 40 && PLAN_ROWS[0].date === '2026-10-26' && PLAN_ROWS.at(-1).date === '2026-12-04', '40 days, 26 Oct (day 1) to 4 Dec (day 40)')
ok(days[1].every((r) => toMin(r.time) >= 20 * 60), 'day 1 uses the evening slot only')
const inSlots = PLAN_ROWS.every((r) => { const s = toMin(r.time), e = s + r.minutes; return (s >= 300 && e <= 450) || (s >= 1200 && e <= 1290) })
ok(inSlots, 'every task fits inside 05:00-07:30 or 20:00-21:30')
const noOverlap = Object.values(days).every((rs) => rs.every((a, i) => rs.every((b, j) => i === j || toMin(a.time) + a.minutes <= toMin(b.time) || toMin(b.time) + b.minutes <= toMin(a.time))))
ok(noOverlap, 'no two tasks overlap on a day')
const full = Object.entries(days).filter(([d]) => d !== '1').every(([, rs]) => rs.reduce((m, r) => m + r.minutes, 0) === 240)
ok(full, 'days 2-40 use all 4 hours (150 morning + 90 evening)')
ok(Object.values(days).every((rs) => rs.some((r) => /error notebook/i.test(r.title) && r.minutes === 5)), 'every day has 5 minutes for the error notebook')
const mockDays = Object.entries(days).filter(([, rs]) => rs.some((r) => /mock test/i.test(r.title))).map(([d]) => Number(d))
ok(same(mockDays, [7, 14, 18, 21, 25, 28, 29, 31, 33, 35, 37, 39]), 'diagnostic mock on day 7, two mocks a week in days 15-28, every second day from 29', mockDays.join(','))
ok([7, 14, 21, 28, 35].every((d) => days[d].some((r) => /weekly revision/i.test(r.title))), 'every 7th day has a weekly revision')
ok([29, 31, 33, 35, 37, 39].every((d) => days[d].filter((r) => /review/i.test(r.title)).reduce((m, r) => m + r.minutes, 0) === 120), 'each mock from day 29 gets 2 hours of review')
ok(new Set(PLAN_ROWS.map((r) => r.id)).size === PLAN_ROWS.length, 'every plan task has its own fixed id')
const known = new Set(BUILT_IN_TOPICS.map((t) => t.id))
ok(PLAN_ROWS.every((r) => !r.topic || known.has(r.topic)), 'every linked topic exists in the syllabus')
const sources = ['Rajesh Verma', 'R.S. Aggarwal', 'Kiran', 'NCERT', 'Lucent', 'AffairsCloud', 'Railway Adda247', 'Rakesh Yadav', 'Piyush Varshney', 'Parmar SSC']
ok(sources.every((s) => PLAN_ROWS.some((r) => r.notes.includes(s))), 'all ten sources are named in the notes')
const late = planTasks({ category: 'learning', fromDate: '2026-10-28' })
ok(late.length === PLAN_ROWS.filter((r) => r.date >= '2026-10-28').length && late.every((t) => t.date >= '2026-10-28' && t.exam.id === 'rrb-ntpc'), 'added late, days already past are left out')

// A plan from the exam date: 40 days ending the day before it, same ids, months counted back from its start.
const exam = planRows(startForExam('2027-03-15'))
ok(exam[0].date === '2027-02-03' && exam.at(-1).date === '2027-03-14', 'exam on 15 Mar 2027: plan runs 3 Feb to 14 Mar', `${exam[0].date}..${exam.at(-1).date}`)
ok(same(exam.map((r) => r.id), PLAN_ROWS.map((r) => r.id)), 'the same task ids whatever the start date')
ok(exam.some((r) => r.title === 'Current affairs: Feb 2027') && exam.some((r) => r.title === 'Revise CA: Jan-Feb 2027'), 'current-affairs months follow the start date')
ok(planRows(startForExam('2026-12-05')).every((r, i) => r.date === PLAN_ROWS[i].date && r.title === PLAN_ROWS[i].title), 'an exam on 5 Dec 2026 gives the first plan exactly')
ok(cleanNtpc({ planStart: '2027-02-03' }).planStart === '2027-02-03' && cleanNtpc({ planStart: 'x' }).planStart === null, 'the saved plan start is kept, and cleaned')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
