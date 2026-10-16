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

// Design 3: small chips next to a column's name, one per kind, always there (a count with a
// pause or ✕ icon; dimmer at 0). One click shows that list in place; clicking the
// lit chip again goes back to the column's tasks. Used on the Board, in both views.
export function ParkChips({ value, onChange, counts, className }) {
  const chip = (kind, n, Icon, label) => (
    <button key={kind} type="button" aria-pressed={value === kind} onClick={() => onChange(value === kind ? 'active' : kind)}
      title={value === kind ? 'Back to the tasks' : n ? `Show ${n} ${label}` : `Show ${label} (none yet)`} aria-label={value === kind ? `Back to the tasks (showing ${label})` : `Show ${n} ${label}`}
      className={cx('h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 transition tnum shrink-0',
        value === kind ? 'bg-ink text-page' : n ? 'bg-card/80 text-current hover:bg-card' : 'bg-card/40 text-current opacity-60 hover:opacity-100')}>
      <Icon size={12} />{n}
    </button>
  )
  return (
    <span className={cx('inline-flex items-center gap-1', className)}>
      {chip('paused', counts.paused, PauseCircle, 'paused')}
      {chip('dropped', counts.dropped, XCircle, 'dropped')}
    </span>
  )
}

// The paused or dropped tasks of a column, shown in place of its cards (or its list rows).
// layout: 'cards' (board view) | 'rows' (list view)
export function ParkedTasks({ list, kind, layout = 'cards', onBack }) {
  const { now, categoryById, setSelectedId, resumeTask, restoreTask, removeTask } = usePlanner()
  const [dropping, setDropping] = useState(null)
  const today = dateKey(now)
  const ago = (iso) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : '')
  const btn = (danger) => cx('inline-flex items-center gap-1 h-7 rounded-full px-2.5 text-[12px] font-semibold border border-line bg-card transition',
    danger ? 'text-coral-fg hover:bg-coral' : 'text-muted hover:text-ink hover:bg-page')

  const back = onBack && (
        <div className={cx('flex items-center justify-between text-[11px] font-semibold text-muted', layout === 'cards' ? 'mb-2 px-1' : 'px-5 pt-3')}>
          <span className="inline-flex items-center gap-1">{kind === 'dropped' ? <XCircle size={12} /> : <PauseCircle size={12} />}{kind === 'dropped' ? 'Dropped' : 'Paused'}</span>
          <button type="button" onClick={onBack} className="hover:text-ink underline">Back to tasks</button>
        </div>
      )
  if (!list.length) {
    return (
      <>
        {back}
        <p className={cx('text-sm text-faint', layout === 'cards' ? 'px-2 py-6 text-center' : 'px-5 py-4')}>
          {kind === 'dropped' ? 'Nothing dropped from here yet.' : 'Nothing paused here yet.'} Use a card's <b>…</b> menu to {kind === 'dropped' ? 'drop' : 'pause'} a task.
          {kind === 'dropped' && ' Dropped tasks are kept 30 days, then deleted.'}
        </p>
      </>
    )
  }
  return (
    <>
      {back}
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
