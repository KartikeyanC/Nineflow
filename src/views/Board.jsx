import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor, defaultDropAnimationSideEffects,
  pointerWithin, rectIntersection, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { addDays, parseISO } from 'date-fns'
import { Plus, MoreHorizontal, Search, LayoutGrid, List, ArrowUpDown, CalendarClock, CalendarCheck, CalendarDays, Trash2, CheckSquare, X, Layers, SlidersHorizontal, Bookmark, Columns3 } from 'lucide-react'
import { ParkChips, ParkedTasks, parkedIn } from '../components/ParkedList'
import FrozenCard from '../components/FrozenCard'
import { frozenOn } from '../lib/tasks'
import { usePlanner } from '../store/PlannerContext'
import { currentProfileId } from '../lib/profiles'
import { allTags } from '../lib/taskMeta'
import { MAX_VIEWS, WHEN_OPTIONS, blankCrit, cleanViews, critCount, matches } from '../lib/views'
import { uid } from '../lib/storage'
import { currentWorkspaceId, listWorkspaces } from '../lib/workspaces'
import { STATUSES, PRIORITIES, PRIORITY_LABEL, carriedLabel, dateKey, dueLabel, fmtMinutes, isOverdue } from '../lib/tasks'
import { cleanColumns, columnOf, isOriginal, styleOf } from '../lib/columns'
import ColumnsEditor from '../components/ColumnsEditor'
import { CategoryTag, CheckCircle, ConfirmDialog, Menu, Modal, PriorityPill, cx } from '../components/ui'
import TaskCard from '../components/TaskCard'
import RequiredBadge from '../components/RequiredBadge'
import DayNav, { NARROW_HIDE } from '../components/DayNav'

const RECENT_COMPLETED = 8
// Button labels hide (the icon and a tooltip stay) once the header is narrower than 1200px, so the title
// and every control keep to one row. Needs the header to be a size container (see the <header> below).
const LABEL = NARROW_HIDE

// Cards change columns while dragging, so re-measure every frame of a drag.
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }
// On drop the floating card glides into its slot instead of vanishing.
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const DROP_ANIMATION = {
  duration: 220,
  easing: EASE,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
}

// Columns are 'todo' / 'working' / 'completed' or 'col_…'; anything else is a card.
const isColumnId = (id) => STATUSES.includes(id) || String(id).startsWith('col_')

// Prefer a card under the pointer, then the column under it, then overlap.
function collisionDetection(args) {
  const within = pointerWithin(args)
  if (within.length) {
    const card = within.find((c) => !isColumnId(c.id))
    return card ? [card] : within
  }
  return rectIntersection(args)
}

