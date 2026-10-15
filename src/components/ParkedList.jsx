import React, { useState } from 'react'
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { PauseCircle, Play, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { createPortal } from 'react-dom'
import { usePlanner } from '../store/PlannerContext'
import { DROP_KEEP_DAYS, dateKey } from '../lib/tasks'
import { columnOf } from '../lib/columns'
import { CategoryTag, cx } from './ui'
import ParkDialog from './ParkDialog'

// The paused or dropped tasks that belong to one Board column (its status, or the custom
// column they sat in). kind: 'paused' | 'dropped'.
export function parkedIn(allTasks, col, cols, kind) {
  return allTasks
    .filter((t) => (kind === 'dropped' ? t.dropped : t.hold && !t.dropped) && columnOf(t, cols) === col.id)
    .sort((a, b) => (kind === 'dropped' ? b.dropped.at.localeCompare(a.dropped.at) : (a.hold.until || '9999').localeCompare(b.hold.until || '9999')))
}

// One click between a column's tasks and its paused / dropped ones (Board, both views).
// fill: three equal tabs across the full width (Board columns), without icons so they fit.
export function ParkTabs({ value, onChange, counts, className, fill = false }) {
  const tab = (id, label, n, Icon) => (
    <button key={id} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)}
      className={cx('h-7 rounded-full font-semibold inline-flex items-center justify-center transition whitespace-nowrap min-w-0', fill ? 'px-1 gap-0.5 text-[11px]' : 'px-2.5 gap-1 text-[12px]',
        value === id ? 'bg-card text-ink shadow-soft' : 'text-current opacity-75 hover:opacity-100')}>
      {Icon && !fill && <Icon size={12} />}{label}
      {n != null && <span className={cx('tnum', value === id ? 'text-muted' : '')}>{n}</span>}
    </button>
  )
  return (
    <div role="tablist" aria-label="Show" className={cx('items-center gap-0.5 rounded-full bg-card/40 p-0.5', fill ? 'grid grid-cols-3' : 'inline-flex', className)}>
      {tab('active', 'Tasks', counts.active)}
      {tab('paused', 'Paused', counts.paused, PauseCircle)}
      {tab('dropped', 'Dropped', counts.dropped, XCircle)}
    </div>
  )
}

// The paused or dropped tasks of a column, shown in place of its cards (or its list rows).
// layout: 'cards' (board view) | 'rows' (list view)
export function ParkedTasks({ list, kind, layout = 'cards' }) {
  const { now, categoryById, setSelectedId, resumeTask, restoreTask, removeTask } = usePlanner()
  const [dropping, setDropping] = useState(null)
  const today = dateKey(now)
  const ago = (iso) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : '')
  const btn = (danger) => cx('inline-flex items-center gap-1 h-7 rounded-full px-2.5 text-[12px] font-semibold border border-line bg-card transition',
    danger ? 'text-coral-fg hover:bg-coral' : 'text-muted hover:text-ink hover:bg-page')

  if (!list.length) {
    return (
      <p className={cx('text-sm text-faint', layout === 'cards' ? 'px-2 py-6 text-center' : 'px-5 py-4')}>
        {kind === 'dropped' ? 'Nothing dropped from here.' : 'Nothing paused here.'} Use a card's <b>…</b> menu to {kind === 'dropped' ? 'drop' : 'pause'} a task.
      </p>
    )
  }
  return (
    <>
      <ul className={layout === 'cards' ? 'flex flex-col gap-2.5' : 'divide-y divide-line'}>
        {list.map((t) => {
          const meta = kind === 'dropped'
            ? `${t.dropped.reason} · dropped ${ago(t.dropped.at)} · deleted in ${Math.max(0, DROP_KEEP_DAYS - differenceInCalendarDays(now, new Date(t.dropped.at)))} days`
            : `${t.hold.reason} · paused ${ago(t.hold.since)}${t.hold.until ? ` · back ${format(parseISO(t.hold.until), 'EEE, MMM d')}` : ''}`
          return (
            <li key={t.id} className={layout === 'cards'
              ? 'bg-card rounded-2xl border border-dashed border-line p-3.5 text-ink'
              : 'flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3'}>
              <button type="button" onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left block w-full">
                <span className={cx('block text-sm font-bold leading-snug', layout === 'rows' && 'truncate', kind === 'dropped' && 'line-through text-muted')}>{t.title || 'Untitled'}</span>
                <span className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <CategoryTag category={categoryById(t.category)} className="text-[10px] py-0" />
                  <span className="text-[11px] text-faint">{meta}</span>
                </span>
              </button>
              <div className={cx('flex flex-wrap gap-1', layout === 'cards' && 'mt-2.5')}>
                {kind === 'dropped' ? (
                  <>
                    <button type="button" className={btn()} onClick={() => restoreTask(t.id, today)}><RotateCcw size={12} /> Restore</button>
                    <button type="button" className={btn(true)} onClick={() => removeTask(t.id)}><Trash2 size={12} /> Delete</button>
                  </>
                ) : (
                  <>
                    <button type="button" className={btn()} onClick={() => resumeTask(t.id, today)}><Play size={12} /> Resume</button>
                    <button type="button" className={btn()} onClick={() => resumeTask(t.id, dateKey(addDays(now, 1)))}>Tomorrow</button>
                    <button type="button" className={btn(true)} onClick={() => setDropping(t)}><XCircle size={12} /> Drop</button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {dropping && createPortal(<ParkDialog task={dropping} mode="drop" onClose={() => setDropping(null)} />, document.body)}
    </>
  )
}
