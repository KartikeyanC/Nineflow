import React, { useMemo, useState } from 'react'
import { addDays, parseISO } from 'date-fns'
import { clock, format } from '../lib/dateFormat'
import { CalendarClock, Plus, Repeat } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { carriedLabel, dateKey, fmtMinutes, isOverdue, sortByTime } from '../lib/tasks'
import { CategoryTag, CheckCircle, EmptyState, PriorityPill, Segmented } from '../components/ui'
import RequiredBadge from '../components/RequiredBadge'

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 365, label: 'All' },
]

// Open tasks as one list, grouped by day: what's behind you, today, then what's coming.
export default function Agenda() {
  const { tasks, now, categoryById, toggleComplete, setSelectedId, setQuickAdd } = usePlanner()
  const [range, setRange] = useState(14)
  const today = dateKey(now)

  const groups = useMemo(() => {
    const end = dateKey(addDays(now, range))
    const open = tasks.filter((t) => t.status !== 'completed' && t.date)
    const overdue = sortByTime(open.filter((t) => isOverdue(t, now)))
    const byDay = new Map()
    for (const t of open) {
      if (isOverdue(t, now) || t.date < today || t.date > end) continue
      if (!byDay.has(t.date)) byDay.set(t.date, [])
      byDay.get(t.date).push(t)
    }
    const days = [...byDay.keys()].sort().map((key) => ({ key, title: dayTitle(key, now), tasks: sortByTime(byDay.get(key)) }))
    return [...(overdue.length ? [{ key: 'overdue', title: 'Overdue', tone: 'text-coral-fg', tasks: overdue }] : []), ...days]
  }, [tasks, now, range, today])

  const total = groups.reduce((n, g) => n + g.tasks.length, 0)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl max-sm:text-2xl">Agenda</h1>
          <p className="text-sm text-muted mt-1">{total} open task{total === 1 ? '' : 's'}, by day.</p>
        </div>
        <div className="flex items-center gap-2 max-sm:w-full">
          <Segmented size="sm" value={range} onChange={setRange} options={RANGES} className="max-sm:w-full max-sm:[&>button]:flex-1" />
          <button type="button" className="btn-black h-9 py-0 px-3 inline-flex items-center gap-1.5 whitespace-nowrap max-sm:hidden" onClick={() => setQuickAdd({})}>
            <Plus size={14} /> New task
          </button>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="card p-6"><EmptyState icon={CalendarClock} title="Nothing coming up" hint="No open tasks in this range. Widen it, or add one." /></div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.title}>
            <h2 className={`px-1 mb-1.5 text-xs font-bold uppercase tracking-wide ${g.tone || (g.key === today ? 'text-lav-fg' : 'text-muted')}`}>
              {g.title} <span className="font-medium text-faint normal-case tracking-normal">· {g.tasks.length}</span>
            </h2>
            <ul className="card divide-y divide-line p-2">
              {g.tasks.map((t) => (
                <li key={t.id} tabIndex={0} onClick={() => setSelectedId(t.id)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') setSelectedId(t.id) }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-page focus-visible:bg-page outline-none transition max-sm:px-2 max-sm:gap-2.5">
                  <CheckCircle checked={false} onToggle={() => toggleComplete(t.id)} size="sm" />
                  <span className="w-12 shrink-0 text-xs font-medium text-muted tnum max-sm:hidden">{t.startTime || '—'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      {t.startTime && <span className="sm:hidden text-[11px] font-semibold text-muted tnum shrink-0">{clock(t.startTime)}</span>}
                      <CategoryTag category={categoryById(t.category)} className="text-[10px] py-0" />
                      {t.recurrence && <Repeat size={10} className="text-lav-fg" />}
                      <RequiredBadge task={t} className="!text-[10px]" />
                      {g.key === 'overdue' && <span className="text-[10px] font-semibold text-muted">{carriedLabel(t.date, now)}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-faint shrink-0">{fmtMinutes(t.durationMinutes)}</span>
                  <PriorityPill priority={t.priority} className="hidden sm:inline-flex" />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function dayTitle(key, now) {
  const d = parseISO(key)
  const diff = Math.round((d - parseISO(dateKey(now))) / 864e5)
  const base = format(d, 'EEEE, MMM d')
  return diff === 0 ? `Today · ${base}` : diff === 1 ? `Tomorrow · ${base}` : base
}
