import React, { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, getISOWeek, isSameDay, isSameMonth, parseISO, startOfWeek } from 'date-fns'
import { clock, datePrefs, format } from '../lib/dateFormat'
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronLeft, ChevronRight, Plus, Check, CheckCircle2, Flame, Wand2, CalendarDays, PartyPopper } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, fmtMinutes, tasksOn, totalMinutes } from '../lib/tasks'
import { unscheduledOn, describePlan } from '../lib/schedule'
import { eventsOn, useCalendarEvents, useShowEvents } from '../lib/gcalEvents'
import { useHolidays } from '../lib/holidays'
import { colorOf, cssVar } from '../lib/colors'
import { PriorityPill, ProgressBar, Segmented, cx } from '../components/ui'
import { usePhone } from '../lib/usePhone'

// The whole day, so early and late tasks have a place; the grid opens
// scrolled to now (or the start of your working day).
const GRID_START = 0
const GRID_END = 24 * 60
const PX_PER_MIN = 1 // 60px per hour
const GRID_HEIGHT = (GRID_END - GRID_START) * PX_PER_MIN
const AXIS_W = 56

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const clampStart = (min, dur) => Math.max(GRID_START, Math.min(GRID_END - dur, min))

// Group overlapping tasks into clusters, then give each the first free lane.
function layoutLanes(tasks) {
  const sorted = [...tasks].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))
  const out = []
  let cluster = [], clusterEnd = -1
  const flush = () => {
    if (!cluster.length) return
    const laneEnds = []
    const placed = cluster.map((t) => {
      const s = toMin(t.startTime), e = s + t.durationMinutes
      let lane = laneEnds.findIndex((end) => end <= s)
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(e) } else laneEnds[lane] = e
      return { task: t, lane }
    })
    for (const p of placed) out.push({ ...p, lanes: laneEnds.length })
    cluster = []; clusterEnd = -1
  }
  for (const t of sorted) {
    const s = toMin(t.startTime)
    if (cluster.length && s >= clusterEnd) flush()
    cluster.push(t)
    clusterEnd = Math.max(clusterEnd, s + t.durationMinutes)
  }
  flush()
  return out
}

function rangeLabel(days, now) {
  const a = days[0], b = days[days.length - 1]
  if (days.length === 1) return isSameDay(a, now) ? `Today · ${format(a, 'MMM d')}` : format(a, 'EEE, MMM d')
  if (!isSameMonth(a, b)) return `${format(a, 'MMM d')} – ${format(b, 'MMM d')}`
  return datePrefs().order === 'dmy' ? `${format(a, 'd')} – ${format(b, 'd MMM')}` : `${format(a, 'MMM d')} – ${format(b, 'd')}`
}

