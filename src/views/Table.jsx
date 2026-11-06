import React, { useMemo, useRef, useState } from 'react'
import { addDays, parseISO } from 'date-fns'
import { ArrowDown, ArrowUp, Check, CheckCheck, Search, Table2, Trash2, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { clock, format } from '../lib/dateFormat'
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, dateKey, fmtMinutes, totalMinutes } from '../lib/tasks'
import { CategoryTag, CheckCircle, ConfirmDialog, EmptyState, PriorityPill, cx } from '../components/ui'
import { DateField } from '../components/DatePicker'
import { cleanTaskFields, sortKeyOf, withValue } from '../lib/fields'

// Every task as one sortable table, with filters, and ticks for changing many at once (the bulk bar:
// complete, move to a day, priority, category, client, delete; one Undo for each). Paused and dropped
// tasks stay in Paused. "Hide completed" (Settings, or the command palette) starts the filter on Open.

const COLUMNS = [
  { id: 'title', label: 'Task', get: (t) => (t.title || '').toLowerCase() },
  { id: 'date', label: 'Date', get: (t) => t.date || '9999' },
  { id: 'time', label: 'Time', get: (t) => t.startTime || '99' },
  { id: 'status', label: 'Status', get: (t) => ['todo', 'working', 'review', 'completed'].indexOf(t.status) },
  { id: 'priority', label: 'Priority', get: (t) => PRIORITIES.indexOf(t.priority) },
  { id: 'category', label: 'Category', get: (t) => t.category || '' },
  { id: 'client', label: 'Client', get: (t) => (t.client || '~').toLowerCase() },
  { id: 'estimate', label: 'Estimate', get: (t) => t.durationMinutes || 0, num: true },
  { id: 'spent', label: 'Spent', get: (t, now) => totalMinutes(t, now), num: true },
]
const SHOW = [['open', 'Open'], ['all', 'All'], ['done', 'Done']]
const STATUS_TONE = { todo: 'text-muted', working: 'text-sky-fg', review: 'text-butter-fg', completed: 'text-mint-fg' }
const MAX_ROWS = 400

