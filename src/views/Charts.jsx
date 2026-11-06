import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, differenceInCalendarDays, endOfDay, isAfter, isSameDay, isValid, parseISO, startOfDay } from 'date-fns'
import { format } from '../lib/dateFormat'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartColumn, ChevronLeft, ChevronRight, Download, FileText, Table2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { MAX_CUSTOM_DAYS, RANGES, rangeWindow, shiftEnd, workSeries } from '../lib/workCharts'
import { dateKey, fmtMinutes, minutesInRange } from '../lib/tasks'
import { colorOf, cssVar } from '../lib/colors'
import { EmptyState, cx } from '../components/ui'
import { DateField } from '../components/DatePicker'
import { buildInvoice, money, rateOf } from '../lib/billing'
import InvoiceDialog from '../components/InvoiceDialog'

// Working charts: hours worked and tasks finished over a day, a week, 15 days, a month, three or
// six months, a year or any stretch you choose. The summary and each chart have their own range,
// so hours can show a year while tasks done shows the last 15 days.
const OLD_KEY = 'nineflow:charts-range' // the one range every chart shared before
const keyFor = (name) => `nineflow:charts-range:${name}`
const savedRange = (name) => {
  try {
    const v = localStorage.getItem(keyFor(name)) || localStorage.getItem(OLD_KEY)
    return RANGES.some((r) => r.id === v) ? v : 'week'
  } catch { return 'week' }
}

// One chart's range: the preset (remembered), where the stretch ends, and custom dates.
function useRange(name, now) {
  const [range, setRangeState] = useState(() => savedRange(name))
  const setRange = (id) => { setRangeState(id); try { localStorage.setItem(keyFor(name), id) } catch { /* only a convenience */ } }
  const [end, setEnd] = useState(() => startOfDay(now))
  const [custom, setCustom] = useState(() => ({ from: dateKey(addDays(now, -13)), to: dateKey(now) }))
  const error = range !== 'custom' ? null : (() => {
    const a = parseISO(custom.from), b = parseISO(custom.to)
    if (!isValid(a) || !isValid(b)) return 'Choose both dates.'
    if (b < a) return 'The end date is before the start date.'
    if (differenceInCalendarDays(b, a) + 1 > MAX_CUSTOM_DAYS) return 'Choose at most three years.'
    return null
  })()
  const win = useMemo(() => {
    if (range !== 'custom') return rangeWindow(range, end)
    if (error) return null
    return { from: startOfDay(parseISO(custom.from)), to: endOfDay(parseISO(custom.to)) }
  }, [range, end, custom, error])
  const label = win ? (isSameDay(win.from, win.to) ? format(win.from, 'EEE d MMM yyyy') : `${format(win.from, win.from.getFullYear() === win.to.getFullYear() ? 'd MMM' : 'd MMM yyyy')} – ${format(win.to, 'd MMM yyyy')}`) : ''
  const atToday = !isAfter(startOfDay(now), end)
  return {
    range, setRange, custom, setCustom, error, win, label, atToday,
    earlier: () => setEnd((e) => shiftEnd(range, e, -1)),
    later: () => setEnd((e) => { const n = shiftEnd(range, e, 1); return isAfter(n, startOfDay(now)) ? startOfDay(now) : n }),
    toToday: () => setEnd(startOfDay(now)),
    now,
  }
}

// The range picker. `compact` (inside a chart card): a menu instead of a row of buttons.
function RangePicker({ r, name, compact = false }) {
  const arrows = (
    <div className="flex items-center gap-0.5">
      <button type="button" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink" aria-label={`${name}: earlier`} onClick={r.earlier}><ChevronLeft size={15} /></button>
      <span className={cx('font-semibold tnum text-center', compact ? 'text-xs min-w-[8.5rem]' : 'text-sm min-w-[11rem]')}>{r.label}</span>
      <button type="button" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink disabled:opacity-30" aria-label={`${name}: later`} disabled={r.atToday} onClick={r.later}><ChevronRight size={15} /></button>
      {!r.atToday && <button type="button" className="btn-ghost h-8 py-0 px-2.5 text-xs" onClick={r.toToday}>Today</button>}
    </div>
  )
  const customDates = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">From
        <DateField size="sm" className="w-40" ariaLabel="From" allowClear={false} value={r.custom.from} max={r.custom.to && r.custom.to < dateKey(r.now) ? r.custom.to : dateKey(r.now)} range={r.custom} onChange={(v) => v && r.setCustom((c) => ({ ...c, from: v }))} />
      </label>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">To
        <DateField size="sm" className="w-40" ariaLabel="To" allowClear={false} value={r.custom.to} min={r.custom.from || undefined} range={r.custom} onChange={(v) => v && r.setCustom((c) => ({ ...c, to: v }))} />
      </label>
    </div>
  )
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {compact ? (
          <select className="input h-8 py-0 w-auto text-xs font-semibold" value={r.range} onChange={(e) => r.setRange(e.target.value)} aria-label={`${name}: range`}>
            {RANGES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        ) : (
          <div role="group" aria-label="Range" className="inline-flex flex-nowrap max-w-full overflow-x-auto rounded-full p-1 gap-0.5 bg-ink/5 dark:bg-ink/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {RANGES.map((x) => (
              <button key={x.id} type="button" aria-pressed={r.range === x.id} onClick={() => r.setRange(x.id)}
                className={cx('rounded-full px-3 py-1.5 text-sm font-semibold transition whitespace-nowrap', r.range === x.id ? 'bg-brand text-white shadow-sm' : 'text-ink/70 hover:text-ink')}>
                {x.label}
              </button>
            ))}
          </div>
        )}
        {r.range === 'custom' ? customDates : arrows}
      </div>
      {r.error && <p role="alert" className="text-xs font-semibold text-coral-fg">{r.error}</p>}
    </div>
  )
}

