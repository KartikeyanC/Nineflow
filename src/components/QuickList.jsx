import React, { useMemo, useState } from 'react'
import { addDays } from 'date-fns'
import { ListTodo, PanelRight, PanelTop, PanelBottom, ChevronDown, ChevronUp, ChevronRight, Plus, Sparkles, PictureInPicture2, AppWindow } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { carriedLabel, dateKey, dueLabel, fmtMinutes, isOverdue, sortByTime } from '../lib/tasks'
import { parseQuickAdd } from '../lib/nlp'
import { CategoryTag, CheckCircle, cx } from './ui'

const FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'overdue', label: 'Carried over' },
  { id: 'week', label: '7 days' },
]
const POSITIONS = [
  { id: 'right', icon: PanelRight, label: 'Dock right' },
  { id: 'top', icon: PanelTop, label: 'Dock top' },
  { id: 'bottom', icon: PanelBottom, label: 'Dock bottom' },
]

// Count used by dock handles: open tasks for today plus anything overdue.
export function useQuickCount() {
  const { tasks, now } = usePlanner()
  return useMemo(() => {
    const today = dateKey(now)
    return tasks.filter((t) => t.status !== 'completed' && t.date && (t.date === today || t.date < today)).length
  }, [tasks, now])
}

// The list itself. The Dock decides where it sits; `layout` tunes density.
export default function QuickList({ layout = 'column', onCollapse, collapseIcon = 'chevron', showPositions = true, inPip = false }) {
  const { tasks, now, settings, updateSettings, categoryById, toggleComplete, setSelectedId, addTask, openPip, closePip, pipWin, pipError } = usePlanner()
  // From the pop-out, opening a task brings the main window forward.
  const open = (id) => { setSelectedId(id); if (inPip) window.focus() }
  const ql = settings.quickList
  const filter = ql.filter || 'today'
  const setQL = (patch) => updateSettings({ quickList: { ...ql, ...patch } })
  const [text, setText] = useState('')

  const list = useMemo(() => {
    const today = dateKey(now)
    const weekEnd = dateKey(addDays(now, 7))
    const open = tasks.filter((t) => t.status !== 'completed' && t.date)
    let r
    if (filter === 'overdue') r = open.filter((t) => t.date < today)
    else if (filter === 'week') r = open.filter((t) => t.date > today && t.date <= weekEnd)
    else r = open.filter((t) => t.date === today || t.date < today)
    return sortByTime(r).sort((a, b) => a.date.localeCompare(b.date))
  }, [tasks, now, filter])

  const parsed = useMemo(() => parseQuickAdd(text, { categories: settings.categories, now }), [text, settings.categories, now])
  const submit = (e) => {
    e.preventDefault()
    if (!parsed.title.trim()) return
    addTask({
      title: parsed.title.trim(),
      date: parsed.date ?? dateKey(now),
      startTime: parsed.startTime ?? null,
      durationMinutes: parsed.durationMinutes ?? 30,
      category: parsed.category ?? settings.categories[0]?.id,
      priority: parsed.priority ?? 'medium',
      recurrence: parsed.recurrence ?? null,
    })
    setText('')
  }

  const row = layout === 'row'
  const CollapseIcon = collapseIcon === 'down' ? ChevronDown : collapseIcon === 'up' ? ChevronUp : ChevronRight

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <ListTodo size={16} className="text-lav-fg" />
        <h2 className="h-display text-sm">Quick list</h2>
        <span className="pill bg-lav text-lav-fg py-0">{list.length}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {inPip ? (
            <button type="button" onClick={() => { window.focus(); closePip() }} title="Back to the app"
              className="h-7 px-2 rounded-full inline-flex items-center gap-1 text-xs font-semibold text-muted hover:bg-page hover:text-ink transition">
              <AppWindow size={13} /> App
            </button>
          ) : (
            <button type="button" onClick={openPip} title={pipWin ? 'Pop-out is open' : 'Pop out as a floating window (stays on top when the app is minimized)'}
              className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center transition', pipWin ? 'bg-lav text-lav-fg' : 'text-faint hover:bg-page hover:text-ink')}>
              <PictureInPicture2 size={14} />
            </button>
          )}
          {showPositions && POSITIONS.map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" title={label} onClick={() => setQL({ position: id, collapsed: false })}
              className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center transition',
                ql.position === id ? 'bg-brand text-white' : 'text-faint hover:bg-page hover:text-ink')}>
              <Icon size={14} />
            </button>
          ))}
          {onCollapse && (
            <button type="button" title="Collapse" onClick={onCollapse}
              className="h-7 w-7 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink transition ml-1">
              <CollapseIcon size={15} />
            </button>
          )}
        </div>
      </header>

      {pipError && <p className="mx-4 mb-2 rounded-xl bg-coral text-coral-fg text-xs font-semibold px-3 py-2 animate-fade-in">{pipError}</p>}

      <div className="px-4 pb-2 flex gap-1">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setQL({ filter: f.id })}
            className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold transition',
              filter === f.id ? 'bg-brand text-white' : 'bg-page text-muted hover:text-ink')}>
            {f.label}
          </button>
        ))}
      </div>

      <div className={cx('flex-1 min-h-0 overflow-y-auto px-2', row && 'overflow-x-auto')}>
        {list.length === 0 ? (
          <p className="text-xs text-faint px-2 py-4 inline-flex items-center gap-1.5"><Sparkles size={12} /> Nothing here. Enjoy it.</p>
        ) : (
          <ul className={cx(row ? 'grid gap-x-4 auto-rows-min' : 'space-y-0.5')}
            style={row ? { gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' } : undefined}>
            {list.map((t) => {
              const od = isOverdue(t, now)
              return (
                <li key={t.id} onClick={() => open(t.id)} tabIndex={0} role="button"
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); open(t.id) } }}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-page focus-visible:bg-page outline-none transition">
                  <CheckCircle checked={false} onToggle={() => { if (toggleComplete(t.id) === false && inPip) window.focus() }} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold truncate">{t.title}</p>
                    <p className="text-[11px] truncate text-faint">
                      {od ? carriedLabel(t.date, now) : dueLabel(t, now)} · {fmtMinutes(t.durationMinutes)}
                      {t.status === 'working' && <span className="text-sky-fg font-semibold"> · working</span>}
                    </p>
                  </div>
                  <CategoryTag category={categoryById(t.category)} className="text-[11px] py-0 hidden sm:inline-flex" />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <form onSubmit={submit} className="px-3 pb-3 pt-2 border-t border-line">
        <label className="flex items-center gap-2 rounded-xl bg-page border border-line px-3 h-9 focus-within:border-lav-fg/60 focus-within:ring-2 focus-within:ring-lav-fg/20 transition">
          <Plus size={14} className="text-faint shrink-0" />
          <input className="bg-transparent outline-none w-full text-sm placeholder:text-faint" placeholder="Add to today… (try “3pm 30m !high”)"
            value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {parsed.tokens.length > 0 && (
          <p className="text-[11px] text-lav-fg font-semibold mt-1 px-1 truncate">
            {parsed.tokens.map((t) => t.raw).join(' · ')}
          </p>
        )}
      </form>
    </div>
  )
}
