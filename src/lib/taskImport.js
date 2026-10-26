// Import tasks from a table: a CSV file, an Excel sheet (lib/xlsx.js) or rows pasted from Excel or
// Google Sheets. Pure functions: text or rows in, task fields out, so they are tested on their own
// (scripts/import-test). The import window is components/TaskImport.jsx.
//
// Column headings are matched loosely ("Task name", "Title", "Task"…), dates may be written the Indian
// way (26-10-2026, 26/10/2026), the ISO way (2026-10-26), in words (26 Oct 2026) or be Excel dates.
// Nothing here touches the planner; the window adds what the person approves.

const MAX_ROWS = 2000

// ---- CSV ---------------------------------------------------------------------------------
// RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. The separator is whichever of
// comma, semicolon or tab the first line uses most (pasted cells arrive tab-separated).
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] || ''
  const sep = [',', ';', '\t'].map((c) => [c, firstLine.split(c).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''))
}

// ---- headings ----------------------------------------------------------------------------------
const FIELDS = {
  title: ['taskname', 'task', 'title', 'name', 'todo', 'item', 'activity', 'topic'],
  date: ['date', 'day', 'duedate', 'due', 'scheduled', 'when', 'plannedfor'],
  time: ['starttime', 'start', 'time', 'from', 'at'],
  duration: ['durationminutes', 'duration', 'durationmins', 'minutes', 'mins', 'length', 'timeneeded', 'estimate', 'estimatedminutes'],
  subject: ['subject', 'category', 'project', 'list', 'area', 'type'],
  priority: ['priority', 'importance', 'prio'],
  notes: ['notes', 'note', 'description', 'details', 'source', 'sources', 'comment', 'comments'],
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// Which column holds which field. Exact names win over partial ones ("Start time" is the time, not a date).
export function mapHeadings(header) {
  const cols = header.map(norm)
  const map = {}
  for (const [field, names] of Object.entries(FIELDS)) {
    let at = cols.findIndex((c, i) => names.includes(c) && !Object.values(map).includes(i))
    if (at < 0) at = cols.findIndex((c, i) => c && names.some((n) => c.startsWith(n)) && !Object.values(map).includes(i))
    if (at >= 0) map[field] = at
  }
  return map
}

// ---- values ----------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const validDate = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return y >= 1990 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null
}
const fullYear = (y) => (y < 100 ? 2000 + y : y)

// A date as yyyy-MM-dd, or null. Numbers are Excel dates (days since 30 Dec 1899).
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Math.floor(Number(v))
    if (n < 20000 || n > 80000) return null
    const dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
    return validDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  }
  const s = String(v).trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1')
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t].*)?$/)
  if (m) return validDate(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3])
    // Day first, as written in India, unless that can't be a date and the other way round can.
    return validDate(y, b, a) || validDate(y, a, b)
  }
  m = s.match(/^(?:[a-z]+,?\s+)?(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s,-]+(\d{2,4})$/)
  if (m && MONTHS.includes(m[2])) return validDate(fullYear(+m[3]), MONTHS.indexOf(m[2]) + 1, +m[1])
  m = s.match(/^(?:[a-z]+,?\s+)?([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})$/)
  if (m && MONTHS.includes(m[1])) return validDate(fullYear(+m[3]), MONTHS.indexOf(m[1]) + 1, +m[2])
  return null
}

// A time as HH:mm, or null: "05:00", "5:00", "5 AM", "8:30 pm", or an Excel time (a fraction of a day).
export function parseTime(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' || /^0?\.\d+$/.test(String(v).trim())) {
    const f = Number(v) % 1
    const mins = Math.round(f * 1440)
    return mins >= 0 && mins < 1440 ? `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` : null
  }
  const m = String(v).trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?$/)
  if (!m) return null
  let h = +m[1]; const min = m[2] ? +m[2] : 0
  if (!m[2] && !m[3]) return null // a bare "5" is too unclear
  if (m[3]) { if (h < 1 || h > 12) return null; h = h % 12 + (m[3].startsWith('p') ? 12 : 0) }
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null
}

