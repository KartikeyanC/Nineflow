import React, { useMemo, useState } from 'react'
import { addDays, parseISO } from 'date-fns'
import { ArrowRight, Clock3, CornerDownRight, Inbox, Moon } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { carriedLabel, dateKey, fmtMinutes, isOverdue } from '../lib/tasks'
import { dayLoad, fitInto, hhmm, remainingMinutes, trimDay } from '../lib/capacity'
import { colorOf } from '../lib/colors'
import { cx } from '../components/ui'
import { openRitual } from './ritualBus'

// Planning aids for the v2 Today view: how full the day is against your
// working hours, and a calm place for work carried over from earlier days.

const rise = (i) => ({ className: 'animate-rise', style: { animationDelay: `${i * 70}ms` } })

export { carriedLabel }

export function CapacityBar({ dayKey, i = 0 }) {
  const { tasks, now, settings, moveTasksTo, setView } = usePlanner()
  const load = useMemo(() => dayLoad(tasks, dayKey, now, settings.workHours), [tasks, dayKey, now, settings.workHours])
  const trim = useMemo(() => (load.over > 0 ? trimDay(tasks, dayKey, load.over, now) : []), [tasks, dayKey, load.over, now])
  const tomorrow = dateKey(addDays(parseISO(dayKey), 1))
  const r = rise(i)

  // The bar is the working day. Today it starts with the part already gone,
  // then the open work from now on, so anything past the end of the day shows
  // as overflow. Other days start with the work already done.
  const elapsed = load.isToday ? load.capacity - load.available : 0
  const base = load.isToday ? elapsed : load.done
  const scale = Math.max(load.capacity, base + load.left, 1)
  const pct = (m) => `${(m / scale) * 100}%`
  const overBy = base + load.left - load.capacity
  const state = load.left === 0 ? 'clear' : load.afterHours ? 'after' : load.over > 0 ? 'over' : 'ok'

  return (
    <section className={cx('mb-5 card px-5 py-4 grid gap-3', r.className)} style={r.style}>
      {/* Row 1: the number and what to do about it. Row 2: the bar, full width. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{load.isToday ? "Today's load" : 'Load'}</span>
          <span className="text-[20px] font-bold tracking-tight tnum">{fmtMinutes(load.planned)}</span>
          <span className="text-[13px] text-muted tnum">of {fmtMinutes(load.capacity)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {state === 'clear' && <p className="text-[13px] font-semibold text-mint-fg">Nothing left open</p>}
          {state === 'after' && (
            <>
              <p className="text-[13px] text-muted"><b className="text-ink">Work day is over.</b> {fmtMinutes(load.left)} still open</p>
              {load.isToday && (
                <button type="button" onClick={() => openRitual('shutdown')}
                  className="inline-flex items-center gap-2 h-9 rounded-full bg-ink text-page px-3.5 text-[12px] font-semibold transition hover:-translate-y-px active:scale-[0.97]">
                  <Moon size={13} /> Shut down
                </button>
              )}
            </>
          )}
          {state === 'ok' && (
            <p className="text-[13px] text-muted tnum">
              Finish <b className="text-ink">≈ {hhmm(load.finish)}</b><span className="mx-1.5 text-faint">·</span>{fmtMinutes(load.available - load.left)} free
            </p>
          )}
          {state === 'over' && (
            <>
              <p className="text-[13px] tnum text-peach-fg font-semibold">
                {fmtMinutes(load.over)} over<span className="mx-1.5 opacity-60">·</span>finish ≈ {hhmm(load.finish)}
              </p>
              {trim.length > 0 && (
                <button type="button" onClick={() => moveTasksTo(trim.map((t) => t.id), tomorrow, `Moved ${trim.length} to tomorrow to make room`)}
                  className="group inline-flex items-center gap-2 h-9 rounded-full bg-ink text-page pl-3.5 pr-1 text-[12px] font-semibold transition hover:-translate-y-px active:scale-[0.97]">
                  Move {trim.length} lower-priority to tomorrow
                  <span className="h-7 w-7 rounded-full bg-page/15 inline-flex items-center justify-center transition duration-500 group-hover:translate-x-0.5"><ArrowRight size={13} /></span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="relative h-2.5 rounded-full bg-subtle ring-hair overflow-hidden flex" role="img"
          aria-label={`${load.isToday ? `${fmtMinutes(elapsed)} of the work day gone, ` : `${fmtMinutes(load.done)} done, `}${fmtMinutes(load.working)} in progress and ${fmtMinutes(load.todo)} to do, against ${fmtMinutes(load.capacity)} of working time`}>
          {load.isToday
            ? <i className="h-full bg-ink/10 transition-all duration-700 ease-spring" style={{ width: pct(elapsed) }} />
            : <i className="h-full bg-mint-fg transition-all duration-700 ease-spring" style={{ width: pct(load.done) }} />}
          <i className="h-full bg-sky-fg transition-all duration-700 ease-spring" style={{ width: pct(load.working) }} />
          <i className="h-full bg-ink/25 transition-all duration-700 ease-spring" style={{ width: pct(load.todo) }} />
          {overBy > 0 && (
            <i className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(var(--peach-fg)/0.55)_0_4px,transparent_4px_8px)]"
              style={{ left: pct(load.capacity), width: pct(overBy) }} />
          )}
          {overBy > 0 && <i className="absolute inset-y-0 w-0.5 bg-ink/70" style={{ left: pct(load.capacity) }} />}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {load.isToday && <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-ink/10 ring-hair" />Day so far {fmtMinutes(elapsed)}</span>}
          <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-mint-fg" />Done {fmtMinutes(load.done)}</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-sky-fg" />Working {fmtMinutes(load.working)}</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-ink/25" />To do {fmtMinutes(load.todo)}</span>
          <button type="button" onClick={() => setView('settings')} className="inline-flex items-center gap-1 text-faint hover:text-ink transition">
            <Clock3 size={11} /> Working hours {settings.workHours.start}–{settings.workHours.end}
          </button>
        </div>
      </div>
    </section>
  )
}

// Unfinished work from earlier days, without red or "overdue": decide each
// one (today, tomorrow, someday, let go) or fit what fits into today.
export function CarriedOver({ i = 0 }) {
  const { tasks, now, settings, categoryById, setSelectedId, moveTasksTo, removeTask } = usePlanner()
  const [all, setAll] = useState(false)
  const today = dateKey(now)
  const tomorrow = dateKey(addDays(now, 1))
  const items = useMemo(() => tasks.filter((t) => isOverdue(t, now)).sort((a, b) => b.date.localeCompare(a.date)), [tasks, now])
  // Fit into today while the work day lasts; after hours, into tomorrow.
  const load = useMemo(() => dayLoad(tasks, today, now, settings.workHours), [tasks, today, now, settings.workHours])
  const target = load.afterHours ? { key: tomorrow, name: 'tomorrow' } : { key: today, name: 'today' }
  const targetLoad = useMemo(() => (load.afterHours ? dayLoad(tasks, tomorrow, now, settings.workHours) : load), [load, tasks, tomorrow, now, settings.workHours])
  const fit = useMemo(() => fitInto(items, Math.max(0, targetLoad.available - targetLoad.left), now), [items, targetLoad, now])
  if (!items.length) return null
  const shown = all ? items : items.slice(0, 4)
  const r = rise(i)
  const move = (t, date, where) => moveTasksTo([t.id], date, `Moved “${t.title}” to ${where}`)

  return (
    <section className={cx('mb-5 card overflow-hidden', r.className)} style={r.style}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight">Carried over <span className="ml-1 text-faint font-semibold text-[13px] tnum">{items.length}</span></h2>
          <p className="text-[12px] text-muted mt-0.5">From earlier days. Give each one a day, or let it go.</p>
        </div>
        {fit.picked.length > 0 ? (
          <button type="button"
            onClick={() => moveTasksTo(fit.picked.map((t) => t.id), target.key, `Fitted ${fit.picked.length} into ${target.name}`)}
            title={`${fmtMinutes(fit.used)} of work that fits in the free time ${target.name}`}
            className="group inline-flex items-center gap-2.5 h-9 rounded-full bg-ink text-page pl-4 pr-1 text-[12px] font-semibold transition hover:-translate-y-px active:scale-[0.97]">
            Fit {fit.picked.length === items.length ? 'all' : fit.picked.length} into {target.name}
            <span className="h-7 w-7 rounded-full bg-page/15 inline-flex items-center justify-center transition duration-500 group-hover:translate-x-0.5"><CornerDownRight size={13} /></span>
          </button>
        ) : (
          <span className="text-[12px] font-semibold text-muted">{load.afterHours ? 'Tomorrow is already full.' : 'Today is full. Try tomorrow.'}</span>
        )}
      </header>
      <ul className="px-2 pb-2">
        {shown.map((t) => {
          const c = colorOf(categoryById(t.category).color)
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-2xl hover:bg-subtle transition">
              <i className={cx('h-2 w-2 rounded-full shrink-0', c.dot)} />
              <button type="button" onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left">
                <span className="block text-[14px] font-semibold truncate">{t.title}</span>
                <span className="block text-[11px] text-faint tnum">{carriedLabel(t.date, now)} · {fmtMinutes(remainingMinutes(t, now))}{t.priority === 'high' ? ' · high priority' : ''}</span>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <Choice onClick={() => move(t, today, 'today')}>Today</Choice>
                <Choice onClick={() => move(t, tomorrow, 'tomorrow')}>Tomorrow</Choice>
                <Choice onClick={() => move(t, null, 'Someday')} title="No date: keep it without a day"><Inbox size={11} /> Someday</Choice>
                <Choice onClick={() => removeTask(t.id)} quiet>Let go</Choice>
              </div>
            </li>
          )
        })}
      </ul>
      {items.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)}
          className="w-full border-t border-line py-2.5 text-[12px] font-semibold text-muted hover:text-ink transition">
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  )
}

function Choice({ children, onClick, quiet, title }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={cx('inline-flex items-center gap-1 h-7 rounded-full px-2.5 text-[11px] font-semibold transition active:scale-[0.96]',
        quiet ? 'text-faint hover:text-ink hover:bg-card' : 'bg-card text-ink shadow-soft hover:-translate-y-px')}>
      {children}
    </button>
  )
}
