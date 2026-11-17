// Tests for transfer files (src/lib/transfer.js): what goes in, locking, checking, fitting in.
//   npm run test:transfer
import { FORMAT, TransferError, buildBundle, makeFile, mergeWorkFor, openFile, readHead, summary, tasksForPlanner } from '../../src/lib/transfer.js'

let pass = 0, fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }
const throwsT = async (fn, has) => { try { await fn(); return false } catch (e) { return e instanceof TransferError && (!has || e.message.includes(has)) } }

const now = new Date('2026-11-17T10:00:00Z')
const task = (o) => ({
  id: o.id, title: o.title || o.id, description: '', date: '2026-11-17', startDate: '2026-11-17', dueDate: null, startTime: null, durationMinutes: 30,
  category: 'work', priority: 'medium', status: 'todo', startedAt: null, completedAt: null, createdAt: '2026-10-01T09:00:00Z', sessions: [{ start: 'x', end: 'y' }],
  subtasks: [], requireRule: 'all', tags: [], client: 'Acme', billable: true, private: false, askedBy: '', why: '', seriesId: null, recurrence: null,
  hold: null, files: [], history: [], dropped: null, fields: { f1: 'secret' }, column: 'col-x', reminders: [10], ...o,
})
const tasks = [
  task({ id: 'a', title: 'Fix banner', why: 'Old sale banner', askedBy: 'Priya', subtasks: [{ id: 's1', title: 'Draft', done: true, depth: 0 }], status: 'working' }),
  task({ id: 'b', title: 'Waiting on legal', hold: { reason: 'Waiting on someone', since: '2026-11-10', until: null } }),
  task({ id: 'p', title: 'My salary review', private: true }),
  task({ id: 'd', title: 'Dropped one', dropped: { reason: 'Not needed', at: '2026-11-01T00:00:00Z' } }),
  task({ id: 'old', title: 'Finished long ago', status: 'completed', completedAt: '2025-01-01T00:00:00Z' }),
  task({ id: 'recent', title: 'Finished last month', status: 'completed', completedAt: '2026-10-20T00:00:00Z' }),
  task({ id: 'r1', title: 'Weekly report', seriesId: 'r1', recurrence: { freq: 'weekly', until: null, skip: [] }, date: '2026-11-16' }),
  task({ id: 'r2', title: 'Weekly report', seriesId: 'r1', recurrence: { freq: 'weekly', until: null, skip: [] }, date: '2026-11-23' }),
  task({ id: 'other', title: 'Globex thing', client: 'Globex' }),
]
const settings = {
  categories: [{ id: 'work', name: 'Work' }, { id: 'design', name: 'Design' }],
  workFor: { colors: { Acme: 'mint' }, notes: { Acme: 'Files are in the Acme drive.' }, people: { Acme: [{ who: 'Priya', role: 'Marketing', contact: 'p@acme.test' }] }, glossary: { Acme: [{ term: 'PR', meaning: 'Press release' }] } },
  billing: { clients: { Acme: { rate: 2000 } } },
}

// ---- 1. what goes in
const b = buildBundle({ tasks, settings, name: 'Acme', from: 'Kartik', now })
const ids = b.tasks.map((t) => t.id)
ok(!ids.includes('p'), 'personal tasks stay out')
ok(!ids.includes('d'), 'dropped tasks stay out')
ok(!ids.includes('other'), 'other companies stay out')
ok(!ids.includes('old') && ids.includes('recent'), 'finished work only from the last year')
ok(ids.includes('r1') && ids.includes('r2'), 'repeating duties go in')
ok(b.tasks.every((t) => !('sessions' in t) && !('fields' in t) && !('column' in t) && !('reminders' in t)), 'no time logs, custom fields, columns or reminders')
ok(!JSON.stringify(b).includes('2000'), 'no hourly rate')
ok(b.tasks.find((t) => t.id === 'a').category === 'Work', 'categories travel by name')
ok(b.notes && b.people.length === 1 && b.glossary.length === 1 && b.color === 'mint', 'notes, people, words and colour go in')

// ---- 2. locking
const locked = await makeFile(b, 'correct horse')
const head = readHead(locked)
ok(head.locked && head.file.format === FORMAT, 'a locked file says it is a locked transfer')
ok(!locked.includes('Fix banner') && !locked.includes('Priya') && !locked.includes('Acme'), 'nothing readable without the password')
ok(await throwsT(() => openFile(locked, 'wrong pass'), "doesn't open"), 'a wrong password is refused')
ok(await throwsT(() => openFile(locked, ''), 'Enter the password'), 'no password asks for one')
const opened = await openFile(locked, 'correct horse')
ok(opened.name === 'Acme' && opened.tasks.length === b.tasks.length && opened.from === 'Kartik', 'the right password opens it whole')
const tampered = JSON.parse(locked); tampered.data = tampered.data.slice(0, -8) + 'AAAAAAA='
ok(await throwsT(() => openFile(JSON.stringify(tampered), 'correct horse')), 'a changed file is refused')
ok(await throwsT(() => makeFile(b, '123')), 'short passwords are refused')
const plain = await makeFile(b, '')
ok(!readHead(plain).locked && (await openFile(plain)).tasks.length === b.tasks.length, 'an unlocked file opens without a password')

