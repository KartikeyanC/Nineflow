// Tests for a task's change history (src/lib/taskHistory.js):  npm run test:history
import { addChanges, cleanHistory, diffTask, withHistory } from '../src/lib/taskHistory.js'

let failed = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got); const w = JSON.stringify(want)
  if (g === w) console.log(`ok   ${name}`)
  else { failed++; console.log(`FAIL ${name}\n     got  ${g}\n     want ${w}`) }
}
const t0 = new Date('2026-11-12T10:00:00Z')
const later = (min) => new Date(t0.getTime() + min * 60000)
const base = { id: 'a', title: 'Report', status: 'todo', date: '2026-11-12', dueDate: '2026-11-14', durationMinutes: 30, priority: 'medium', category: 'work', history: [] }

eq('end day change is a change', diffTask(base, { ...base, dueDate: '2026-11-17' }), [{ field: 'dueDate', from: '2026-11-14', to: '2026-11-17' }])
eq('timer sessions are not noted', diffTask(base, { ...base, sessions: [{ start: 'x' }] }), [])
eq('several fields at once', diffTask(base, { ...base, status: 'working', priority: 'high' }).map((c) => c.field), ['status', 'priority'])

// Through the store's update
let list = [base]
list = withHistory(list, list.map((t) => ({ ...t, dueDate: '2026-11-17' })), t0)
eq('noted with the time', list[0].history, [{ at: t0.toISOString(), field: 'dueDate', from: '2026-11-14', to: '2026-11-17' }])
list = withHistory(list, list.map((t) => ({ ...t, dueDate: '2026-11-20' })), later(10))
eq('a later change is a new entry', list[0].history.map((e) => `${e.from}>${e.to}`), ['2026-11-14>2026-11-17', '2026-11-17>2026-11-20'])

// Typing a title: one entry, from the first to the last
let typing = [base]
for (const [i, s] of ['Repo', 'Report fo', 'Report for Q4'].entries()) typing = withHistory(typing, typing.map((t) => ({ ...t, title: s })), later(i * 0.1))
eq('typing folds into one entry', typing[0].history.map((e) => [e.field, e.from, e.to]), [['title', 'Report', 'Report for Q4']])
let back = withHistory(typing, typing.map((t) => ({ ...t, title: 'Report' })), later(0.5))
eq('typed back to where it began: no entry', back[0].history, [])

let quick = withHistory(list, list.map((t) => ({ ...t, dueDate: '2026-11-21' })), later(10.5))
eq('two end-day picks a minute apart are both kept', quick[0].history.length, 3)
eq('unchanged list is the same list', withHistory(list, list), list)
eq('new tasks get no entry', withHistory([], [base])[0].history, [])
eq('a removed task is just gone', withHistory([base], []), [])
eq('end day cleared', diffTask(base, { ...base, dueDate: null }), [{ field: 'dueDate', from: '2026-11-14', to: null }])
eq('limit', addChanges(Array.from({ length: 300 }, (_, i) => ({ at: t0.toISOString(), field: 'date', from: `${i}`, to: `${i + 1}` })), [{ field: 'title', from: 'a', to: 'b' }], later(60)).length, 300)
eq('cleanHistory drops junk', cleanHistory([{ at: 'x', field: 'dueDate', from: null, to: '2026-11-14' }, { field: 'nope' }, null, { at: 'y', field: 'title', from: {}, to: 'a' }]), [{ at: 'x', field: 'dueDate', from: null, to: '2026-11-14' }])

if (failed) { console.log(`\n${failed} failed`); process.exit(1) }
console.log('\nAll history tests passed')
