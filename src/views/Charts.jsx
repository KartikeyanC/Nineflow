import React, { useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays, endOfDay, format, isAfter, isSameDay, isValid, parseISO, startOfDay } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartColumn, ChevronLeft, ChevronRight, Table2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { MAX_CUSTOM_DAYS, RANGES, rangeWindow, shiftEnd, workSeries } from '../lib/workCharts'
import { dateKey, fmtMinutes } from '../lib/tasks'
import { colorOf, cssVar } from '../lib/colors'
import { EmptyState, cx } from '../components/ui'

// Working charts: hours worked and tasks finished over a day, a week, 15 days, a month,
// six months, a year or any stretch you choose.
const RANGE_KEY = 'nineflow:charts-range'
const savedRange = () => { try { const v = localStorage.getItem(RANGE_KEY); return RANGES.some((r) => r.id === v) ? v : 'week' } catch { return 'week' } }

export default function Charts() {
  const { allTasks, tasks, settings, now } = usePlanner()
  const list = allTasks || tasks
  const [range, setRangeState] = useState(savedRange)
  const setRange = (id) => { setRangeState(id); try { localStorage.setItem(RANGE_KEY, id) } catch { /* ignore */ } }
  const [end, setEnd] = useState(() => startOfDay(now))
  const [custom, setCustom] = useState(() => ({ from: dateKey(addDays(now, -13)), to: dateKey(now) }))
  const [showTable, setShowTable] = useState(false)

  const customOk = (() => {
    const a = parseISO(custom.from), b = parseISO(custom.to)
    if (!isValid(a) || !isValid(b)) return 'Choose both dates.'
    if (b < a) return 'The end date is before the start date.'
    if (differenceInCalendarDays(b, a) + 1 > MAX_CUSTOM_DAYS) return 'Choose at most three years.'
    return null
  })()
  const win = useMemo(() => {
    if (range !== 'custom') return rangeWindow(range, end)
    if (customOk) return null
    return { from: startOfDay(parseISO(custom.from)), to: endOfDay(parseISO(custom.to)) }
  }, [range, end, custom, customOk])

  const data = useMemo(() => (win ? workSeries(list, win.from, win.to, settings.categories, now) : null), [list, win, settings.categories, now])
  const atToday = !isAfter(startOfDay(now), end)
  const label = win ? (isSameDay(win.from, win.to) ? format(win.from, 'EEEE d MMMM yyyy') : `${format(win.from, win.from.getFullYear() === win.to.getFullYear() ? 'd MMM' : 'd MMM yyyy')} – ${format(win.to, 'd MMM yyyy')}`) : ''
  const empty = data && data.minutes === 0 && data.done === 0
  // Plotted in whole hours; when every bar is under two hours, in minutes on a 15- or 30-minute grid.
  const hourRows = useMemo(() => (data ? data.rows.map((r) => ({ ...r, hours: r.minutes / 60 })) : []), [data])
  const maxMinutes = data ? Math.max(0, ...data.rows.map((r) => r.minutes)) : 0

  return (
    <div className="flex flex-col gap-4 animate-view-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl max-sm:text-2xl">Working charts</h1>
          <p className="text-sm text-muted mt-1">Hours you worked and tasks you finished, over any stretch of time.</p>
        </div>
      </header>

      {/* Range: presets, then the stretch shown with ‹ › to step through it */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Range" className="inline-flex flex-wrap rounded-full p-1 gap-0.5 bg-ink/5 dark:bg-ink/10">
          {RANGES.map((r) => (
            <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}
              className={cx('rounded-full px-3 py-1.5 text-sm font-semibold transition whitespace-nowrap', range === r.id ? 'bg-brand text-white shadow-sm' : 'text-ink/70 hover:text-ink')}>
              {r.label}
            </button>
          ))}
        </div>
        {range === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 ml-auto max-sm:ml-0">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">From
              <input type="date" className="input h-9 py-0 w-40" value={custom.from} max={dateKey(now)} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">To
              <input type="date" className="input h-9 py-0 w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-1 ml-auto max-sm:ml-0">
            <button type="button" className="h-9 w-9 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink" aria-label="Earlier" onClick={() => setEnd((e) => shiftEnd(range, e, -1))}><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold tnum min-w-[11rem] text-center">{label}</span>
            <button type="button" className="h-9 w-9 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink disabled:opacity-30" aria-label="Later" disabled={atToday}
              onClick={() => setEnd((e) => { const n = shiftEnd(range, e, 1); return isAfter(n, startOfDay(now)) ? startOfDay(now) : n })}><ChevronRight size={16} /></button>
            {!atToday && <button type="button" className="btn-ghost h-9 py-0 px-3" onClick={() => setEnd(startOfDay(now))}>Today</button>}
          </div>
        )}
      </div>
      {range === 'custom' && customOk && <p role="alert" className="text-sm font-semibold text-coral-fg -mt-2">{customOk}</p>}

      {data && (
        <>
          {/* Summary first */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Hours worked" value={fmtMinutes(data.minutes)} hint={range === 'custom' ? label : `${RANGES.find((r) => r.id === range).label.toLowerCase()} · ${label}`} />
            <Stat label="Tasks done" value={data.done} hint={data.done === 1 ? 'task finished' : 'tasks finished'} />
            <Stat label="Average per working day" value={data.activeDays ? fmtMinutes(data.minutes / data.activeDays) : '—'} hint={`${data.activeDays} day${data.activeDays === 1 ? '' : 's'} with work`} />
            <Stat label="Planned time worked" value={data.planned ? `${Math.round((data.workedOnPlanned / data.planned) * 100)}%` : '—'}
              hint={data.planned ? `${fmtMinutes(data.workedOnPlanned)} of ${fmtMinutes(data.planned)} planned` : 'No time planned on tasks'} />
          </div>

          {empty ? (
            <div className="card p-6">
              <EmptyState icon={ChartColumn} title="No work recorded in this stretch"
                hint="Hours come from tasks moved to Working or timed with the focus timer. Finish a task and it counts here too." />
            </div>
          ) : (
            <>
              <section className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="h-display text-base">Hours worked</h2>
                    <p className="text-xs text-faint">Per {data.unit}{data.best && data.best.minutes > 0 ? ` · best: ${data.best.title}, ${fmtMinutes(data.best.minutes)}` : ''}</p>
                  </div>
                  <button type="button" className="btn-ghost h-8 py-0 px-3 text-xs" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
                    <Table2 size={13} /> {showTable ? 'Show chart' : 'Show table'}
                  </button>
                </div>
                {showTable ? <SeriesTable rows={data.rows} /> : maxMinutes < 120 ? (
                  <BarsChart rows={data.rows} dataKey="minutes" color="--lav-fg" height={240} ticks={minuteTicks(maxMinutes)}
                    yFormat={(m) => `${m}m`} tip={(r) => fmtMinutes(r.minutes)} />
                ) : (
                  <BarsChart rows={hourRows} dataKey="hours" color="--lav-fg" height={240} allowDecimals={false}
                    yFormat={(h) => `${h}h`} tip={(r) => fmtMinutes(r.minutes)} />
                )}
              </section>

              <div className="grid lg:grid-cols-2 gap-4">
                <section className="card p-5">
                  <h2 className="h-display text-base">Tasks done</h2>
                  <p className="text-xs text-faint mb-3">Per {data.unit}, by the day each task was finished</p>
                  <BarsChart rows={data.rows} dataKey="done" color="--mint-fg" height={180} allowDecimals={false}
                    yFormat={(v) => String(v)} tip={(r) => `${r.done} task${r.done === 1 ? '' : 's'} done`} />
                </section>
                <section className="card p-5">
                  <h2 className="h-display text-base">Hours by category</h2>
                  <p className="text-xs text-faint mb-3">Share of the {fmtMinutes(data.minutes)} worked</p>
                  <CategoryBars cats={data.categories} total={data.minutes} />
                </section>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="h-display text-2xl tnum mt-0.5">{value}</p>
      <p className="text-[11px] text-faint mt-0.5 truncate" title={hint}>{hint}</p>
    </div>
  )
}

const minuteTicks = (max) => {
  const step = max > 60 ? 30 : 15
  return Array.from({ length: Math.max(1, Math.ceil(max / step)) + 1 }, (_, i) => i * step)
}

// One measure, one colour, one axis. Bars are rounded at the top and sit on the baseline.
function BarsChart({ rows, dataKey, color, height, yFormat, tip, allowDecimals = true, ticks }) {
  const many = rows.length > 16
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={rows.length > 40 ? 1 : 3}>
          <CartesianGrid vertical={false} stroke={cssVar('--line')} />
          <XAxis dataKey="tick" axisLine={false} tickLine={false} interval={many ? 'preserveStartEnd' : 0} minTickGap={8}
            tick={{ fontSize: 10, fill: cssVar('--faint') }} />
          <YAxis axisLine={false} tickLine={false} width={34} allowDecimals={allowDecimals} tickFormatter={yFormat}
            ticks={ticks} domain={ticks ? [0, ticks[ticks.length - 1]] : undefined}
            tick={{ fontSize: 10, fill: cssVar('--faint') }} />
          <Tooltip cursor={{ fill: cssVar('--page') }} content={({ active, payload }) => (active && payload?.length ? (
            <div className="card px-2.5 py-1.5 text-xs shadow-lift">
              <p className="font-semibold">{payload[0].payload.title}</p>
              <p className="text-muted">{tip(payload[0].payload)}</p>
            </div>
          ) : null)} />
          <Bar dataKey={dataKey} fill={cssVar(color)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SeriesTable({ rows }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-line">
      <table className="w-full text-sm tnum">
        <thead className="sticky top-0 bg-card text-xs text-muted">
          <tr><th className="text-left font-semibold px-3 py-2">When</th><th className="text-right font-semibold px-3 py-2">Hours worked</th><th className="text-right font-semibold px-3 py-2">Tasks done</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.from.toISOString()} className="border-t border-line">
              <td className="px-3 py-1.5">{r.title}</td>
              <td className="px-3 py-1.5 text-right">{r.minutes ? fmtMinutes(r.minutes) : '—'}</td>
              <td className="px-3 py-1.5 text-right">{r.done || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Each category keeps its own colour, the same one its pills use everywhere else.
function CategoryBars({ cats, total }) {
  if (!cats.length) return <p className="text-sm text-faint">No hours worked in this stretch.</p>
  return (
    <ul className="space-y-3">
      {cats.map((c) => {
        const col = c.color ? colorOf(c.color) : null
        const pct = total ? Math.round((c.minutes / total) * 100) : 0
        return (
          <li key={c.id} title={`${c.name}: ${fmtMinutes(c.minutes)} (${pct}%)`}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="inline-flex items-center gap-1.5 font-semibold"><i className={cx('h-2 w-2 rounded-full', col ? col.dot : 'bg-faint')} />{c.name}</span>
              <span className="text-muted tnum">{fmtMinutes(c.minutes)} · {pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-page overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: col ? cssVar(col.var) : cssVar('--faint') }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