export default function Table() {
  const { tasks, now, settings, categoryById, toggleComplete, setSelectedId, updateTasks, removeTasks } = usePlanner()
  const [show, setShow] = useState(settings.hideDone ? 'open' : 'all')
  const [find, setFind] = useState('')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState({ by: 'date', dir: 1 })
  const [picked, setPicked] = useState(() => new Set())
  const [all, setAll] = useState(false) // past MAX_ROWS
  const lastTick = useRef(null)
  const today = dateKey(now)

  // Custom fields (Settings → Custom fields) come after Client.
  const fields = settings.fields || []
  const columns = useMemo(() => {
    const at = COLUMNS.findIndex((c) => c.id === 'client') + 1
    const extra = fields.map((f) => ({ id: `field:${f.id}`, label: f.name, field: f, num: f.type === 'number', get: (t) => sortKeyOf(f, cleanTaskFields(t.fields, [f])[f.id]) }))
    return [...COLUMNS.slice(0, at), ...extra, ...COLUMNS.slice(at)]
  }, [fields])

  const rows = useMemo(() => {
    const q = find.trim().toLowerCase()
    const col = columns.find((c) => c.id === sort.by) || COLUMNS[1]
    return tasks
      .filter((t) => (show === 'all' || (show === 'done') === (t.status === 'completed'))
        && (cat === 'all' || t.category === cat)
        && (!q || `${t.title} ${t.description || ''} ${t.client || ''} ${(t.tags || []).join(' ')}`.toLowerCase().includes(q)))
      .map((t) => ({ t, k: col.get(t, now) }))
      .sort((a, b) => (a.k < b.k ? -sort.dir : a.k > b.k ? sort.dir : (a.t.startTime || '').localeCompare(b.t.startTime || '')))
      .map((x) => x.t)
  }, [tasks, show, cat, find, sort, now, columns])
  const shown = all ? rows : rows.slice(0, MAX_ROWS)

  // Ticks only count for rows still on screen (a filter change can hide some).
  const ids = new Set(rows.map((t) => t.id))
  const chosen = [...picked].filter((id) => ids.has(id))
  const tick = (id, e) => {
    setPicked((p) => {
      const next = new Set(p)
      const on = !next.has(id)
      // Shift-click ticks (or clears) everything between the last ticked row and this one.
      if (e?.shiftKey && lastTick.current) {
        const a = shown.findIndex((t) => t.id === lastTick.current), b = shown.findIndex((t) => t.id === id)
        if (a >= 0 && b >= 0) { for (const t of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? next.add(t.id) : next.delete(t.id) }
      } else if (on) next.add(id); else next.delete(id)
      return next
    })
    lastTick.current = id
  }
  const allTicked = shown.length > 0 && shown.every((t) => picked.has(t.id))
  const tickAll = () => setPicked(allTicked ? new Set() : new Set(shown.map((t) => t.id)))
  const clear = () => setPicked(new Set())
  const sortBy = (id) => setSort((s) => (s.by === id ? { by: id, dir: -s.dir } : { by: id, dir: 1 }))

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl max-sm:text-2xl">Table</h1>
          <p className="text-sm text-muted mt-1">{rows.length} task{rows.length === 1 ? '' : 's'}. Tick some to change them together; click a heading to sort.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          <label className="relative max-sm:flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input h-9 py-0 pl-8 w-52 max-sm:w-full" placeholder="Search" aria-label="Search tasks" value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
          <div role="group" aria-label="Show" className="inline-flex rounded-full p-1 gap-0.5 bg-ink/5">
            {SHOW.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)}
                className={cx('rounded-full px-3 py-1 max-sm:py-2 text-xs font-semibold transition', show === v ? 'bg-brand text-white' : 'text-ink/70 hover:text-ink')}>{l}</button>
            ))}
          </div>
          <select className="input h-9 py-0 w-auto text-sm" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All categories</option>
            {settings.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </header>

      {chosen.length > 0 && <BulkBar ids={chosen} clear={clear} today={today} now={now} updateTasks={updateTasks} removeTasks={removeTasks} categories={settings.categories} tasks={tasks} fields={fields} />}

      {rows.length === 0 ? (
        <div className="card p-6"><EmptyState icon={Table2} title="No tasks match" hint="Try All, another category, or a different search." /></div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-line">
                <th className="py-2.5 pl-4 pr-2 w-10">
                  <input type="checkbox" className="h-4 w-4 align-middle" aria-label={allTicked ? 'Untick all' : 'Tick all shown'} checked={allTicked} onChange={tickAll} />
                </th>
                <th className="py-2.5 px-1 w-8"><span className="sr-only">Done</span></th>
                {columns.map((c) => (
                  <th key={c.id} className={cx('py-2.5 px-2 font-semibold', c.num && 'text-right')} aria-sort={sort.by === c.id ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => sortBy(c.id)} className={cx('inline-flex items-center gap-1 hover:text-ink', sort.by === c.id && 'text-ink')}>
                      {c.label}{sort.by === c.id && (sort.dir > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const on = picked.has(t.id)
                const late = t.status !== 'completed' && t.date && t.date < today
                return (
                  <tr key={t.id} className={cx('border-b border-line/60 last:border-0 transition', on ? 'bg-lav/40' : 'hover:bg-page')}>
                    <td className="py-1.5 pl-4 pr-2">
                      <input type="checkbox" className="h-4 w-4 align-middle" aria-label={`Tick ${t.title || 'task'}`} checked={on} onChange={() => {}} onClick={(e) => tick(t.id, e)} />
                    </td>
                    <td className="py-1.5 px-1"><CheckCircle size="sm" checked={t.status === 'completed'} onToggle={() => toggleComplete(t.id)} /></td>
                    <td className="py-1.5 px-2 max-w-[320px]">
                      <button type="button" onClick={() => setSelectedId(t.id)} className={cx('text-left font-semibold truncate max-w-full block hover:underline', t.status === 'completed' && 'line-through text-muted')}>{t.title || 'Untitled'}</button>
                    </td>
                    <td className={cx('py-1.5 px-2 whitespace-nowrap tnum', late ? 'text-coral-fg font-semibold' : 'text-muted')}>{t.date ? format(parseISO(t.date), 'EEE d MMM') : 'Someday'}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap tnum text-muted">{t.startTime ? clock(t.startTime) : '—'}</td>
                    <td className={cx('py-1.5 px-2 whitespace-nowrap text-xs font-semibold', STATUS_TONE[t.status])}>{STATUS_LABEL[t.status]}</td>
                    <td className="py-1.5 px-2"><PriorityPill priority={t.priority} /></td>
                    <td className="py-1.5 px-2"><CategoryTag category={categoryById(t.category)} className="text-xs py-0" /></td>
                    <td className="py-1.5 px-2 text-muted truncate max-w-[140px]">{t.client || '—'}{t.billable && <span className="ml-1 text-xs text-mint-fg">· billable</span>}</td>
                    {fields.map((f) => <td key={f.id} className={cx('py-1.5 px-2 text-muted whitespace-nowrap truncate max-w-[160px]', f.type === 'number' && 'text-right tnum')}>{fieldText(f, t)}</td>)}
                    <td className="py-1.5 px-2 text-right tnum text-muted">{fmtMinutes(t.durationMinutes || 0)}</td>
                    <td className="py-1.5 pr-4 pl-2 text-right tnum text-muted">{(() => { const m = totalMinutes(t, now); return m ? fmtMinutes(m) : '—' })()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!all && rows.length > MAX_ROWS && (
            <div className="p-3 text-center"><button type="button" className="btn-ghost h-9 py-0" onClick={() => setAll(true)}>Show all {rows.length}</button></div>
          )}
        </div>
      )}
    </div>
  )
}

// What to do with the ticked tasks. Each action is one Undo.
function BulkBar({ ids, clear, today, now, updateTasks, removeTasks, categories, tasks, fields }) {
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const n = ids.length
  const run = (patch, label) => {
    const { changed, skipped } = updateTasks(ids, patch, label)
    setNote(skipped ? `${skipped} still have required steps to tick, so they were left as they are.` : '')
    if (changed) clear()
  }
  const day = (key, label) => run({ date: key }, `Moved ${n} tasks to ${label}`)
  const clients = [...new Set(tasks.map((t) => t.client).filter(Boolean))].sort()
  const sel = 'input h-8 py-0 w-auto text-xs font-semibold bg-card'

  return (
    <div role="toolbar" aria-label={`${n} ticked`} className="sticky top-2 z-20 card p-2.5 flex flex-wrap items-center gap-2 shadow-lift">
      <span className="text-sm font-bold px-1.5">{n} ticked</span>
      <button type="button" className="btn-black h-8 py-0 text-xs" onClick={() => run({ status: 'completed' }, `Completed ${n} tasks`)}><CheckCheck size={13} /> Complete</button>
      <button type="button" className="btn-ghost h-8 py-0 text-xs" onClick={() => run({ status: 'todo' }, `Reopened ${n} tasks`)}><Check size={13} /> To do</button>
      <select className={sel} aria-label="Move to a day" value="" onChange={(e) => {
        const v = e.target.value
        if (v === 'today') day(today, 'today')
        else if (v === 'tomorrow') day(dateKey(addDays(now, 1)), 'tomorrow')
        else if (v === 'week') day(dateKey(addDays(now, 7)), 'next week')
        else if (v === 'someday') run({ date: null, startTime: null }, `Moved ${n} tasks to Someday`)
      }}>
        <option value="">Move to…</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option>
        <option value="week">In a week</option><option value="someday">Someday (no date)</option>
      </select>
      <DateField size="sm" className="w-36" ariaLabel="Move to a date" placeholder="Move to a date" allowClear={false} value={null} onChange={(v) => v && day(v, format(parseISO(v), 'd MMM'))} />
      <select className={sel} aria-label="Priority" value="" onChange={(e) => e.target.value && run({ priority: e.target.value }, `Set ${n} tasks to ${PRIORITY_LABEL[e.target.value]}`)}>
        <option value="">Priority…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
      </select>
      <select className={sel} aria-label="Category" value="" onChange={(e) => e.target.value && run({ category: e.target.value }, `Moved ${n} tasks to ${categories.find((c) => c.id === e.target.value)?.name}`)}>
        <option value="">Category…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select className={sel} aria-label="Client" value="" onChange={(e) => {
        const v = e.target.value
        if (v === '__none') run({ client: null, billable: false }, `Cleared the client on ${n} tasks`)
        else if (v === '__bill') run({ billable: true }, `Marked ${n} tasks billable`)
        else if (v === '__nobill') run({ billable: false }, `Marked ${n} tasks not billable`)
        else if (v) run({ client: v }, `Set ${n} tasks to ${v}`)
      }}>
        <option value="">Client…</option>
        {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value="__bill">Mark billable</option><option value="__nobill">Mark not billable</option><option value="__none">No client</option>
      </select>
      {fields.length > 0 && (
        // Dropdown and tick-box fields can be set here; any field can be cleared.
        <select className={sel} aria-label="Field" value="" onChange={(e) => {
          const at = e.target.value.indexOf('::') // field id :: value (ids never hold '::'; options may)
          const id = e.target.value.slice(0, at), v = e.target.value.slice(at + 2)
          const f = fields.find((x) => x.id === id)
          if (!f) return
          const value = v === '__clear' ? undefined : f.type === 'check' ? v === 'yes' || undefined : v
          run((t) => ({ fields: withValue(t.fields, f, value) }), value === undefined ? `Cleared ${f.name} on ${n} tasks` : `Set ${f.name} on ${n} tasks`)
        }}>
          <option value="">Field…</option>
          {fields.map((f) => (
            <optgroup key={f.id} label={f.name}>
              {f.type === 'select' && f.options.map((o) => <option key={o} value={`${f.id}::${o}`}>{o}</option>)}
              {f.type === 'check' && <option value={`${f.id}::yes`}>Yes</option>}
              <option value={`${f.id}::__clear`}>Clear</option>
            </optgroup>
          ))}
        </select>
      )}
      <button type="button" className="btn-ghost h-8 py-0 text-xs text-coral-fg" onClick={() => setConfirm(true)}><Trash2 size={13} /> Delete</button>
      <button type="button" className="ml-auto h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-page" aria-label="Untick all" onClick={clear}><X size={15} /></button>
      {note && <p role="status" className="w-full text-xs text-peach-fg font-semibold px-1.5">{note}</p>}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${n} task${n === 1 ? '' : 's'}?`}
        body="They go now; Undo, right after, brings them back." confirmLabel="Delete"
        onConfirm={() => { removeTasks(ids, `Deleted ${n} tasks`); setConfirm(false); clear() }} />
    </div>
  )
}

// A custom field's value as the table shows it.
function fieldText(field, task) {
  const v = cleanTaskFields(task.fields, [field])[field.id]
  if (v === undefined) return '—'
  if (field.type === 'check') return '✓'
  if (field.type === 'date') return format(parseISO(v), 'd MMM yyyy')
  return String(v)
}
