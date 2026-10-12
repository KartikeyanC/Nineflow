import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { addDays, parseISO } from 'date-fns'
import { Plus, MoreHorizontal, Search, LayoutGrid, List, ArrowUpDown, CalendarClock, CalendarCheck, Trash2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { STATUSES, STATUS_LABEL, PRIORITIES, PRIORITY_LABEL, carriedLabel, dateKey, dueLabel, fmtMinutes, isOverdue } from '../lib/tasks'
import { CategoryTag, CheckCircle, ConfirmDialog, Menu, PriorityPill, cx } from '../components/ui'
import TaskCard from '../components/TaskCard'

const COL = {
  // To Do uses the app's accent colour (orange in both designs).
  todo: { label: 'To Do', panel: 'bg-accent-soft/60', text: 'text-accent', header: 'bg-accent-soft' },
  working: { label: 'Working', panel: 'bg-sky/60', text: 'text-sky-fg', header: 'bg-sky' },
  completed: { label: 'Completed', panel: 'bg-mint/60', text: 'text-mint-fg', header: 'bg-mint' },
}
const RECENT_COMPLETED = 8

// Prefer a card under the pointer, then the column under it, then overlap.
function collisionDetection(args) {
  const within = pointerWithin(args)
  if (within.length) {
    const card = within.find((c) => !STATUSES.includes(c.id))
    return card ? [card] : within
  }
  return rectIntersection(args)
}

export default function Board() {
  const { tasks, now, settings, moveTask, sortStatus, moveOverdueToToday, clearCompleted, setQuickAdd } = usePlanner()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [mode, setMode] = useState('board')
  const [showAllDone, setShowAllDone] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // ---- filtering ----
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const today = dateKey(now)
    const weekEnd = dateKey(addDays(now, 6))
    return tasks.filter((t) => {
      if (q && !`${t.title} ${t.description}`.toLowerCase().includes(q)) return false
      if (filter === 'today') return t.date === today
      if (filter === 'week') return t.date && t.date >= today && t.date <= weekEnd
      if (filter === 'overdue') return isOverdue(t, now)
      if (filter.startsWith('cat:')) return t.category === filter.slice(4)
      if (filter.startsWith('pri:')) return t.priority === filter.slice(4)
      return true
    })
  }, [tasks, query, filter, now])

  // Column id lists derived from the global array order.
  const columns = useMemo(() => {
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, []]))
    for (const t of visible) byStatus[t.status].push(t)
    byStatus.completed.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    return byStatus
  }, [visible])

  const hiddenDone = Math.max(0, columns.completed.length - RECENT_COMPLETED)
  const shownColumns = useMemo(() => ({
    ...columns,
    completed: showAllDone ? columns.completed : columns.completed.slice(0, RECENT_COMPLETED),
  }), [columns, showAllDone])

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  // ---- drag and drop ----
  // While dragging we keep a local draft of the id lists and commit once at the end.
  const [draft, setDraft] = useState(null)
  const draftRef = useRef(null)
  const [activeId, setActiveId] = useState(null)
  // Mouse drags after 6px; touch needs a short hold so the page can still scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const idLists = useMemo(
    () => draft || Object.fromEntries(STATUSES.map((s) => [s, shownColumns[s].map((t) => t.id)])),
    [draft, shownColumns],
  )

  const containerOf = useCallback((id, lists) => {
    if (STATUSES.includes(id)) return id
    return STATUSES.find((s) => lists[s].includes(id)) || null
  }, [])

  const onDragStart = ({ active }) => {
    const lists = Object.fromEntries(STATUSES.map((s) => [s, shownColumns[s].map((t) => t.id)]))
    draftRef.current = lists
    setDraft(lists)
    setActiveId(active.id)
  }

  const onDragOver = ({ active, over }) => {
    if (!over) return
    const lists = draftRef.current
    const from = containerOf(active.id, lists)
    const to = containerOf(over.id, lists)
    if (!from || !to || from === to) return
    const next = { ...lists, [from]: lists[from].filter((id) => id !== active.id) }
    const overIndex = lists[to].indexOf(over.id)
    const target = [...lists[to]]
    target.splice(overIndex < 0 ? target.length : overIndex, 0, active.id)
    next[to] = target
    draftRef.current = next
    setDraft(next)
  }

  const onDragEnd = ({ active, over }) => {
    const lists = draftRef.current
    setActiveId(null)
    setDraft(null)
    draftRef.current = null
    if (!over || !lists) return
    const status = containerOf(active.id, lists)
    if (!status) return
    let ids = lists[status]
    if (over.id !== active.id && containerOf(over.id, lists) === status && !STATUSES.includes(over.id)) {
      ids = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))
    }
    const beforeId = ids[ids.indexOf(active.id) + 1] ?? null
    moveTask(active.id, status, beforeId)
  }

  const cancelDrag = () => {
    setActiveId(null)
    setDraft(null)
    draftRef.current = null
  }

  const activeTask = activeId ? taskById.get(activeId) : null

  return (
    <div className="animate-view-in h-full flex flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="h-display text-3xl">Board</h1>
          <p className="text-sm text-muted mt-1">Drag cards between columns. Moving a card to Working starts tracking its time.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[140px] sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-8 w-full sm:w-48 bg-card" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select className="input w-auto min-w-[10rem] bg-card" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All tasks</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="overdue">Carried over</option>
            <optgroup label="Category">
              {settings.categories.map((c) => <option key={c.id} value={`cat:${c.id}`}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Priority">
              {PRIORITIES.map((p) => <option key={p} value={`pri:${p}`}>{PRIORITY_LABEL[p]}</option>)}
            </optgroup>
          </select>
          <div className="inline-flex rounded-full border border-line bg-card p-1 gap-0.5">
            {[{ id: 'list', icon: List, label: 'List view' }, { id: 'board', icon: LayoutGrid, label: 'Board view' }].map((m) => (
              <button key={m.id} type="button" title={m.label} onClick={() => setMode(m.id)}
                className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center transition',
                  mode === m.id ? 'bg-ink text-page' : 'text-muted hover:text-ink')}>
                <m.icon size={15} />
              </button>
            ))}
          </div>
        </div>
      </header>

      {mode === 'list' ? (
        <ListView columns={columns} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetection}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={cancelDrag}>
          {/* Phones: one column per screen, swipe between them. */}
          <div className="flex md:grid md:grid-cols-3 gap-4 flex-1 min-h-0 overflow-x-auto md:overflow-visible snap-x snap-mandatory -mx-3 px-3 md:mx-0 md:px-0">
            {STATUSES.map((s) => (
              <Column
                key={s}
                status={s}
                ids={idLists[s]}
                taskById={taskById}
                activeId={activeId}
                onAdd={() => setQuickAdd({ status: s })}
                menu={[
                  { label: 'Add task', icon: Plus, onSelect: () => setQuickAdd({ status: s }) },
                  { label: 'Sort by priority', icon: ArrowUpDown, onSelect: () => sortStatus(s, 'priority') },
                  { label: 'Sort by due date', icon: CalendarClock, onSelect: () => sortStatus(s, 'date') },
                  'divider',
                  s === 'completed'
                    ? { label: 'Clear completed', icon: Trash2, danger: true, onSelect: () => setConfirmClear(true) }
                    : { label: 'Move carried-over to today', icon: CalendarCheck, onSelect: () => moveOverdueToToday(s) },
                ]}
                footer={
                  s === 'completed' && hiddenDone > 0 && !showAllDone ? (
                    <button type="button" onClick={() => setShowAllDone(true)}
                      className="text-xs font-semibold text-mint-fg hover:underline py-1">
                      Show {hiddenDone} older completed task{hiddenDone === 1 ? '' : 's'}
                    </button>
                  ) : null
                }
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <div className="rotate-[2.5deg] scale-[1.03] shadow-modal rounded-2xl">
                <TaskCard task={activeTask} tone={STATUSES.find((s) => idLists[s].includes(activeTask.id))} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={clearCompleted}
        title="Clear completed tasks?" body={`This deletes ${columns.completed.length} completed task${columns.completed.length === 1 ? '' : 's'}. Their logged focus time goes with them.`}
        confirmLabel="Clear" />
    </div>
  )
}

function Column({ status, ids, taskById, activeId, onAdd, menu, footer }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const c = COL[status]
  return (
    <section ref={setNodeRef}
      className={cx('rounded-card p-3 flex flex-col min-h-[360px] transition-shadow min-w-[86vw] md:min-w-0 snap-center', c.panel, isOver && 'ring-2 ring-inset ring-current/20', c.text)}>
      <div className="flex items-center gap-2 px-1 mb-3">
        <span className="h-6 min-w-6 px-1.5 rounded-full bg-card text-ink text-xs font-bold inline-flex items-center justify-center shadow-soft">{ids.length}</span>
        <h2 className={cx('font-bold text-sm', c.text)}>{c.label}</h2>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={onAdd} title="Add task" className="h-7 w-7 rounded-full inline-flex items-center justify-center hover:bg-card/70 transition">
            <Plus size={15} />
          </button>
          <Menu items={menu} trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} title="Column menu"
              className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center transition hover:bg-card/70', open && 'bg-card/70')}>
              <MoreHorizontal size={16} />
            </button>
          )} />
        </div>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto pr-0.5 text-ink">
          {ids.map((id) => taskById.get(id) && <SortableCard key={id} task={taskById.get(id)} tone={status} dragging={id === activeId} />)}
          {ids.length === 0 && (
            <div className={cx('flex-1 flex items-center justify-center text-xs font-semibold border-2 border-dashed rounded-2xl min-h-[96px]', c.text, 'border-current/30 opacity-70')}>
              Drop tasks here
            </div>
          )}
          {footer}
        </div>
      </SortableContext>

      <button type="button" onClick={onAdd}
        className={cx('mt-2.5 w-full rounded-2xl border-2 border-dashed border-current/30 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1 transition hover:bg-card/60', c.text)}>
        <Plus size={14} /> Add new task
      </button>
    </section>
  )
}

