import React, { useMemo } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Inbox, Plus, Sun, Sunrise } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, fmtMinutes } from '../lib/tasks'
import { CategoryTag, CheckCircle, EmptyState, PriorityPill } from '../components/ui'

// Open tasks with no day: ideas and "one day" work. Pull one onto a day when it's time.
export default function Someday() {
  const { tasks, now, categoryById, toggleComplete, setSelectedId, setQuickAdd, moveTasksTo } = usePlanner()
  const rows = useMemo(
    () => tasks.filter((t) => !t.date && t.status !== 'completed').sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
    [tasks],
  )
  const plan = (id, key, label) => moveTasksTo([id], key, label)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="h-display text-3xl max-sm:text-2xl">Someday</h1>
          <p className="text-sm text-muted mt-1">Tasks without a day. Pull one onto a day when it's time.</p>
        </div>
        <button type="button" className="btn-black h-9 py-0 px-3 inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => setQuickAdd({ date: null })}>
          <Plus size={14} /> Add to Someday
        </button>
      </header>
      {rows.length === 0 ? (
        <div className="card p-6"><EmptyState icon={Inbox} title="Nothing waiting" hint="Ideas without a date land here. Choose Someday when planning, or add one above." /></div>
      ) : (
        <ul className="card divide-y divide-line p-2">
          {rows.map((t) => (
            <li key={t.id} onClick={() => setSelectedId(t.id)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-page transition">
              <CheckCircle checked={false} onToggle={() => toggleComplete(t.id)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{t.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <CategoryTag category={categoryById(t.category)} className="text-[10px] py-0" />
                  <span className="text-[10px] text-faint">{fmtMinutes(t.durationMinutes)}</span>
                </div>
              </div>
              <PriorityPill priority={t.priority} className="hidden sm:inline-flex" />
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn-ghost h-7 py-0 px-2.5 text-xs inline-flex items-center gap-1" onClick={() => plan(t.id, dateKey(now), 'Planned for today')}><Sun size={12} /> Today</button>
                <button type="button" className="btn-ghost h-7 py-0 px-2.5 text-xs inline-flex items-center gap-1" onClick={() => plan(t.id, dateKey(addDays(now, 1)), 'Planned for tomorrow')}><Sunrise size={12} /> Tomorrow</button>
                <input type="date" aria-label={`Pick a day for ${t.title}`} min={dateKey(now)} className="input h-7 py-0 px-2 text-xs w-[8.5rem]"
                  onChange={(e) => e.target.value && plan(t.id, e.target.value, `Planned for ${format(parseISO(e.target.value), 'MMM d')}`)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