export default function Board() {
  const { tasks, allTasks, now, settings, updateSettings, moveToWorkspace, moveTask, sortStatus, moveOverdueToToday, clearCompleted, setQuickAdd, dashboardDate, setDashboardDate } = usePlanner()
  const [query, setQuery] = useState('')
  // Filters: a search plus When / Category / Priority / Tag, which can be saved as a named view.
  const [crit, setCrit] = useState(blankCrit)
  const [viewId, setViewId] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [naming, setNaming] = useState(false)
  const [viewName, setViewName] = useState('')
  const [mode, setMode] = useState('board')
  // The Board shows one day at a time (the same selected day as the Dashboard), or every task at once.
  const [scope, setScope] = useState('day') // 'day' | 'all'
  const [showAllDone, setShowAllDone] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // ---- choosing several cards to send to another workspace ----
  const pid = currentProfileId()
  const otherWorkspaces = pid ? listWorkspaces(pid).filter((w) => w.id !== currentWorkspaceId(pid)) : []
  const [selecting, setSelecting] = useState(false)
  // What each column shows, one click away: its tasks, or its paused / dropped ones.
  const [colShow, setColShow] = useState({}) // { [columnId]: 'active' | 'paused' | 'dropped' }
  // A day's frozen records: tasks that were on it and moved on unfinished (lib/tasks.js frozenOn),
  // each in the column it was in that day. Only for one day (not "All days").
  const frozenFor = (col) => (scope !== 'day' ? [] : frozenOn(allTasks, dashboardDate)
    .filter(({ entry }) => columnOf({ status: entry.status, column: entry.column }, cols) === col.id))
  const showOf = (id) => colShow[id] || 'active'
  const shownOf = (col) => showOf(col.id)
  // A list that empties while it is open (its last task resumed or restored) goes back to the
  // tasks. An empty list opened on purpose stays open.
  const lastCounts = useRef({})
  useEffect(() => {
    for (const col of cols) {
      const v = showOf(col.id)
      if (v === 'active') continue
      const n = parkedIn(allTasks, col, cols, v).length
      const was = lastCounts.current[`${col.id}:${v}`]
      if (was > 0 && n === 0) setShow(col.id, 'active')
      lastCounts.current[`${col.id}:${v}`] = n
    }
  }, [allTasks, colShow]) // eslint-disable-line react-hooks/exhaustive-deps
  const setShow = (id, v) => setColShow((m) => ({ ...m, [id]: v }))
  const parkedOf = (col) => ({ paused: parkedIn(allTasks, col, cols, 'paused'), dropped: parkedIn(allTasks, col, cols, 'dropped') })
  const [picked, setPicked] = useState(() => new Set())
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()) }
  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  useEffect(() => {
    if (!selecting) return undefined
    const onKey = (e) => { if (e.key === 'Escape') stopSelecting() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting])

  // ---- filtering ----
  const tagList = useMemo(() => allTags(tasks), [tasks])
  const views = useMemo(() => cleanViews(settings.views), [settings.views])
  // "When" looks across days, so it only applies to "All days"; on a single day the day itself is the filter.
  const critNow = useMemo(() => (scope === 'day' ? { ...crit, when: 'all' } : crit), [scope, crit])
  const visible = useMemo(
    () => tasks.filter((t) => (scope === 'all' || t.date === dashboardDate) && matches(t, critNow, query, now)),
    [tasks, scope, dashboardDate, critNow, query, now],
  )
  const activeFilters = critCount(critNow, query)
  const setC = (patch) => {
    setCrit((c) => ({ ...c, ...patch })); setViewId('')
    if (patch.when && patch.when !== 'all') setScope('all') // choosing a When filter means looking across days
  }
  // Pick a day (arrows, the date picker, Back to today): back to the single-day view.
  const goDay = (key) => { setDashboardDate(key); setScope('day'); if (crit.when !== 'all') setC({ when: 'all' }) }
  // A new task starts on the day you are looking at, so tomorrow's to-dos can be made from tomorrow's board.
  const quickAddFor = (col) => setQuickAdd({ status: col.base, column: isOriginal(col) ? null : col.id, ...(scope === 'day' ? { date: dashboardDate } : {}) })
  const applyView = (id) => {
    const v = views.find((x) => x.id === id)
    setViewId(v ? v.id : '')
    setCrit(v ? { ...blankCrit(), ...v.crit } : blankCrit())
    setQuery(v ? v.text : '')
    if (v && critCount(v.crit) > 0) setShowFilters(true)
    if (v && v.crit.when && v.crit.when !== 'all') setScope('all') // a saved view that filters by When looks across days
  }
  const clearFilters = () => { setCrit(blankCrit()); setQuery(''); setViewId('') }
  const saveView = () => {
    const name = viewName.trim()
    if (!name || views.length >= MAX_VIEWS) return
    const v = { id: uid(), name: name.slice(0, 30), text: query.trim(), crit }
    updateSettings({ views: [...views, v] })
    setViewId(v.id); setNaming(false); setViewName('')
  }
  const deleteView = () => { updateSettings({ views: views.filter((v) => v.id !== viewId) }); setViewId('') }


  // The Board's columns (settings.columns: the three originals plus any you added),
  // and which tasks sit in each.
  const cols = useMemo(() => cleanColumns(settings.columns), [settings.columns])
  const colIds = useMemo(() => cols.map((c) => c.id), [cols])
  const columns = useMemo(() => {
    const byCol = Object.fromEntries(colIds.map((id) => [id, []]))
    for (const t of visible) byCol[columnOf(t, cols)].push(t)
    for (const c of cols) if (c.base === 'completed') byCol[c.id].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    return byCol
  }, [visible, cols, colIds])

  // Finished columns show the newest few; the rest are one click away.
  const hiddenDone = cols.filter((c) => c.base === 'completed').reduce((n, c) => n + Math.max(0, columns[c.id].length - RECENT_COMPLETED), 0)
  const shownColumns = useMemo(() => Object.fromEntries(cols.map((c) => [c.id, c.base === 'completed' && !showAllDone ? columns[c.id].slice(0, RECENT_COMPLETED) : columns[c.id]])), [cols, columns, showAllDone])
  const completedCount = cols.filter((c) => c.base === 'completed').reduce((n, c) => n + columns[c.id].length, 0)
  const [editingColumns, setEditingColumns] = useState(false)

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const shownIds = useMemo(() => colIds.flatMap((s) => shownColumns[s].map((t) => t.id)), [colIds, shownColumns])
  const sendPicked = (workspaceId) => {
    const w = otherWorkspaces.find((x) => x.id === workspaceId)
    if (w && moveToWorkspace([...picked].filter((id) => taskById.has(id)), w)) stopSelecting()
  }

  // ---- drag and drop ----
  // While dragging we keep a local draft of the id lists and commit once at the end.
  const [draft, setDraft] = useState(null)
  const draftRef = useRef(null)
  const [activeId, setActiveId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  // Mouse drags after 6px; touch needs a short hold so the page can still scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const idLists = useMemo(
    () => draft || Object.fromEntries(colIds.map((s) => [s, shownColumns[s].map((t) => t.id)])),
    [draft, colIds, shownColumns],
  )

  const containerOf = useCallback((id, lists) => {
    if (isColumnId(id)) return id
    return Object.keys(lists).find((s) => lists[s].includes(id)) || null
  }, [])

  const onDragStart = ({ active }) => {
    const lists = Object.fromEntries(colIds.map((s) => [s, shownColumns[s].map((t) => t.id)]))
    draftRef.current = lists
    setDraft(lists)
    setActiveId(active.id)
  }

  const onDragOver = ({ active, over }) => {
    if (!over) return
    const lists = draftRef.current
    const from = containerOf(active.id, lists)
    const to = containerOf(over.id, lists)
    setOverColumn(to)
    if (!from || !to || from === to) return
    const next = { ...lists, [from]: lists[from].filter((id) => id !== active.id) }
    const target = [...lists[to]]
    let at
    if (cols.find((c) => c.id === to)?.base === 'completed') {
      // Completed is newest first, so a finished card always lands on top.
      at = 0
    } else {
      // Over a card: go above or below it depending on which half the dragged
      // card's centre is in, so the list doesn't flip back and forth.
      const overIndex = target.indexOf(over.id)
      const dragged = active.rect.current.translated
      const below = overIndex >= 0 && dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2
      at = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0)
    }
    target.splice(at, 0, active.id)
    next[to] = target
    draftRef.current = next
    setDraft(next)
  }

  const onDragEnd = ({ active, over }) => {
    const lists = draftRef.current
    setActiveId(null)
    setOverColumn(null)
    setDraft(null)
    draftRef.current = null
    if (!over || !lists) return
    const status = containerOf(active.id, lists)
    if (!status) return
    let ids = lists[status]
    if (over.id !== active.id && containerOf(over.id, lists) === status && !isColumnId(over.id)) {
      ids = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))
    }
    const beforeId = ids[ids.indexOf(active.id) + 1] ?? null
    moveTask(active.id, status, beforeId)
  }

  const cancelDrag = () => {
    setActiveId(null)
    setOverColumn(null)
    setDraft(null)
    draftRef.current = null
  }

  const activeTask = activeId ? taskById.get(activeId) : null

  return (
    <div className="animate-view-in h-full flex flex-col">
      <header className="[container-type:inline-size] flex flex-wrap items-center gap-x-4 gap-y-3 mb-6">
        <h1 className="h-display text-3xl shrink-0">Board</h1>
        {/* Everything else shares the title's row; it only wraps (right-aligned) when there truly is no room. */}
        <div className="flex flex-wrap items-center justify-end gap-2 basis-full sm:basis-0 sm:flex-1 min-w-0">
          <DayNav value={dashboardDate} onChange={goDay} backLabel="Today" compact />
          <button type="button" onClick={() => setScope((s) => (s === 'all' ? 'day' : 'all'))} aria-pressed={scope === 'all'}
            data-tip="All days" data-tip-hint={scope === 'all' ? 'Showing every task. Pick a day to go back to one day.' : 'Show every task, whatever its day (including undated ones)'}
            aria-label="All days"
            className={cx('h-9 px-3 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition',
              scope === 'all' ? 'bg-brand text-white border-transparent' : 'bg-card border-line text-muted hover:text-ink')}>
            <CalendarDays size={14} /><span className={LABEL}>All days</span>
          </button>
          <label className="relative min-w-[8rem] flex-1 sm:basis-32 sm:min-w-[6rem] sm:max-w-[11rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-8 w-full bg-card" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select className="input w-auto min-w-[6.5rem] max-w-[9.5rem] shrink bg-card" value={viewId} aria-label="Saved views" onChange={(e) => applyView(e.target.value)}>
            <option value="">All tasks</option>
            {views.length > 0 && (
              <optgroup label="Saved views">
                {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </optgroup>
            )}
          </select>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="board-filters"
            aria-label="Filters" data-tip="Filters" data-tip-hint="By when, category, priority or tag"
            className={cx('h-9 px-3 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition',
              showFilters || activeFilters ? 'bg-brand text-white border-transparent' : 'bg-card border-line text-muted hover:text-ink')}>
            <SlidersHorizontal size={14} /><span className={LABEL}>Filters</span>{activeFilters > 0 && <span className="h-5 min-w-5 px-1 rounded-full bg-page text-ink text-[11px] font-bold inline-flex items-center justify-center">{activeFilters}</span>}
          </button>
          {mode === 'board' && (
            <button type="button" onClick={() => setEditingColumns(true)} data-tip="Columns" data-tip-hint="Add, rename and reorder the Board's columns" aria-label="Columns"
              className="h-9 px-3 rounded-full border border-line bg-card text-[13px] font-semibold text-muted hover:text-ink inline-flex items-center gap-1.5 transition">
              <Columns3 size={14} /><span className={LABEL}>Columns</span>
            </button>
          )}
          {otherWorkspaces.length > 0 && mode === 'board' && (
            <button type="button" onClick={() => (selecting ? stopSelecting() : setSelecting(true))} aria-pressed={selecting}
              data-tip="Select" data-tip-hint="Choose several tasks to move to another workspace" aria-label="Select"
              className={cx('h-9 px-3 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition',
                selecting ? 'bg-brand text-white border-transparent' : 'bg-card border-line text-muted hover:text-ink')}>
              <CheckSquare size={14} /><span className={LABEL}>Select</span>
            </button>
          )}
          <div className="inline-flex rounded-full border border-line bg-card p-1 gap-0.5">
            {[{ id: 'list', icon: List, label: 'List view' }, { id: 'board', icon: LayoutGrid, label: 'Board view' }].map((m) => (
              <button key={m.id} type="button" data-tip={m.label} aria-label={m.label} onClick={() => setMode(m.id)}
                className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center transition',
                  mode === m.id ? 'bg-brand text-white' : 'text-muted hover:text-ink')}>
                <m.icon size={15} />
              </button>
            ))}
          </div>
        </div>
        {/* The hint is too long to sit beside the controls, so it gets the line under them. */}
        <p className="basis-full -mt-1 text-sm text-muted">Drag cards between columns. Moving a card to Working starts tracking its time.</p>
      </header>

      {showFilters && (
        <div id="board-filters" className="mb-4 -mt-2 rounded-2xl bg-card border border-line p-3 flex flex-wrap items-end gap-3 animate-fade-in">
          {[
            ['When', 'when', WHEN_OPTIONS.map((o) => [o.value, o.label])],
            ['Category', 'category', [['', 'Any category'], ...settings.categories.map((c) => [c.id, c.name])]],
            ['Priority', 'priority', [['', 'Any priority'], ...PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]])]],
            ['Tag', 'tag', [['', 'Any tag'], ...tagList.map(({ tag, count }) => [tag, `#${tag} (${count})`])]],
          ].map(([label, key, options]) => (
            <label key={key} className="flex flex-col gap-1 min-w-[8.5rem]">
              <span className="text-[11px] font-semibold text-muted">{label}</span>
              <select className="input py-1.5 bg-page" value={crit[key]} onChange={(e) => setC({ [key]: e.target.value })}>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            {activeFilters > 0 && <button type="button" className="btn-ghost h-9 py-0 px-3" onClick={clearFilters}>Clear</button>}
            {viewId && <button type="button" className="btn-ghost h-9 py-0 px-3 text-coral-fg" onClick={deleteView} title="Delete this saved view"><Trash2 size={13} /> Delete view</button>}
            {!viewId && activeFilters > 0 && !naming && views.length < MAX_VIEWS && (
              <button type="button" className="btn-black h-9 py-0 px-3.5" onClick={() => { setNaming(true); setViewName('') }}><Bookmark size={13} /> Save view</button>
            )}
            {naming && (
              <form onSubmit={(e) => { e.preventDefault(); saveView() }} className="flex items-center gap-2">
                <input autoFocus className="input h-9 py-0 w-40" placeholder="Name this view" maxLength={30} value={viewName} onChange={(e) => setViewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setNaming(false) } }} aria-label="View name" />
                <button type="submit" disabled={!viewName.trim()} className={cx('btn-black h-9 py-0 px-3.5', !viewName.trim() && 'opacity-40')}>Save</button>
                <button type="button" onClick={() => setNaming(false)} aria-label="Cancel" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:bg-page hover:text-ink"><X size={14} /></button>
              </form>
            )}
          </div>
        </div>
      )}

      {selecting && mode === 'board' && (
        <div role="region" aria-label="Move selected tasks"
          className="sticky top-2 z-40 mx-auto mb-4 w-fit flex items-center gap-2 rounded-full bg-ink text-page shadow-modal pl-5 pr-2 h-12 max-w-full animate-modal-in">
          <span className="text-[13px] font-semibold tnum whitespace-nowrap">{picked.size === 0 ? 'Tap tasks to pick them' : `${picked.size} selected`}</span>
          <button type="button" onClick={() => setPicked(picked.size === shownIds.length ? new Set() : new Set(shownIds))}
            className="h-8 rounded-full px-3 text-[12px] font-semibold hover:bg-page/15 transition whitespace-nowrap">{picked.size === shownIds.length && shownIds.length > 0 ? 'Clear' : 'Select all'}</button>
          <label className="relative inline-flex items-center">
            <Layers size={13} className="absolute left-3 pointer-events-none" />
            <select value="" disabled={picked.size === 0} aria-label="Move the selected tasks to a workspace" onChange={(e) => sendPicked(e.target.value)}
              className={cx('h-8 rounded-full pl-8 pr-3 text-[12px] font-semibold bg-accent text-white border-0 outline-none cursor-pointer', picked.size === 0 && 'opacity-40 cursor-not-allowed')}>
              <option value="">Move to…</option>
              {otherWorkspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={stopSelecting} aria-label="Cancel selecting" className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-page/15 transition"><X size={15} /></button>
        </div>
      )}

      {mode === 'list' ? (
        <ListView columns={columns} cols={cols} shownOf={shownOf} setShow={setShow} parkedOf={parkedOf} frozenFor={frozenFor} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} measuring={MEASURING}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={cancelDrag}>
          {/* Phones: one column per screen, swipe between them. */}
          <div className="flex md:grid gap-4 flex-1 min-h-0 overflow-x-auto snap-x snap-mandatory -mx-3 px-3 md:mx-0 md:px-0 md:[grid-template-columns:repeat(var(--cols),minmax(340px,1fr))]"
            style={{ '--cols': cols.length }}>
            {cols.map((col) => {
              const s = col.id
              const done = col.base === 'completed'
              return (
                <Column
                  key={s}
                  col={col}
                  ids={idLists[s]}
                  taskById={taskById}
                  activeId={activeId}
                  selecting={selecting}
                  picked={picked}
                  onPick={togglePick}
                  highlighted={activeId != null && overColumn === s}
                  onAdd={() => quickAddFor(col)}
                  show={shownOf(col)}
                  onShow={(v) => setShow(col.id, v)}
                  parked={parkedOf(col)}
                  frozen={frozenFor(col)}
                  menu={[
                    { label: 'Add task', icon: Plus, onSelect: () => quickAddFor(col) },
                    { label: 'Sort by priority', icon: ArrowUpDown, onSelect: () => sortStatus(s, 'priority') },
                    { label: 'Sort by due date', icon: CalendarClock, onSelect: () => sortStatus(s, 'date') },
                    'divider',
                    done
                      ? { label: 'Clear completed', icon: Trash2, danger: true, onSelect: () => setConfirmClear(true) }
                      : { label: 'Move carried-over to today', icon: CalendarCheck, onSelect: () => moveOverdueToToday(s) },
                    'divider',
                    { label: 'Edit columns…', icon: Columns3, onSelect: () => setEditingColumns(true) },
                  ]}
                  footer={
                    done && hiddenDone > 0 && !showAllDone && columns[s].length > RECENT_COMPLETED ? (
                      <button type="button" onClick={() => setShowAllDone(true)}
                        className="text-xs font-semibold text-mint-fg hover:underline py-1">
                        Show {columns[s].length - RECENT_COMPLETED} older completed task{columns[s].length - RECENT_COMPLETED === 1 ? '' : 's'}
                      </button>
                    ) : null
                  }
                />
              )
            })}
          </div>
          {/* Portalled to <body>: the view's entry animation leaves a transform on
              the page, which would offset a fixed-position overlay from the pointer. */}
          {createPortal(<DragOverlay dropAnimation={DROP_ANIMATION}>
            {activeTask ? (
              <div className="animate-card-lift rotate-[2deg] shadow-modal rounded-2xl cursor-grabbing">
                <TaskCard task={activeTask} tone={cols.find((c) => idLists[c.id].includes(activeTask.id))?.color} />
              </div>
            ) : null}
          </DragOverlay>, document.body)}
        </DndContext>
      )}

      <Modal open={editingColumns} onClose={() => setEditingColumns(false)} title="Board columns" width="max-w-lg">
        <ColumnsEditor />
      </Modal>

      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={clearCompleted}
        title="Clear completed tasks?" body={`This deletes ${completedCount} completed task${completedCount === 1 ? '' : 's'}. Their logged focus time goes with them.`}
        confirmLabel="Clear" />
    </div>
  )
}

