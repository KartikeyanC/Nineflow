// Tests for spoken changes to a task list (src/lib/voiceCommands.js) and Speak tasks:  npm run test:voice
import { parseCommand, resolveTargets } from '../../src/lib/voiceCommands.js'
import { applySpokenCommands, spokenToTasks } from '../../src/lib/voiceTasks.js'

let failed = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got); const w = JSON.stringify(want)
  if (g === w) console.log(`ok   ${name}`)
  else { failed++; console.log(`FAIL ${name}\n     got  ${g}\n     want ${w}`) }
}

// What a said change means
const kind = (s) => { const c = parseCommand(s); return c && [c.type, c.target.kind, c.target.list || c.target.words || null] }
eq('delete the row', kind('delete the row'), ['remove', 'last', null])
eq('delete the last one', kind('Delete the last one.'), ['remove', 'last', null])
eq('remove that', kind('remove that'), ['remove', 'last', null])
eq('delete it', kind('delete it'), ['remove', 'last', null])
eq('remove task 2', kind('remove task 2'), ['remove', 'index', [2]])
eq('delete task to', kind('delete task to'), ['remove', 'index', [2]])
eq('delete the second one', kind('delete the second one'), ['remove', 'index', [2]])
eq('delete task one', kind('delete task one'), ['remove', 'index', [1]])
eq('delete one', kind('delete one'), ['remove', 'index', [1]])
eq('delete row 2 and 3', kind('delete row 2 and 3'), ['remove', 'index', [2, 3]])
eq('delete rows 1, 4 and 5', kind('delete rows 1, 4 and 5'), ['remove', 'index', [1, 4, 5]])
eq('delete number three', kind('delete number three'), ['remove', 'index', [3]])
eq('delete all', kind('delete all'), ['remove', 'all', null])
eq('remove all the tasks', kind('remove all the tasks'), ['remove', 'all', null])
eq('delete call mom', kind('delete call mom'), ['remove', 'match', 'call mom'])
eq('bring back task 2', kind('bring back task 2'), ['restore', 'index', [2]])
eq('undo', kind('undo'), ['restore', 'undo', null])
eq('a task is not a change', kind('call mom at 6'), null)

// Which rows
const titles = ['Revise polity', 'Mock test', 'Call mom']
const rows = (s, off = [], history = []) => resolveTargets(parseCommand(s), titles, { isOn: (i) => !off.includes(i), history })
eq('last = last ticked row', rows('delete the last one', [2]), [1])
eq('by name', rows('delete mock test'), [1])
eq('by close name', rows('remove mom'), [2])
eq('no such name', rows('delete the gym'), [])
eq('bring back last removed', rows('bring back that', [0, 2], [2, 0]), [0])
eq('undo', rows('undo', [1], [1]), [1])
eq('index out of range', rows('delete task 9'), [])

// While dictating
const said = (s) => spokenToTasks(s, { now: new Date(2026, 10, 6, 9) }).map((t) => t.title)
eq('delete that while dictating', said('call mom next buy milk next delete that next revise polity'), ['Call mom', 'Revise polity'])
eq('delete the row', said('call mom then buy milk then delete the row'), ['Call mom'])
eq('delete by number', said('call mom next buy milk next pay rent next remove task 2'), ['Call mom', 'Pay rent'])
eq('delete by name', said('call mom next buy milk next delete call mom'), ['Buy milk'])
eq('undo a delete', said('call mom next buy milk next delete that next undo'), ['Call mom', 'Buy milk'])
eq('a real task that starts with cancel', said('call mom next cancel the gym membership'), ['Call mom', 'Cancel the gym membership'])
eq('nothing to delete yet', said('delete the last one next call mom'), ['Call mom'])
eq('typed note left alone for AI', applySpokenCommands('write copy, fix mobile layout'), 'write copy, fix mobile layout')
eq('changes applied for AI', applySpokenCommands('write copy next fix layout next delete that'), 'write copy')

if (failed) { console.log(`\n${failed} failed`); process.exit(1) }
console.log('\nAll voice tests passed')
