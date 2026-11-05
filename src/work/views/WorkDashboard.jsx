import React, { useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { format } from '../../lib/dateFormat'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useWork } from '../WorkContext'
import { usePlanner } from '../../store/PlannerContext'
import { rangeStats, presets, key, fmtKpi, fmtTarget, h1 } from '../workCalc'
import { Section, Pill, STATUS_TONE } from '../ui'
import { DateField } from '../../components/DatePicker'
import { cssVar } from '../../lib/colors'
import { cx } from '../../components/ui'

const AREA_COLORS = ['--violet-fg', '--sky-fg', '--mint-fg', '--peach-fg', '--coral-fg', '--butter-fg', '--rose-fg', '--teal-fg', '--muted']
const STATUS_COLORS = { 'Not started': '--faint', 'In progress': '--sky-fg', 'In review': '--peach-fg', Done: '--mint-fg', 'On hold': '--coral-fg' }

export default function WorkDashboard() {
  const { work } = useWork()
  const today = new Date()
  const { settings: { weekStart } } = usePlanner()
  const P = presets(today, weekStart)
  const [range, setRange] = useState(() => P['This week'].map(key))
  const [from, to] = range
  const stats = useMemo(() => rangeStats(work, parseISO(from), parseISO(to), today), [work, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = work.settings.currency
  const areaRows = stats.byArea.filter((a) => a.tasks > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateField value={from} onChange={(v) => v && setRange([v, to])} allowClear={false} className="w-36" />
        <span className="text-faint">→</span>
        <DateField value={to} onChange={(v) => v && setRange([from, v])} allowClear={false} className="w-36" />
        {Object.entries(P).map(([label, [a, b]]) => (
          <button key={label} type="button" onClick={() => setRange([key(a), key(b)])}
            className={cx('rounded-full px-3 py-1.5 text-xs font-semibold transition', from === key(a) && to === key(b) ? 'bg-brand text-white' : 'bg-card border border-line text-muted hover:text-ink')}>{label}</button>
        ))}
        <span className="text-xs text-faint ml-auto">{stats.days} working days · {h1(stats.available)} h available</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {stats.kpis.map((k) => (
          <div key={k.label} className="card p-3.5">
            <p className="text-[11px] font-semibold text-muted">{k.label}</p>
            <p className="h-display text-2xl leading-tight mt-0.5">{fmtKpi(k, cur)}</p>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-faint">{k.target != null ? `target ${fmtTarget(k, cur)}` : ''}</span>
              <Pill tone={STATUS_TONE[k.status]}>{k.status}</Pill>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="By work area" hint="Tasks worked on in the range.">
          {areaRows.length === 0 ? <p className="text-sm text-faint">No work logged in this range.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-muted uppercase"><th className="text-left py-1">Area</th><th className="text-right">Tasks</th><th className="text-right">Done</th><th className="text-right">Planned h</th><th className="text-right">Actual h</th></tr></thead>
              <tbody>{areaRows.map((a) => (
                <tr key={a.area} className="border-t border-line"><td className="py-1.5 font-semibold">{a.area}</td><td className="text-right">{a.tasks}</td><td className="text-right">{a.done}</td><td className="text-right text-muted">{h1(a.planned)}</td><td className={cx('text-right font-semibold', a.actual > a.planned && 'text-coral-fg')}>{h1(a.actual)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Section>
        <Section title="By status" hint="Tasks worked on or due in the range.">
          <ul className="space-y-2">{stats.byStatus.map((s) => (
            <li key={s.status} className="flex items-center gap-3 text-sm"><span className="w-28 font-semibold">{s.status}</span>
              <div className="flex-1 h-2.5 rounded-full bg-page overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, s.count * 10)}%`, background: cssVar(STATUS_COLORS[s.status]) }} /></div>
              <span className="w-8 text-right font-semibold">{s.count}</span></li>
          ))}</ul>
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Section title="Hours by work area">
          <div className="h-56"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={areaRows} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" hide /><YAxis type="category" dataKey="area" width={120} tick={{ fontSize: 10, fill: cssVar('--muted') }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: cssVar('--page') }} formatter={(v) => `${h1(v)} h`} />
              <Bar dataKey="actual" radius={[0, 6, 6, 0]} maxBarSize={16}>{areaRows.map((_, i) => <Cell key={i} fill={cssVar(AREA_COLORS[i % AREA_COLORS.length])} />)}</Bar>
            </BarChart>
          </ResponsiveContainer></div>
        </Section>
        <Section title="Hours day by day">
          <div className="h-56"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.byDay} margin={{ left: -20, right: 4 }} barGap={2}>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={cssVar('--line')} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: cssVar('--faint') }} axisLine={false} tickLine={false} interval={stats.byDay.length > 14 ? 4 : 0} />
              <YAxis tick={{ fontSize: 10, fill: cssVar('--faint') }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: cssVar('--page') }} labelFormatter={(l, p) => p?.[0] ? format(p[0].payload.date, 'EEE d MMM') : l} formatter={(v, n) => [`${h1(v)} h`, n]} />
              <Bar dataKey="planned" fill={cssVar('--sky')} radius={[4, 4, 4, 4]} maxBarSize={14} />
              <Bar dataKey="actual" radius={[4, 4, 4, 4]} maxBarSize={14}>{stats.byDay.map((d, i) => <Cell key={i} fill={d.working ? cssVar('--sky-fg') : cssVar('--line')} />)}</Bar>
            </BarChart>
          </ResponsiveContainer></div>
        </Section>
        <Section title="Tasks by status">
          <div className="h-56"><ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={stats.byStatus.filter((s) => s.count)} dataKey="count" nameKey="status" innerRadius="55%" outerRadius="85%" paddingAngle={3} cornerRadius={5} stroke="none">
              {stats.byStatus.filter((s) => s.count).map((s) => <Cell key={s.status} fill={cssVar(STATUS_COLORS[s.status])} />)}
            </Pie><Tooltip /></PieChart>
          </ResponsiveContainer></div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">{stats.byStatus.filter((s) => s.count).map((s) => <li key={s.status} className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: cssVar(STATUS_COLORS[s.status]) }} />{s.status} {s.count}</li>)}</ul>
        </Section>
      </div>
    </div>
  )
}
