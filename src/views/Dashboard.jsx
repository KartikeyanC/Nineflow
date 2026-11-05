import React, { useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays, isSameDay, parseISO, subDays } from 'date-fns'
import { clock, format } from '../lib/dateFormat'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import {
  ArrowRight, Plus, X, Flame, ListChecks, CheckCircle2, Activity, Circle, Eye,
  Sparkles, AlertTriangle, TrendingUp, Clock3, Flag, PieChart as PieIcon, Repeat, Wand2, Zap, Moon, CalendarDays, Hourglass, PartyPopper,
  Search, Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, Droplets,
} from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { uid } from '../lib/storage'
import {
  PRIORITIES, PRIORITY_LABEL, carriedLabel, dateKey, fmtMinutes, focusByHour, isOverdue, sortByTime, tasksOn, totalMinutes,
} from '../lib/tasks'
import { buildInsights } from '../lib/insights'
import { describePlan } from '../lib/schedule'
import { eventsOn, useCalendarEvents, useShowEvents } from '../lib/gcalEvents'
import { currentProfile, firstName } from '../lib/profiles'
import { describeCode, useWeather } from '../lib/weather'
import { useHolidays } from '../lib/holidays'
import { colorOf, cssVar, PRIORITY_STYLE } from '../lib/colors'
import { CategoryTag, CheckCircle, Segmented, cx } from '../components/ui'
import RequiredBadge from '../components/RequiredBadge'
import DayNav from '../components/DayNav'
import { CapacityBar, CarriedOver } from '../features/Planning'
import { RitualPrompt } from '../features/Ritual'
import { WorkspaceMenu } from '../features/Workspaces'
import { openInterrupt } from '../features/Interrupt'
import { openPalette } from '../components/MobileNav'

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const hh = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const INSIGHT_ICON = { sparkles: Sparkles, alert: AlertTriangle, trend: TrendingUp, clock: Clock3, flag: Flag, pie: PieIcon }

