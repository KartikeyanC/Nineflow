// Tests for custom fields (src/lib/fields.js):  npm run test:fields
import { MAX_FIELDS, cleanFields, cleanTaskFields, cleanValue, sortKeyOf, withValue } from '../src/lib/fields.js'

let pass = 0, fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }

const fields = cleanFields([
  { id: 'stage', name: 'Stage', type: 'select', options: ['Idea', 'Draft', 'Draft', ' ', 'Ready'] },
  { id: 'words', name: 'Words', type: 'number' },
  { id: 'due', name: 'Publish on', type: 'date' },
  { id: 'paid', name: 'Paid', type: 'check' },
  { id: 'note', name: '  Note  ', type: 'nonsense' },
  { id: 'stage', name: 'Duplicate id', type: 'text' },
  null,
])
ok(fields.length === 5, 'fields are cleaned: a duplicate id and junk dropped', JSON.stringify(fields.map((f) => f.id)))
ok(fields[0].options.join() === 'Idea,Draft,Ready', 'dropdown options: no blanks, no repeats')
ok(fields[4].type === 'text' && fields[4].name === 'Note', 'an unknown type becomes text; names are trimmed')
ok(cleanFields(Array.from({ length: 15 }, (_, i) => ({ id: `f${i}`, name: 'x' }))).length === MAX_FIELDS, `at most ${MAX_FIELDS} fields`)

const [stage, words, due, paid, note] = fields
ok(cleanValue(words, '12.345') === 12.35 && cleanValue(words, 'abc') === undefined, 'numbers are read and rounded; text is not a number')
ok(cleanValue(due, '2026-11-06') === '2026-11-06' && cleanValue(due, '6 Nov') === undefined, 'dates must be yyyy-mm-dd')
ok(cleanValue(stage, 'Draft') === 'Draft' && cleanValue(stage, 'Gone') === undefined, 'a dropdown value must be one of its options')
ok(cleanValue(paid, true) === true && cleanValue(paid, 'yes') === undefined && cleanValue(paid, false) === undefined, 'a tick box is either ticked or empty')
ok(cleanValue(note, '  hi  there ') === 'hi there' && cleanValue(note, '') === undefined, 'text is trimmed; empty is no value')

const values = { stage: 'Gone', words: 900, paid: true, removed: 'x' }
const shown = cleanTaskFields(values, fields)
ok(JSON.stringify(shown) === JSON.stringify({ words: 900, paid: true }), 'a task shows only values that fit fields that exist', JSON.stringify(shown))
let v = withValue({ words: 900 }, stage, 'Ready')
ok(v.stage === 'Ready' && v.words === 900, 'setting one value keeps the others')
v = withValue(v, words, '')
ok(!('words' in v) && v.stage === 'Ready', 'clearing a value removes only that one')
ok(sortKeyOf(stage, 'Idea') < sortKeyOf(stage, 'Draft') && sortKeyOf(stage, 'Ready') < sortKeyOf(stage, undefined), 'dropdowns sort in the order of their options, empty last')
ok(sortKeyOf(words, undefined) === Infinity && sortKeyOf(note, undefined) > sortKeyOf(note, 'zzz'), 'empty values sort last')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
