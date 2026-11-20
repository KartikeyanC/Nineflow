// Tests for profession days (src/lib/professions.js, src/lib/professionDay.js):  npm run test:profession
import { PROFESSIONS, professionById, professionFromOccupation } from '../src/lib/professions.js'
import { buildDailyTasks, clockOf, customiseDay, isRoutineTask, replaceRoutine, scheduleOf, shiftHours } from '../src/lib/professionDay.js'

let pass = 0, fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }
const titles = (ts) => ts.map((t) => t.title)
const day = (id, over = {}) => buildDailyTasks(professionById(id), { optionIndex: 0, startMinutes: 9 * 60, hours: 8, ...over })

// Hour filtering
const short = day('doctor', { hours: 6 })
ok(short.every((t) => t.offsetHours <= 6), 'tasks past the end of the day are dropped')
ok(!titles(short).includes('20 min of CME reading'), 'the 8-hour CME task is gone from a 6-hour day')
ok(titles(day('doctor')).includes('20 min of CME reading'), 'a task exactly at the end of the day stays')
ok(day('nurse', { hours: 6 }).length === 5 && day('nurse', { hours: 12 }).length === 7, 'a 6-hour nurse shift keeps 5 tasks, 12 hours keeps all 7')

// Sorting
const wards = day('doctor', { optionIndex: 1 })
const offs = wards.map((t) => t.offsetHours)
ok(offs.every((o, i) => i === 0 || offs[i - 1] <= o), 'sorted by time in the day', offs.join(','))
ok(titles(wards.filter((t) => t.offsetHours === 0)).join('|') === "Review today's appointments and new lab results|Ward rounds and handover review", 'base tasks come before variant tasks at the same time')
const reversed = { ...professionById('doctor'), baseTasks: [...professionById('doctor').baseTasks].reverse(), variantTasks: {} }
ok(buildDailyTasks(reversed, { optionIndex: 0, startMinutes: 540, hours: 8 }).map((t) => t.offsetHours).join(',') === '0,0.5,4,5,7,8', 'config written out of order is sorted')

// Variant merging
ok(titles(day('doctor')).includes('Call patients with abnormal reports') && !titles(day('doctor')).includes('Write discharge summaries'), 'only the chosen option adds its tasks')
const both = day('lawyer', { optionIndex: 2 })
ok(titles(both).includes('Court appearances') && titles(both).includes('Review contracts and due diligence') && both.length === 8, '"Both" gets both sets')
ok(day('teacher').length === 6 && day('teacher', { optionIndex: 2 }).length === 8, 'an option with no extras gives just the base tasks')
ok(day('other').length === 0 && day('other', { optionIndex: 1 }).length === 4, '"Something else" starts blank or with a starter routine')

// Clock times and midnight wrap
ok(day('doctor')[1].startTime === '09:30', 'time = start + offset (9:00 + 0.5 h = 09:30)')
ok(day('doctor', { startMinutes: 9 * 60 + 30 })[1].startTime === '10:00', 'a 9:30 start shifts everything by 30 minutes')
const night = day('nurse', { startMinutes: 19 * 60, hours: 12 })
const n = Object.fromEntries(night.map((t) => [t.title, t]))
ok(n['Receive handoff and review assigned patients'].startTime === '19:00' && n['Receive handoff and review assigned patients'].dayOffset === 0, 'a 7 pm shift starts at 19:00')
ok(n['Second medication round'].startTime === '00:00' && n['Second medication round'].dayOffset === 1, '7 pm + 5 h = midnight, the next day')
ok(n['Prepare handoff report'].startTime === '06:00' && night.at(-1).title === 'Prepare handoff report', 'shift order kept across midnight (06:00 is last)')
ok(clockOf(19 * 60, 4.5).minutes === 23 * 60 + 30 && clockOf(19 * 60, 5.5).minutes === 30 && clockOf(19 * 60, 5.5).dayOffset === 1, 'half hours wrap (11:30 pm, 12:30 am)')
ok(shiftHours('22:00', '06:00') === 8 && shiftHours('09:30', '18:30') === 9 && shiftHours('09:00', '09:00') === 24, 'shift length handles night shifts')

