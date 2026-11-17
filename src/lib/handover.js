// A handover pack: everything the next person needs to pick up one company's / client's work
// (the task's `client`, see lib/workFor.js). Personal tasks (task.private) are never in it, and
// neither is anything let go (dropped). It comes out as a page to print or save as PDF, and as
// plain text to paste into an email or chat.
import { parseISO, isValid, differenceInCalendarDays } from 'date-fns'
import { format } from './dateFormat'
import { describe } from './recurrence'
import { STATUS_LABEL, fmtMinutes, totalMinutes } from './tasks'

export const FINISHED_CHOICES = [30, 90, 365]
export const NOTE_MAX = 4000

const day = (key) => { const d = key ? parseISO(key) : null; return d && isValid(d) ? format(d, 'EEE d MMM yyyy') : '' }
const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' }
const many = (n, one, more) => `${n} ${n === 1 ? one : more}`

function item(t, now) {
  const spent = totalMinutes(t, now)
  const last = (t.history || []).reduce((m, h) => (h.at > m ? h.at : m), t.createdAt || '')
  return {
    id: t.id,
    title: t.title || 'Untitled',
    status: t.hold ? 'Paused' : STATUS_LABEL[t.status] || t.status,
    waiting: t.hold?.reason || '',
    date: t.date ? day(t.date) : 'Someday',
    due: t.dueDate ? day(t.dueDate) : '',
    priority: PRIORITY[t.priority] || '',
    description: (t.description || '').trim(),
    steps: (t.subtasks || []).filter((s) => s.title).map((s) => ({ title: s.title, done: !!s.done, depth: s.depth || 0 })),
    files: (t.files || []).filter((f) => f.url).map((f) => ({ name: f.name || f.url, url: f.url })),
    tags: t.tags || [],
    spent: spent > 0 ? fmtMinutes(spent) : '',
    estimate: t.durationMinutes ? fmtMinutes(t.durationMinutes) : '',
    added: t.createdAt ? day(t.createdAt.slice(0, 10)) : '',
    lastTouched: last ? day(last.slice(0, 10)) : '',
  }
}

export function buildHandover({ tasks, name, now = new Date(), finishedDays = 90 }) {
  const mine = (tasks || []).filter((t) => t.client === name && !t.dropped)
  const privateCount = mine.filter((t) => t.private).length
  const use = mine.filter((t) => !t.private)

  // Recurring duties: one line per series, from its latest open repeat (or its latest one).
  const series = new Map()
  for (const t of use) {
    if (!t.recurrence || !t.seriesId) continue
    const best = series.get(t.seriesId)
    const better = !best || (best.status === 'completed' && t.status !== 'completed') || ((best.status === 'completed') === (t.status === 'completed') && (t.date || '') > (best.date || ''))
    if (better) series.set(t.seriesId, t)
  }
  const recurring = [...series.values()].map((t) => ({
    ...item(t, now),
    how: describe(t.recurrence),
    at: t.startTime || '',
  })).sort((a, b) => a.title.localeCompare(b.title))

  const open = use.filter((t) => t.status !== 'completed' && !(t.recurrence && t.seriesId))
  const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999')
  const groups = [
    { id: 'progress', title: 'In progress', tasks: open.filter((t) => !t.hold && (t.status === 'working' || t.status === 'review')) },
    { id: 'paused', title: 'Paused or waiting', tasks: open.filter((t) => t.hold) },
    { id: 'todo', title: 'To do', tasks: open.filter((t) => !t.hold && t.status === 'todo' && t.date).sort(byDate) },
    { id: 'someday', title: 'Someday (no date yet)', tasks: open.filter((t) => !t.hold && t.status === 'todo' && !t.date) },
  ].map((g) => ({ ...g, items: g.tasks.map((t) => item(t, now)) })).filter((g) => g.items.length)

  const since = (t) => { const d = t.completedAt ? new Date(t.completedAt) : null; return d && isValid(d) ? differenceInCalendarDays(now, d) : Infinity }
  const finished = use.filter((t) => t.status === 'completed' && !(t.recurrence && t.seriesId) && since(t) <= finishedDays)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    .map((t) => ({ title: t.title || 'Untitled', on: day(t.completedAt.slice(0, 10)), spent: fmtMinutes(totalMinutes(t, now)) }))

  const openCount = groups.reduce((n, g) => n + g.items.length, 0)
  return { name, recurring, groups, finished, finishedDays, privateCount, openCount, empty: !openCount && !recurring.length && !finished.length }
}

// ---- as a page ---------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const para = (s) => esc(s).split('\n').join('<br>')
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '')

function taskHtml(t) {
  const meta = [t.status + (t.waiting ? `: ${t.waiting}` : ''), t.date, t.due && `ends ${t.due}`, t.priority && `${t.priority} priority`, t.estimate && `about ${t.estimate}`, t.spent && `${t.spent} spent so far`].filter(Boolean)
  return `<div class="task"><h3>${esc(t.title)}</h3><p class="meta">${meta.map(esc).join(' · ')}</p>
  ${t.description ? `<p>${para(t.description)}</p>` : '<p class="muted">No notes on this task.</p>'}
  ${t.steps.length ? `<ul class="steps">${t.steps.map((s) => `<li style="margin-left:${s.depth * 18}px">${s.done ? '&#9745;' : '&#9744;'} ${esc(s.title)}</li>`).join('')}</ul>` : ''}
  ${t.files.length ? `<p class="files">Files: ${t.files.map((f) => (safeUrl(f.url) ? `<a href="${esc(f.url)}">${esc(f.name)}</a>` : esc(f.name))).join(', ')}</p>` : ''}
  ${t.tags.length ? `<p class="muted">${t.tags.map((x) => `#${esc(x)}`).join(' ')}</p>` : ''}
  <p class="muted small">Added ${esc(t.added)}${t.lastTouched && t.lastTouched !== t.added ? ` · last changed ${esc(t.lastTouched)}` : ''}</p></div>`
}

