import React, { useState } from 'react'
import { CalendarDays, Timer, ArrowRight, Repeat, Check, ListChecks, Bell } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { reminderShort } from '../lib/taskMeta'
import { carriedLabel, dueLabel, fmtMinutes, isOverdue, subProgress, todayKey, totalMinutes } from '../lib/tasks'
import { describe } from '../lib/recurrence'
import { CARD_STYLE, STATUS_CARD_COLOR } from '../lib/columns'
import { CategoryTag, CheckCircle, PriorityPill, cx } from './ui'

// In dark mode a card takes the colour of the column it sits in (see CARD_STYLE).

// Board card. Presentation only; the parent attaches drag behaviour through
// `innerRef`, `handleProps` and `style`. `tone` is the column it is in right
// now, as a column colour (it changes while the card is dragged across, before the status does).
// `select` ({ picked, onToggle }) puts it in "choose tasks" mode: tapping picks
// the card instead of opening it, and the done circle becomes a pick circle.
export default function TaskCard({ task, tone, dragging = false, handleProps, style, innerRef, select }) {
  const { categoryById, toggleComplete, setSelectedId, updateTask, now } = usePlanner()
  const [leaving, setLeaving] = useState(false)
  const done = task.status === 'completed'
  const overdue = isOverdue(task, now)
  const due = dueLabel(task, now)
  const sub = subProgress(task)
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
      onClick={() => (select ? select.onToggle() : setSelectedId(task.id))}
      // Enter opens the task; Space still picks the card up to move it.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); setSelectedId(task.id); return }
        handleProps?.onKeyDown?.(e)
      }}
      aria-label={`${task.title || 'Untitled'}${overdue ? `, carried over ${carriedLabel(task.date, now)}` : ''}. Enter to open, Space to move.`}
      className={cx(
        'group bg-card rounded-2xl border border-line shadow-soft p-3.5 cursor-pointer select-none',
        CARD_STYLE[tone] || CARD_STYLE[STATUS_CARD_COLOR[task.status]],
        // On the board dnd-kit owns `transform` (and its transition), so a CSS
        // transform transition or hover lift there would fight it and stutter.
        innerRef ? 'transition-shadow duration-200 hover:shadow-lift' : 'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        dragging && 'opacity-40 shadow-none',
        select?.picked && 'ring-2 ring-accent',
        leaving && 'animate-card-out pointer-events-none',
      )}
    >
      <div className="flex items-start gap-3">
        <p className={cx('flex-1 min-w-0 text-sm font-bold leading-snug', done && 'line-through text-muted')}>
          {task.title || 'Untitled'}
        </p>
        {select
          ? <span role="checkbox" aria-checked={select.picked} aria-label="Select this task"
              className={cx('shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center', select.picked ? 'bg-accent border-accent text-white' : 'border-line bg-page')}>
              {select.picked && <Check size={12} strokeWidth={3.5} />}
            </span>
          : <CheckCircle checked={done || leaving} onToggle={onCheck} />}
      </div>

      {due && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <CalendarDays size={13} /> {due}
          {overdue && <span className="pill bg-page text-muted border border-line text-[10px] px-1.5 py-0 ml-1">carried over</span>}
        </p>
      )}

      {overdue && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); updateTask(task.id, { date: todayKey() }) }}
          className="mt-2.5 w-full rounded-xl bg-page border border-line text-ink text-xs font-semibold py-1.5 inline-flex items-center justify-center gap-1 hover:border-faint transition"
        >
          Move to today <ArrowRight size={12} />
        </button>
      )}

      {(task.tags || []).length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-semibold text-lav-fg">
          {task.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
          {task.tags.length > 3 && <span className="text-faint">+{task.tags.length - 3}</span>}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <CategoryTag category={categoryById(task.category)} />
        <span className="inline-flex items-center gap-1 text-[11px] text-faint font-medium" title={actual ? `Estimated ${fmtMinutes(task.durationMinutes)} · actual ${fmtMinutes(actual)}` : undefined}>
          <Timer size={12} /> {fmtMinutes(task.durationMinutes)}
          {actual > 0 && (
            <span className={cx('font-semibold', actual > task.durationMinutes * 1.15 ? 'text-peach-fg' : 'text-mint-fg')}>
              → took {fmtMinutes(actual)}
            </span>
          )}
        </span>
        {sub.total > 0 && (
          <span className={cx('inline-flex items-center gap-1 text-[11px] font-semibold tnum', sub.done === sub.total ? 'text-mint-fg' : 'text-faint')} title={`${sub.done} of ${sub.total} steps done`}>
            <ListChecks size={12} /> {sub.done}/{sub.total}
          </span>
        )}
        {task.recurrence && <Repeat size={12} className="text-lav-fg" title={describe(task.recurrence)} />}
        {Array.isArray(task.reminders) && task.reminders.length > 0 && <Bell size={12} className="text-faint" aria-label="Has reminders" title={`Reminders: ${task.reminders.map(reminderShort).join(', ')}`} />}
        <PriorityPill priority={task.priority} className="ml-auto" />
      </div>
    </div>
  )
}
