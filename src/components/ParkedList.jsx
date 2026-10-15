import React, { useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { PauseCircle, Play, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { DROP_KEEP_DAYS, dateKey } from '../lib/tasks'
import { columnOf } from '../lib/columns'
import { CategoryTag, Modal, cx } from './ui'
import ParkDialog from './ParkDialog'

// The paused or dropped tasks that belong to one Board column (its status, or the custom
// column they sat in), as a list with their reasons and what you can do next.
// kind: 'paused' | 'dropped'. Opened from each column's menu on the Board.
export function parkedIn(allTasks, col, cols, kind) {
  return allTasks
    .filter((t) => (kind === 'dropped' ? t.dropped : t.hold && !t.dropped) && columnOf(t, cols) === col.id)
    .sort((a, b) => (kind === 'dropped' ? b.dropped.at.localeCompare(a.dropped.at) : (a.hold.until || '9999').localeCompare(b.hold.until || '9999')))
}

export default function ParkedList({ col, cols, kind, onClose }) {
  const { allTasks, now, categoryById, setSelectedId, resumeTask, restoreTask, removeTask } = usePlanner()
  const [dropping, setDropping] = useState(null)
  const list = useMemo(() => parkedIn(allTasks, col, cols, kind), [allTasks, col, cols, kind])
  const today = dateKey(now)
  const ago = (iso) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : '')
  const btn = (danger) => cx('inline-flex items-center gap-1 h-7 rounded-full px-2.5 text-[12px] font-semibold border border-line transition',
    danger ? 'text-coral-fg hover:bg-coral' : 'text-muted hover:text-ink hover:bg-page')
  const open = (id) => { onClose(); setSelectedId(id) }

  return (
    <Modal open onClose={onClose} width="max-w-xl"
      title={`${kind === 'dropped' ? 'Dropped' : 'Paused'} from ${col.name} · ${list.length}`}>
      <p className="text-[12px] text-muted -mt-1 mb-3">
        {kind === 'dropped'
          ? `Let go, with the reason. Kept ${DROP_KEEP_DAYS} days so you can restore them, then deleted.`
          : 'Stopped on purpose. Off the Board, every plan and every reminder until you resume them, or until their check-again day.'}
      </p>
      {list.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-page px-4 py-5">
          {kind === 'dropped' ? <XCircle size={18} className="text-faint" /> : <PauseCircle size={18} className="text-faint" />}
          <p className="text-sm text-muted">Nothing {kind} from this column. Use a card's <b>…</b> menu to pause or drop a task.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line -mx-2 max-h-[60vh] overflow-y-auto">
          {list.map((t) => {
            const meta = kind === 'dropped'
              ? `${t.dropped.reason} · dropped ${ago(t.dropped.at)} · deleted in ${Math.max(0, DROP_KEEP_DAYS - differenceInCalendarDays(now, new Date(t.dropped.at)))} days`
              : `${t.hold.reason} · paused ${ago(t.hold.since)}${t.hold.until ? ` · back ${format(parseISO(t.hold.until), 'EEE, MMM d')}` : ''}`
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-2.5">
                <button type="button" onClick={() => open(t.id)} className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold truncate">{t.title || 'Untitled'}</span>
                  <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <CategoryTag category={categoryById(t.category)} className="text-[10px] py-0" />
                    <span className="text-[11px] text-faint">{meta}</span>
                  </span>
                </button>
                <div className="flex flex-wrap gap-1">
                  {kind === 'dropped' ? (
                    <>
                      <button type="button" className={btn()} onClick={() => restoreTask(t.id, today)}><RotateCcw size={12} /> Restore to today</button>
                      <button type="button" className={btn(true)} onClick={() => removeTask(t.id)}><Trash2 size={12} /> Delete now</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={btn()} onClick={() => resumeTask(t.id, today)}><Play size={12} /> Resume today</button>
                      <button type="button" className={btn()} onClick={() => resumeTask(t.id, dateKey(addDays(now, 1)))}>Tomorrow</button>
                      <button type="button" className={btn(true)} onClick={() => setDropping(t)}><XCircle size={12} /> Drop</button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {dropping && <ParkDialog task={dropping} mode="drop" onClose={() => setDropping(null)} />}
    </Modal>
  )
}