export function handoverHtml(pack, { from, date, note, label }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Handover: ${esc(pack.name)}</title><style>
  *{box-sizing:border-box}body{font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:40px;max-width:860px}
  h1{font-size:28px;margin:0}h2{font-size:18px;margin:32px 0 8px;padding-bottom:6px;border-bottom:2px solid #111}
  h3{font-size:15px;margin:0}.muted{color:#666}.small{font-size:12px}.meta{color:#555;font-size:12.5px;margin:2px 0 6px}
  .task{padding:12px 0;border-bottom:1px solid #e5e5e5;break-inside:avoid}.task p{margin:4px 0}
  .steps{list-style:none;padding:0;margin:6px 0}.steps li{margin:2px 0}.note{background:#f6f4ef;border-radius:10px;padding:14px 16px;white-space:normal}
  table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-bottom:1px solid #eee}td.n{text-align:right;color:#555;white-space:nowrap}
  .sum{display:flex;gap:28px;margin:18px 0 0}.sum b{display:block;font-size:22px}a{color:#c2410c}
  @page{margin:16mm}@media print{body{padding:0}}</style></head><body>
  <p class="muted" style="margin:0 0 4px">Handover · ${esc(label)}</p><h1>${esc(pack.name)}</h1>
  <p class="muted">Prepared${from ? ` by ${esc(from)}` : ''} on ${esc(date)}</p>
  <div class="sum"><div><b>${pack.openCount}</b><span class="muted">open task${pack.openCount === 1 ? '' : 's'}</span></div><div><b>${pack.recurring.length}</b><span class="muted">regular dut${pack.recurring.length === 1 ? 'y' : 'ies'}</span></div><div><b>${pack.finished.length}</b><span class="muted">finished, last ${pack.finishedDays} days</span></div></div>
  <h2>Notes for the next person</h2>
  ${note?.trim() ? `<div class="note">${para(note.trim())}</div>` : '<p class="muted">No notes were added.</p>'}
  ${pack.recurring.length ? `<h2>Regular duties</h2><table>${pack.recurring.map((r) => `<tr><td><b>${esc(r.title)}</b>${r.description ? `<br><span class="muted small">${para(r.description)}</span>` : ''}</td><td class="n">${esc(r.how)}${r.at ? ` at ${esc(r.at)}` : ''}${r.estimate ? ` · ${esc(r.estimate)}` : ''}</td></tr>`).join('')}</table>` : ''}
  ${pack.groups.map((g) => `<h2>${esc(g.title)} <span class="muted small">(${g.items.length})</span></h2>${g.items.map(taskHtml).join('')}`).join('')}
  ${pack.finished.length ? `<h2>Finished in the last ${pack.finishedDays} days</h2><table>${pack.finished.map((f) => `<tr><td>${esc(f.title)}</td><td class="n">${esc(f.on)}${f.spent && f.spent !== '0m' ? ` · ${esc(f.spent)}` : ''}</td></tr>`).join('')}</table>` : ''}
  ${pack.privateCount ? `<p class="muted small" style="margin-top:28px">${pack.privateCount} personal task${pack.privateCount === 1 ? ' was' : 's were'} left out.</p>` : ''}
  <p class="muted small" style="margin-top:28px">Made with NineFlow.</p>
  </body></html>`
}

// ---- as plain text (for an email or chat) ------------------------------------------------------
export function handoverText(pack, { from, date, note, label }) {
  const out = [`HANDOVER · ${label}: ${pack.name}`, `Prepared${from ? ` by ${from}` : ''} on ${date}`, '',
    `${many(pack.openCount, 'open task', 'open tasks')} · ${many(pack.recurring.length, 'regular duty', 'regular duties')} · ${pack.finished.length} finished in the last ${pack.finishedDays} days`]
  out.push('', 'NOTES FOR THE NEXT PERSON', note?.trim() || '(none)')
  if (pack.recurring.length) {
    out.push('', 'REGULAR DUTIES')
    for (const r of pack.recurring) out.push(`- ${r.title}: ${r.how}${r.at ? ` at ${r.at}` : ''}${r.estimate ? `, about ${r.estimate}` : ''}`)
  }
  for (const g of pack.groups) {
    out.push('', `${g.title.toUpperCase()} (${g.items.length})`)
    for (const t of g.items) {
      out.push(`- ${t.title}  [${[t.status + (t.waiting ? `: ${t.waiting}` : ''), t.date, t.due && `ends ${t.due}`, t.priority].filter(Boolean).join(' · ')}]`)
      if (t.description) out.push(...t.description.split('\n').map((l) => `    ${l}`))
      for (const s of t.steps) out.push(`    ${'  '.repeat(s.depth)}[${s.done ? 'x' : ' '}] ${s.title}`)
      for (const f of t.files) out.push(`    File: ${f.name} ${f.url}`)
    }
  }
  if (pack.finished.length) {
    out.push('', `FINISHED IN THE LAST ${pack.finishedDays} DAYS`)
    for (const f of pack.finished) out.push(`- ${f.title} (${f.on})`)
  }
  if (pack.privateCount) out.push('', `${pack.privateCount} personal task${pack.privateCount === 1 ? ' was' : 's were'} left out.`)
  return out.join('\n')
}