function Column({ col, ids, taskById, activeId, selecting, picked, onPick, highlighted, onAdd, menu, footer, show = 'active', onShow, parked, frozen = [] }) {
  const status = col.id
  const { setNodeRef } = useDroppable({ id: status })
  const c = styleOf(col)
  return (
    <section ref={setNodeRef}
      className={cx('[container-type:inline-size] rounded-card p-3 flex flex-col min-h-[360px] transition-shadow duration-200 min-w-[max(86vw,340px)] md:min-w-0 snap-center', c.panel, highlighted && 'ring-2 ring-inset ring-current/25', c.text)}>
      {/* The name never gets cut: the chips sit next to it, or on their own line below it in a narrow column */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 mb-3">
        <span className="h-6 min-w-6 px-1.5 rounded-full bg-card text-ink text-xs font-bold inline-flex items-center justify-center shadow-soft">{ids.length}</span>
        <h2 className={cx('font-bold text-sm whitespace-nowrap', c.text)}>
          {show === 'active' ? col.name : <button type="button" onClick={() => onShow('active')} title="Back to the tasks" className="hover:underline">{col.name}</button>}
        </h2>
        <div className="ml-auto flex items-center gap-0.5 order-2">
          <button type="button" onClick={onAdd} data-tip="Add task" aria-label="Add task" className="h-7 w-7 rounded-full inline-flex items-center justify-center hover:bg-card/70 transition">
            <Plus size={15} />
          </button>
          <Menu items={menu} trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} data-tip="Column menu" aria-label="Column menu"
              className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center transition hover:bg-card/70', open && 'bg-card/70')}>
              <MoreHorizontal size={16} />
            </button>
          )} />
        </div>
        <ParkChips className="order-1 [@container(max-width:300px)]:order-3 [@container(max-width:300px)]:basis-full" value={show} onChange={onShow} counts={{ paused: parked.paused.length, dropped: parked.dropped.length }} />
      </div>

      {show === 'active' ? (
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto pr-0.5 text-ink">
            {ids.map((id) => taskById.get(id) && <SortableCard key={id} task={taskById.get(id)} tone={col.color} dragging={id === activeId} selecting={selecting} picked={picked.has(id)} onPick={() => onPick(id)} />)}
            {ids.length === 0 && frozen.length === 0 && (
              <div className={cx('flex-1 flex items-center justify-center text-xs font-semibold border-2 border-dashed rounded-2xl min-h-[96px]', c.text, c.edge, 'opacity-70')}>
                Drop tasks here
              </div>
            )}
            {frozen.length > 0 && (
              <div className="mt-1 flex flex-col gap-2">
                <p className="px-1 text-[11px] font-semibold text-muted">Moved on from this day · {frozen.length}</p>
                {frozen.map(({ task, entry }) => <FrozenCard key={task.id} task={task} entry={entry} />)}
              </div>
            )}
            {footer}
          </div>
        </SortableContext>
      ) : (
        <div className="flex-1 overflow-y-auto pr-0.5"><ParkedTasks list={parked[show]} kind={show} layout="cards" onBack={() => onShow('active')} /></div>
      )}

      <button type="button" onClick={onAdd}
        className={cx('mt-2.5 w-full rounded-2xl border-2 border-dashed py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1 transition hover:bg-card/60', c.text, c.edge)}>
        <Plus size={14} /> Add new task
      </button>
    </section>
  )
}