// The numbers for a range (each chart works them out for its own range).
function useSeries(r) {
  const { allTasks, tasks, settings, now } = usePlanner()
  const list = allTasks || tasks
  return useMemo(() => (r.win ? workSeries(list, r.win.from, r.win.to, settings.categories, now) : null), [list, r.win, settings.categories, now])
}

const NoWork = ({ text = 'No work recorded in this stretch.' }) => <p className="py-10 text-center text-sm text-faint">{text}</p>

export default function Charts() {
  const { now } = usePlanner()
  const summary = useRange('summary', now)
  const data = useSeries(summary)

  return (
    <div className="flex flex-col gap-4 animate-view-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl max-sm:text-2xl">Working charts</h1>
          <p className="text-sm text-muted mt-1">Hours you worked and tasks you finished. The summary and each chart have their own range.</p>
        </div>
      </header>

      {/* Summary: its range, then the four numbers */}
      <section className="card p-3 flex flex-col gap-3" aria-label="Summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h-display text-base px-1">Summary</h2>
          <RangePicker r={summary} name="Summary" />
        </div>
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Hours worked" value={fmtMinutes(data.minutes)} hint={summary.label} />
            <Stat label="Tasks done" value={data.done} hint={data.done === 1 ? 'task finished' : 'tasks finished'} />
            <Stat label="Average per working day" value={data.activeDays ? fmtMinutes(data.minutes / data.activeDays) : '—'} hint={`${data.activeDays} day${data.activeDays === 1 ? '' : 's'} with work`} />
            <Stat label="Planned time worked" value={data.planned ? `${Math.round((data.workedOnPlanned / data.planned) * 100)}%` : '—'}
              hint={data.planned ? `${fmtMinutes(data.workedOnPlanned)} of ${fmtMinutes(data.planned)} planned` : 'No time planned on tasks'} />
          </div>
        )}
      </section>

      {data && data.minutes === 0 && data.done === 0 && summary.range !== 'day' && (
        <div className="card p-6">
          <EmptyState icon={ChartColumn} title="No work recorded in this stretch"
            hint="Hours come from tasks moved to Working or timed with the focus timer. Finish a task and it counts here too." />
        </div>
      )}

      <HoursChart now={now} />
      <div className="grid lg:grid-cols-2 gap-4">
        <DoneChart now={now} />
        <CategoryChart now={now} />
      </div>
      <ClientChart now={now} />
    </div>
  )
}

// The head of a chart card: its title and note, then its own range.
function ChartHead({ title, note, r, right }) {
  return (
    <div className="flex flex-col gap-2 mb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="h-display text-base">{title}</h2>
          {note && <p className="text-xs text-faint">{note}</p>}
        </div>
        {right}
      </div>
      <RangePicker r={r} name={title} compact />
    </div>
  )
}

