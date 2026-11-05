import React, { useMemo } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { format } from '../lib/dateFormat'
import { ChevronLeft, ChevronRight, Flame, CheckCircle2, Clock3, PartyPopper } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, tasksOn, todayKey } from '../lib/tasks'
import { cssVar } from '../lib/colors'
import { IconButton, Segmented, cx } from '../components/ui'
import SeasonScene from '../components/SeasonScene'
import { usePhone } from '../lib/usePhone'
import { climateOf, monthLook } from '../lib/climate'
import { useHolidays } from '../lib/holidays'

// Workload levels 0–4 and the lavender opacity for each.
const LEVEL_ALPHA = [0, 0.1, 0.25, 0.45, 0.75]
const HOUR_STEPS = [2, 4.5, 7]
const COUNT_STEPS = [2, 4, 6]
// Said and shown as dots too, so the load never depends on colour alone.
const LEVEL_NAME = ['', 'light', 'moderate', 'busy', 'very busy']
const levelOf = (value, steps) => (value <= 0 ? 0 : steps.findIndex((s) => value <= s) + 1 || 4)

export default function Month() {
  const { tasks, now, settings, updateSettings, openDay, dashboardDate, setDashboardDate } = usePlanner()
  const phone = usePhone()
  // The month of the day the planner is looking at (shared with Week and the Dashboard).
  const selected = useMemo(() => parseISO(dashboardDate), [dashboardDate])
  const monthStart = useMemo(() => startOfMonth(selected), [selected])
  const moveMonth = (n) => setDashboardDate(dateKey(addMonths(selected, n)))
  const thisMonth = isSameMonth(monthStart, now)
  const measure = settings.heatmapMeasure
  // The banner follows the month's season where you are (lib/climate.js).
  const look = monthLook(monthStart.getMonth(), climateOf(settings))

  const grid = useMemo(() => {
    const opts = { weekStartsOn: settings.weekStart }
    return eachDayOfInterval({ start: startOfWeek(monthStart, opts), end: endOfWeek(endOfMonth(monthStart), opts) })
  }, [monthStart, settings.weekStart])

  const dayNames = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(now, { weekStartsOn: settings.weekStart }), i), 'EEE')),
    [now, settings.weekStart],
  )

  // One record per tile: tasks, planned hours, level.
  // Public holidays (Settings → Connections), by 'yyyy-MM-dd'; null while switched off.
  const holidays = useHolidays(settings.holidays, grid.map((d) => d.getFullYear()))

  const cells = useMemo(() => grid.map((day) => {
    const key = dateKey(day)
    const list = tasksOn(tasks, key)
    const hours = list.reduce((s, t) => s + t.durationMinutes, 0) / 60
    const level = measure === 'count' ? levelOf(list.length, COUNT_STEPS) : levelOf(hours, HOUR_STEPS)
    return { day, key, list, hours, level, holiday: holidays?.[key] || null, inMonth: isSameMonth(day, monthStart), today: isSameDay(day, now), selected: key === dashboardDate }
  }), [grid, tasks, measure, monthStart, now, dashboardDate, holidays])

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
      <Poster month={format(monthStart, 'MMMM')} look={look} />

      <div className="flex-1 min-w-0 relative">
        {/* Giant year, behind everything */}
        <span aria-hidden className="max-sm:hidden absolute -top-3 sm:-top-6 right-0 select-none pointer-events-none font-black leading-none tracking-tighter text-[64px] sm:text-[112px]"
          style={{ color: cssVar('--lav-fg', 0.16) }}>
          {format(monthStart, 'yyyy')}
        </span>

        {/* Smaller screens: the season banner as a strip */}
        <div className="xl:hidden relative h-20 rounded-card overflow-hidden mb-4 flex items-center px-4"
          style={{ background: `linear-gradient(90deg, ${look.from} 0%, ${look.to} 100%)` }}>
          <div className="relative z-10 text-white">
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-90">{look.label}</p>
            <p className="text-xl font-black tracking-tight leading-tight">{format(monthStart, 'MMMM yyyy')}</p>
          </div>
          {/* the whole scene (a little trimmed at the top), small on the right, clear of the text */}
          <SeasonScene season={look.season} viewBox="0 40 150 180" className="absolute right-3 bottom-0 h-20 w-[67px]" />
        </div>

        <header className="relative flex flex-wrap items-end justify-between gap-3 mb-5 max-sm:items-center max-sm:gap-2 max-sm:mb-4">
          <div className="max-sm:contents">
            <div className="flex items-center gap-1.5 mb-2 max-sm:mb-0">
              <IconButton label="Previous month" onClick={() => moveMonth(-1)} className="border border-line bg-card"><ChevronLeft size={16} /></IconButton>
              <IconButton label="Next month" onClick={() => moveMonth(1)} className="border border-line bg-card"><ChevronRight size={16} /></IconButton>
              {!thisMonth && <button type="button" className="btn-ghost h-8 py-0" onClick={() => setDashboardDate(todayKey())}>This month</button>}
            </div>
            <h1 className="text-ink font-black tracking-tight leading-none text-[40px] sm:text-[56px] max-sm:sr-only">{format(monthStart, 'MMMM')}</h1>
          </div>
          <Segmented size="sm" value={measure} onChange={(v) => updateSettings({ heatmapMeasure: v })}
            options={[{ value: 'hours', label: phone ? 'Hours' : 'By hours' }, { value: 'count', label: phone ? 'Tasks' : 'By task count' }]} />
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
  const { day, list, level, holiday, inMonth, today, selected } = cell
  const strong = level === 4
  return (
    <button type="button" onClick={onOpen} aria-label={`${format(day, 'EEEE, MMMM d')}${holiday ? `, ${holiday}` : ''}${list.length ? `, ${list.length} task${list.length === 1 ? '' : 's'}` : ''}${level ? `, ${LEVEL_NAME[level]}` : ''}. Open this day`}
      aria-current={today ? 'date' : undefined} title={holiday || undefined}
      className={cx(
        'relative text-left rounded-xl sm:rounded-2xl p-1.5 sm:p-2 min-h-[60px] sm:min-h-[104px] flex flex-col transition duration-200 hover:-translate-y-0.5 hover:shadow-lift max-sm:p-1 max-sm:min-h-[54px] max-sm:rounded-lg',
        level === 0 && 'border border-line',
        !inMonth && 'opacity-50 border border-dashed border-line',
        today && 'outline outline-2 outline-offset-2 outline-coral-fg',
        selected && !today && 'outline outline-2 outline-offset-2 outline-lav-fg',
        strong ? 'text-white' : 'text-ink',
      )}
      style={{ background: level ? cssVar('--lav-fg', LEVEL_ALPHA[level]) : undefined }}>
      <div className="flex items-start justify-between gap-1 max-sm:flex-col-reverse max-sm:items-center max-sm:justify-start max-sm:gap-1.5 max-sm:pt-0.5">
        {list.length > 0 ? (
          <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-semibold max-sm:min-w-[18px] max-sm:text-center max-sm:px-1 max-sm:py-0 max-sm:leading-[16px]', strong ? 'bg-white/20' : 'bg-card border border-line text-muted')}>
            {list.length}<span className="hidden sm:inline"> task{list.length === 1 ? '' : 's'}</span>
          </span>
        ) : <span />}
        <span className="flex items-center gap-1.5">
          {level > 0 && (
            <span aria-hidden="true" className="hidden sm:flex gap-0.5">
              {[1, 2, 3, 4].map((i) => <span key={i} className={cx('h-1.5 w-1.5 rounded-full', i <= level ? (strong ? 'bg-white' : 'bg-lav-fg') : (strong ? 'bg-white/30' : 'bg-line'))} />)}
            </span>
          )}
          <span className={cx('text-sm font-bold leading-none', today && 'text-coral-fg')}>{format(day, 'd')}</span>
        </span>
      </div>
      <div className="mt-auto space-y-0.5 hidden sm:block">
        {holiday && <p className={cx('text-[10px] font-bold truncate inline-flex items-center gap-1 max-w-full', strong ? 'text-white' : 'text-peach-fg')}><PartyPopper size={10} className="shrink-0" />{holiday}</p>}
        {list.slice(0, holiday ? 1 : 2).map((t) => (
          <p key={t.id} className={cx('text-[11px] font-medium truncate', t.status === 'completed' && 'line-through opacity-60', !strong && 'text-muted')}>{t.title}</p>
        ))}
        {list.length > (holiday ? 1 : 2) && <p className={cx('text-[10px] font-semibold', strong ? 'text-white/70' : 'text-faint')}>+{list.length - (holiday ? 1 : 2)} more</p>}
      </div>
    </button>
  )
}

// Poster panel: the month's season (lib/climate.js): its colours, vertical month name, flat scene.
function Poster({ month, look }) {
  return (
    <aside className="hidden xl:flex w-[150px] shrink-0 rounded-card overflow-hidden relative flex-col justify-between"
      style={{ background: `linear-gradient(180deg, ${look.from} 0%, ${look.to} 100%)`, minHeight: 640 }}>
      <span className="absolute left-1/2 top-8 -translate-x-1/2 text-white font-black tracking-tight leading-none select-none"
        style={{ writingMode: 'vertical-rl', transform: 'translateX(-50%) rotate(180deg)', fontSize: 64 }}>
        {month}
      </span>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">{look.label}</span>
      <SeasonScene season={look.season} className="mt-auto w-full" />
    </aside>
  )
}
