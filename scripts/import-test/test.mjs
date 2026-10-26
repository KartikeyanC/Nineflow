// Tests for importing tasks from CSV, Excel and pasted rows (src/lib/taskImport.js, src/lib/xlsx.js):
//   npm run test:import
import fs from 'node:fs'
import path from 'node:path'
import { mapHeadings, parseCsv, parseDate, parseDuration, parsePriority, parseTime, readTable, rowId, sameTask, toTask } from '../../src/lib/taskImport.js'
import { readXlsx } from '../../src/lib/xlsx.js'
import { PLAN_ROWS } from '../../src/exams/ntpc/plan40.js'

let pass = 0, fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const root = path.resolve(import.meta.dirname, '..', '..')

// ---- 1. the real 40-day plan CSV
const csvFile = path.join(root, 'release', 'rrb-ntpc-40-day-plan.csv')
if (fs.existsSync(csvFile)) {
  const t = readTable(parseCsv(fs.readFileSync(csvFile, 'utf8')))
  ok(!t.error && t.items.length === 204, 'the 40-day plan CSV gives 204 tasks', t.error || t.items.length)
  ok(t.items.every((it, i) => it.title === PLAN_ROWS[i].title && it.date === PLAN_ROWS[i].date && it.startTime === PLAN_ROWS[i].time && it.durationMinutes === PLAN_ROWS[i].minutes),
    'every task keeps its name, date, start time and duration')
  ok(t.items.every((it) => it.problems.length === 0), 'no row has a problem')
  ok(t.items[2].notes.includes('question, your error') && t.items[0].priority === 'high' && t.items[0].subject === 'Maths', 'quoted notes, priority and subject come through')
} else ok(false, 'release/rrb-ntpc-40-day-plan.csv exists (node scripts/ntpc-plan-csv.mjs)')

// ---- 2. CSV details
const rows = parseCsv('﻿Task,Date,Notes\r\n"Read, then revise",26-10-2026,"line one\nline ""two"""\r\n\r\nNext,27/10/2026,\r\n')
ok(rows.length === 3 && rows[1][0] === 'Read, then revise' && rows[1][2] === 'line one\nline "two"', 'quoted commas, quotes and line breaks; blank lines and BOM ignored', JSON.stringify(rows))
ok(same(parseCsv('Task;Date\nA;26.10.2026')[1], ['A', '26.10.2026']), 'semicolon-separated files')
ok(same(parseCsv('Task name\tDate\tStart time\nMaths\t26-10-2026\t5:00 AM')[1], ['Maths', '26-10-2026', '5:00 AM']), 'rows pasted from Excel or Sheets (tabs)')
const m = mapHeadings(['Task name', 'Date', 'Start time', 'Duration (minutes)', 'Subject', 'Priority', 'Notes (book or YouTube channel)'])
ok(same(m, { title: 0, date: 1, time: 2, duration: 3, subject: 4, priority: 5, notes: 6 }), 'your column headings are recognised', JSON.stringify(m))
ok(same(mapHeadings(['Title', 'Due date', 'Time', 'Minutes', 'Category', 'Description']), { title: 0, date: 1, time: 2, duration: 3, subject: 4, notes: 5 }), 'other common headings too')
ok(readTable([['Date', 'When']]).error?.startsWith('No task column'), 'a file without a task column says so')

// ---- 3. values
const dates = { '2026-10-26': '2026-10-26', '26-10-2026': '2026-10-26', '26/10/2026': '2026-10-26', '26.10.26': '2026-10-26', '10/26/2026': '2026-10-26', '26 Oct 2026': '2026-10-26', 'Mon, 26 October 2026': '2026-10-26', 'Oct 26, 2026': '2026-10-26', '26th Oct 2026': '2026-10-26', 46321: '2026-10-26', '31/02/2026': null, 'soon': null }
ok(Object.entries(dates).every(([k, v]) => parseDate(isNaN(k) ? k : Number(k)) === v), 'dates: Indian, ISO, in words and Excel numbers; impossible dates refused',
  Object.entries(dates).filter(([k, v]) => parseDate(isNaN(k) ? k : Number(k)) !== v).map(([k]) => `${k}=>${parseDate(isNaN(k) ? k : Number(k))}`).join(' '))
const times = { '05:00': '05:00', '5:00': '05:00', '5 AM': '05:00', '8:00 PM': '20:00', '12 am': '00:00', '12:30 pm': '12:30', '20:00:00': '20:00', 0.2083333: '05:00', '25:00': null, '5': null }
ok(Object.entries(times).every(([k, v]) => parseTime(k === '0.2083333' ? 0.2083333 : k) === v), 'times: 24-hour, AM/PM and Excel times',
  Object.entries(times).filter(([k, v]) => parseTime(k === '0.2083333' ? 0.2083333 : k) !== v).map(([k]) => k).join(' '))