function HoursChart({ now }) {
  const r = useRange('hours', now)
  const data = useSeries(r)
  const [showTable, setShowTable] = useState(false)
  // Plotted in whole hours; when every bar is under two hours, in minutes on a 15- or 30-minute grid.
  const hourRows = useMemo(() => (data ? data.rows.map((x) => ({ ...x, hours: x.minutes / 60 })) : []), [data])
  const maxMinutes = data ? Math.max(0, ...data.rows.map((x) => x.minutes)) : 0
  return (
    <section className="card p-5">
      <ChartHead title="Hours worked" r={r}
        note={data ? `${fmtMinutes(data.minutes)} · per ${data.unit}${data.best && data.best.minutes > 0 ? ` · best: ${data.best.title}, ${fmtMinutes(data.best.minutes)}` : ''}` : null}
        right={(
          <button type="button" className="btn-ghost h-8 py-0 px-3 text-xs" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
            <Table2 size={13} /> {showTable ? 'Show chart' : 'Show table'}
          </button>
        )} />
      {!data ? null : data.minutes === 0 && data.done === 0 ? <NoWork /> : showTable ? <SeriesTable rows={data.rows} /> : maxMinutes < 120 ? (
        <BarsChart rows={data.rows} dataKey="minutes" color="--lav-fg" height={240} ticks={minuteTicks(maxMinutes)}
          yFormat={(m) => `${m}m`} tip={(x) => fmtMinutes(x.minutes)} />
      ) : (
        <BarsChart rows={hourRows} dataKey="hours" color="--lav-fg" height={240} allowDecimals={false}
          yFormat={(h) => `${h}h`} tip={(x) => fmtMinutes(x.minutes)} />
      )}
    </section>
  )
}

function DoneChart({ now }) {
  const r = useRange('done', now)
  const data = useSeries(r)
  return (
    <section className="card p-5">
      <ChartHead title="Tasks done" r={r} note={data ? `${data.done} done · per ${data.unit}, by the day each was finished` : null} />
      {!data ? null : data.done === 0 ? <NoWork text="No tasks finished in this stretch." /> : (
        <BarsChart rows={data.rows} dataKey="done" color="--mint-fg" height={180} allowDecimals={false}
          yFormat={(v) => String(v)} tip={(x) => `${x.done} task${x.done === 1 ? '' : 's'} done`} />
      )}
    </section>
  )
}

function CategoryChart({ now }) {
  const r = useRange('categories', now)
  const data = useSeries(r)
  return (
    <section className="card p-5">
      <ChartHead title="Hours by category" r={r} note={data ? `Share of the ${fmtMinutes(data.minutes)} worked` : null} />
      {data && <CategoryBars cats={data.categories} total={data.minutes} />}
    </section>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="h-display text-2xl tnum mt-0.5">{value}</p>
      <p className="text-xs text-faint mt-0.5 truncate" title={hint}>{hint}</p>
    </div>
  )
}

const minuteTicks = (max) => {
  const step = max > 60 ? 30 : 15
  return Array.from({ length: Math.max(1, Math.ceil(max / step)) + 1 }, (_, i) => i * step)
}

