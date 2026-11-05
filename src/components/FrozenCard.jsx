import React from 'react'
import { parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { Snowflake } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { STATUS_LABEL } from '../lib/tasks'
import { cx } from './ui'

// A frozen record on a past day: the task was here (with this status) and has moved on.
// Read-only; a click opens the live task. See lib/tasks.js leaveTrail / frozenOn.
export function movedOnLabel(task) {
  if (task.dropped) return 'since dropped'
  if (task.hold) return 'since paused'
  if (task.status === 'completed') return task.completedAt ? `done ${format(new Date(task.completedAt), 'MMM d')}` : 'done'
  if (!task.date) return 'now in Someday'
  return `now on ${format(parseISO(task.date), 'EEE, MMM d')} · ${STATUS_LABEL[task.status]}`
}

export default function FrozenCard({ task, entry, layout = 'card' }) {
  const { setSelectedId } = usePlanner()
  const open = () => setSelectedId(task.id)
  if (layout === 'row') {
    return (
      <li onClick={open} tabIndex={0} role="button" onKeyDown={(e) => { if (e.key === 'Enter') open() }}
        className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-page focus-visible:bg-page outline-none transition opacity-80">
        <Snowflake size={15} className="text-sky-fg shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-0 text-sm font-semibold truncate text-muted">{task.title || 'Untitled'}</p>
        <span className="text-xs text-faint shrink-0">was {STATUS_LABEL[entry.status]} · {movedOnLabel(task)}</span>
      </li>
    )
  }
  return (
    <button type="button" onClick={open} title="Frozen: this task was here that day and has moved on. Open it."
      className={cx('w-full text-left rounded-2xl border border-dashed border-line bg-card/60 px-3.5 py-2.5 text-ink transition hover:bg-card')}>
      <span className="flex items-start gap-2">
        <Snowflake size={13} className="text-sky-fg shrink-0 mt-0.5" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-snug text-muted">{task.title || 'Untitled'}</span>
          <span className="block text-xs text-faint mt-0.5">Moved on · {movedOnLabel(task)}</span>
        </span>
      </span>
    </button>
  )
}
