import React, { useState } from 'react'
import { CalendarDays, Timer, ArrowRight, Repeat } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dueLabel, fmtMinutes, isDueToday, isOverdue, todayKey, totalMinutes } from '../lib/tasks'
import { describe } from '../lib/recurrence'
import { CategoryTag, CheckCircle, PriorityPill, cx } from './ui'

// Board card. Presentation only; the parent attaches drag behaviour through
// `innerRef`, `handleProps` and `style`.
export default function TaskCard({ task, dragging = false, handleProps, style, innerRef }) {
  const { categoryById, toggleComplete, setSelectedId, updateTask, now } = usePlanner()
  const [leaving, setLeaving] = useState(false)
  const done = task.status === 'completed'
  const overdue = isOverdue(task, now)
  const dueRed = !done && (overdue || isDueToday(task, now))
  const due = dueLabel(task, now)
  // Estimate vs actual, shown once a task is finished.
  const actual = done ? totalMinutes(task, now) : 0

  // Pop the circle, slide the card out, then change status.
  const onCheck = () => {
    if (leaving) return
    setLeaving(true)
    setTimeout(() => {
      toggleComplete(task.id)
      setLeaving(false)
    }, 240)
  }

  return (
    <div
      ref={innerRef}
      style={style}
      {...handleProps}
      onClick={() => setSelectedId(task.id)}
      className={cx(
        'group bg-card rounded-2xl border border-line shadow-soft p-3.5 cursor-pointer select-none',
        'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        dragging && 'opacity-30',
        leaving && 'animate-card-out pointer-events-none',
      )}
    >
      <div className="flex items-start gap-3">
        <p className={cx('flex-1 min-w-0 text-sm font-bold leading-snug', done && 'line-through text-muted')}>
          {task.title || 'Untitled'}
        </p>
        <CheckCircle checked={done || leaving} onToggle={onCheck} />
      </div>

      {due && (
        <p className={cx('mt-2 inline-flex items-center gap-1.5 text-xs font-medium', dueRed ? 'text-coral-fg' : 'text-muted')}>
          <CalendarDays size={13} /> {due}
          {overdue && <span className="pill bg-coral text-coral-fg text-[10px] tracking-wide px-1.5 py-0 ml-1">OVERDUE</span>}
        </p>
      )}

      {overdue && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); updateTask(task.id, { date: todayKey() }) }}
          className="mt-2.5 w-full rounded-xl bg-coral text-coral-fg text-xs font-semibold py-1.5 inline-flex items-center justify-center gap-1 hover:opacity-90 transition"
        >
          Move to today <ArrowRight size={12} />
        </button>
      )}

      <div className="mt-3 flex items-center gap-2">
        <CategoryTag category={categoryById(task.category)} />
        <span className="inline-flex items-center gap-1 text-[11px] text-faint font-medium" title={actual ? `Estimated ${fmtMinutes(task.durationMinutes)} · actual ${fmtMinutes(actual)}` : undefined}>
          <Timer size={12} /> {fmtMinutes(task.durationMinutes)}
          {actual > 0 && (
            <span className={cx('font-semibold', actual > task.durationMinutes * 1.15 ? 'text-coral-fg' : 'text-mint-fg')}>
              → {fmtMinutes(actual)}
            </span>
          )}
        </span>
        {task.recurrence && <Repeat size={12} className="text-lav-fg" title={describe(task.recurrence)} />}
        <PriorityPill priority={task.priority} className="ml-auto" />
      </div>
    </div>
  )
}
