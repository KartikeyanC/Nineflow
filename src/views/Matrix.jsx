import React, { useMemo } from 'react'
import { addDays } from 'date-fns'
import { DndContext, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Flame, CalendarClock, Zap, Archive } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, dueLabel } from '../lib/tasks'
import { CheckCircle, PriorityPill, cx } from '../components/ui'

// Eisenhower matrix: important = high priority, urgent = due today, tomorrow or overdue.
const QUADRANTS = [
  { id: 'do', important: true, urgent: true, title: 'Do first', hint: 'Important and urgent', icon: Flame, tone: 'bg-rose/40' },
  { id: 'schedule', important: true, urgent: false, title: 'Schedule', hint: 'Important, not urgent', icon: CalendarClock, tone: 'bg-mint/40' },
  { id: 'quick', important: false, urgent: true, title: 'Quick wins', hint: 'Urgent, not important', icon: Zap, tone: 'bg-sky/40' },
  { id: 'later', important: false, urgent: false, title: 'Later', hint: 'Neither', icon: Archive, tone: 'bg-line/40' },
]

function MatrixCard({ task, now }) {
  const { toggleComplete, setSelectedId } = usePlanner()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => setSelectedId(task.id)}
      className={cx('flex items-center gap-2.5 rounded-xl bg-card border border-line px-3 py-2 cursor-grab touch-none',
        isDragging && 'opacity-40')}
    >
      <CheckCircle size="sm" checked={false} onToggle={() => toggleComplete(task.id)} />
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{task.title || 'Untitled'}</span>
      {task.date && <span className="text-xs text-muted shrink-0">{dueLabel(task, now)}</span>}
      <PriorityPill priority={task.priority} className="hidden sm:inline-flex" />
    </div>
  )
}

function Quadrant({ q, tasks, now }) {
  const { setNodeRef, isOver } = useDroppable({ id: q.id })
  const Icon = q.icon
  return (
    <section ref={setNodeRef} className={cx('card p-4 flex flex-col min-h-[220px] transition', isOver && 'ring-2 ring-brand')}>
      <header className="flex items-center gap-2.5 mb-3">
        <span className={cx('h-8 w-8 rounded-xl flex items-center justify-center', q.tone)}><Icon size={16} /></span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{q.title}</h2>
          <p className="text-xs text-muted">{q.hint}</p>
        </div>
        <span className="text-xs font-semibold text-muted">{tasks.length}</span>
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {tasks.map((t) => <MatrixCard key={t.id} task={t} now={now} />)}
        {!tasks.length && <p className="text-xs text-muted py-4 text-center">Drop a task here</p>}
      </div>
    </section>
  )
}

export default function Matrix() {
  const { tasks, now, updateTask } = usePlanner()
  const today = dateKey(now)
  const tomorrow = dateKey(addDays(now, 1))
  const isUrgent = (t) => !!t.date && t.date <= tomorrow
  const isImportant = (t) => t.priority === 'high'

  const groups = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'completed' && !(t.date && t.date < today && t.seriesId && t.recurrence))
    return QUADRANTS.map((q) => ({
      q,
      tasks: open.filter((t) => isImportant(t) === q.important && isUrgent(t) === q.urgent),
    }))
  }, [tasks, today, tomorrow])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  // Dropping on a quadrant sets just enough to put the task there.
  const onDragEnd = ({ active, over }) => {
    const task = tasks.find((t) => t.id === active.id)
    const q = QUADRANTS.find((x) => x.id === over?.id)
    if (!task || !q) return
    const patch = {}
    if (q.important !== isImportant(task)) patch.priority = q.important ? 'high' : 'medium'
    if (q.urgent !== isUrgent(task)) patch.date = q.urgent ? today : dateKey(addDays(now, 3))
    if (Object.keys(patch).length) updateTask(task.id, patch)
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div>
        <h1 className="text-2xl font-semibold">Matrix</h1>
        <p className="text-sm text-muted">Important means high priority; urgent means due by tomorrow. Drag a task to re-rank it.</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map(({ q, tasks: ts }) => <Quadrant key={q.id} q={q} tasks={ts} now={now} />)}
        </div>
      </DndContext>
    </div>
  )
}