// Durations
const doc = day('doctor')
ok(doc[0].durationMinutes === 30 && doc[1].durationMinutes === 210, 'a task runs until the next one (0 → 0.5 h = 30 min, 0.5 → 4 h = 210 min)', doc.slice(0, 2).map((t) => t.durationMinutes).join(','))
ok(doc.at(-1).durationMinutes === 30, 'a task at the very end of the day gets 30 minutes')
ok(day('it-employee')[2].durationMinutes === 240, 'durations are capped at 4 hours')

// Scheduling into the calendar
const thu = new Date(2026, 10, 19), sat = new Date(2026, 10, 21)
const wk = scheduleOf(day('doctor'), { today: thu, workingDays: [1, 2, 3, 4, 5] })
ok(wk.every((t) => t.freq === 'weekdays' && t.date === '2026-11-19'), 'Monday to Friday repeats on weekdays, starting today')
ok(scheduleOf(day('doctor'), { today: sat, workingDays: [1, 2, 3, 4, 5] })[0].date === '2026-11-23', 'on a weekend, a weekday routine starts on Monday')
const monSat = scheduleOf(day('doctor'), { today: thu, workingDays: [1, 2, 3, 4, 5, 6] })
ok(monSat.length === 7 * 6 && monSat.every((t) => t.freq === 'weekly'), 'a Monday–Saturday week gets one weekly series per working day (7 tasks × 6 days)', `${monSat.length}`)
ok(monSat[0].date === '2026-11-19' && !monSat.some((t) => new Date(`${t.date}T12:00`).getDay() === 0), 'it starts today and never lands on Sunday')
ok(scheduleOf(day('doctor'), { today: sat, workingDays: [0, 1, 2, 3, 4, 5, 6] })[0].freq === 'daily', 'a 7-day week repeats daily')
const nightWk = scheduleOf(night, { today: thu, workingDays: [1, 2, 3, 4, 5] })
const lateDays = nightWk.filter((t) => t.title === 'Second medication round').map((t) => new Date(`${t.date}T12:00`).getDay()).sort()
ok(lateDays.join(',') === '2,3,4,5,6' && nightWk.filter((t) => t.title === 'Second medication round').every((t) => t.freq === 'weekly'), 'Mon–Fri night shifts: after-midnight tasks repeat Tue–Sat mornings, weekly per shift', lateDays.join(','))
ok(nightWk.filter((t) => t.title.startsWith('Receive handoff')).length === 1 && nightWk.find((t) => t.title.startsWith('Receive handoff')).freq === 'weekdays', 'before-midnight tasks of a night shift still repeat on weekdays')
const sched = scheduleOf(night, { today: thu, workingDays: [0, 1, 2, 3, 4, 5, 6] })
ok(sched.find((t) => t.title === 'Second medication round').date === '2026-11-20' && sched[0].date === '2026-11-19', 'after-midnight tasks land on the next calendar day')

// Editing and adding on the preview screen
const base = day('doctor') // 9:00 start
const custom = customiseDay(base, {
  edits: { [base[0].key]: { title: '  Check labs  ', startTime: '13:15' } },
  added: [{ key: 'added:1', title: 'Gym', startTime: '08:00' }, { key: 'added:2', title: '   ', startTime: '10:00' }],
}, 9 * 60, 8)
const lab = custom.find((t) => t.title === 'Check labs')
ok(lab && lab.startTime === '13:15' && lab.offsetHours === 4.25, 'an edit changes the title (trimmed) and re-times the task', JSON.stringify(lab))
ok(custom.map((t) => t.offsetHours).every((o, i, a) => i === 0 || a[i - 1] <= o), 'the list is re-sorted after an edit')
const gym = custom.find((t) => t.title === 'Gym')
ok(gym && gym.offsetHours === -1 && gym.dayOffset === 0 && gym.startTime === '08:00' && gym.category === 'My tasks', 'a task added before work stays that morning (8:00 on a 9:00 day)', JSON.stringify(gym))
ok(custom[0].title === 'Gym', 'and sorts first')
const evening = customiseDay(base, { added: [{ key: 'a', title: 'Dinner', startTime: '20:00' }] }, 540, 8).find((t) => t.title === 'Dinner')
ok(evening.offsetHours === 11 && evening.dayOffset === 0, 'a task after work stays that evening')
const beforeNight = customiseDay(night, { added: [{ key: 'a', title: 'School run', startTime: '08:00' }] }, 19 * 60, 12).find((t) => t.title === 'School run')
ok(beforeNight.offsetHours === -11 && beforeNight.dayOffset === 0, 'on a 7 pm–7 am shift, 08:00 is the morning before the shift, not after it')
ok(!custom.some((t) => t.key === 'added:2'), 'an added task with no title is ignored')
ok(customiseDay(base, { edits: {}, added: [] }, 540).length === base.length && customiseDay(base, undefined, 540).length === base.length, 'no changes gives the same day')
const nightEdit = customiseDay(night, { edits: { [night[0].key]: { startTime: '01:30' } } }, 19 * 60, 12).find((t) => t.key === night[0].key)
ok(nightEdit.offsetHours === 6.5 && nightEdit.dayOffset === 1 && nightEdit.startTime === '01:30', 'on a 7 pm shift, 01:30 is after midnight (6.5 h in)')