// Minutes, or null: "90", "90 min", "1h 30m", "1.5 h", "1:30".
export function parseDuration(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v > 0 && v <= 1440 ? Math.round(v) : null
  const s = String(v).trim().toLowerCase()
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?)?$/)
  if (m) { const n = Math.round(+m[1]); return n > 0 && n <= 1440 ? n : null }
  m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)$/)
  if (m) { const n = Math.round(+m[1] * 60); return n > 0 && n <= 1440 ? n : null }
  m = s.match(/^(\d+)\s*(?:h|hr|hrs|hours?)\s*(\d+)\s*(?:m|min|mins|minutes?)?$/) || s.match(/^(\d+):(\d{2})$/)
  if (m) { const n = +m[1] * 60 + +m[2]; return n > 0 && n <= 1440 ? n : null }
  return null
}

export function parsePriority(v) {
  const s = norm(v)
  if (!s && !String(v || '').trim()) return null
  if (['high', 'h', 'urgent', 'important', 'top'].includes(s) || /^(1|p1)$/i.test(String(v).trim())) return 'high'
  if (['low', 'l', 'minor', 'later'].includes(s) || /^(3|p3)$/i.test(String(v).trim())) return 'low'
  if (['medium', 'med', 'm', 'normal', 'mid'].includes(s) || /^(2|p2)$/i.test(String(v).trim())) return 'medium'
  return null
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)
// The same row always gets the same id, so importing a file twice is noticed.
export function rowId(title, date, time) {
  const s = `${title.toLowerCase()}|${date || ''}|${time || ''}`
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return `imp-${h.toString(36)}-${s.length.toString(36)}`
}

// ---- rows → tasks --------------------------------------------------------------------------------
// `rows` is a table (first row = headings). Returns { items, columns, error }:
//   items: [{ line, id, title, date, startTime, durationMinutes, priority, subject, notes, problems: [] }]
// A row with a value that couldn't be read keeps going with that field empty and says so in `problems`.
export function readTable(rows) {
  if (!rows.length) return { items: [], columns: {}, error: 'The file is empty.' }
  const columns = mapHeadings(rows[0])
  if (columns.title === undefined) return { items: [], columns, error: 'No task column found. The first row should hold headings such as Task name, Date, Start time, Duration.' }
  const cell = (r, f) => (columns[f] === undefined ? '' : r[columns[f]] ?? '')
  const items = []
  rows.slice(1, MAX_ROWS + 1).forEach((r, i) => {
    const title = String(cell(r, 'title')).trim().slice(0, 200)
    if (!title) return
    const problems = []
    const rawDate = cell(r, 'date'), rawTime = cell(r, 'time'), rawDur = cell(r, 'duration'), rawPri = cell(r, 'priority')
    const date = parseDate(rawDate)
    if (String(rawDate).trim() && !date) problems.push(`Date "${String(rawDate).trim()}" not understood`)
    const startTime = parseTime(rawTime)
    if (String(rawTime).trim() && !startTime) problems.push(`Time "${String(rawTime).trim()}" not understood`)
    const durationMinutes = parseDuration(rawDur)
    if (String(rawDur).trim() && !durationMinutes) problems.push(`Duration "${String(rawDur).trim()}" not understood`)
    const priority = parsePriority(rawPri)
    const subject = String(cell(r, 'subject')).trim().slice(0, 60)
    items.push({
      line: i + 2, id: rowId(title, date, startTime), title, date, startTime: date ? startTime : null,
      durationMinutes, priority, subject, notes: String(cell(r, 'notes')).trim().slice(0, 5000), problems,
    })
  })
  if (!items.length) return { items, columns, error: 'No rows with a task name were found.' }
  return { items, columns, error: null, cut: rows.length - 1 > MAX_ROWS }
}

// One item as planner task fields. `categories` are the planner's; a subject that names one picks it.
// `examLink(subject)` may return an RRB NTPC link for a Maths / Reasoning / General Awareness subject.
export function toTask(item, { categories, fallbackCategory, examLink }) {
  const byName = categories.find((c) => norm(c.name) === norm(item.subject))
  const tag = slug(item.subject)
  const exam = examLink ? examLink(item.subject) : null
  return {
    id: item.id,
    title: item.title,
    description: item.notes,
    date: item.date,
    startTime: item.startTime,
    ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}),
    priority: item.priority || 'medium',
    category: byName?.id || fallbackCategory,
    tags: ['imported', ...(tag && !byName ? [tag] : [])].slice(0, 6),
    ...(exam ? { exam } : {}),
  }
}

// Same title, day and time as a task already in the planner (any id): treated as already there.
export const sameTask = (a, b) => a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && (a.date || null) === (b.date || null) && (a.startTime || null) === (b.startTime || null)