function SortableCard({ task, tone, dragging }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  const style = { transform: CSS.Translate.toString(transform), transition }
  return <TaskCard task={task} tone={tone} innerRef={setNodeRef} style={style} handleProps={{ ...attributes, ...listeners }} dragging={dragging} />
}

// ---- list view ----------------------------------------------------------

function ListView({ columns }) {
  const { categoryById, toggleComplete, setSelectedId, now } = usePlanner()
  return (
    <div className="space-y-4">
      {STATUSES.map((s) => {
        const c = COL[s]
        const list = columns[s]
        return (
          <section key={s} className="card overflow-hidden">
            <div className={cx('flex items-center gap-2 px-5 py-3', c.header, c.text)}>
              <h2 className="font-bold text-sm">{c.label}</h2>
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-card text-ink text-[11px] font-bold inline-flex items-center justify-center">{list.length}</span>
            </div>
            {list.length === 0 ? (
              <p className="px-5 py-4 text-sm text-faint">Nothing here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((t) => {
                  const done = t.status === 'completed'
                  const overdue = isOverdue(t, now)
                  return (
                    <li key={t.id} onClick={() => setSelectedId(t.id)} tabIndex={0} role="button"
                      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setSelectedId(t.id) } }}
                      className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-page focus-visible:bg-page outline-none transition">
                      <CheckCircle checked={done} onToggle={() => toggleComplete(t.id)} />
                      <p className={cx('flex-1 min-w-0 text-sm font-semibold truncate', done && 'line-through text-muted')}>
                        {t.title}
                        {overdue && <span className="pill bg-page text-muted border border-line text-[10px] px-1.5 py-0 ml-2">{carriedLabel(t.date, now)}</span>}
                      </p>
                      <CategoryTag category={categoryById(t.category)} className="hidden sm:inline-flex" />
                      <PriorityPill priority={t.priority} />
                      <span className="text-xs font-medium w-28 text-right text-muted">{dueLabel(t, now) || '—'}</span>
                      <span className="text-xs text-faint w-14 text-right">{fmtMinutes(t.durationMinutes)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