// One measure, one colour, one axis. Bars are rounded at the top and sit on the baseline.
function BarsChart({ rows, dataKey, color, height, yFormat, tip, allowDecimals = true, ticks }) {
  // Only as many date labels as fit the chart's width (about one per 44px), so they never run together on a phone.
  const box = useRef(null)
  const [width, setWidth] = useState(0)
  // Measured before the first paint, then kept up to date (rotating a phone, resizing a window).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return undefined
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fit = Math.max(2, Math.floor((width - 40) / 44))
  const every = Math.max(1, Math.ceil(rows.length / fit))
  return (
    <div ref={box} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap={rows.length > 40 ? 1 : 3}>
          <CartesianGrid vertical={false} stroke={cssVar('--line')} />
          <XAxis dataKey="tick" axisLine={false} tickLine={false} interval={every - 1}
            tick={{ fontSize: 10, fill: cssVar('--faint') }} />
          <YAxis axisLine={false} tickLine={false} width={34} allowDecimals={allowDecimals} tickFormatter={yFormat}
            ticks={ticks} domain={ticks ? [0, ticks[ticks.length - 1]] : undefined}
            tick={{ fontSize: 10, fill: cssVar('--faint') }} />
          <Tooltip cursor={{ fill: cssVar('--ink', 0.05) }} content={({ active, payload }) => (active && payload?.length ? (
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

// ---- Hours by client ------------------------------------------------------------------------
// Time worked in the range for each client (the task's Client field), and how much of it is billable.
// The CSV has one row per task, so it can go straight into an invoice or a spreadsheet.
export function clientHours(tasks, from, to, now) {
  const by = new Map()
  const rows = []
  for (const t of tasks) {
    const minutes = minutesInRange(t, from, to, now)
    if (!minutes) continue
    const client = t.client || ''
    const c = by.get(client) || { client, minutes: 0, billable: 0, tasks: 0 }
    c.minutes += minutes
    if (t.billable) c.billable += minutes
    c.tasks += 1
    by.set(client, c)
    rows.push({ client, title: t.title || 'Untitled', minutes, billable: !!t.billable, category: t.category })
  }
  // Named clients first, biggest first; work with no client last.
  const clients = [...by.values()].sort((a, b) => (!a.client) - (!b.client) || b.minutes - a.minutes)
  return { clients, rows: rows.sort((a, b) => (!a.client) - (!b.client) || a.client.localeCompare(b.client) || b.minutes - a.minutes) }
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const hoursOf = (m) => (Math.round((m / 60) * 100) / 100).toFixed(2)

function ClientChart({ now }) {
  const { allTasks, tasks, settings, updateSettings } = usePlanner()
  const r = useRange('clients', now)
  const list = allTasks || tasks
  const data = useMemo(() => (r.win ? clientHours(list, r.win.from, r.win.to, now) : null), [list, r.win, now])
  const named = data ? data.clients.filter((c) => c.client) : []
  const total = data ? data.clients.reduce((s, c) => s + c.minutes, 0) : 0
  const billable = data ? data.clients.reduce((s, c) => s + c.billable, 0) : 0
  const billing = settings.billing
  // Before tax: each billable task's rounded hours × the client's rate (the same sums the invoice shows).
  const amountOf = (client) => buildInvoice({ client, rows: data.rows, billing }).subtotal
  const setRate = (client, rate) => {
    const old = billing.clients[client] || { rate: 0, details: '' }
    if (old.rate !== rate) updateSettings({ billing: { ...billing, clients: { ...billing.clients, [client]: { ...old, rate } } } })
  }
  const [invoiceFor, setInvoiceFor] = useState(null)

  const download = () => {
    const cat = (id) => settings.categories.find((c) => c.id === id)?.name || ''
    const lines = [['Client', 'Task', 'Category', 'Hours', 'Billable'], ...data.rows.map((x) => [x.client || 'No client', x.title, cat(x.category), hoursOf(x.minutes), x.billable ? 'Yes' : 'No'])]
    const blob = new Blob([`${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `nineflow-hours-by-client-${dateKey(r.win.from)}-to-${dateKey(r.win.to)}.csv` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section className="card p-5">
      <ChartHead title="Hours by client" r={r}
        note={data && total ? `${fmtMinutes(total)} worked · ${fmtMinutes(billable)} billable` : null}
        right={data?.rows.length ? <button type="button" className="btn-ghost h-8 py-0 text-xs" onClick={download}><Download size={13} /> CSV</button> : null} />
      {data && !named.length && (
        <p className="text-sm text-faint py-4">
          {total ? 'None of this time has a client yet. ' : 'No hours worked in this stretch. '}
          Open a task and fill in <b className="text-muted">Client</b>, and mark it <b className="text-muted">Billable</b> if you charge for it.
        </p>
      )}
      {data && named.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-line">
                <th className="py-2 pr-3 font-semibold">Client</th>
                <th className="py-2 px-3 font-semibold text-right">Hours</th>
                <th className="py-2 px-3 font-semibold text-right">Billable</th>
                <th className="py-2 px-3 font-semibold text-right">Tasks</th>
                <th className="py-2 px-3 font-semibold text-right">Rate / h ({billing.currency})</th>
                <th className="py-2 px-3 font-semibold text-right">Amount</th>
                <th className="py-2 pl-3"><span className="sr-only">Invoice</span></th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.client || '-'} className="border-b border-line/60 last:border-0">
                  <td className={cx('py-2 pr-3 font-semibold', !c.client && 'text-muted font-medium')}>{c.client || 'No client'}</td>
                  <td className="py-2 px-3 text-right">{hoursOf(c.minutes)}</td>
                  <td className="py-2 px-3 text-right">{c.billable ? hoursOf(c.billable) : '—'}</td>
                  <td className="py-2 px-3 text-right text-muted">{c.tasks}</td>
                  <td className="py-1 px-3 text-right">
                    {c.client ? (
                      <input key={`${c.client}:${rateOf(billing, c.client)}`} type="number" min={0} step="any" inputMode="decimal" aria-label={`Hourly rate for ${c.client}`}
                        defaultValue={rateOf(billing, c.client) || ''} placeholder="Set"
                        onBlur={(e) => setRate(c.client, Math.max(0, Number(e.target.value) || 0))}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className="input h-8 py-0 w-24 text-right tnum ml-auto" />
                    ) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">{c.client && c.billable && rateOf(billing, c.client) ? money(amountOf(c.client), billing.currency) : '—'}</td>
                  <td className="py-1 pl-3 text-right">
                    {c.client && c.billable > 0 && <button type="button" className="btn-ghost h-8 py-0 text-xs" onClick={() => setInvoiceFor(c.client)}><FileText size={13} /> Invoice</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {invoiceFor && data && <InvoiceDialog client={invoiceFor} rows={data.rows} win={r.win} onClose={() => setInvoiceFor(null)} />}
    </section>
  )
}
