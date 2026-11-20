// Tests for the module registry (src/lib/modules.js):  npm run test:modules
import { SECTIONS, TOOLS, checklistItems, roomLeft, sectionOn, toolsFor } from '../src/lib/modules.js'
import { PROFESSIONS, professionById } from '../src/lib/professions.js'

let pass = 0, fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }

// Sections: exactly the old behaviour of the four hand-written checks
const on = { modules: { work: true, ntpc: false } }
ok(sectionOn(on, 'work') && !sectionOn(on, 'ntpc'), 'Work OS and the exam follow settings.modules')
ok(sectionOn(on, 'dashboard') && sectionOn(on, 'board') && sectionOn(on, 'settings'), 'screens that are not sections are always shown')
ok(!sectionOn({}, 'work') && !sectionOn(undefined, 'ntpc') && sectionOn(undefined, 'week'), 'missing settings: sections off, everything else on')
ok(sectionOn({ modules: { ntpc: true } }, 'ntpc'), 'turning the exam on shows it')
ok(SECTIONS.work.defaultOn === true && SECTIONS.ntpc.defaultOn === false, 'defaults match storage.js (work on, exam off)')

// Tools
const ids = PROFESSIONS.flatMap((p) => p.modules)
const missing = ids.filter((id) => !TOOLS[id])
ok(missing.length === 0, 'every module a profession lists exists in TOOLS', missing.join(','))
ok(Object.keys(TOOLS).every((id) => id.length <= 24 && id === id.toLowerCase()), 'tool ids fit as task tags (lower case, 24 characters)')
ok(Object.values(TOOLS).every((t) => (t.kind === 'view' ? typeof t.view === 'string' : t.kind === 'checklist')), 'each tool is a view with a screen, or a checklist')
ok(toolsFor(professionById('doctor')).map((t) => t.id).join(',') === 'patient-queue,pending-notes,follow-up-reminders', "a profession's tools come in its own order")
ok(toolsFor(professionById('other')).length === 0 && toolsFor(undefined).length === 0 && toolsFor({ modules: ['nope'] }).length === 0, 'no profession or unknown ids give no tools')
ok(toolsFor(professionById('student'))[0].view === 'ntpc', "Student's tool opens the exam section")

// Checklists
const T = (id, tags, status = 'todo', extra = {}) => ({ id, tags, status, createdAt: `2026-11-20T0${id.length}:00`, ...extra })
const tasks = [
  T('a', ['patient-queue']), T('bb', ['patient-queue', 'urgent']), T('c', ['other']),
  T('dddd', ['patient-queue'], 'completed', { completedAt: '2026-11-20T10:00:00Z' }),
  T('eeeee', ['patient-queue'], 'completed', { completedAt: '2026-11-19T10:00:00Z' }),
  T('ff', ['patient-queue'], 'todo', { hold: { reason: 'x' } }), T('ggg', ['patient-queue'], 'working'),
]
const items = checklistItems(tasks, 'patient-queue', '2026-11-20')
ok(items.map((t) => t.id).join(',') === 'a,bb,ggg,dddd', 'open items first (oldest first), then done today; other tags, old done and paused left out', items.map((t) => t.id).join(','))
ok(checklistItems(undefined, 'x', '2026-11-20').length === 0, 'no tasks, no items')
ok(roomLeft(TOOLS['top-priorities'], [T('1', []), T('2', [])]) === 1 && roomLeft(TOOLS['top-priorities'], [T('1', [], 'completed')]) === 3, 'Top 3 counts only open items')
ok(roomLeft(TOOLS['patient-queue'], items) === Infinity, 'other checklists have no limit')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