export default function Dashboard() {
  const { tasks, now, settings, dashboardDate, setDashboardDate } = usePlanner()
  const day = useMemo(() => parseISO(dashboardDate), [dashboardDate])
  const holidays = useHolidays(settings.holidays, [day.getFullYear()])
  const holiday = holidays?.[dashboardDate] || null
  const isToday = isSameDay(day, now)
  const list = useMemo(() => sortByTime(tasksOn(tasks, dashboardDate)), [tasks, dashboardDate])
  const counts = {
    total: list.length,
    done: list.filter((t) => t.status === 'completed').length,
    working: list.filter((t) => t.status === 'working').length,
    review: list.filter((t) => t.status === 'review').length,
    todo: list.filter((t) => t.status === 'todo').length,
  }
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <div className="animate-view-in">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5 max-sm:gap-3 max-sm:mb-4">
        <div className="min-w-0">
          {/* Phones have no sidebar, so the workspace switcher sits here: tap it to change workspace. */}
          <WorkspaceMenu className="sm:hidden mb-3 w-fit max-w-[75vw]" />
          <h1 className="h-display text-3xl max-sm:text-2xl">{greeting}{firstName(currentProfile()?.name) ? `, ${firstName(currentProfile().name)}` : ''} 👋</h1>
          <p className="text-sm text-muted mt-1 font-medium">{format(day, 'EEEE, MMMM d, yyyy')}</p>
          <p className="text-sm text-faint max-sm:hidden">Let's make today productive.</p>
          {holiday && <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-peach-fg"><PartyPopper size={13} aria-hidden="true" /> {holiday}</p>}
          <WeatherChip dayKey={dashboardDate} />
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {isToday && <RitualPrompt />}
          {/* Phones search from the round button above +, so this is for wider screens */}
          {/* Wide like a search field, so it reads as the place to type */}
          <button type="button" className="btn-ghost h-9 py-0 max-sm:hidden w-56 lg:w-80 justify-start font-medium text-muted hover:text-ink" onClick={openPalette} aria-label="Search tasks and notes" title="Search (Ctrl+K)">
            <Search size={14} className="shrink-0" /> <span className="flex-1 text-left truncate">Search tasks and notes…</span> <span className="kbd shrink-0">Ctrl K</span>
          </button>
          {isToday && (
            <button type="button" className="btn-ghost h-9 py-0 max-sm:hidden" onClick={openInterrupt} title="Something came up (Ctrl+I)">
              <Zap size={14} className="text-peach-fg" /> Interruption
            </button>
          )}
          <DayNav value={dashboardDate} onChange={setDashboardDate} block />
        </div>
      </header>

      {/* How full the day is, and calm handling of work from earlier days */}
      <CapacityBar dayKey={dashboardDate} />
      {isToday && <CarriedOver />}

      {/* Phones: the five counts as one compact strip instead of five cards (which cut their own words off). */}
      <div className="sm:hidden card mb-4 px-1 py-3 grid grid-cols-5" aria-label="Today at a glance">
        {[['Tasks', counts.total], ['Done', counts.done], ['Working', counts.working], ['Review', counts.review], ['To do', counts.todo]].map(([label, value], i) => (
          <div key={label} className={cx('text-center px-1', i > 0 && 'border-l border-line')}>
            <p className="h-display text-2xl leading-none tnum">{value}</p>
            <p className="mt-1 text-xs font-semibold text-muted truncate">{label}</p>
          </div>
        ))}
      </div>

      {/* Stat cards */}
      <div className="hidden sm:grid grid-cols-2 xl:grid-cols-5 gap-4 mb-4">
        <Stat label="My tasks" value={counts.total} sub={isToday ? 'Planned for today' : 'Planned that day'} icon={ListChecks} tone="lav" />
        <Stat label="Completed" value={counts.done} sub={`${counts.total ? Math.round((counts.done / counts.total) * 100) : 0}% of tasks done`} icon={CheckCircle2} tone="mint" />
        <Stat label="Working" value={counts.working} sub="In progress" icon={Activity} tone="sky" />
        <Stat label="In review" value={counts.review} sub="With someone else" icon={Eye} tone="lav" />
        <Stat label="To do" value={counts.todo} sub="Not started yet" icon={Circle} tone={TODO_TONE} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-4 items-stretch">
        <Schedule list={list} isToday={isToday} now={now} />
        <TaskList day={day} dayKey={dashboardDate} isToday={isToday} />
        <Productivity counts={counts} />
        <FocusTime day={day} now={now} tasks={tasks} isToday={isToday} />
        <Categories list={list} />
        <PrioritySplit list={list} />
        <Insights day={day} />
        <Habits dayKey={dashboardDate} day={day} />
        <Countdowns />
      </div>
    </div>
  )
}

// To do has its own colour (the logo orange), which is not one of the category colours in colors.js.
const TODO_TONE = { bg: 'bg-todo-soft', text: 'text-todo' }

const WEATHER_ICONS = { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning }

// The weather for the day being looked at, from Open-Meteo (Settings → Connections). Nothing shows while it is off.
function WeatherChip({ dayKey }) {
  const { settings } = usePlanner()
  const { state, data } = useWeather(settings.weather)
  if (state === 'off' || state === 'loading') return null
  if (state === 'error') return <p className="mt-1.5 text-[12px] text-faint">Weather isn't available right now.</p>
  const d = data.days.find((x) => x.date === dayKey)
  const isToday = dayKey === data.days[0]?.date
  if (!d) return null
  const { label, icon } = describeCode(isToday ? data.now.code : d.code)
  const Icon = WEATHER_ICONS[icon] || Cloud
  const place = settings.weather.place
  return (
    <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold text-muted" title={`${label} in ${place.name}${place.country ? `, ${place.country}` : ''}`}>
      <Icon size={14} className="text-sky-fg" aria-hidden="true" />
      <span>{isToday ? `${data.now.temp}°` : `${d.max}°`}</span>
      <span className="text-faint font-medium">{d.max}° / {d.min}° · {label}</span>
      {d.rain != null && d.rain >= 30 && <span className="inline-flex items-center gap-1 text-faint font-medium"><Droplets size={12} aria-hidden="true" />{d.rain}%</span>}
      <span className="text-faint font-medium">· {place.name}</span>
    </p>
  )
}