const durs = { 90: 90, '90 min': 90, '1h 30m': 90, '1.5 h': 90, '1:30': 90, '2 hours': 120, '0': null, 'long': null }
ok(Object.entries(durs).every(([k, v]) => parseDuration(k) === v), 'durations in minutes, hours or h:mm')
ok(parsePriority('High') === 'high' && parsePriority('P2') === 'medium' && parsePriority('3') === 'low' && parsePriority('urgent') === 'high' && parsePriority('') === null, 'priorities')
const bad = readTable([['Task', 'Date', 'Start time', 'Duration'], ['Revise', '31/31/2026', 'noon', 'long']])
ok(bad.items[0].date === null && bad.items[0].problems.length === 3, 'a row with unreadable values is kept and its problems listed', JSON.stringify(bad.items[0].problems))

// ---- 4. duplicates and tasks
ok(rowId('Maths', '2026-10-26', '05:00') === rowId('maths', '2026-10-26', '05:00') && rowId('Maths', '2026-10-26', '05:00') !== rowId('Maths', '2026-10-27', '05:00'), 'the same row always gets the same id')
ok(sameTask({ title: 'Mock test 2 ', date: '2026-11-08', startTime: '05:00' }, { title: 'mock test 2', date: '2026-11-08', startTime: '05:00' }), 'a task already in the planner (same name, day, time) is recognised')
const cats = [{ id: 'work', name: 'Work' }, { id: 'learning', name: 'Learning' }]
const t1 = toTask({ id: 'x', title: 'A', date: '2026-10-26', startTime: '05:00', durationMinutes: 90, priority: 'high', subject: 'Learning', notes: 'n' }, { categories: cats, fallbackCategory: 'work' })
const t2 = toTask({ id: 'y', title: 'B', date: null, startTime: null, durationMinutes: null, priority: null, subject: 'General Awareness', notes: '' }, { categories: cats, fallbackCategory: 'learning', examLink: () => ({ id: 'rrb-ntpc', subject: 'ga', topic: 'plan:general', kind: 'learn' }) })
ok(t1.category === 'learning' && same(t1.tags, ['imported']) && t1.durationMinutes === 90 && t1.startTime === '05:00', 'a Subject that names a category picks it')
ok(t2.category === 'learning' && same(t2.tags, ['imported', 'general-awareness']) && t2.priority === 'medium' && !('durationMinutes' in t2) && t2.exam.subject === 'ga', 'otherwise it becomes a tag; empty fields get the usual defaults')

// ---- 5. Excel (.xlsx), built here: a zip of the sheet's XML
async function zip(entries) {
  const enc = new TextEncoder()
  const parts = [], central = []
  let offset = 0
  for (const [name, text, deflate] of entries) {
    const raw = enc.encode(text)
    const data = deflate ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : raw
    const nm = enc.encode(name)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(8, deflate ? 8 : 0, true); local.setUint32(18, data.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, nm.length, true)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(10, deflate ? 8 : 0, true); cd.setUint32(20, data.length, true); cd.setUint32(24, raw.length, true); cd.setUint16(28, nm.length, true); cd.setUint32(42, offset, true)
    parts.push(new Uint8Array(local.buffer), nm, data); central.push(new Uint8Array(cd.buffer), nm)
    offset += 30 + nm.length + data.length
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer()
}
const sheet = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" s="1"><v>46321</v></c><c r="C2" s="2"><v>0.20833333333333334</v></c><c r="D2"><v>90</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Reasoning &amp; puzzles</t></is></c><c r="B3" t="str"><v>27-10-2026</v></c><c r="D3"><v>45</v></c></row>
</sheetData></worksheet>`
const strings = '<sst><si><t>Task name</t></si><si><t>Date</t></si><si><t>Start time</t></si><si><t>Duration (minutes)</t></si><si><r><t>Number </t></r><r><t>System</t></r></si></sst>'
const xbuf = await zip([
  ['xl/workbook.xml', '<workbook><sheets><sheet name="Plan" sheetId="1" r:id="rId1"/></sheets></workbook>', false],
  ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>', false],
  ['xl/sharedStrings.xml', strings, true],
  ['xl/worksheets/sheet1.xml', sheet, true],
])
const xrows = await readXlsx(xbuf)
const xt = readTable(xrows)
ok(xt.items.length === 2 && xt.items[0].title === 'Number System' && xt.items[0].date === '2026-10-26' && xt.items[0].startTime === '05:00' && xt.items[0].durationMinutes === 90,
  'Excel: text, date and time cells are read', JSON.stringify(xt.items[0]))
ok(xt.items[1].title === 'Reasoning & puzzles' && xt.items[1].date === '2026-10-27' && xt.items[1].startTime === null && xt.items[1].durationMinutes === 45, 'Excel: inline text, typed dates and empty cells', JSON.stringify(xt.items[1]))
let notZip = ''
try { await readXlsx(new TextEncoder().encode('Task,Date\nA,1').buffer) } catch (e) { notZip = e.message }
ok(notZip === 'This is not an Excel (.xlsx) file.', 'a file that is not .xlsx says so')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
