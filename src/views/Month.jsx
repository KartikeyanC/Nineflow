import React, { useMemo } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Flame, CheckCircle2, Clock3 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, tasksOn, todayKey } from '../lib/tasks'
import { cssVar } from '../lib/colors'
import { IconButton, Segmented, cx } from '../components/ui'

// Workload levels 0–4 and the lavender opacity for each.
const LEVEL_ALPHA = [0, 0.1, 0.25, 0.45, 0.75]
const HOUR_STEPS = [2, 4.5, 7]
const COUNT_STEPS = [2, 4, 6]
const levelOf = (value, steps) => (value <= 0 ? 0 : steps.findIndex((s) => value <= s) + 1 || 4)

export default function Month() {
  const { tasks, now, settings, updateSettings, openDay, dashboardDate, setDashboardDate } = usePlanner()
  // The month of the day the planner is looking at (shared with Week and the Dashboard).
  const selected = useMemo(() => parseISO(dashboardDate), [dashboardDate])
  const monthStart = useMemo(() => startOfMonth(selected), [selected])
  const moveMonth = (n) => setDashboardDate(dateKey(addMonths(selected, n)))
  const thisMonth = isSameMonth(monthStart, now)
  const measure = settings.heatmapMeasure

  const grid = useMemo(() => {
    const opts = { weekStartsOn: settings.weekStart }
    return eachDayOfInterval({ start: startOfWeek(monthStart, opts), end: endOfWeek(endOfMonth(monthStart), opts) })
  }, [monthStart, settings.weekStart])

  const dayNames = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(now, { weekStartsOn: settings.weekStart }), i), 'EEE')),
    [now, settings.weekStart],
  )

  // One record per tile: tasks, planned hours, level.
  const cells = useMemo(() => grid.map((day) => {
    const key = dateKey(day)
    const list = tasksOn(tasks, key)
    const hours = list.reduce((s, t) => s + t.durationMinutes, 0) / 60
    const level = measure === 'count' ? levelOf(list.length, COUNT_STEPS) : levelOf(hours, HOUR_STEPS)
    return { day, key, list, hours, level, inMonth: isSameMonth(day, monthStart), today: isSameDay(day, now), selected: key === dashboardDate }
  }), [grid, tasks, measure, monthStart, now, dashboardDate])

  const monthCells = cells.filter((c) => c.inMonth)
  const stats = useMemo(() => {
    const all = monthCells.flatMap((c) => c.list)
    const done = all.filter((t) => t.status === 'completed').length
    const busiest = monthCells.reduce((m, c) => (c.list.length > (m?.list.length || 0) ? c : m), null)
    const planned = monthCells.reduce((s, c) => s + c.hours, 0)
    return { total: all.length, done, pct: all.length ? Math.round((done / all.length) * 100) : 0, busiest, planned }
  }, [monthCells])

  return (
    <div className="animate-view-in flex gap-4">
      <Poster month={format(monthStart, 'MMMM')} />

      <div className="flex-1 min-w-0 relative">
        {/* Giant year, behind everything */}
        <span aria-hidden className="absolute -top-3 sm:-top-6 right-0 select-none pointer-events-none font-black leading-none tracking-tighter text-[64px] sm:text-[112px]"
          style={{ color: cssVar('--lav-fg', 0.16) }}>
          {format(monthStart, 'yyyy')}
        </span>

        <header className="relative flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <IconButton label="Previous month" onClick={() => moveMonth(-1)} className="border border-line bg-card"><ChevronLeft size={16} /></IconButton>
              <IconButton label="Next month" onClick={() => moveMonth(1)} className="border border-line bg-card"><ChevronRight size={16} /></IconButton>
              {!thisMonth && <button type="button" className="btn-ghost h-8 py-0" onClick={() => setDashboardDate(todayKey())}>This month</button>}
            </div>
            <h1 className="text-ink font-black tracking-tight leading-none text-[40px] sm:text-[56px]">{format(monthStart, 'MMMM')}</h1>
          </div>
          <Segmented size="sm" value={measure} onChange={(v) => updateSettings({ heatmapMeasure: v })}
            options={[{ value: 'hours', label: 'By hours' }, { value: 'count', label: 'By task count' }]} />
        </header>

        {/* Grid */}
        <div className="relative grid grid-cols-7 gap-2 mb-2">
          {dayNames.map((d) => <p key={d} className="text-[11px] font-bold text-faint uppercase tracking-wider text-center">{d}</p>)}
        </div>
        <div className="relative grid grid-cols-7 gap-2">
          {cells.map((c) => <Tile key={c.key} cell={c} onOpen={() => openDay(c.key)} />)}
        </div>

        {/* Footer cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <button type="button" disabled={!stats.busiest?.list.length} onClick={() => stats.busiest && openDay(stats.busiest.key)}
            className="card p-4 flex items-center gap-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-lift disabled:pointer-events-none">
            <div className="h-11 w-11 rounded-2xl bg-coral text-coral-fg flex items-center justify-center shrink-0"><Flame size={20} /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted">Busiest day this month</p>
              {stats.busiest?.list.length ? (
                <p className="text-sm font-bold truncate">
                  {format(stats.busiest.day, 'MMM d')} <span className="text-faint font-medium">· {stats.busiest.list.length} tasks · {stats.busiest.hours.toFixed(1)} h</span>
                </p>
              ) : <p className="text-sm font-bold text-faint">Nothing planned yet</p>}
            </div>
          </button>

          <div className="card p-4 flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-mint text-mint-fg flex items-center justify-center shrink-0"><CheckCircle2 size={20} /></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted">Completed this month</p>
              <p className="text-sm font-bold">{stats.done} / {stats.total} <span className="text-faint font-medium">· {stats.pct}%</span></p>
            </div>
          </div>

          <div className="card p-4 flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-lav text-lav-fg flex items-center justify-center shrink-0"><Clock3 size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{Math.round(stats.planned)} h planned</p>
              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-semibold text-faint">
                Less
                {LEVEL_ALPHA.map((a, i) => (
                  <span key={i} className="h-3 w-3 rounded-[4px] border border-line" style={{ background: i ? cssVar('--lav-fg', a) : 'transparent' }} />
                ))}
                More
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tile({ cell, onOpen }) {
  const { day, list, level, inMonth, today, selected } = cell
  const strong = level === 4
  return (
    <button type="button" onClick={onOpen} aria-label={`${format(day, 'EEEE, MMMM d')}${list.length ? `, ${list.length} task${list.length === 1 ? '' : 's'}` : ''}. Open this day`}
      aria-current={today ? 'date' : undefined}
      className={cx(
        'relative text-left rounded-xl sm:rounded-2xl p-1.5 sm:p-2 min-h-[60px] sm:min-h-[104px] flex flex-col transition duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        level === 0 && 'border border-line',
        !inMonth && 'opacity-50 border border-dashed border-line',
        today && 'outline outline-2 outline-offset-2 outline-coral-fg',
        selected && !today && 'outline outline-2 outline-offset-2 outline-lav-fg',
        strong ? 'text-white' : 'text-ink',
      )}
      style={{ background: level ? cssVar('--lav-fg', LEVEL_ALPHA[level]) : undefined }}>
      <div className="flex items-start justify-between gap-1">
        {list.length > 0 ? (
          <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', strong ? 'bg-white/20' : 'bg-card border border-line text-muted')}>
            {list.length}<span className="hidden sm:inline"> task{list.length === 1 ? '' : 's'}</span>
          </span>
        ) : <span />}
        <span className={cx('text-sm font-bold leading-none', today && 'text-coral-fg')}>{format(day, 'd')}</span>
      </div>
      <div className="mt-auto space-y-0.5 hidden sm:block">
        {list.slice(0, 2).map((t) => (
          <p key={t.id} className={cx('text-[11px] font-medium truncate', t.status === 'completed' && 'line-through opacity-60', !strong && 'text-muted')}>{t.title}</p>
        ))}
        {list.length > 2 && <p className={cx('text-[10px] font-semibold', strong ? 'text-white/70' : 'text-faint')}>+{list.length - 2} more</p>}
      </div>
    </button>
  )
}

// Poster panel: gradient, vertical month name, flat scene.
function Poster({ month }) {
  return (
    <aside className="hidden xl:flex w-[150px] shrink-0 rounded-card overflow-hidden relative flex-col justify-between"
      style={{ background: 'linear-gradient(180deg, #FFA23A 0%, #F2420E 100%)', minHeight: 640 }}>
      <span className="absolute left-1/2 top-8 -translate-x-1/2 text-white font-black tracking-tight leading-none select-none"
        style={{ writingMode: 'vertical-rl', transform: 'translateX(-50%) rotate(180deg)', fontSize: 64 }}>
        {month}
      </span>
      <svg viewBox="0 0 150 220" className="mt-auto w-full" aria-hidden>
        {/* snow */}
        {[18, 44, 70, 96, 122, 30, 84, 110].map((x, i) => (
          <circle key={i} cx={x} cy={20 + (i % 3) * 22} r={i % 2 ? 2 : 1.4} fill="white" opacity="0.85" />
        ))}
        {/* mountains */}
        <path d="M0 150 L40 80 L80 150 Z" fill="white" opacity="0.25" />
        <path d="M50 150 L100 70 L150 150 Z" fill="white" opacity="0.4" />
        <path d="M86 92 L100 70 L114 92 L106 88 L100 94 L94 88 Z" fill="white" />
        {/* butter hill */}
        <path d="M0 220 L0 170 Q60 130 150 165 L150 220 Z" fill={cssVar('--butter')} />
        {/* house */}
        <rect x="58" y="150" width="30" height="24" rx="2" fill={cssVar('--coral-fg')} />
        <path d="M54 152 L73 136 L92 152 Z" fill={cssVar('--coral')} />
        <rect x="69" y="160" width="8" height="14" rx="1" fill="white" opacity="0.9" />
        <rect x="80" y="140" width="5" height="10" fill={cssVar('--coral')} />
      </svg>
    </aside>
  )
}
