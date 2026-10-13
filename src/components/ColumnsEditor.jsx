import React, { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import {
  BASES, BASE_LABEL, COLUMN_COLORS, COLUMN_NAME_MAX, COLUMN_STYLE, MAX_COLUMNS, cleanColumns, isOriginal, newColumnId, styleOf,
} from '../lib/columns'
import { cx } from './ui'

// Add, rename, recolour and reorder the Board's columns. Every column counts as
// To do, Working or Completed, which is what timers, reports and your daily
// capacity use. The three originals stay; the ones you add can be deleted.
export default function ColumnsEditor() {
  const { settings, updateSettings, tasks } = usePlanner()
  const cols = cleanColumns(settings.columns)
  const [name, setName] = useState('')
  const [base, setBase] = useState('working')
  const save = (next) => updateSettings({ columns: next })
  const patch = (id, change) => save(cols.map((c) => (c.id === id ? { ...c, ...change } : c)))
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= cols.length) return
    const next = [...cols]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  const add = () => {
    const n = name.trim()
    if (!n || cols.length >= MAX_COLUMNS) return
    const used = new Set(cols.map((c) => c.color))
    const color = COLUMN_COLORS.find((c) => !used.has(c)) || 'lav'
    // New columns go just before the finished ones, so "Completed" stays last.
    const doneAt = cols.findIndex((c) => c.id === 'completed')
    const at = base === 'completed' || doneAt < 0 ? cols.length : doneAt
    const next = [...cols]
    next.splice(at, 0, { id: newColumnId(), name: n.slice(0, COLUMN_NAME_MAX), base, color })
    save(next)
    setName('')
  }
  const inColumn = (id) => tasks.filter((t) => t.column === id).length

  return (
    <div>
      <p className="text-sm text-muted -mt-1 mb-3">
        Add stages like “In review” or “Waiting”. Each one counts as To do, Working or Completed, so your timers and reports keep working.
      </p>
      <ul className="space-y-1.5">
        {cols.map((c, i) => {
          const st = styleOf(c)
          return (
            <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-page px-2 py-1.5">
              <span className={cx('h-3 w-3 rounded-full shrink-0 ml-1', st.dot)} />
              <input value={c.name} maxLength={COLUMN_NAME_MAX} aria-label={`Name of column ${c.name}`}
                onChange={(e) => patch(c.id, { name: e.target.value })}
                onBlur={(e) => { if (!e.target.value.trim()) patch(c.id, { name: isOriginal(c) ? { todo: 'To Do', working: 'Working', completed: 'Completed' }[c.id] : 'Column' }) }}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold" />
              <select value={c.color} aria-label={`Colour of ${c.name}`} onChange={(e) => patch(c.id, { color: e.target.value })}
                className="bg-transparent text-[12px] font-semibold text-muted outline-none cursor-pointer">
                {COLUMN_COLORS.map((k) => <option key={k} value={k}>{COLUMN_STYLE[k].label}</option>)}
              </select>
              <span className="hidden sm:inline text-[11px] text-faint w-[4.5rem] text-right">counts as {BASE_LABEL[c.base]}</span>
              <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-faint hover:bg-card hover:text-ink disabled:opacity-30"><ArrowUp size={13} /></button>
              <button type="button" aria-label={`Move ${c.name} down`} disabled={i === cols.length - 1} onClick={() => move(i, 1)} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-faint hover:bg-card hover:text-ink disabled:opacity-30"><ArrowDown size={13} /></button>
              {isOriginal(c)
                ? <span className="h-7 w-7" />
                : <button type="button" aria-label={`Delete column ${c.name}`} title={inColumn(c.id) ? `${inColumn(c.id)} task(s) move back to ${BASE_LABEL[c.base]}` : 'Delete column'}
                    onClick={() => save(cols.filter((x) => x.id !== c.id))} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-faint hover:bg-coral/60 hover:text-coral-fg"><Trash2 size={13} /></button>}
            </li>
          )
        })}
      </ul>

      {cols.length < MAX_COLUMNS ? (
        <form onSubmit={(e) => { e.preventDefault(); add() }} className="mt-3 flex flex-wrap items-center gap-2">
          <input value={name} maxLength={COLUMN_NAME_MAX} placeholder="New column, e.g. In review" aria-label="New column name"
            onChange={(e) => setName(e.target.value)} className="input h-9 py-0 flex-1 min-w-[10rem]" />
          <select value={base} aria-label="The new column counts as" onChange={(e) => setBase(e.target.value)} className="input h-9 py-0 w-auto">
            {BASES.map((b) => <option key={b} value={b}>Counts as {BASE_LABEL[b]}</option>)}
          </select>
          <button type="submit" disabled={!name.trim()} className={cx('btn-black h-9 py-0 px-4', !name.trim() && 'opacity-40')}><Plus size={14} /> Add</button>
        </form>
      ) : <p className="mt-3 text-[12px] text-faint">You have {MAX_COLUMNS} columns, the most the Board can hold.</p>}
    </div>
  )
}
