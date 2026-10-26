// Writes the RRB NTPC 40-day plan (src/exams/ntpc/plan40.js) as a CSV, the same tasks the app adds:
//   node scripts/ntpc-plan-csv.mjs [out.csv]
import fs from 'node:fs'
import { PLAN_ROWS } from '../src/exams/ntpc/plan40.js'

const out = process.argv[2] || 'release/rrb-ntpc-40-day-plan.csv'
const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' }
const lines = [
  ['Task name', 'Date', 'Start time', 'Duration (minutes)', 'Subject', 'Priority', 'Notes'],
  ...PLAN_ROWS.map((r) => [r.title, r.date, r.time, r.minutes, r.subject, PRIORITY[r.priority], r.notes]),
].map((row) => row.map(cell).join(','))
fs.writeFileSync(out, `${lines.join('\r\n')}\r\n`)
console.log(`${PLAN_ROWS.length} tasks -> ${out}`)
