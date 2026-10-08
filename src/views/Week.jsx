import React, { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, getISOWeek, isSameDay, isSameMonth, startOfWeek } from 'date-fns'
import { DndContext, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronLeft, ChevronRight, Plus, Check, CheckCircle2, Flame, Wand2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, fmtMinutes, tasksOn } from '../lib/tasks'
import { unscheduledOn, describePlan } from '../lib/schedule'
import { colorOf, cssVar } from '../lib/colors'
import { PriorityPill, ProgressBar, Segmented, cx } from '../components/ui'

const GRID_START = 7 * 60 // 07:00
const GRID_END = 22 * 60 // 22:00
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

function rangeLabel(days) {
  const a = days[0], b = days[days.length - 1]
  if (days.length === 1) return format(a, 'EEE, MMM d')
  return isSameMonth(a, b) ? `${format(a, 'MMM d')} – ${format(b, 'd')}` : `${format(a, 'MMM d')} – ${format(b, 'MMM d')}`
}

export default function Week() {
  const { tasks, now, settings, updateTask, setQuickAdd, setView, setSelectedId, planDay } = usePlanner()
  const [anchor, setAnchor] = useState(() => new Date())
  // Phones open on a single day; wider screens on the week.
  const [mode, setMode] = useState(() => (window.innerWidth < 640 ? 'day' : 'week')) // 'day' | 'week'

  const days = useMemo(() => {
    if (mode === 'day') return [anchor]
    const start = startOfWeek(anchor, { weekStartsOn: settings.weekStart })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchor, mode, settings.weekStart])

  const todayInRange = days.some((d) => isSameDay(d, now))
  const shift = (dir) => setAnchor((a) => addDays(a, dir * (mode === 'day' ? 1 : 7)))

  // "Plan" targets the single day in day mode, otherwise today when it's in range.
  const planDate = mode === 'day' ? anchor : todayInRange ? now : null
  const planKey = planDate ? dateKey(planDate) : null
  const unscheduled = planKey ? unscheduledOn(tasks, planKey).length : 0
  const [planMsg, setPlanMsg] = useState(null)

  // Per-day task buckets, split into timed (with lanes) and untimed.
  const byDay = useMemo(() => days.map((day) => {
    const list = tasksOn(tasks, dateKey(day))
    const timed = list.filter((t) => t.startTime)
    const untimed = list.filter((t) => !t.startTime)
    return { day, key: dateKey(day), list, untimed, lanes: layoutLanes(timed) }
  }), [tasks, days])

  // Scroll the grid so "now" sits ~160px from the top on load.
  const scrollRef = useRef(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nowMin = now.getHours() * 60 + now.getMinutes()
    el.scrollTop = Math.max(0, (nowMin - GRID_START) * PX_PER_MIN - 160)
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
      completed: list.filter((t) => t.status === 'completed').reduce((s, t) => s + t.durationMinutes, 0) / 60,
      count: list.length,
      date: day,
    }))
    const all = byDay.flatMap((d) => d.list)
    const done = all.filter((t) => t.status === 'completed').length
    const busiest = rows.reduce((m, r) => (r.count > (m?.count || 0) ? r : m), null)
    return { rows, total: all.length, done, busiest, pct: all.length ? Math.round((done / all.length) * 100) : 0 }
  }, [byDay, mode])

  const hours = Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, i) => GRID_START + i * 60)
  // A week needs ~110px per day; narrower screens scroll sideways.
  const colTemplate = `${AXIS_W}px repeat(${days.length}, minmax(${days.length > 1 ? 110 : 0}px, 1fr))`

  return (
    <div className="animate-view-in">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-full bg-ink text-page p-1">
            <button type="button" onClick={() => shift(-1)} className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-page/15 transition" aria-label="Previous"><ChevronLeft size={16} /></button>
            <span className="px-3 text-sm font-bold tracking-tight min-w-[140px] text-center">{rangeLabel(days)}</span>
            <button type="button" onClick={() => shift(1)} className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-page/15 transition" aria-label="Next"><ChevronRight size={16} /></button>
          </div>
          {!todayInRange && (
            <button type="button" className="btn-ghost h-9 py-0" onClick={() => setAnchor(new Date())}>Jump to today</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {planMsg && <span className="text-[11px] font-semibold text-muted animate-fade-in">{planMsg}</span>}
          {unscheduled > 0 && !planMsg && (
            <button type="button" className="btn-ghost h-9 py-0 text-lav-fg"
              onClick={() => { setPlanMsg(describePlan(planDay(planKey))); setTimeout(() => setPlanMsg(null), 4000) }}
              title={`Timebox ${unscheduled} unscheduled task${unscheduled === 1 ? '' : 's'} on ${format(planDate, 'EEE d')}`}>
              <Wand2 size={15} /> Plan {isSameDay(planDate, now) ? 'today' : format(planDate, 'EEE d')} · {unscheduled}
            </button>
          )}
          <button type="button" className="btn-ghost h-9 py-0" onClick={() => setQuickAdd({ date: dateKey(anchor) })}><Plus size={15} /> Add task</button>
          <Segmented size="sm" value={mode}
            onChange={(v) => { if (v === 'month') setView('month'); else { setMode(v); if (v === 'day') setAnchor(new Date()) } }}
            options={[{ value: 'day', label: 'Today' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </div>
      </header>

      {/* Calendar card */}
      <section className="card overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          {/* Day tiles */}
          <div className="grid gap-2 px-3 pt-3" style={{ gridTemplateColumns: colTemplate }}>
            <div className="rounded-2xl bg-page flex flex-col items-center justify-center py-2">
              <span className="text-[10px] font-bold text-faint">W</span>
              <span className="text-sm font-bold">{getISOWeek(days[0])}</span>
            </div>
            {days.map((day) => {
              const today = isSameDay(day, now)
              return (
                <button key={dateKey(day)} type="button"
                  onClick={() => { setAnchor(day); setMode('day') }}
                  className={cx('rounded-2xl py-2 flex flex-col items-center transition hover:-translate-y-0.5',
                    today ? 'bg-ink text-page' : 'bg-page text-ink hover:bg-lav/60')}>
                  <span className={cx('text-[10px] font-bold uppercase tracking-wider', today ? 'text-page/70' : 'text-faint')}>{format(day, 'EEE')}</span>
                  <span className="h-display text-2xl leading-tight">{format(day, 'd')}</span>
                </button>
              )
            })}
          </div>

          {/* No-time row */}
          <div className="grid gap-2 px-3 pt-2 pb-2 border-b border-line" style={{ gridTemplateColumns: colTemplate }}>
            <div className="text-[10px] font-bold text-faint uppercase tracking-wider flex items-center justify-center">No time</div>
            {byDay.map(({ key, untimed }) => (
              <div key={key} className="min-h-[28px] flex flex-wrap gap-1 content-start">
                {untimed.slice(0, 3).map((t) => <Chip key={t.id} task={t} />)}
                {untimed.length > 3 && <span className="text-[10px] font-semibold text-faint self-center">+{untimed.length - 3} more</span>}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ height: 520 }}>
            <div className="grid relative" style={{ gridTemplateColumns: colTemplate, height: GRID_HEIGHT }}>
              {/* Axis */}
              <div className="relative">
                {hours.map((m) => (
                  <span key={m} className="absolute right-3 -translate-y-1/2 text-[11px] font-semibold text-faint" style={{ top: (m - GRID_START) * PX_PER_MIN }}>
                    {toHHMM(m)}
                  </span>
                ))}
                {showNow && (
                  <span className="absolute right-2 -translate-y-1/2 z-20 rounded-full bg-coral-fg text-white text-[10px] font-bold px-1.5 py-0.5"
                    style={{ top: (nowMin - GRID_START) * PX_PER_MIN }}>
                    {toHHMM(nowMin)}
                  </span>
                )}
              </div>

              {byDay.map(({ day, key, lanes }) => (
                <DayColumn key={key} dayKey={key} isToday={isSameDay(day, now)} hours={hours}
                  onSlot={(min) => setQuickAdd({ date: key, startTime: toHHMM(min), durationMinutes: 60 })}>
                  {lanes.map(({ task, lane, lanes: n }) => (
                    <Block key={task.id} task={task} lane={lane} lanes={n} onOpen={() => setSelectedId(task.id)} />
                  ))}
                </DayColumn>
              ))}

              {showNow && (
                <div className="absolute left-0 right-0 z-10 pointer-events-none border-t-2 border-dashed border-coral-fg"
                  style={{ top: (nowMin - GRID_START) * PX_PER_MIN, marginLeft: AXIS_W }} />
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
            <div className="flex items-center gap-3 text-[11px] font-semibold text-muted">
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

function DayColumn({ dayKey, isToday, hours, onSlot, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey })
  const [hover, setHover] = useState(null)
  return (
    <div ref={setNodeRef} className={cx('relative border-l border-line', isToday && 'bg-lav/20', isOver && 'bg-lav/40')}>
      {hours.map((m) => (
        <React.Fragment key={m}>
          <div className="absolute left-0 right-0 border-t border-line" style={{ top: (m - GRID_START) * PX_PER_MIN }} />
          <div className="absolute left-0 right-0 border-t border-dashed border-line/70" style={{ top: (m + 30 - GRID_START) * PX_PER_MIN }} />
          {[m, m + 30].map((slot) => (
            <button key={slot} type="button" onClick={() => onSlot(slot)}
              onMouseEnter={() => setHover(slot)} onMouseLeave={() => setHover(null)}
              className={cx('absolute left-0 right-0 text-left px-1.5 text-[10px] font-semibold text-lav-fg transition-colors',
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

function Block({ task, lane, lanes, onOpen }) {
  const { categoryById } = usePlanner()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const c = colorOf(categoryById(task.category).color)
  const start = toMin(task.startTime)
  const height = Math.max(22, task.durationMinutes * PX_PER_MIN)
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
      className={cx('absolute rounded-xl border-l-[3px] px-2 py-1 cursor-pointer overflow-hidden select-none transition-shadow',
        c.bg, isDragging ? 'shadow-lift' : 'hover:shadow-soft', done && 'opacity-60')}>
      <p className={cx('text-xs font-bold leading-tight line-clamp-2 flex items-start gap-1', c.text, done && 'line-through')}>
        {done && <Check size={11} strokeWidth={3} className="mt-0.5 shrink-0" />}
        {task.title}
      </p>
      {height >= 40 && (
        <p className={cx('text-[10px] font-medium opacity-80', c.text)}>{toHHMM(start)} – {toHHMM(start + task.durationMinutes)}</p>
      )}
      {height >= 72 && <PriorityPill priority={task.priority} className="mt-1 text-[10px] py-0" />}
    </div>
  )
}

function Chip({ task }) {
  const { categoryById, setSelectedId } = usePlanner()
  const c = colorOf(categoryById(task.category).color)
  return (
    <button type="button" onClick={() => setSelectedId(task.id)}
      className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold truncate max-w-full', c.bg, c.text, task.status === 'completed' && 'line-through opacity-60')}>
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
        {sub && <p className="text-[11px] text-faint truncate">{sub}</p>}
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
