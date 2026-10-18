// Tests for the RRB NTPC module (src/exams/ntpc) and the task fields it adds:  npm run test:ntpc
import './globals.mjs'
import { BUILT_IN_TOPICS, SUBJECTS } from '../../src/exams/ntpc/syllabus.js'
import { accuracy, isWeak, planRevisions, practiceTotals, revisionTaskId, summarize, topicStatus } from '../../src/exams/ntpc/calc.js'
import { cleanNtpc, emptyNtpc, loadNtpc, saveNtpc, topicsOf } from '../../src/exams/ntpc/store.js'
import { loadTasks, saveTasks } from '../../src/lib/storage.js'
import { ensureRecurrences } from '../../src/lib/recurrence.js'
import { createTask } from '../../src/lib/tasks.js'

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