export default function Week() {
  const {
    tasks, now, settings, updateTask, setQuickAdd, setView, setSelectedId, planDay,
    dashboardDate, setDashboardDate, calendarMode: mode, setCalendarMode: setMode,
  } = usePlanner()
  // The day being looked at is shared with the Dashboard and Month, so
  // moving here moves them too (and the other way round).
  const anchor = useMemo(() => parseISO(dashboardDate), [dashboardDate])
  const setAnchor = (next) => setDashboardDate(dateKey(typeof next === 'function' ? next(anchor) : next))

  // Phones: a strip of the week's days on top, and the chosen day's timeline under it (like a phone calendar).
  const phone = usePhone()
  const days = useMemo(() => {
    if (mode === 'day' && !phone) return [anchor]
    const start = startOfWeek(anchor, { weekStartsOn: settings.weekStart })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchor, mode, phone, settings.weekStart])

  const holidays = useHolidays(settings.holidays, days.map((d) => d.getFullYear())) // public holidays, or null when off
  const todayInRange = days.some((d) => isSameDay(d, now))
  const shift = (dir) => setAnchor((a) => addDays(a, dir * (mode === 'day' && !phone ? 1 : 7)))

  // "Plan" targets the single day in day mode, otherwise today when it's in range.
  const planDate = mode === 'day' || phone ? anchor : todayInRange ? now : null
  const planKey = planDate ? dateKey(planDate) : null
  const unscheduled = planKey ? unscheduledOn(tasks, planKey).length : 0
  const [planMsg, setPlanMsg] = useState(null)

  // Your Google Calendar events, when Settings → Show my calendar events is on.
  const showEvents = useShowEvents()
  const calendar = useCalendarEvents()
  const events = showEvents ? calendar.events : []

  // Per-day task buckets, split into timed (with lanes) and untimed. Calendar
  // events share the lanes, so they sit beside tasks instead of under them.
  const byDay = useMemo(() => days.map((day) => {
    const key = dateKey(day)
    // "Hide completed" (Settings) leaves finished tasks off the grid.
    const list = tasksOn(tasks, key).filter((t) => !settings.hideDone || t.status !== 'completed')
    const timed = list.filter((t) => t.startTime)
    const untimed = list.filter((t) => !t.startTime)
    const todays = eventsOn(events, key)
    const timedEvents = todays.filter((e) => !e.allDay).map((e) => ({ id: `ev:${e.id}:${key}`, startTime: toHHMM(Math.min(e.startMin, 1439)), durationMinutes: Math.max(15, e.endMin - e.startMin), event: e }))
    return { day, key, list, untimed, allDayEvents: todays.filter((e) => e.allDay), lanes: layoutLanes([...timed, ...timedEvents]) }
  }), [tasks, days, events, settings.hideDone])

  // Scroll the grid so "now" (or, outside 06:00–22:00, the start of your
  // working day) sits ~160px from the top on load.
  const scrollRef = useRef(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const anchor = nowMin >= 6 * 60 && nowMin <= 22 * 60 ? nowMin : toMin(settings.workHours.start)
    el.scrollTop = Math.max(0, (anchor - GRID_START) * PX_PER_MIN - 160)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The "now" line ticks every minute on its own.
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const nowMin = tick.getHours() * 60 + tick.getMinutes()
  const showNow = nowMin >= GRID_START && nowMin <= GRID_END

  // ---- drag: delta.y → minutes, snapped to 15, column → date ----
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )
  const onDragEnd = ({ active, over, delta }) => {
    const task = tasks.find((t) => t.id === active.id)
    if (!task) return
    const deltaMin = Math.round(delta.y / PX_PER_MIN / 15) * 15
    const start = clampStart(toMin(task.startTime) + deltaMin, task.durationMinutes)
    const patch = { startTime: toHHMM(start) }
    if (over && over.id !== task.date) patch.date = over.id
    updateTask(task.id, patch)
  }

  // ---- stats row ----
  const weekStats = useMemo(() => {
    const rows = byDay.map(({ day, list }) => ({
      day: format(day, mode === 'day' ? 'EEE d' : 'EEE'),
      planned: list.reduce((s, t) => s + t.durationMinutes, 0) / 60,
      // Actual logged time where there is some, so the chart shows what really happened.
      completed: list.filter((t) => t.status === 'completed').reduce((s, t) => s + (totalMinutes(t, now) || t.durationMinutes), 0) / 60,
      count: list.length,
      date: day,
    }))
    const all = byDay.flatMap((d) => d.list)
    const done = all.filter((t) => t.status === 'completed').length
    const busiest = rows.reduce((m, r) => (r.count > (m?.count || 0) ? r : m), null)
    return { rows, total: all.length, done, busiest, pct: all.length ? Math.round((done / all.length) * 100) : 0 }
  }, [byDay, mode])

  const hours = Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, i) => GRID_START + i * 60)
  // The days the time grid shows: on phones only the chosen one.
  const gridDays = phone ? byDay.filter(({ day }) => isSameDay(day, anchor)) : byDay
  const axisW = phone ? 46 : AXIS_W
  // A week fits down to ~64px a day; only narrower than that does it scroll sideways.
  const colTemplate = `${axisW}px repeat(${gridDays.length}, minmax(${gridDays.length > 1 ? 64 : 0}px, 1fr))`
  // Hours outside the working day are shaded (a night shift wraps past midnight).
  const offHours = useMemo(() => {
    const a = toMin(settings.workHours.start), b = toMin(settings.workHours.end)
    return b > a ? [[GRID_START, a], [b, GRID_END]] : b < a ? [[b, a]] : []
  }, [settings.workHours.start, settings.workHours.end])
  const planButton = unscheduled > 0 && !planMsg && (
    <button type="button" className={cx('btn-ghost h-9 py-0 text-lav-fg', phone && 'h-10 px-3')}
      onClick={() => { setPlanMsg(describePlan(planDay(planKey))); setTimeout(() => setPlanMsg(null), 4000) }}
      title={`Timebox ${unscheduled} unscheduled task${unscheduled === 1 ? '' : 's'} on ${format(planDate, 'EEE d')}`}>
      <Wand2 size={15} /> Plan{phone ? '' : ` ${isSameDay(planDate, now) ? 'today' : format(planDate, 'EEE d')}`} · {unscheduled}
    </button>
  )

  return (
    <div className="animate-view-in">
      {/* Top bar */}
      {phone ? (
        <header className="mb-3">
          <div className="flex items-center gap-2 mb-3">
            <h1 className="h-display text-2xl flex-1 min-w-0 truncate">{format(anchor, 'MMMM yyyy')}</h1>
            {!isSameDay(anchor, now) && (
              <button type="button" onClick={() => setAnchor(new Date())}
                className="h-10 px-3.5 rounded-full border border-line bg-card text-[13px] font-semibold text-ink active:scale-95 transition">Today</button>
            )}
            {planButton}
          </div>
          {planMsg && <p className="text-xs font-semibold text-muted mb-2 animate-fade-in">{planMsg}</p>}
          {/* The week's days; tap one to see it, arrows move a week. */}
          <div className="card p-1.5 flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous week" className="h-10 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-muted active:bg-page"><ChevronLeft size={18} /></button>
            <div className="grid grid-cols-7 gap-1 flex-1 min-w-0">
              {byDay.map(({ day, key, list }) => {
                const on = isSameDay(day, anchor)
                const today = isSameDay(day, now)
                return (
                  <button key={key} type="button" onClick={() => setAnchor(day)} aria-pressed={on}
                    aria-label={`${format(day, 'EEEE d MMMM')}${list.length ? `, ${list.length} task${list.length === 1 ? '' : 's'}` : ''}`}
                    className={cx('h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95',
                      on ? 'bg-brand text-white shadow-sm' : today ? 'text-brand' : 'text-ink')}>
                    <span className={cx('text-[11px] font-bold uppercase', on ? 'text-white/80' : today ? 'text-brand' : 'text-faint')}>{format(day, 'EEEEE')}</span>
                    <span className="text-base font-bold leading-none tnum">{format(day, 'd')}</span>
                    <i className={cx('h-1 w-1 rounded-full', list.length ? (on ? 'bg-white' : 'bg-faint') : 'bg-transparent')} />
                  </button>
                )
              })}
            </div>
            <button type="button" onClick={() => shift(1)} aria-label="Next week" className="h-10 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-muted active:bg-page"><ChevronRight size={18} /></button>
          </div>
        </header>
      ) : (
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full bg-brand text-white p-1">
            <button type="button" onClick={() => shift(-1)} className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-white/20 transition" aria-label="Previous"><ChevronLeft size={16} /></button>
            <span className="px-3 text-sm font-bold tracking-tight min-w-[140px] text-center">{rangeLabel(days, now)}</span>
            <button type="button" onClick={() => shift(1)} className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-white/20 transition" aria-label="Next"><ChevronRight size={16} /></button>
          </div>
          {!todayInRange && (
            <button type="button" className="btn-ghost h-9 py-0" onClick={() => setAnchor(new Date())}>Jump to today</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {planMsg && <span className="text-xs font-semibold text-muted animate-fade-in">{planMsg}</span>}
          {planButton}
          <button type="button" className="btn-ghost h-9 py-0" onClick={() => setQuickAdd({ date: dateKey(anchor) })}><Plus size={15} /> Add task</button>
          <Segmented size="sm" value={mode}
            onChange={(v) => (v === 'month' ? setView('month') : setMode(v))}
            options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </div>
      </header>
      )}

      {/* Calendar card */}
      <section className="card overflow-x-auto max-sm:overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          {/* Day tiles (phones have the strip above instead) */}
          {!phone && <div className="grid gap-2 px-3 pt-3" style={{ gridTemplateColumns: colTemplate }}>
            <div className="flex items-center justify-center text-[11px] font-bold text-faint" title="Week number">W{getISOWeek(days[0])}</div>
            {byDay.map(({ day, key, list }) => {
              const today = isSameDay(day, now)
              const holiday = holidays?.[key]
              const planned = list.reduce((m, t) => m + (t.durationMinutes || 0), 0)
              return (
                <button key={key} type="button" title={[holiday, planned ? `${fmtMinutes(planned)} planned` : ''].filter(Boolean).join(' · ') || undefined}
                  aria-label={`${format(day, 'EEEE d MMMM')}${holiday ? `, ${holiday}` : ''}${planned ? `, ${fmtMinutes(planned)} planned` : ''}. Open this day`}
                  onClick={() => { setAnchor(day); setMode('day') }}
                  className="group rounded-2xl py-1.5 flex items-center justify-center gap-2 transition hover:bg-page min-w-0">
                  <span className={cx('text-[11px] font-bold uppercase tracking-wider', today ? 'text-brand' : 'text-faint')}>{format(day, 'EEE')}</span>
                  <span className={cx('h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-base font-bold tnum transition',
                    today ? 'bg-brand text-white' : 'text-ink group-hover:bg-lav/60')}>{format(day, 'd')}</span>
                  {holiday && <PartyPopper size={11} className="text-peach-fg shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>}

          {/* No-time row */}
          <div className={cx('grid gap-2 px-3 pt-2 pb-2 border-b border-line', phone && 'px-2 py-2.5')} style={{ gridTemplateColumns: colTemplate }}>
            <div className="text-[11px] font-bold text-faint uppercase tracking-wider flex items-center justify-center text-center leading-tight">No time</div>
            {gridDays.map(({ key, untimed, allDayEvents }) => (
              <div key={key} className="min-h-[28px] flex flex-wrap gap-1 content-start">
                {allDayEvents.slice(0, 2).map((e) => <EventChip key={e.id} event={e} />)}
                {untimed.slice(0, 3).map((t) => <Chip key={t.id} task={t} />)}
                {untimed.length > 3 && <span className="text-[11px] font-semibold text-faint self-center">+{untimed.length - 3} more</span>}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div ref={scrollRef} className="overflow-y-auto overscroll-contain" style={{ height: phone ? 'max(360px, calc(100dvh - 330px))' : 520 }}>
            <div className="grid relative" style={{ gridTemplateColumns: colTemplate, height: GRID_HEIGHT }}>
              {/* Axis */}
              <div className="relative">
                {hours.map((m) => (
                  <span key={m} className={cx('absolute -translate-y-1/2 text-xs font-semibold text-faint', phone ? 'right-2' : 'right-3')} style={{ top: (m - GRID_START) * PX_PER_MIN }}>
                    {clock(toHHMM(m))}
                  </span>
                ))}
                {showNow && (
                  <span className="absolute right-2 -translate-y-1/2 z-20 rounded-full bg-danger text-white text-[11px] font-bold px-1.5 py-0.5"
                    style={{ top: (nowMin - GRID_START) * PX_PER_MIN }}>
                    {clock(toHHMM(nowMin))}
                  </span>
                )}
              </div>

              {gridDays.map(({ day, key, lanes }) => (
                <DayColumn key={key} dayKey={key} isToday={isSameDay(day, now)} hours={hours} offHours={offHours}
                  onSlot={(min) => setQuickAdd({ date: key, startTime: toHHMM(min), durationMinutes: 60 })}>
                  {lanes.map(({ task, lane, lanes: n }) => (task.event
                    ? <EventBlock key={task.id} item={task} lane={lane} lanes={n} />
                    : <Block key={task.id} task={task} lane={lane} lanes={n} onOpen={() => setSelectedId(task.id)} />))}
                </DayColumn>
              ))}

              {showNow && (
                <div className="absolute left-0 right-0 z-10 pointer-events-none border-t-2 border-dashed border-coral-fg"
                  style={{ top: (nowMin - GRID_START) * PX_PER_MIN, marginLeft: axisW }} />
              )}
            </div>
          </div>
        </DndContext>
      </section>

      {/* Stats row */}
      <div className="grid grid-cols-12 gap-4 mt-4">
        <section className="card p-5 col-span-12 xl:col-span-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="h-display text-base">Planned vs completed</h2>
            <div className="flex items-center gap-3 text-xs font-semibold text-muted">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sky" /> Planned</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sky-fg" /> Completed</span>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekStats.rows} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barGap={4} barCategoryGap={18}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={cssVar('--line')} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: cssVar('--faint'), fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: cssVar('--faint') }} tickFormatter={(v) => `${v}h`} allowDecimals={false} />
                <Tooltip cursor={{ fill: cssVar('--page') }} content={<ChartTip />} />
                <Bar dataKey="planned" fill={cssVar('--sky')} radius={[6, 6, 6, 6]} maxBarSize={22} />
                <Bar dataKey="completed" fill={cssVar('--sky-fg')} radius={[6, 6, 6, 6]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="col-span-12 xl:col-span-4 flex flex-col gap-4">
          <Summary icon={CheckCircle2} tone="mint" label="Tasks completed" value={`${weekStats.done} / ${weekStats.total}`} />
          <Summary icon={Flame} tone="coral" label="Busiest day"
            value={weekStats.busiest?.count ? format(weekStats.busiest.date, 'EEEE') : '—'}
            sub={weekStats.busiest?.count ? `${weekStats.busiest.count} tasks · ${weekStats.busiest.planned.toFixed(1)} h` : 'Nothing planned'} />
          <div className="card p-4 flex-1">
            <p className="text-xs font-semibold text-muted">Completion</p>
            <p className="h-display text-2xl mt-0.5">{weekStats.pct}%</p>
            <ProgressBar value={weekStats.pct / 100} className="mt-3" tone="bg-lav-fg" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DayColumn({ dayKey, isToday, hours, offHours = [], onSlot, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey })
  const [hover, setHover] = useState(null)
  return (
    <div ref={setNodeRef} className={cx('relative border-l border-line', isToday && 'bg-lav/20', isOver && 'bg-lav/40')}>
      {offHours.map(([a, b]) => (
        <div key={a} aria-hidden="true" className="absolute left-0 right-0 bg-ink/[0.035] pointer-events-none" style={{ top: (a - GRID_START) * PX_PER_MIN, height: (b - a) * PX_PER_MIN }} />
      ))}
      {hours.map((m) => (
        <React.Fragment key={m}>
          <div className="absolute left-0 right-0 border-t border-line" style={{ top: (m - GRID_START) * PX_PER_MIN }} />
          <div className="absolute left-0 right-0 border-t border-dashed border-line/70" style={{ top: (m + 30 - GRID_START) * PX_PER_MIN }} />
          {[m, m + 30].map((slot) => (
            <button key={slot} type="button" onClick={() => onSlot(slot)}
              onMouseEnter={() => setHover(slot)} onMouseLeave={() => setHover(null)}
              className={cx('absolute left-0 right-0 text-left px-1.5 text-[11px] font-semibold text-lav-fg transition-colors',
                hover === slot ? 'bg-lav/60' : 'bg-transparent')}
              style={{ top: (slot - GRID_START) * PX_PER_MIN, height: 30 * PX_PER_MIN }}>
              {hover === slot && `+ ${toHHMM(slot)}`}
            </button>
          ))}
        </React.Fragment>
      ))}
      {children}
    </div>
  )
}

// Dragging the bottom edge changes how long a task takes, in 15-minute steps (from 15 minutes to midnight).
function useResize(task, updateTask) {
  const [preview, setPreview] = useState(null)
  const onPointerDown = (e) => {
    e.stopPropagation()
    e.preventDefault() // no text selection, and no mouse events for the block's drag to pick up
    const y0 = e.clientY, d0 = task.durationMinutes, start = toMin(task.startTime)
    const len = (y) => Math.max(15, Math.min(GRID_END - start, d0 + Math.round((y - y0) / PX_PER_MIN / 15) * 15))
    let last = d0
    const move = (ev) => { last = len(ev.clientY); setPreview(last) }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPreview(null)
      if (last !== d0) updateTask(task.id, { durationMinutes: last })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { preview, onPointerDown }
}

function Block({ task, lane, lanes, onOpen }) {
  const { categoryById, updateTask } = usePlanner()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const c = colorOf(categoryById(task.category).color)
  const start = toMin(task.startTime)
  const resize = useResize(task, updateTask)
  const minutes = resize.preview ?? task.durationMinutes
  const height = Math.max(22, minutes * PX_PER_MIN)
  const done = task.status === 'completed'
  const width = 100 / lanes
  const style = {
    top: (start - GRID_START) * PX_PER_MIN,
    height,
    left: `calc(${lane * width}% + 3px)`,
    width: `calc(${width}% - 6px)`,
    borderLeftColor: cssVar(c.var),
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(1.5deg) scale(1.02)` : undefined,
    zIndex: isDragging ? 30 : 5,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={onOpen}
      // Enter opens; Space picks the block up, then arrow keys move it in time.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); onOpen(); return }
        listeners?.onKeyDown?.(e)
      }}
      aria-label={`${task.title}, ${toHHMM(start)} to ${toHHMM(start + task.durationMinutes)}. Enter to open, Space to move.`}
      className={cx('group/block absolute rounded-xl border-l-[3px] px-2 cursor-pointer overflow-hidden select-none transition-shadow',
        height < 40 ? 'py-0.5 flex items-center' : 'py-1', c.bg, isDragging || resize.preview ? 'shadow-lift' : 'hover:shadow-soft', done && 'opacity-60')}>
      {/* Short blocks: one line, time first. Taller ones: the title on up to three lines, then the time. */}
      {height < 40 ? (
        <p className={cx('text-xs font-bold leading-tight truncate min-w-0', c.text, done && 'line-through')}>
          <span className="font-medium opacity-80 mr-1">{clock(toHHMM(start))}</span>{task.title}
        </p>
      ) : (
        <>
          <p className={cx('text-xs font-bold leading-tight break-words', height < 64 ? 'line-clamp-1' : height < 96 ? 'line-clamp-2' : 'line-clamp-3', c.text, done && 'line-through')}>
            {done && <Check size={11} strokeWidth={3} className="inline -mt-0.5 mr-0.5" />}
            {task.title}
          </p>
          <p className={cx('text-[11px] font-medium opacity-80 truncate', c.text)}>{clock(toHHMM(start))} – {clock(toHHMM(start + minutes))}</p>
          {height >= 110 && <PriorityPill priority={task.priority} className="mt-1 text-[11px] py-0" />}
        </>
      )}
      <span aria-hidden="true" onPointerDown={resize.onPointerDown} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
        title="Drag to change how long it takes"
        className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize touch-none opacity-0 group-hover/block:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:h-3 transition">
        <i className={cx('block mx-auto mt-0.5 h-1 w-6 rounded-full opacity-60', c.dot)} />
      </span>
    </div>
  )
}

// A Google Calendar event: read-only, opens in Google Calendar.
function EventBlock({ item, lane, lanes }) {
  const e = item.event
  const start = toMin(item.startTime)
  const height = Math.max(22, item.durationMinutes * PX_PER_MIN)
  const width = 100 / lanes
  const Tag = e.link ? 'a' : 'div'
  return (
    <Tag {...(e.link ? { href: e.link, target: '_blank', rel: 'noopener noreferrer' } : {})}
      aria-label={`Calendar event: ${e.title}, ${toHHMM(e.startMin)} to ${toHHMM(Math.min(e.endMin, 1439))}`}
      style={{ top: (start - GRID_START) * PX_PER_MIN, height, left: `calc(${lane * width}% + 3px)`, width: `calc(${width}% - 6px)`, zIndex: 4 }}
      className={cx('absolute rounded-xl border border-dashed border-faint/60 bg-subtle/80 px-2 py-1 overflow-hidden select-none text-muted hover:text-ink hover:border-faint transition', e.free && 'opacity-70')}>
      <p className={cx('text-xs font-bold leading-tight break-words', height < 64 ? 'line-clamp-1' : 'line-clamp-2')}><CalendarDays size={11} className="inline -mt-0.5 mr-1" />{e.title}</p>
      {height >= 40 && <p className="text-[11px] font-medium opacity-80">{clock(toHHMM(e.startMin))} – {clock(toHHMM(Math.min(e.endMin, 1439)))}</p>}
    </Tag>
  )
}

function EventChip({ event }) {
  const Tag = event.link ? 'a' : 'span'
  return (
    <Tag {...(event.link ? { href: event.link, target: '_blank', rel: 'noopener noreferrer' } : {})} title={`Calendar: ${event.title}`}
      className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold truncate max-w-full inline-flex items-center gap-1 border border-dashed border-faint/60 bg-subtle/80 text-muted hover:text-ink">
      <CalendarDays size={9} className="shrink-0" /> <span className="truncate">{event.title}</span>
    </Tag>
  )
}

function Chip({ task }) {
  const { categoryById, setSelectedId } = usePlanner()
  const c = colorOf(categoryById(task.category).color)
  return (
    <button type="button" onClick={() => setSelectedId(task.id)}
      className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold truncate max-w-full', c.bg, c.text, task.status === 'completed' && 'line-through opacity-60')}>
      {task.title}
    </button>
  )
}

function Summary({ icon: Icon, tone, label, value, sub }) {
  const c = colorOf(tone)
  return (
    <div className="card p-4 flex items-center gap-3.5 flex-1">
      <div className={cx('h-11 w-11 rounded-2xl flex items-center justify-center shrink-0', c.bg, c.text)}><Icon size={20} /></div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="h-display text-xl leading-tight">{value}</p>
        {sub && <p className="text-xs text-faint truncate">{sub}</p>}
      </div>
    </div>
  )
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="card px-3 py-2 text-xs shadow-lift">
      <p className="font-semibold">{label} · {d.count} task{d.count === 1 ? '' : 's'}</p>
      <p className="text-muted">{fmtMinutes(d.planned * 60)} planned · {fmtMinutes(d.completed * 60)} completed</p>
    </div>
  )
}