// Changing profession: swap the routine, never the user's own tasks
const R = (id, date, status = 'todo') => ({ id, date, status, fields: { source: 'profession:nurse' } })
const own = (id, date, status = 'todo') => ({ id, date, status, fields: {} })
const before = [R('past', '2026-11-18'), R('today', '2026-11-20'), R('later', '2026-11-25'), R('done', '2026-11-20', 'completed'),
  R('working', '2026-11-20', 'working'), own('mine', '2026-11-20'), own('mine-later', '2026-11-30'), { id: 'bare', date: '2026-11-21', status: 'todo' }]
const swapped = replaceRoutine(before, [{ id: 'new1', fields: { source: 'profession:doctor' } }], '2026-11-20')
const ids = swapped.tasks.map((t) => t.id)
ok(swapped.removed === 2 && !ids.includes('today') && !ids.includes('later'), 'upcoming to-do routine tasks are replaced', ids.join(','))
ok(['mine', 'mine-later', 'bare'].every((i) => ids.includes(i)), "the user's own tasks are untouched")
ok(['past', 'done', 'working'].every((i) => ids.includes(i)), 'past days and routine tasks already started or done stay')
ok(ids.at(-1) === 'new1' && swapped.tasks.length === before.length - 2 + 1, 'the new routine is added')
const series = [
  { id: 'a1', seriesId: 'S', date: '2026-11-19', status: 'completed', recurrence: { freq: 'daily', until: null, skip: [] }, fields: { source: 'profession:nurse' } },
  { id: 'a2', seriesId: 'S', date: '2026-11-20', status: 'completed', recurrence: { freq: 'daily', until: null, skip: [] }, fields: { source: 'profession:nurse' } },
  { id: 'a3', seriesId: 'S', date: '2026-11-21', status: 'todo', recurrence: { freq: 'daily', until: null, skip: [] }, fields: { source: 'profession:nurse' } },
  { id: 'm1', seriesId: 'M', date: '2026-11-20', status: 'todo', recurrence: { freq: 'daily', until: null, skip: [] }, fields: {} },
]
const ended = replaceRoutine(series, [], '2026-11-20').tasks
ok(ended.filter((t) => t.seriesId === 'S').every((t) => t.recurrence.until === '2026-11-20') && !ended.some((t) => t.id === 'a3'), "an old routine series ends at its last kept task, so it can't grow back", JSON.stringify(ended.map((t) => [t.id, t.recurrence.until])))
ok(ended.find((t) => t.id === 'm1').recurrence.until === null, "the user's own repeating tasks keep repeating")
ok(isRoutineTask(R('x', '2026-11-20')) && !isRoutineTask(own('y', '2026-11-20')) && !isRoutineTask({}) && !isRoutineTask(null), 'routine tasks are told apart by their source tag')

// Every profession builds
let allOk = true
for (const p of PROFESSIONS) for (let i = 0; i < p.setupQuestion.options.length; i++) {
  const a = buildDailyTasks(p, { optionIndex: i, startMinutes: 540, hours: 12 })
  if (new Set(a.map((t) => t.key)).size !== a.length || JSON.stringify(a) !== JSON.stringify(buildDailyTasks(p, { optionIndex: i, startMinutes: 540, hours: 12 }))) allOk = false
}
ok(allOk, 'every profession and option builds the same day twice, with unique keys')
ok(PROFESSIONS.length === 12 && professionById('student').examIds.length === 3, '12 professions; Student maps its 3 options to exams')
ok(professionFromOccupation('Developer') === 'it-employee' && professionFromOccupation('Manager') === 'other', 'old occupations map to a profession')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
