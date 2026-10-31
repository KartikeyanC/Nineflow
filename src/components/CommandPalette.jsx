import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, LayoutDashboard, KanbanSquare, CalendarRange, CalendarDays, Grid2x2, Inbox, Settings, Briefcase, Plus, Target, Sparkles, MessageCircle, Moon, CornerDownLeft, ListTodo, StickyNote, PauseCircle, GraduationCap, ChartColumn } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { Modal, cx } from './ui'
import { showNote } from '../views/Notes'

// Ctrl/Cmd+K: jump to a screen, run an action, find a task or note, or type a new task.
export default function CommandPalette({ open, onClose }) {
  const { allTasks: tasks, settings, updateSettings, setView, setQuickAdd, setSelectedId, setGoalPlannerOpen, setPromptListOpen, setAskOpen } = usePlanner()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const listRef = useRef(null)

  useEffect(() => { if (open) { setQ(''); setI(0) } }, [open])

  const items = useMemo(() => {
    const go = (id) => () => setView(id)
    const nav = [
      { label: 'Dashboard', icon: LayoutDashboard, run: go('dashboard') },
      { label: 'Board', icon: KanbanSquare, run: go('board') },
      { label: 'Week', icon: CalendarRange, run: go('week') },
      { label: 'Month', icon: CalendarDays, run: go('month') },
      { label: 'Agenda', icon: ListTodo, run: go('agenda') },
      { label: 'Matrix', icon: Grid2x2, run: go('matrix') },
      { label: 'Working charts', icon: ChartColumn, run: go('charts') },
      { label: 'Notes', icon: StickyNote, run: go('notes') },
      { label: 'Paused', icon: PauseCircle, run: go('paused') },
      { label: 'Someday', icon: Inbox, run: go('someday') },
      ...(settings.modules?.work ? [{ label: 'Work OS', icon: Briefcase, run: go('work') }] : []),
      ...(settings.modules?.ntpc ? [{ label: 'RRB NTPC syllabus', icon: GraduationCap, run: go('ntpc') }] : []),
      { label: 'Settings', icon: Settings, run: go('settings') },
    ].map((x) => ({ ...x, group: 'Go to' }))
    const actions = [
      { label: 'New task', icon: Plus, run: () => setQuickAdd({}) },
      { label: 'Plan a goal', icon: Target, run: () => setGoalPlannerOpen(true) },
      { label: 'Prompt to list', icon: Sparkles, run: () => setPromptListOpen(true) },
      { label: 'Ask NineFlow', icon: MessageCircle, run: () => setAskOpen(true) },
      { label: settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: Moon, run: () => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
    ].map((x) => ({ ...x, group: 'Actions' }))

    const needle = q.trim().toLowerCase()
    const match = (x) => !needle || x.label.toLowerCase().includes(needle)
    const found = needle
      ? tasks
          .filter((t) => t.title.toLowerCase().includes(needle) || (t.description || '').toLowerCase().includes(needle) || (t.tags || []).some((g) => g.includes(needle.replace(/^#/, ''))))
          .sort((a, b) => (a.status === 'completed') - (b.status === 'completed'))
          .slice(0, 8)
          .map((t) => ({ label: t.title, hint: t.dropped ? 'Dropped' : t.hold ? 'Paused' : t.status === 'completed' ? 'Done' : t.date || 'Someday', icon: ListTodo, group: 'Tasks', run: () => setSelectedId(t.id) }))
      : []
    const notes = needle
      ? (settings.notes || [])
          .filter((n) => (n.text || '').toLowerCase().includes(needle))
          .slice(0, 6)
          .map((n) => ({ label: n.text.trim().split('\n')[0].slice(0, 80) || 'Note', hint: 'Note', icon: StickyNote, group: 'Notes', run: () => { setView('notes'); showNote(n.id) } }))
      : []
    const create = needle ? [{ label: `Add “${q.trim()}”`, icon: Plus, group: 'Create', run: () => setQuickAdd({ title: q.trim() }) }] : []
    return [...create, ...actions.filter(match), ...nav.filter(match), ...found, ...notes]
  }, [q, tasks, settings.notes, settings.theme, settings.modules, setView, setQuickAdd, setSelectedId, setGoalPlannerOpen, setPromptListOpen, setAskOpen, updateSettings])

  useEffect(() => { setI(0) }, [q])
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [i])

  const choose = (item) => { if (!item) return; onClose(); setTimeout(item.run, 0) }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(0, n - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[i]) }
  }

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl">
      <div>
        <div className="flex items-center gap-2.5 border-b border-line pb-3">
          <Search size={18} className="text-faint shrink-0" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} aria-label="Search or type a command"
            placeholder="Search tasks and notes, jump to a screen, or type a new task…"
            className="flex-1 min-w-0 bg-transparent outline-none text-base placeholder:text-faint" />
          <kbd className="text-[10px] text-faint border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul ref={listRef} role="listbox" className="mt-2 max-h-[50vh] overflow-y-auto -mx-1">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-faint">Nothing matches.</li>}
          {items.map((it, n) => {
            const Icon = it.icon
            const first = n === 0 || items[n - 1].group !== it.group
            return (
              <React.Fragment key={`${it.group}-${it.label}-${n}`}>
                {first && <li role="presentation" className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-faint">{it.group}</li>}
                <li role="option" aria-selected={n === i} data-active={n === i}
                  onMouseEnter={() => setI(n)} onClick={() => choose(it)}
                  className={cx('flex items-center gap-3 px-3 h-10 rounded-xl cursor-pointer', n === i ? 'bg-page' : '')}>
                  <Icon size={15} className="text-muted shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">{it.label}</span>
                  {it.hint && <span className="text-xs text-faint shrink-0">{it.hint}</span>}
                  {n === i && <CornerDownLeft size={13} className="text-faint shrink-0" />}
                </li>
              </React.Fragment>
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
