// "Export to Google Sheets / Google Docs": a spreadsheet of the person's tasks and a document of a
// day's report, made in their own Drive (NineFlow folder) with createConverted (lib/drive.js).
// One-off copies: nothing is kept in step afterwards.
import { format, parseISO } from 'date-fns'
import { createConverted } from './drive'
import { dayReport } from './report'
import { fmtMinutes, totalMinutes } from './tasks'

const SHEET = 'application/vnd.google-apps.spreadsheet'
const DOC = 'application/vnd.google-apps.document'

// A cell that starts with = + - or @ would be read as a formula; the quote keeps it text.
const cell = (v) => {
  let s = String(v ?? '')
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function tasksCsv(tasks, categories = [], now = new Date()) {
  const cat = (id) => categories.find((c) => c.id === id)?.name || ''
  const head = ['Title', 'Date', 'Start', 'Status', 'Category', 'Priority', 'Estimate (min)', 'Spent (min)', 'Steps done', 'Steps', 'Tags']
  const rows = [...tasks].sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || (a.startTime || '').localeCompare(b.startTime || '')).map((t) => [
    t.title, t.date || '', t.startTime || '', t.status, cat(t.category), t.priority, t.durationMinutes, totalMinutes(t, now),
    (t.subtasks || []).filter((s) => s.done).length, (t.subtasks || []).length, (t.tags || []).map((g) => `#${g}`).join(' '),
  ])
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

export async function exportTasksToSheet({ tasks, categories, now = new Date() }) {
  const name = `NineFlow tasks · ${format(now, 'd MMM yyyy')}`
  return createConverted({ name, content: tasksCsv(tasks, categories, now), sourceType: 'text/csv', googleType: SHEET })
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The day's report as a document: the title, then each line (a bullet list for the "•" lines).
export function reportHtml(text) {
  const out = []
  let inList = false
  const close = () => { if (inList) { out.push('</ul>'); inList = false } }
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('• ')) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${esc(line.slice(2))}</li>`); return }
    close()
    if (!line.trim()) return
    if (i === 0) out.push(`<h1>${esc(line)}</h1>`)
    else if (/^[A-Z][A-Za-z ]+:$/.test(line)) out.push(`<h3>${esc(line.slice(0, -1))}</h3>`)
    else out.push(`<p>${esc(line)}</p>`)
  })
  close()
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${out.join('')}</body></html>`
}

export async function exportReportToDoc({ tasks, categories, dayKey, now = new Date(), name = '' }) {
  const rep = dayReport({ tasks, key: dayKey, now, categories, name })
  const title = `Daily report · ${format(parseISO(dayKey), 'd MMM yyyy')}`
  const file = await createConverted({ name: title, content: reportHtml(rep.text), sourceType: 'text/html', googleType: DOC })
  return { ...file, summary: `${rep.done.length} of ${rep.list.length} tasks, ${fmtMinutes(rep.focus)} focused` }
}