function Stat({ label, value, sub, icon: Icon, tone }) {
  const c = typeof tone === 'string' ? colorOf(tone) : tone
  return (
    <div className="card p-4 flex items-center justify-between gap-3 transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="h-display text-3xl leading-tight">{value}</p>
        <p className="text-xs text-faint truncate">{sub}</p>
      </div>
      <div className={cx('h-11 w-11 rounded-full flex items-center justify-center shrink-0', c.bg, c.text)}><Icon size={20} /></div>
    </div>
  )
}

function Card({ title, right, children, span, className }) {
  return (
    <section className={cx('card p-5 flex flex-col col-span-12', span, className)}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="h-display text-base">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

// 1. Timeline of the day's timed tasks.
function Schedule({ list, isToday, now }) {
  const { categoryById, setSelectedId, previewPlan, applyPlan, dashboardDate } = usePlanner()
  const [preview, setPreview] = useState(null) // plan awaiting Apply / Cancel
  const timed = list.filter((t) => t.startTime)
  const unscheduled = list.filter((t) => !t.startTime && t.status === 'todo').length
  // Your Google Calendar events for the day (read-only), when switched on in Settings.
  const showEvents = useShowEvents()
  const calendar = useCalendarEvents()
  const dayEvents = showEvents ? eventsOn(calendar.events, dashboardDate).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMin - b.startMin) : []
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [planMsg, setPlanMsg] = useState(null)
  // Show where tasks would go first; nothing moves until Apply.
  const runPlan = () => {
    const plan = previewPlan(dashboardDate)
    if (plan.patches.length) setPreview(plan)
    else { setPlanMsg(describePlan(plan)); setTimeout(() => setPlanMsg(null), 4000) }
  }
  const proposed = preview ? preview.patches.map((p) => ({ ...p, t: list.find((x) => x.id === p.id) })).filter((p) => p.t) : []
  return (
    <Card title="Today's schedule" span="xl:col-span-4"
      right={preview ? (
        <div className="flex items-center gap-1.5">
          <button type="button" className="pill bg-page text-muted hover:text-ink transition" onClick={() => setPreview(null)}>Cancel</button>
          <button type="button" className="pill bg-lav-fg text-white hover:opacity-90 transition" onClick={() => { applyPlan(preview); setPreview(null) }}>Apply</button>
        </div>
      ) : planMsg ? (
        <span role="status" className="text-xs font-semibold text-muted animate-fade-in">{planMsg}</span>
      ) : unscheduled > 0 && (
        <button type="button" onClick={runPlan} title={`Timebox ${unscheduled} unscheduled task${unscheduled === 1 ? '' : 's'} into free slots`}
          className="pill bg-lav text-lav-fg hover:opacity-90 transition">
          <Wand2 size={12} /> Plan my day · {unscheduled}
        </button>
      )}>
      {preview && (
        <div className="mb-3 rounded-2xl bg-lav/60 border border-lav-fg/20 p-3 animate-fade-in">
          <p className="text-xs font-semibold text-lav-fg mb-1.5">Preview · nothing changes until you apply</p>
          <ul className="space-y-1">
            {proposed.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs"><span className="w-10 font-semibold text-muted tnum">{p.startTime}</span><span className="font-semibold truncate">{p.t.title}</span><span className="ml-auto text-faint">{fmtMinutes(p.t.durationMinutes)}</span></li>
            ))}
          </ul>
          {preview.unplaced.length > 0 && <p className="text-xs text-muted mt-1.5">{preview.unplaced.length} won't fit today.</p>}
        </div>
      )}
      {dayEvents.length > 0 && (
        <div className="mb-3 rounded-2xl bg-subtle/70 border border-dashed border-line px-3 py-2">
          <p className="text-xs font-semibold text-faint inline-flex items-center gap-1.5 mb-1"><CalendarDays size={12} /> On your calendar</p>
          <ul className="space-y-0.5">
            {dayEvents.map((e) => {
              const Tag = e.link ? 'a' : 'span'
              return (
                <li key={`${e.id}-${e.key}`}>
                  <Tag {...(e.link ? { href: e.link, target: '_blank', rel: 'noopener noreferrer' } : {})} className="flex items-baseline gap-2.5 text-[13px] text-muted hover:text-ink">
                    <span className="w-[4.5rem] shrink-0 text-xs font-semibold tnum">{e.allDay ? 'All day' : `${hh(e.startMin)}–${hh(Math.min(e.endMin, 1439))}`}</span>
                    <span className="truncate font-semibold">{e.title}</span>
                  </Tag>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {timed.length === 0 ? (
        <p className="text-sm text-faint">No timed tasks. Add a start time to see them here.</p>
      ) : (
        <ol className="relative">
          <div className="absolute left-[60px] top-2 bottom-2 w-px bg-line" />
          {timed.map((t) => {
            const s = toMin(t.startTime), e = s + t.durationMinutes
            const live = isToday && nowMin >= s && nowMin < e && t.status !== 'completed'
            const c = colorOf(categoryById(t.category).color)
            const done = t.status === 'completed'
            return (
              <li key={t.id} onClick={() => setSelectedId(t.id)}
                className={cx('relative flex items-start gap-3 py-2 pr-2 rounded-xl cursor-pointer transition hover:bg-page', live && 'bg-lav/50')}>
                <span className="w-12 text-right text-xs font-semibold text-muted pt-0.5 shrink-0">{clock(t.startTime)}</span>
                <span className="relative shrink-0 mt-1.5 ml-1.5">
                  <span className={cx('block h-2.5 w-2.5 rounded-full', c.dot, live && 'animate-pulse')} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cx('text-sm font-semibold truncate', done && 'line-through text-muted')}>
                    {t.interruption && <Zap size={12} className="inline -mt-0.5 mr-1 text-peach-fg" aria-label="Interruption" />}
                    {t.title}
                    {live && <span className="ml-2 pill bg-lav-fg text-white text-[11px] py-0">Now</span>}
                  </p>
                  <p className="text-xs text-faint">{clock(hh(s))} – {clock(hh(e))} · {fmtMinutes(t.durationMinutes)}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

// 2. Checklist with All / Today / Upcoming tabs.
function TaskList({ day, dayKey, isToday }) {
  const { tasks, now, categoryById, toggleComplete, setSelectedId, setQuickAdd, settings } = usePlanner()
  const [tab, setTab] = useState('today')
  // Timed tasks that start after the working day ends are listed apart, as the evening.
  const eveningFrom = settings.workHours?.end || '18:00'
  const rows = useMemo(() => {
    const open = (t) => t.status !== 'completed'
    const weekEnd = dateKey(addDays(day, 7))
    let r
    if (tab === 'today') r = tasksOn(tasks, dayKey)
    else if (tab === 'upcoming') r = tasks.filter((t) => open(t) && t.date && t.date > dayKey && t.date <= weekEnd)
    else r = tasks.filter((t) => open(t) || t.date === dayKey)
    const sorted = sortByTime(r).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
    if (tab !== 'today') return sorted
    const isEve = (t) => !!t.startTime && t.startTime >= eveningFrom
    return [...sorted.filter((t) => !isEve(t)), ...sorted.filter(isEve)]
  }, [tasks, tab, day, dayKey, eveningFrom])
  const firstEvening = tab === 'today' ? rows.findIndex((t) => t.startTime && t.startTime >= eveningFrom) : -1
  const showEvening = firstEvening > 0

  // Keyboard: ↑↓ or J/K move between rows, Enter opens, X completes, F focuses.
  const { startFocus } = usePlanner()
  const onRowKey = (e, t) => {
    if (e.target !== e.currentTarget) return
    const els = [...e.currentTarget.parentElement.querySelectorAll('li[data-row]')]
    const i = els.indexOf(e.currentTarget)
    const k = e.key.toLowerCase()
    if (k === 'arrowdown' || k === 'j') { e.preventDefault(); els[i + 1]?.focus() }
    else if (k === 'arrowup' || k === 'k') { e.preventDefault(); els[i - 1]?.focus() }
    else if (k === 'enter') { e.preventDefault(); setSelectedId(t.id) }
    else if (k === 'x') { e.preventDefault(); toggleComplete(t.id) }
    else if (k === 'f' && t.status !== 'completed') { e.preventDefault(); startFocus(t.id) }
  }

  return (
    <Card title="Tasks" span="xl:col-span-5"
      right={
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-page p-0.5 gap-0.5">
            {['all', 'today', 'upcoming'].map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                className={cx('rounded-full px-2.5 py-1 max-sm:py-2 text-xs font-semibold capitalize transition', tab === k ? 'bg-lav text-lav-fg' : 'text-muted hover:text-ink')}>{k}</button>
            ))}
          </div>
          <button type="button" aria-label="Add task" onClick={() => setQuickAdd({ date: dayKey })} className="h-7 w-7 max-sm:h-10 max-sm:w-10 rounded-full bg-lav text-lav-fg inline-flex items-center justify-center hover:opacity-90 transition"><Plus size={15} /></button>
        </div>
      }>
      {rows.length === 0 ? (
        <p className="text-sm text-faint">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-line -mx-2 overflow-y-auto max-h-80">
          {rows.map((t, idx) => {
            const done = t.status === 'completed'
            const od = isOverdue(t, now)
            return (
              <React.Fragment key={t.id}>
              {showEvening && idx === firstEvening && (
                <li role="presentation" className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-faint"><Moon size={11} /> Evening · from {eveningFrom}</li>
              )}
              <li data-row tabIndex={0} onKeyDown={(e) => onRowKey(e, t)} onClick={() => setSelectedId(t.id)} aria-label={`${t.title}${done ? ', done' : ''}`}
                className="flex items-center gap-3 px-2 py-2 rounded-xl cursor-pointer hover:bg-page focus-visible:bg-page focus-visible:ring-2 focus-visible:ring-lav-fg/30 outline-none transition">
                <CheckCircle checked={done} onToggle={() => toggleComplete(t.id)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className={cx('text-sm font-semibold truncate', done && 'line-through text-muted')}>{t.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CategoryTag category={categoryById(t.category)} className="text-[11px] py-0" />
                    {t.recurrence && <Repeat size={10} className="text-lav-fg" />}
                    <RequiredBadge task={t} className="!text-[11px]" />
                    {t.status === 'working' && <span className="text-[11px] font-semibold text-sky-fg">Working</span>}
                    {t.interruption && <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-peach-fg"><Zap size={10} />Interruption{t.interruption.by ? ` · ${t.interruption.by}` : ''}</span>}
                    {od && <span className="text-[11px] font-semibold text-muted">{carriedLabel(t.date, now)}</span>}
                    {tab !== 'today' && t.date && t.date !== dayKey && <span className="text-[11px] text-faint">{format(parseISO(t.date), 'EEE d')}</span>}
                  </div>
                </div>
                <span className="text-xs font-medium text-muted tnum text-right">
                  {t.startTime || fmtMinutes(t.durationMinutes)}
                  {done && totalMinutes(t, now) >= 1 && <span className="block text-[11px] text-faint">took {fmtMinutes(totalMinutes(t, now))}</span>}
                </span>
              </li>
              </React.Fragment>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// 3. Donut.
function Productivity({ counts }) {
  const data = [
    // The same colours as the Board and the stat cards: Done is green, To do is the logo orange.
    { name: 'Done', value: counts.done, fill: cssVar('--mint-fg') },
    { name: 'Working', value: counts.working, fill: cssVar('--sky-fg') },
    { name: 'In review', value: counts.review, fill: cssVar('--violet-fg', 0.45) },
    { name: 'To do', value: counts.todo, fill: cssVar('--todo') },
  ]
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0
  const empty = counts.total === 0
  return (
    <Card title="Productivity" span="xl:col-span-3">
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={empty ? [{ name: 'none', value: 1, fill: cssVar('--line') }] : data} dataKey="value" innerRadius="72%" outerRadius="100%"
              paddingAngle={empty ? 0 : 3} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
              {(empty ? [{ fill: cssVar('--line') }] : data).map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="h-display text-2xl leading-none">{pct}%</span>
          <span className="text-xs text-faint font-medium mt-0.5">Productivity</span>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-2 text-muted font-medium"><i className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />{d.name}</span>
            <span className="font-bold">{d.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// 4. Focus time with an hourly bar chart.
function FocusTime({ day, now, tasks, isToday }) {
  const hours = useMemo(() => focusByHour(tasks, day, now), [tasks, day, now])
  const total = hours.reduce((s, h) => s + h.minutes, 0)
  // 6 AM–10 PM, widened to include any hour with focus.
  const active = hours.filter((h) => h.minutes > 0).map((h) => h.hour)
  const from = Math.min(6, ...active), to = Math.max(22, ...active)
  const data = hours.slice(from, to + 1)
  const peak = data.reduce((m, h) => (h.minutes > m.minutes ? h : m), { minutes: 0, hour: -1 })
  const cur = isToday ? now.getHours() : -1
  return (
    <Card title="Focus time" span="xl:col-span-4">
      <p className="h-display text-3xl -mt-1">{fmtMinutes(total)}</p>
      <p className="text-xs text-faint mb-2">Time spent in Working{isToday ? ' today' : ' that day'}</p>
      <div className="h-28 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={3}>
            <XAxis dataKey="hour" axisLine={false} tickLine={false} interval={3} tick={{ fontSize: 10, fill: cssVar('--faint') }}
              tickFormatter={(h) => (h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`)} />
            <Tooltip cursor={{ fill: cssVar('--page') }} content={({ active: a, payload }) => a && payload?.length ? (
              <div className="card px-2.5 py-1.5 text-xs shadow-lift"><b>{hh(payload[0].payload.hour * 60)}</b> · {fmtMinutes(payload[0].value)}</div>) : null} />
            <Bar dataKey="minutes" radius={[4, 4, 4, 4]} minPointSize={2}>
              {data.map((h) => (
                <Cell key={h.hour} fill={h.hour === cur ? cssVar('--lav-fg') : h.hour === peak.hour && h.minutes > 0 ? cssVar('--sky-fg') : cssVar('--sky')} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// 5. Category bars with a Time / Tasks toggle.
function Categories({ list }) {
  const { settings } = usePlanner()
  const [mode, setMode] = useState('time')
  const rows = settings.categories.map((c) => {
    const mine = list.filter((t) => t.category === c.id)
    return { cat: c, minutes: mine.reduce((s, t) => s + t.durationMinutes, 0), count: mine.length }
  }).filter((r) => r.count > 0)
  const total = rows.reduce((s, r) => s + (mode === 'time' ? r.minutes : r.count), 0)
  return (
    <Card title="Categories" span="xl:col-span-5"
      right={<Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'time', label: 'Time' }, { value: 'count', label: 'Tasks' }]} />}>
      {rows.length === 0 ? <p className="text-sm text-faint">No tasks planned.</p> : (
        <ul className="space-y-3">
          {rows.sort((a, b) => (mode === 'time' ? b.minutes - a.minutes : b.count - a.count)).map(({ cat, minutes, count }) => {
            const c = colorOf(cat.color)
            const v = mode === 'time' ? minutes : count
            const pct = total ? Math.round((v / total) * 100) : 0
            return (
              <li key={cat.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="inline-flex items-center gap-1.5 font-semibold"><i className={cx('h-2 w-2 rounded-full', c.dot)} />{cat.name}</span>
                  <span className="text-muted">{mode === 'time' ? fmtMinutes(minutes) : `${count} task${count === 1 ? '' : 's'}`} · {pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-page overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: cssVar(c.var) }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// 6. Priority split.
function PrioritySplit({ list }) {
  const COLORS = { high: '--coral-fg', medium: '--peach-fg', low: '--mint-fg' }
  return (
    <Card title="Priority split" span="xl:col-span-3">
      <ul className="space-y-3.5">
        {PRIORITIES.map((p) => {
          const mine = list.filter((t) => t.priority === p)
          const done = mine.filter((t) => t.status === 'completed').length
          const pending = mine.length - done
          const donePct = mine.length ? (done / mine.length) * 100 : 0
          return (
            <li key={p}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={cx('pill', PRIORITY_STYLE[p])}>{PRIORITY_LABEL[p]}</span>
                <span className="text-xs text-muted">{done} done · {pending} pending</span>
              </div>
              <div className="h-2 rounded-full bg-page overflow-hidden flex">
                <div className="h-full" style={{ width: `${donePct}%`, background: cssVar(COLORS[p]) }} />
                <div className="h-full" style={{ width: `${mine.length ? 100 - donePct : 0}%`, background: cssVar(COLORS[p], 0.25) }} />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// 7. Rule-based insights.
function Insights({ day }) {
  const { tasks, now, settings } = usePlanner()
  const items = useMemo(() => buildInsights({ tasks, day, now, categories: settings.categories }), [tasks, day, now, settings.categories])
  return (
    <Card title="Insights" span="xl:col-span-7">
      <div className="grid sm:grid-cols-2 gap-2.5">
        {items.map((it, i) => {
          const c = colorOf(it.tone)
          const Icon = INSIGHT_ICON[it.icon] || Sparkles
          return (
            <div key={i} className={cx('rounded-2xl p-3.5 flex items-start gap-3', c.bg)}>
              <span className={cx('h-8 w-8 rounded-full bg-card/70 flex items-center justify-center shrink-0', c.text)}><Icon size={15} /></span>
              <p className="text-sm font-medium leading-snug text-ink">{it.text}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// 8. Habit tracker.
function Habits({ dayKey, day }) {
  const { habits, addHabit, removeHabit, toggleHabit, toggleHabitRest, now } = usePlanner()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const strip = Array.from({ length: 7 }, (_, i) => subDays(day, 6 - i))

  // Done days count; rest days are skipped over without breaking the streak.
  const streakOf = (h) => {
    const rest = h.rest || []
    let d = now
    if (!h.done.includes(dateKey(d)) && !rest.includes(dateKey(d))) d = subDays(d, 1)
    let n = 0
    for (let guard = 0; guard < 400; guard++) {
      const k = dateKey(d)
      if (h.done.includes(k)) n++
      else if (!rest.includes(k)) break
      d = subDays(d, 1)
    }
    return n
  }

  const submit = (e) => {
    e.preventDefault()
    if (name.trim()) addHabit(name.trim())
    setName(''); setAdding(false)
  }

  return (
    <Card title="Habits" span="xl:col-span-5"
      right={<button type="button" aria-label="Add habit" onClick={() => setAdding(true)} className="h-7 w-7 max-sm:h-10 max-sm:w-10 rounded-full bg-lav text-lav-fg inline-flex items-center justify-center hover:opacity-90 transition"><Plus size={15} /></button>}>
      {habits.length === 0 && !adding && <p className="text-sm text-faint">Track small daily wins. Add your first habit.</p>}
      <ul className="space-y-2">
        {habits.map((h) => {
          const streak = streakOf(h)
          return (
            <li key={h.id} className="group flex items-center gap-3">
              <CheckCircle checked={h.done.includes(dayKey)} onToggle={() => toggleHabit(h.id, dayKey)} />
              <span className="flex-1 min-w-0 text-sm font-semibold truncate">{h.name}</span>
              <div className="flex gap-1">
                {strip.map((d) => {
                  const k = dateKey(d)
                  const rest = (h.rest || []).includes(k)
                  return <span key={k} title={`${format(d, 'EEE d')}${rest ? ' · rest day' : ''}`} className={cx('h-4 w-3 rounded-full', h.done.includes(k) ? 'bg-mint-fg' : rest ? 'bg-lav' : 'bg-page border border-line')} />
                })}
              </div>
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-peach-fg w-9 justify-end"><Flame size={12} />{streak}</span>
              <button type="button" onClick={() => toggleHabitRest(h.id, dayKey)}
                aria-label={(h.rest || []).includes(dayKey) ? `Undo rest day for ${h.name}` : `Rest day for ${h.name}: keeps the streak`}
                title={(h.rest || []).includes(dayKey) ? 'Undo rest day' : 'Rest day (keeps your streak)'}
                className={cx('h-6 w-6 rounded-full inline-flex items-center justify-center transition',
                  (h.rest || []).includes(dayKey) ? 'bg-lav text-lav-fg' : 'text-faint opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-page hover:text-ink')}>
                <Moon size={12} />
              </button>
              <button type="button" aria-label="Remove habit" onClick={() => removeHabit(h.id)}
                className="h-6 w-6 rounded-full inline-flex items-center justify-center text-faint opacity-0 group-hover:opacity-100 hover:bg-coral hover:text-coral-fg transition"><X size={13} /></button>
            </li>
          )
        })}
      </ul>
      {adding && (
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input autoFocus className="input" placeholder="e.g. Read 20 minutes" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
          <button type="submit" className="btn-black h-9 py-0 px-3">Add</button>
        </form>
      )}
    </Card>
  )
}

// 9. Countdowns: days left to a deadline or an event.
function Countdowns() {
  const { settings, updateSettings, now } = usePlanner()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const list = useMemo(
    () => [...(settings.countdowns || [])].sort((a, b) => a.date.localeCompare(b.date)),
    [settings.countdowns],
  )
  const daysLeft = (d) => differenceInCalendarDays(parseISO(d), now)
  const label = (n) => (n === 0 ? 'Today' : n === 1 ? '1 day' : n > 0 ? `${n} days` : n === -1 ? '1 day ago' : `${-n} days ago`)
  const save = (next) => updateSettings({ countdowns: next })
  const submit = (e) => {
    e.preventDefault()
    if (name.trim() && date) save([...(settings.countdowns || []), { id: uid(), name: name.trim().slice(0, 60), date }])
    setName(''); setDate(''); setAdding(false)
  }
  return (
    <Card title="Countdowns" span="xl:col-span-4"
      right={<button type="button" aria-label="Add countdown" onClick={() => setAdding(true)} className="h-7 w-7 max-sm:h-10 max-sm:w-10 rounded-full bg-lav text-lav-fg inline-flex items-center justify-center hover:opacity-90 transition"><Plus size={15} /></button>}>
      {list.length === 0 && !adding && <p className="text-sm text-faint">Count down to a deadline, launch or birthday.</p>}
      <ul className="space-y-2">
        {list.map((c) => {
          const n = daysLeft(c.date)
          return (
            <li key={c.id} className="group flex items-center gap-3">
              <span className={cx('h-9 w-9 rounded-full flex items-center justify-center shrink-0', n < 0 ? 'bg-page text-faint' : n <= 3 ? 'bg-coral text-coral-fg' : 'bg-lav text-lav-fg')}><Hourglass size={15} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                <p className="text-xs text-faint">{format(parseISO(c.date), 'EEE, MMM d, yyyy')}</p>
              </div>
              <span className={cx('text-sm font-bold tnum', n < 0 && 'text-faint')}>{label(n)}</span>
              <button type="button" aria-label={`Remove ${c.name}`} onClick={() => save(list.filter((x) => x.id !== c.id))}
                className="h-6 w-6 rounded-full inline-flex items-center justify-center text-faint opacity-0 group-hover:opacity-100 hover:bg-coral hover:text-coral-fg transition"><X size={13} /></button>
            </li>
          )
        })}
      </ul>
      {adding && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
          <input autoFocus className="input flex-1 min-w-[8rem]" placeholder="e.g. Product launch" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
          <input type="date" className="input w-auto" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="submit" className="btn-black h-9 py-0 px-3">Add</button>
        </form>
      )}
    </Card>
  )
}