// ---- 3. checking untrusted files
ok(await throwsT(() => openFile('not json'), "isn't a NineFlow"), 'not JSON')
ok(await throwsT(() => openFile(JSON.stringify({ format: 'other' })), "isn't a NineFlow"), 'another format')
ok(await throwsT(() => openFile(JSON.stringify({ format: FORMAT, v: 99 })), 'newer NineFlow'), 'a newer version')
const evil = await openFile(JSON.stringify({ format: FORMAT, v: 1, locked: false, bundle: {
  name: 'Acme', from: 'x'.repeat(500), notes: 'n', people: [{ who: 'A' }, 'junk', null], glossary: [{ term: 'T', meaning: 'M' }],
  tasks: [
    { id: 'e1', title: 'T'.repeat(1000), description: 'D'.repeat(10000), status: 'hacked', priority: 'urgent', recurrence: { freq: 'hourly' }, files: [{ id: 'f', name: 'x', url: 'javascript:alert(1)' }], date: '2026-13-45', durationMinutes: 1e9, __proto__x: 1, interruption: { by: 'x' }, exam: { id: 'x', topic: 'y' } },
    { id: '', title: 'no id' }, { id: 'e3', title: '   ' }, 'not a task',
  ] } }))
const e1 = evil.tasks[0]
ok(evil.tasks.length === 1 && evil.skipped === 3, 'broken tasks are left out and counted', `${evil.tasks.length} ${evil.skipped}`)
ok(e1.title.length === 200 && e1.description.length === 4000 && evil.from.length === 80, 'long text is cut to size')
ok(e1.status === 'todo' && e1.priority === 'medium' && e1.recurrence === null && e1.date === null && e1.durationMinutes === 1440, 'unknown values fall back to safe ones')
ok(!('interruption' in e1) && !('exam' in e1), 'fields a transfer never carries are dropped')
ok(evil.people.length === 1, 'junk people rows are dropped')

// ---- 4. fitting in
const mine = [{ id: 'keep-me', title: 'My own', client: 'Acme' }]
const fitted = tasksForPlanner(opened, { as: 'Acme', categories: [{ id: 'mywork', name: 'work' }, { id: 'x', name: 'Other' }], takenIds: new Set(mine.map((t) => t.id)), now })
ok(fitted.every((t) => !b.tasks.some((o) => o.id === t.id) && t.id !== 'keep-me'), 'every task gets a new id')
const reps = fitted.filter((t) => t.title === 'Weekly report')
ok(reps.length === 2 && reps[0].seriesId && reps[0].seriesId === reps[1].seriesId && reps[0].seriesId !== 'r1', 'a repeating series stays one series')
const fa = fitted.find((t) => t.title === 'Fix banner')
ok(fa.status === 'todo' && fa.sessions.length === 0 && fa.category === 'mywork', 'Working goes back to To do; categories matched by name', `${fa.status} ${fa.category}`)
ok(fa.handedOver?.from === 'Kartik' && fa.why === 'Old sale banner' && fa.askedBy === 'Priya' && fa.subtasks[0].title === 'Draft', 'who it came from, why, asked by and steps arrive')
ok(fitted.every((t) => t.client === 'Acme' && t.private === false), 'all under the chosen name')
ok(fitted.find((t) => t.title === 'Waiting on legal').hold?.reason === 'Waiting on someone', 'paused stays paused')
const s = summary(opened)
ok(s.open === 2 && s.duties === 1 && s.finished === 1, 'the summary counts open, duties and finished', JSON.stringify(s))

// ---- 5. merging the notes
const merged = mergeWorkFor({ colors: { Acme: 'sky' }, notes: { Acme: 'My own note' }, people: { Acme: [{ who: 'priya', role: '', contact: '' }] }, archived: ['Acme'] }, opened, 'Acme')
ok(merged.colors.Acme === 'sky', 'their own colour stays')
ok(merged.notes.Acme.startsWith('My own note') && merged.notes.Acme.includes('From Kartik:') && merged.notes.Acme.includes('Acme drive'), 'notes are added after their own')
ok(merged.people.Acme.length === 1, 'the same person is not listed twice')
ok(merged.glossary.Acme.length === 1 && !merged.archived.includes('Acme'), 'words added, and taking it over brings it back from archived')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