function SortableCard({ task, tone, dragging, selecting, picked, onPick }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id, disabled: selecting, transition: { duration: 220, easing: EASE } })
  const style = { transform: CSS.Translate.toString(transform), transition }
  return <TaskCard task={task} tone={tone} innerRef={setNodeRef} style={style} dragging={dragging}
    handleProps={selecting ? undefined : { ...attributes, ...listeners }} select={selecting ? { picked, onToggle: onPick } : undefined} />
}

// ---- list view ----------------------------------------------------------

function ListView({ columns, cols, shownOf, setShow, parkedOf, frozenFor }) {
  const { categoryById, toggleComplete, setSelectedId, now } = usePlanner()
  return (
    <div className="space-y-4">
      {cols.map((col) => {
        const c = styleOf(col)
        const list = columns[col.id]
        const parked = parkedOf(col)
        const show = shownOf(col)
        const frozen = frozenFor(col)
        return (
          <section key={col.id} className="card overflow-hidden">
            <div className={cx('flex items-center gap-2 px-5 py-3', c.header, c.text)}>
              <h2 className="font-bold text-sm">{col.name}</h2>
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-card text-ink text-[11px] font-bold inline-flex items-center justify-center">{list.length}</span>
              <ParkChips value={show} onChange={(v) => setShow(col.id, v)} counts={{ paused: parked.paused.length, dropped: parked.dropped.length }} />
            </div>
            {show !== 'active' ? (
              <ParkedTasks list={parked[show]} kind={show} layout="rows" onBack={() => setShow(col.id, 'active')} />
            ) : list.length === 0 && frozen.length === 0 ? (
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
                      <RequiredBadge task={t} />
                      <CategoryTag category={categoryById(t.category)} className="hidden sm:inline-flex" />
                      <PriorityPill priority={t.priority} />
                      <span className="text-xs font-medium w-28 text-right text-muted">{dueLabel(t, now) || '—'}</span>
                      <span className="text-xs text-faint w-14 text-right">{fmtMinutes(t.durationMinutes)}</span>
                    </li>
                  )
                })}
                {frozen.map(({ task, entry }) => <FrozenCard key={`frozen-${task.id}`} task={task} entry={entry} layout="row" />)}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
