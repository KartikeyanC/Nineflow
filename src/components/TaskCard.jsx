import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Timer, ArrowRight, Repeat, Check, ListChecks, Bell, MoreHorizontal, PauseCircle, XCircle } from 'lucide-react'
import ParkDialog from './ParkDialog'
import { usePlanner } from '../store/PlannerContext'
import { reminderShort } from '../lib/taskMeta'
import { carriedLabel, daysOnPlan, dueLabel, fmtMinutes, isOverdue, startDayOf, subProgress, todayKey, totalMinutes } from '../lib/tasks'
import { parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { describe } from '../lib/recurrence'
import RequiredBadge from './RequiredBadge'
import { CARD_STYLE, STATUS_CARD_COLOR, cleanColumns, columnOf } from '../lib/columns'
import { usePhone } from '../lib/usePhone'
import { CategoryTag, CheckCircle, Menu, PriorityPill, cx } from './ui'
import { WorkForBadge } from './WorkFor'

// In dark mode a card takes the colour of the column it sits in (see CARD_STYLE).

// Board card. Presentation only; the parent attaches drag behaviour through
// `innerRef`, `handleProps` and `style`. `tone` is the column it is in right
// now, as a column colour (it changes while the card is dragged across, before the status does).
// `select` ({ picked, onToggle }) puts it in "choose tasks" mode: tapping picks
// the card instead of opening it, and the done circle becomes a pick circle.
export default function TaskCard({ task, tone, dragging = false, handleProps, style, innerRef, select }) {
  const { categoryById, toggleComplete, setSelectedId, updateTask, moveTask, settings, now } = usePlanner()
  const phone = usePhone()
  // Phones show one column at a time, so a card can't be dragged across: its menu moves it instead.
  const cols = cleanColumns(settings.columns)
  const here = columnOf(task, cols)
  const moves = phone ? [...cols.filter((c) => c.id !== here).map((c) => ({ label: `Move to ${c.name}`, icon: ArrowRight, onSelect: () => moveTask(task.id, c.id) })), 'divider'] : []
  const [leaving, setLeaving] = useState(false)
  const [park, setPark] = useState(null) // 'pause' | 'drop'
  const done = task.status === 'completed'
  const overdue = isOverdue(task, now)
  const due = dueLabel(task, now)
  const sub = subProgress(task)
  // Estimate vs actual, shown once a task is finished.
  const actual = done ? totalMinutes(task, now) : 0
  const overBy = actual > 0 ? actual - task.durationMinutes : 0 // minutes over (+) or under (−) the estimate

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
          : (
            <>
              {!done && (
                // The card's own menu: pause or drop it here. Its clicks never open or drag the card.
                <span className="shrink-0 -my-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Menu items={[
                    ...moves,
                    { label: 'Pause…', icon: PauseCircle, onSelect: () => setPark('pause') },
                    { label: 'Drop…', icon: XCircle, danger: true, onSelect: () => setPark('drop') },
                  ]} trigger={({ toggle, open }) => (
                    <button type="button" onClick={toggle} aria-label={`More for ${task.title || 'this task'}`} title="Pause or drop"
                      className={cx('tap-target h-6 w-6 rounded-full inline-flex items-center justify-center text-faint hover:text-ink hover:bg-page transition', open && 'bg-page text-ink')}>
                      <MoreHorizontal size={15} />
                    </button>
                  )} />
                </span>
              )}
              <CheckCircle checked={done || leaving} onToggle={onCheck} />
            </>
          )}
      </div>
      {/* Drawn on <body>: a dragged card has a transform, which would misplace a fixed dialog.
          React still passes the dialog's events up to the card, so they stop here (no opening,
          no dragging, no Space picking the card up while typing a reason). */}
      {park && createPortal(
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ParkDialog task={task} mode={park} onClose={() => setPark(null)} />
        </div>, document.body)}

      {due && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <CalendarDays size={13} /> {due}
          {overdue && <span className="pill bg-page text-muted border border-line text-[11px] px-1.5 py-0 ml-1">carried over</span>}
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

      {/* Which day it started, once it has been going for more than a day (see the day trail) */}
      {!done && startDayOf(task) && task.date && startDayOf(task) < task.date && (
        <p className="mt-1.5 text-xs font-medium text-faint">Since {format(parseISO(startDayOf(task)), 'MMM d')} · day {daysOnPlan(task, now)}</p>
      )}

      {(task.client || (task.tags || []).length > 0) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-lav-fg">
          <WorkForBadge name={task.client} className="max-w-[12rem]" />
          {(task.tags || []).slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
          {(task.tags || []).length > 3 && <span className="text-faint">+{task.tags.length - 3}</span>}
        </p>
      )}

      {/* One line at normal widths. flex-wrap only kicks in when a column is too narrow, so the priority
          pill moves down a line rather than spilling out of the card. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <CategoryTag category={categoryById(task.category)} className="shrink-0 whitespace-nowrap" />
        {/* Estimate, then how far off it was: "30m +3h 41m" over, "30m −10m" under. Kept as one piece. */}
        <span className="inline-flex items-center gap-1 text-xs text-faint font-medium tnum whitespace-nowrap shrink-0"
          title={actual ? `Took ${fmtMinutes(actual)} · estimated ${fmtMinutes(task.durationMinutes)}${overBy ? ` · ${fmtMinutes(Math.abs(overBy))} ${overBy > 0 ? 'over' : 'under'}` : ''}` : undefined}>
          <Timer size={12} /> {fmtMinutes(task.durationMinutes)}
          {overBy !== 0 && (
            <span className={cx('font-semibold', overBy > 0 ? 'text-peach-fg' : 'text-mint-fg')}>
              {overBy > 0 ? '+' : '−'}{fmtMinutes(Math.abs(overBy))}
            </span>
          )}
        </span>
        {sub.total > 0 && (
          <span className={cx('inline-flex items-center gap-1 text-xs font-semibold tnum whitespace-nowrap shrink-0', sub.done === sub.total ? 'text-mint-fg' : 'text-faint')} title={`${sub.done} of ${sub.total} steps done`}>
            <ListChecks size={12} /> {sub.done}/{sub.total}
          </span>
        )}
        <RequiredBadge task={task} />
        {task.recurrence && <Repeat size={12} className="text-lav-fg" title={describe(task.recurrence)} />}
        {Array.isArray(task.reminders) && task.reminders.length > 0 && <Bell size={12} className="text-faint" aria-label="Has reminders" title={`Reminders: ${task.reminders.map(reminderShort).join(', ')}`} />}
        <PriorityPill priority={task.priority} className="ml-auto shrink-0 whitespace-nowrap" />
      </div>
    </div>
  )
}
