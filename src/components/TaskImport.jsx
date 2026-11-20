import React, { useMemo, useRef, useState } from 'react'
import { parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { AlertTriangle, Check, ClipboardPaste, FileSpreadsheet, Upload } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, fmtMinutes } from '../lib/tasks'
import { parseCsv, readTable, sameTask, toTask } from '../lib/taskImport'
import { Modal, cx } from './ui'
import { sectionOn } from '../lib/modules'

// "Import tasks" (Settings → Your data): a CSV or Excel file, or rows pasted from Excel / Google
// Sheets, become planner tasks. Everything is read first and shown with every row ticked; one press on
// "Add all" adds them on their own dates and times. Rows already in the planner (same title, day and
// time) are left out, so importing a file twice changes nothing. One Undo takes the import back.

const NTPC_SUBJECT = { maths: 'maths', mathematics: 'maths', quant: 'maths', reasoning: 'reasoning', generalintelligenceandreasoning: 'reasoning', generalawareness: 'ga', ga: 'ga', gk: 'ga', generalknowledge: 'ga', currentaffairs: 'ga' }
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

export default function TaskImport({ onClose }) {
  const { allTasks, settings, addTasks, now, setDashboardDate } = usePlanner()
  const today = dateKey(now)
  const fileRef = useRef(null)
  const [stage, setStage] = useState('pick') // 'pick' | 'preview'
  const [source, setSource] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState([])
  const [off, setOff] = useState(() => new Set()) // ids the person unticked
  const [on, setOn] = useState(() => new Set()) // problem rows the person ticked anyway
  const [skipPast, setSkipPast] = useState(true)
  const [category, setCategory] = useState(() => (settings.categories.find((c) => c.id === 'learning') || settings.categories[0])?.id)
  const [linkNtpc, setLinkNtpc] = useState(true)
  const [dragging, setDragging] = useState(false)

  const load = (rows, name) => {
    const r = readTable(rows)
    if (r.error) { setError(r.error); return }
    setItems(r.items); setSource(name); setOff(new Set()); setOn(new Set()); setError(''); setStage('preview')
  }
  const readFile = async (file) => {
    if (!file) return
    setError(''); setBusy(true)
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { readXlsx } = await import('../lib/xlsx')
        load(await readXlsx(await file.arrayBuffer()), file.name)
      } else if (/\.(xls|ods|numbers)$/i.test(file.name)) {
        setError('That spreadsheet format can\'t be read. In Excel or Sheets choose Save as / Download → .xlsx or .csv, then import that.')
      } else if (/\.exe$/i.test(file.name)) {
        setError('That is a program, not a task list. Choose a .csv or .xlsx file.')
      } else {
        load(parseCsv(await file.text()), file.name)
      }
    } catch (e) {
      setError(e?.message || 'That file could not be read.')
    }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Where each row stands, and what "Add all" will add.
  const existing = useMemo(() => allTasks.filter((t) => !t.dropped), [allTasks])
  const rows = useMemo(() => {
    const seen = new Set()
    return items.map((it) => {
      let skip = null
      if (seen.has(it.id)) skip = 'Repeated row'
      else if (existing.some((t) => t.id === it.id || sameTask(t, it))) skip = 'Already in your planner'
      else if (skipPast && it.date && it.date < today) skip = 'Day already past'
      seen.add(it.id)
      const dateProblem = it.problems.some((p) => p.startsWith('Date'))
      const ticked = !skip && (dateProblem ? on.has(it.id) : !off.has(it.id))
      return { ...it, skip, dateProblem, ticked }
    })
  }, [items, existing, skipPast, today, off, on])
  const chosen = rows.filter((r) => r.ticked)
  const hasNtpc = sectionOn(settings, 'ntpc') && items.some((it) => NTPC_SUBJECT[norm(it.subject)])
  const dates = chosen.map((r) => r.date).filter(Boolean).sort()
  const counts = { already: rows.filter((r) => r.skip === 'Already in your planner' || r.skip === 'Repeated row').length, past: rows.filter((r) => r.skip === 'Day already past').length, problems: rows.filter((r) => r.problems.length).length }

  const toggle = (r) => {
    if (r.skip) return
    if (r.dateProblem) setOn((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })
    else setOff((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })
  }
  const addAll = () => {
    if (!chosen.length) return
    const examLink = hasNtpc && linkNtpc ? (subject) => {
      const s = NTPC_SUBJECT[norm(subject)]
      return s ? { id: 'rrb-ntpc', subject: s, topic: 'plan:general', kind: 'learn', deadline: null } : null
    } : null
    addTasks(chosen.map((r) => toTask(r, { categories: settings.categories, fallbackCategory: category, examLink })),
      `Imported ${chosen.length} task${chosen.length === 1 ? '' : 's'} from ${source}`)
    if (dates[0]) setDashboardDate(dates[0] < today ? today : dates[0])
    onClose()
  }

  const nice = (k) => format(parseISO(k), 'd MMM')
  return (
    <Modal open onClose={onClose} width="max-w-2xl" title={stage === 'pick' ? 'Import tasks' : `Import from ${source}`}>
      {stage === 'pick' ? (
        <div className="grid gap-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files?.[0]) }}
            className={cx('rounded-2xl border-2 border-dashed p-5 text-center transition', dragging ? 'border-lav-fg bg-lav/40' : 'border-line')}>
            <FileSpreadsheet size={26} className="mx-auto text-lav-fg" />
            <p className="mt-2 text-sm font-semibold">Choose a CSV or Excel file</p>
            <p className="text-xs text-muted mt-0.5">Or drop it here. Only the Task name column is needed; Date, Start time, Duration, Subject, Priority and Notes are used when they're there.</p>
            <button type="button" className="btn-black mt-3" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} /> {busy ? 'Reading…' : 'Choose file'}</button>
            <input ref={fileRef} type="file" className="hidden" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => readFile(e.target.files?.[0])} />
          </div>
          <div>
            <label htmlFor="task-import-paste" className="text-sm font-semibold flex items-center gap-2"><ClipboardPaste size={15} /> Or paste rows from Excel or Google Sheets</label>
            <p className="text-xs text-muted mt-0.5">Copy the rows including the heading row, then paste them here.</p>
            <textarea id="task-import-paste" className="input mt-2 min-h-[110px] resize-y font-mono text-xs" value={pasted} onChange={(e) => setPasted(e.target.value)}
              placeholder={'Task name\tDate\tStart time\tDuration (minutes)\nNumber System basics\t26-10-2026\t20:00\t50'} />
            <button type="button" className="btn-ghost mt-2" disabled={!pasted.trim()} onClick={() => load(parseCsv(pasted), 'pasted rows')}>Read pasted rows</button>
          </div>
          {error && <p role="alert" className="rounded-xl bg-coral/60 text-coral-fg px-3 py-2 text-[13px] font-semibold flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</p>}
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm">
            <b className="tnum">{chosen.length}</b> task{chosen.length === 1 ? '' : 's'} ready
            {dates.length > 0 && <span className="text-muted"> · {nice(dates[0])}{dates.at(-1) !== dates[0] ? ` to ${nice(dates.at(-1))}` : ''}</span>}
            {counts.already > 0 && <span className="text-muted"> · {counts.already} already in your planner</span>}
            {counts.past > 0 && <span className="text-muted"> · {counts.past} on days already past</span>}
            {counts.problems > 0 && <span className="text-coral-fg font-semibold"> · {counts.problems} with a problem</span>}
          </p>

          <div className="grid sm:grid-cols-2 gap-2 text-[13px]">
            <label className="grid gap-1 text-xs font-semibold text-muted">Category, when the Subject isn't one of yours
              <select className="input py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                {settings.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5 content-end">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="h-4 w-4" checked={skipPast} onChange={(e) => setSkipPast(e.target.checked)} /> Leave out days already past</label>
              {hasNtpc && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="h-4 w-4" checked={linkNtpc} onChange={(e) => setLinkNtpc(e.target.checked)} /> Link Maths, Reasoning and GA rows to RRB NTPC</label>}
            </div>
          </div>

          <ul className="max-h-[46vh] overflow-y-auto rounded-2xl border border-line divide-y divide-line" aria-label="Rows to import">
            {rows.map((r) => (
              <li key={`${r.line}-${r.id}`}>
                <button type="button" role="checkbox" aria-checked={r.ticked} disabled={!!r.skip} onClick={() => toggle(r)}
                  className="w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-page transition disabled:opacity-55 disabled:hover:bg-transparent">
                  <span className={cx('mt-0.5 shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center', r.ticked ? 'bg-accent border-accent text-white' : 'border-line bg-card')}>{r.ticked && <Check size={12} strokeWidth={3.5} />}</span>
                  <span className="w-[5.5rem] shrink-0 text-[12px] font-semibold tnum text-muted">{r.date ? format(parseISO(r.date), 'EEE d MMM') : 'No date'}{r.startTime && <span className="block font-medium text-faint">{r.startTime}</span>}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{r.title}</span>
                    <span className="block text-xs text-faint">{[r.subject, r.durationMinutes && fmtMinutes(r.durationMinutes), r.priority && `${r.priority[0].toUpperCase()}${r.priority.slice(1)} priority`].filter(Boolean).join(' · ')}</span>
                    {r.skip && <span className="block text-xs font-semibold text-muted">{r.skip}</span>}
                    {r.problems.map((p) => <span key={p} className="block text-xs font-semibold text-coral-fg">Line {r.line}: {p}{p.startsWith('Date') ? ' · tick to add it without a date' : ''}</span>)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => { setStage('pick'); setItems([]) }}>Choose another file</button>
            <button type="button" className="btn-black disabled:opacity-40" disabled={!chosen.length} onClick={addAll}>
              {chosen.length ? `Add all ${chosen.length} task${chosen.length === 1 ? '' : 's'}` : 'Nothing to add'}
            </button>
          </div>
          <p className="text-xs text-faint">Your other tasks stay as they are. Undo, right after adding, removes this import.</p>
        </div>
      )}
    </Modal>
  )
}
