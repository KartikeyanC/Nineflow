import React, { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, getISOWeek, isSameDay, parseISO, subDays } from 'date-fns'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import {
  ChevronLeft, ChevronRight, ArrowRight, ArrowUpRight, Plus, X, Flame, Play, Check, Repeat, Wand2, AlertTriangle,
  Sparkles, TrendingUp, Clock3, Flag, PieChart as PieIcon, CalendarPlus, Moon, Zap, CornerUpLeft,
} from 'lucide-react'
import { usePlanner } from '../../store/PlannerContext'
import { dateKey, fmtMinutes, focusByHour, isOverdue, sortByTime, tasksOn, todayKey, totalMinutes } from '../../lib/tasks'
import { toMin as capMin } from '../../lib/capacity'
import { CapacityBar, CarriedOver, carriedLabel } from '../../features/Planning'
import { RitualPrompt } from '../../features/Ritual'
import { openInterrupt } from '../../features/Interrupt'
import { buildInsights } from '../../lib/insights'
import { describePlan } from '../../lib/schedule'
import { currentProfile, firstName } from '../../lib/profiles'
import { colorOf, cssVar } from '../../lib/colors'
import { CategoryTag, CheckCircle, cx } from '../../components/ui'
import RequiredBadge from '../../components/RequiredBadge'
import { DateField } from '../../components/DatePicker'

// v2 replacement for views/Dashboard.jsx. Asymmetric bento: an editorial
// header, a dark "Now" plate next to the day ring, then the task list beside
// a day timeline, and quieter analytics underneath.
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const hh = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const INSIGHT_ICON = { sparkles: Sparkles, alert: AlertTriangle, trend: TrendingUp, clock: Clock3, flag: Flag, pie: PieIcon }

// Staggered entrance: each block rises a beat after the previous one.
const rise = (i) => ({ className: 'animate-rise', style: { animationDelay: `${i * 70}ms` } })

export default function Today() {
  const { tasks, now, dashboardDate, setDashboardDate, setQuickAdd } = usePlanner()
  const day = useMemo(() => parseISO(dashboardDate), [dashboardDate])
  const isToday = isSameDay(day, now)
  const list = useMemo(() => sortByTime(tasksOn(tasks, dashboardDate)), [tasks, dashboardDate])
  const counts = {
    total: list.length,
    done: list.filter((t) => t.status === 'completed').length,
    working: list.filter((t) => t.status === 'working').length,
    todo: list.filter((t) => t.status === 'todo').length,
    minutes: list.reduce((s, t) => s + (t.durationMinutes || 0), 0),
  }
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = firstName(currentProfile()?.name)

  return (
    <div className="max-w-[1320px] mx-auto">
      {/* Editorial header */}
      <header {...rise(0)} className="animate-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-5 pt-2 pb-7">
        <div className="min-w-0">
          <span className="eyebrow">
            <i className={cx('h-1.5 w-1.5 rounded-full', isToday ? 'bg-accent' : 'bg-faint')} />
            {format(day, 'EEEE')} · Week {getISOWeek(day)}
          </span>
          <h1 className="mt-4 font-serif text-[44px] sm:text-[58px] leading-[0.95] tracking-[-0.01em] text-ink">
            {isToday ? <>{greeting}{name && ','} <em className="text-accent">{name || 'there'}.</em></>
              : <>{format(day, 'MMMM')} <em className="text-accent">{format(day, 'do')}.</em></>}
          </h1>
          <p className="mt-3 text-[14px] text-muted">
            <b className="text-ink font-semibold tnum">{counts.total}</b> tasks
            <span className="mx-2 text-faint">·</span><b className="text-ink font-semibold tnum">{fmtMinutes(counts.minutes)}</b> planned
            <span className="mx-2 text-faint">·</span><b className="text-ink font-semibold tnum">{counts.done}</b> done{isToday ? ' so far' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {isToday && <RitualPrompt />}
          {!isToday && <button type="button" className="btn-ghost h-11" onClick={() => setDashboardDate(todayKey())}>Today</button>}
          <div className="inline-flex items-center h-11 rounded-full bg-card shadow-soft p-1">
            <RoundBtn label="Previous day" onClick={() => setDashboardDate(dateKey(subDays(day, 1)))}><ChevronLeft size={16} /></RoundBtn>
            <DateField value={dashboardDate} onChange={(v) => v && setDashboardDate(v)} allowClear={false} align="right"
              trigger={({ toggle, open }) => (
                <button type="button" onClick={toggle}
                  className={cx('px-3.5 h-9 rounded-full text-[13px] font-semibold transition min-w-[104px] tnum', open ? 'bg-ink text-page' : 'hover:bg-subtle')}>
                  {isToday ? 'Today' : format(day, 'EEE, MMM d')}
                </button>
              )} />
            <RoundBtn label="Next day" onClick={() => setDashboardDate(dateKey(addDays(day, 1)))}><ChevronRight size={16} /></RoundBtn>
          </div>
          <button type="button" onClick={() => setQuickAdd({ date: dashboardDate })}
            className="group hidden md:inline-flex items-center gap-3 h-11 rounded-full bg-accent text-white pl-5 pr-1.5 text-[13px] font-semibold transition duration-300 hover:-translate-y-px active:scale-[0.97] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_24px_-10px_rgb(var(--accent)/0.9)]">
            Add task
            <span className="h-8 w-8 rounded-full bg-white/20 inline-flex items-center justify-center transition duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
              <ArrowUpRight size={16} />
            </span>
          </button>
        </div>
      </header>

      <CapacityBar dayKey={dashboardDate} i={1} />
      {isToday && <CarriedOver i={1} />}

      <div className="grid grid-cols-12 gap-4 lg:gap-5">
        <NowCard list={list} isToday={isToday} dayKey={dashboardDate} className="col-span-12 lg:col-span-7" i={2} />
        <DayRing counts={counts} day={day} isToday={isToday} className="col-span-12 lg:col-span-5" i={3} />

        <TaskList day={day} dayKey={dashboardDate} className="col-span-12 xl:col-span-7" i={4} />
        <Timeline list={list} day={day} dayKey={dashboardDate} isToday={isToday} className="col-span-12 xl:col-span-5 xl:row-span-2" i={5} />
        <Habits dayKey={dashboardDate} day={day} className="col-span-12 xl:col-span-7" i={6} />

        <FocusTime day={day} isToday={isToday} className="col-span-12 md:col-span-6 xl:col-span-4" i={7} />
        <Categories list={list} className="col-span-12 md:col-span-6 xl:col-span-3" i={8} />
        <Insights day={day} className="col-span-12 xl:col-span-5" i={9} />
      </div>
    </div>
  )
}

function RoundBtn({ label, onClick, children, className }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={cx('h-9 w-9 rounded-full inline-flex items-center justify-center text-muted hover:bg-subtle hover:text-ink transition', className)}>
      {children}
    </button>
  )
}

// White card with a quiet header; the basic bento tile.
function Panel({ title, meta, right, children, className, bodyClass = 'px-5 pb-5', i = 0 }) {
  const r = rise(i)
  return (
    <section className={cx('card flex flex-col min-w-0', r.className, className)} style={r.style}>
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 shrink-0">
        <h2 className="text-[15px] font-bold tracking-tight truncate">
          {title}{meta != null && <span className="ml-2 text-faint font-semibold text-[13px] tnum">{meta}</span>}
        </h2>
        {right}
      </header>
      <div className={cx('flex-1 min-h-0', bodyClass)}>{children}</div>
    </section>
  )
}

// What matters right now: the live block, else the next one.
function pickFocus(list, isToday, nowMin) {
  const open = list.filter((t) => t.status !== 'completed')
  const timed = open.filter((t) => t.startTime).map((t) => ({ t, s: toMin(t.startTime), e: toMin(t.startTime) + (t.durationMinutes || 0) }))
  if (isToday) {
    const live = timed.find((x) => nowMin >= x.s && nowMin < x.e)
    if (live) return { ...live, kind: 'now' }
    const next = timed.find((x) => x.s > nowMin)
    if (next) return { ...next, kind: 'next' }
    const working = open.find((t) => t.status === 'working')
    if (working) return { t: working, kind: 'working' }
  } else if (timed.length) return { ...timed[0], kind: 'first' }
  return open.length ? { t: open[0], kind: 'list' } : null
}

function NowCard({ list, isToday, dayKey, className, i }) {
  const { tasks, now, categoryById, startFocus, toggleComplete, setSelectedId, setQuickAdd, focus } = usePlanner()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const pick = pickFocus(list, isToday, nowMin)
  const later = pick?.s != null ? list.filter((t) => t.startTime && t.status !== 'completed' && toMin(t.startTime) > pick.s).slice(0, 2) : []
  const r = rise(i)
  const back = pick?.t.interruption?.resume && tasks.find((t) => t.id === pick.t.interruption.resume)
  const label = pick?.t.interruption ? `Interruption${pick.t.interruption.by ? ` · from ${pick.t.interruption.by}` : ''}` : { now: 'Happening now', next: `Up next · in ${fmtMinutes(Math.max(0, (pick?.s ?? 0) - nowMin))}`, working: 'In progress', first: 'First up', list: 'Next on your list' }[pick?.kind]
  const pct = pick?.kind === 'now' ? (nowMin - pick.s) / Math.max(1, pick.e - pick.s) : 0
  const cat = pick ? categoryById(pick.t.category) : null
  const focusing = pick && focus?.taskId === pick.t.id

  return (
    <div className={cx('bezel', r.className, className)} style={r.style}>
      <section className="relative overflow-hidden rounded-[22px] bg-[#161412] text-[#F4F0EA] h-full min-h-[236px] p-6 sm:p-7 flex flex-col shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]">
        {/* ember glow */}
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-[rgb(240_94_45/0.35)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-[rgb(120_100_255/0.18)] blur-3xl" />

        {!pick ? (
          <div className="relative flex-1 flex flex-col items-start justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">All clear</span>
            <p className="mt-3 font-serif text-[36px] leading-none">Nothing planned <em className="text-[#FF9A6E]">yet.</em></p>
            <button type="button" onClick={() => setQuickAdd({ date: dayKey })}
              className="group mt-6 inline-flex items-center gap-3 h-11 rounded-full bg-white text-[#161412] pl-5 pr-1.5 text-[13px] font-semibold transition hover:-translate-y-px active:scale-[0.97]">
              Plan something
              <span className="h-8 w-8 rounded-full bg-black/5 inline-flex items-center justify-center transition duration-500 group-hover:rotate-90"><Plus size={15} /></span>
            </button>
          </div>
        ) : (
          <>
            <div className="relative flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
                <span className="relative flex h-2 w-2">
                  {pick.kind === 'now' && <span className="absolute inset-0 rounded-full bg-[#FF7A50] animate-ping opacity-70" />}
                  <span className="relative h-2 w-2 rounded-full bg-[#FF7A50]" />
                </span>
                {label}
              </span>
              {pick.s != null && <span className="text-[13px] font-semibold text-white/60 tnum">{hh(pick.s)} – {hh(pick.e)}</span>}
            </div>

            <div className="relative mt-5 flex items-start justify-between gap-6">
              <button type="button" onClick={() => setSelectedId(pick.t.id)} className="text-left min-w-0">
                <h2 className="text-[30px] sm:text-[36px] font-bold tracking-[-0.03em] leading-[1.05] hover:text-white transition">{pick.t.title}</h2>
              </button>
              {isToday && (
                <div className="hidden sm:block text-right shrink-0 -mt-1">
                  <p className="font-serif text-[64px] leading-[0.85] text-white/90 tnum">{hh(nowMin)}</p>
                  <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                    {pick.kind === 'now' ? `${fmtMinutes(pick.e - nowMin)} left` : pick.kind === 'next' ? 'local time' : 'right now'}
                  </p>
                </div>
              )}
            </div>
            <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/60">
              {cat && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-white/80"><i className="h-1.5 w-1.5 rounded-full" style={{ background: cssVar(colorOf(cat.color).var) }} />{cat.name}</span>}
              <span className="tnum">{fmtMinutes(pick.t.durationMinutes || 0)}</span>
              {pick.t.priority === 'high' && <span className="text-[#FF9A6E] font-semibold">High priority</span>}
            </div>

            {pick.kind === 'now' && (
              <div className="relative mt-5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#FF7A50] to-[#FFB38F] transition-all duration-700" style={{ width: `${Math.round(pct * 100)}%` }} />
              </div>
            )}

            <div className="relative flex-1 min-h-[16px]" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => startFocus(pick.t.id)} disabled={focusing}
                  className="group inline-flex items-center gap-3 h-11 rounded-full bg-[#FF7A50] text-[#1A0F0A] pl-1.5 pr-5 text-[13px] font-bold transition duration-300 hover:-translate-y-px active:scale-[0.97] disabled:opacity-60 shadow-[0_10px_28px_-10px_rgb(255_122_80/0.9)]">
                  <span className="h-8 w-8 rounded-full bg-black/15 inline-flex items-center justify-center transition duration-500 group-hover:scale-110">
                    <Play size={13} fill="currentColor" />
                  </span>
                  {focusing ? 'Focusing…' : 'Start focus'}
                </button>
                <button type="button" onClick={() => toggleComplete(pick.t.id)}
                  className="inline-flex items-center gap-2 h-11 rounded-full bg-white/10 ring-1 ring-white/15 px-4 text-[13px] font-semibold text-white/90 transition hover:bg-white/15 active:scale-[0.97]">
                  <Check size={15} /> Done
                </button>
                {isToday && !pick.t.interruption && (
                  <button type="button" onClick={openInterrupt} title="Something came up (Ctrl+I)"
                    className="inline-flex items-center gap-1.5 h-11 rounded-full px-3 text-[13px] font-semibold text-white/55 transition hover:text-white">
                    <Zap size={14} /> Interrupted?
                  </button>
                )}
              </div>
              {back && back.status !== 'completed' && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Then back to</p>
                  <button type="button" onClick={() => setSelectedId(back.id)} className="inline-flex items-center gap-1.5 mt-1 text-[13px] text-white/80 hover:text-white transition">
                    <CornerUpLeft size={13} /> {back.title}
                  </button>
                </div>
              )}
              {!back && later.length > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Then</p>
                  {later.map((t) => (
                    <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
                      className="block ml-auto mt-1 text-[13px] text-white/75 hover:text-white transition truncate max-w-[220px]">
                      <span className="tnum text-white/45 mr-2">{t.startTime}</span>{t.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function DayRing({ counts, day, isToday, className, i }) {
  const { tasks, now } = usePlanner()
  const focusMin = useMemo(() => focusByHour(tasks, day, now).reduce((s, h) => s + h.minutes, 0), [tasks, day, now])
  const pct = counts.total ? counts.done / counts.total : 0
  const R = 52, C = 2 * Math.PI * R
  const seg = (n) => (counts.total ? (n / counts.total) * C : 0)
  const r = rise(i)
  const legend = [
    { label: 'Done', n: counts.done, color: 'bg-mint-fg' },
    { label: 'Working', n: counts.working, color: 'bg-sky-fg' },
    { label: 'To do', n: counts.todo, color: 'bg-line' },
  ]
  return (
    <div className={cx('bezel', r.className, className)} style={r.style}>
      <section className="core h-full p-5 sm:p-6 flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-tight">{isToday ? "Today's progress" : 'Progress'}</h2>
          <span className="text-[12px] font-semibold text-faint tnum">{counts.done}/{counts.total}</span>
        </div>
        <div className="flex-1 flex items-center gap-5 sm:gap-6 mt-3">
          <div className="relative h-[132px] w-[132px] shrink-0">
            <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
              <circle cx="66" cy="66" r={R} fill="none" stroke="rgb(var(--line))" strokeWidth="12" />
              <circle cx="66" cy="66" r={R} fill="none" stroke="rgb(var(--sky-fg))" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${seg(counts.done + counts.working)} ${C}`} className="transition-all duration-700 ease-spring" />
              <circle cx="66" cy="66" r={R} fill="none" stroke="rgb(var(--mint-fg))" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${seg(counts.done)} ${C}`} className="transition-all duration-700 ease-spring" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-serif text-[40px] leading-none tnum">{Math.round(pct * 100)}<span className="text-[22px] text-faint">%</span></span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint mt-1">complete</span>
            </div>
          </div>
          <ul className="flex-1 space-y-2.5 min-w-0">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center justify-between text-[13px]">
                <span className="inline-flex items-center gap-2 text-muted font-medium"><i className={cx('h-2.5 w-2.5 rounded-full', l.color)} />{l.label}</span>
                <span className="font-bold tnum">{l.n}</span>
              </li>
            ))}
            <li className="pt-2.5 border-t border-line flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-2 text-muted font-medium"><Flame size={13} className="text-accent" />Focused</span>
              <span className="font-bold tnum whitespace-nowrap">{fmtMinutes(focusMin)}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}

// Estimate vs actual as words, not just colour: "30m → took 45m" once done,
// "12m of 30m" while working, the estimate otherwise.
function TimeNote({ t, now }) {
  const spent = totalMinutes(t, now)
  if (t.status === 'completed' && spent >= 1) {
    const ratio = spent / Math.max(1, t.durationMinutes)
    const tone = ratio > 1.25 ? 'text-peach-fg' : ratio < 0.8 ? 'text-mint-fg' : 'text-muted'
    return <span className={cx('tnum', tone)}>{fmtMinutes(t.durationMinutes)} → took {fmtMinutes(spent)}</span>
  }
  if (t.status === 'working') return <span className="text-faint tnum">{fmtMinutes(spent)} of {fmtMinutes(t.durationMinutes)}</span>
  return <span className="text-faint tnum">{fmtMinutes(t.durationMinutes)}</span>
}

function Tabs({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-full bg-subtle p-1 gap-0.5 ring-hair">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('rounded-full px-3 h-7 text-[12px] font-semibold transition duration-300',
            value === o.value ? 'bg-card text-ink shadow-soft' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function TaskList({ day, dayKey, className, i }) {
  const { tasks, now, categoryById, toggleComplete, setSelectedId, setQuickAdd, startFocus, focus } = usePlanner()
  const [tab, setTab] = useState('today')
  const rows = useMemo(() => {
    const open = (t) => t.status !== 'completed'
    const weekEnd = dateKey(addDays(day, 7))
    let r
    if (tab === 'today') r = tasksOn(tasks, dayKey)
    else if (tab === 'upcoming') r = tasks.filter((t) => open(t) && t.date && t.date > dayKey && t.date <= weekEnd)
    else r = tasks.filter((t) => open(t) || t.date === dayKey)
    return sortByTime(r).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
  }, [tasks, tab, day, dayKey])

  // Keyboard: ↑↓ or J/K move between rows, Enter opens, X completes, F focuses.
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
    <Panel title="Tasks" meta={rows.length} className={className} i={i} bodyClass="px-2 pb-2"
      right={
        <div className="flex items-center gap-1.5">
          <Tabs value={tab} onChange={setTab} options={[{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'all', label: 'All' }]} />
          <RoundBtn label="Add task" onClick={() => setQuickAdd({ date: dayKey })} className="h-8 w-8 bg-subtle ring-hair"><Plus size={15} /></RoundBtn>
        </div>
      }>
      {rows.length === 0 ? (
        <button type="button" onClick={() => setQuickAdd({ date: dayKey })}
          className="m-3 w-[calc(100%-1.5rem)] rounded-2xl border border-dashed border-line px-4 py-8 text-[13px] text-faint hover:text-muted hover:border-faint transition">
          Nothing here yet. Add a task
        </button>
      ) : (
        <>
        <ul className="group/list max-h-[440px] overflow-y-auto">
          {rows.map((t) => {
            const done = t.status === 'completed'
            const od = isOverdue(t, now)
            const focused = focus?.taskId === t.id
            return (
              <li key={t.id} data-row onClick={() => setSelectedId(t.id)} tabIndex={0} onKeyDown={(e) => onRowKey(e, t)}
                aria-label={`${t.title}${done ? ', done' : ''}`}
                className="group flex items-center gap-3 px-3 h-[52px] rounded-2xl cursor-pointer hover:bg-subtle focus-visible:bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40 outline-none transition duration-300">
                <CheckCircle checked={done} onToggle={() => toggleComplete(t.id)} />
                <div className="min-w-0 flex-1">
                  <p className={cx('text-[14px] font-semibold truncate transition', done && 'line-through text-faint')}>{t.title}</p>
                  <div className="flex items-center gap-2 text-[11px] font-medium">
                    {t.interruption && <span className="inline-flex items-center gap-1 text-peach-fg"><Zap size={10} />Interruption{t.interruption.by ? ` · ${t.interruption.by}` : ''}</span>}
                    {t.status === 'working' && <span className="inline-flex items-center gap-1 text-sky-fg"><i className="h-1.5 w-1.5 rounded-full bg-sky-fg animate-pulse" />Working</span>}
                    {od && <span className="text-muted">{carriedLabel(t.date, now)}</span>}
                    {tab !== 'today' && t.date && t.date !== dayKey && <span className="text-faint">{format(parseISO(t.date), 'EEE d')}</span>}
                    {t.recurrence && <span className="inline-flex items-center gap-1 text-faint"><Repeat size={10} />Repeats</span>}
                    <RequiredBadge task={t} />
                    {!t.recurrence && !od && <TimeNote t={t} now={now} />}
                  </div>
                </div>
                <CategoryTag category={categoryById(t.category)} className="hidden sm:inline-flex shrink-0" />
                {!done && !focused && (
                  <button type="button" title="Start focus" aria-label="Start focus"
                    onClick={(e) => { e.stopPropagation(); startFocus(t.id) }}
                    className="h-8 w-8 rounded-full inline-flex items-center justify-center text-accent bg-accent-soft opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:scale-100 transition duration-300 shrink-0">
                    <Play size={12} fill="currentColor" />
                  </button>
                )}
                <span className="w-12 text-right text-[13px] font-semibold text-muted tnum shrink-0">{t.startTime || '—'}</span>
              </li>
            )
          })}
        </ul>
        <p className="px-3 pt-1 text-[11px] text-faint" aria-hidden="true">
          <span className="kbd">↑</span> <span className="kbd">↓</span> move · <span className="kbd">Enter</span> open · <span className="kbd">X</span> done · <span className="kbd">F</span> focus
        </p>
        </>
      )}
    </Panel>
  )
}

// Overlapping blocks share the width: greedy lanes inside each cluster.
function layout(timed) {
  const items = timed.map((t) => { const s = toMin(t.startTime); return { t, s, e: s + Math.max(t.durationMinutes || 0, 15) } })
    .sort((a, b) => a.s - b.s || b.e - a.e)
  const out = []
  let cluster = [], lanes = [], clusterEnd = -1
  const flush = () => { cluster.forEach((c) => out.push({ ...c, lanes: lanes.length })); cluster = []; lanes = [] }
  for (const it of items) {
    if (it.s >= clusterEnd) { flush(); clusterEnd = -1 }
    let lane = lanes.findIndex((end) => end <= it.s)
    if (lane === -1) { lane = lanes.length; lanes.push(it.e) } else lanes[lane] = it.e
    cluster.push({ ...it, lane })
    clusterEnd = Math.max(clusterEnd, it.e)
  }
  flush()
  return out
}

const HOUR = 56

function Timeline({ list, day, dayKey, isToday, className, i }) {
  const { categoryById, setSelectedId, setQuickAdd, previewPlan, applyPlan, settings, now } = usePlanner()
  const [preview, setPreview] = useState(null) // plan awaiting Apply / Cancel
  const scroller = useRef(null)
  const [planMsg, setPlanMsg] = useState(null)
  const unscheduled = list.filter((t) => !t.startTime && t.status !== 'completed')
  const blocks = useMemo(() => layout(list.filter((t) => t.startTime)), [list])

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const starts = blocks.map((b) => b.s), ends = blocks.map((b) => b.e)
  const from = Math.max(0, Math.min(7, ...starts.map((s) => Math.floor(s / 60)), isToday ? now.getHours() : 24))
  const to = Math.min(24, Math.max(21, ...ends.map((e) => Math.ceil(e / 60)), isToday ? now.getHours() + 1 : 0))
  const y = (min) => ((min - from * 60) / 60) * HOUR
  const showNow = isToday && nowMin >= from * 60 && nowMin <= to * 60

  // Open on the current time (or the first block) rather than the top.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const target = showNow ? y(nowMin) : blocks.length ? y(blocks[0].s) : 0
    el.scrollTop = Math.max(0, target - 120)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey])

  // Show where tasks would go first; nothing moves until Apply.
  const runPlan = () => {
    const plan = previewPlan(dayKey)
    if (plan.patches.length) setPreview(plan)
    else { setPlanMsg(describePlan(plan)); setTimeout(() => setPlanMsg(null), 4000) }
  }
  useEffect(() => setPreview(null), [dayKey, list])
  const ghosts = preview ? preview.patches.map((p) => {
    const t = list.find((x) => x.id === p.id)
    const s = toMin(p.startTime)
    return t && { t, s, e: s + (t.durationMinutes || 30) }
  }).filter(Boolean) : []
  const workStart = capMin(settings.workHours.start), workEnd = capMin(settings.workHours.end)
  const addAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const min = from * 60 + Math.floor(((e.clientY - rect.top) / HOUR) * 4) * 15
    setQuickAdd({ date: dayKey, startTime: hh(Math.min(min, 23 * 60 + 45)), durationMinutes: 60 })
  }

  return (
    <Panel title="Schedule" meta={format(day, 'EEE d')} className={className} i={i} bodyClass="flex flex-col"
      right={preview ? (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setPreview(null)} className="h-8 rounded-full px-3 text-[12px] font-semibold text-muted hover:text-ink hover:bg-subtle transition">Cancel</button>
          <button type="button" onClick={() => { applyPlan(preview); setPreview(null) }}
            className="h-8 rounded-full px-3.5 text-[12px] font-semibold bg-accent text-white transition hover:-translate-y-px active:scale-[0.97]">Apply</button>
        </div>
      ) : planMsg ? <span role="status" className="text-[11px] font-semibold text-muted animate-fade-in truncate">{planMsg}</span> : unscheduled.some((t) => t.status === 'todo') && (
        <button type="button" onClick={runPlan} title="Timebox unscheduled tasks into free slots"
          className="group h-8 inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold text-accent bg-accent-soft transition hover:-translate-y-px active:scale-[0.97]">
          <Wand2 size={13} className="transition duration-500 group-hover:-rotate-12" /> Plan my day
        </button>
      )}>
      {preview && (
        <p className="mx-5 mb-3 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-[12px] font-medium text-ink animate-fade-in">
          <b>Preview:</b> {preview.patches.length} task{preview.patches.length === 1 ? '' : 's'} placed {hh(Math.min(...ghosts.map((g) => g.s)))}–{hh(Math.max(...ghosts.map((g) => g.e)))}
          {preview.unplaced.length > 0 && <>, {preview.unplaced.length} won't fit before {hh(preview.end)}</>}. Nothing changes until you apply.
        </p>
      )}
      {!preview && unscheduled.length > 0 && (
        <div className="mx-5 mb-3 rounded-2xl bg-subtle ring-hair p-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint px-1">Unscheduled</span>
          {unscheduled.map((t) => {
            const c = colorOf(categoryById(t.category).color)
            return (
              <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
                className="pill bg-card text-ink shadow-soft hover:-translate-y-px transition">
                <i className={cx('h-1.5 w-1.5 rounded-full', c.dot)} />{t.title}
              </button>
            )
          })}
        </div>
      )}
      {/* Absolute scroller: the column takes its height from the cards beside it. */}
      <div className="relative flex-1 min-h-[460px] border-t border-line">
        <div ref={scroller} className="absolute inset-0 overflow-y-auto rounded-b-card">
          <div className="relative" style={{ height: (to - from) * HOUR + 24 }}>
            {Array.from({ length: to - from + 1 }, (_, k) => (
              <div key={k} className="absolute inset-x-0 flex items-start" style={{ top: k * HOUR + 12 }}>
                <span className="w-16 pr-3 -mt-[8px] text-right text-[11px] font-semibold text-faint tnum">{from + k < 24 ? hh((from + k) * 60) : ''}</span>
                <span className="flex-1 border-t border-dashed border-line mr-4" />
              </div>
            ))}
            {/* hours outside your working day, shaded */}
            {[[from * 60, Math.max(from * 60, workStart)], [Math.min(to * 60, workEnd), to * 60]].map(([a, b], k) => b > a && (
              <div key={k} className="absolute left-16 right-4 bg-subtle/70 pointer-events-none rounded-md" style={{ top: y(a) + 12, height: y(b) - y(a) }} />
            ))}
            {/* click empty space to add at that time */}
            <div className="absolute left-16 right-4 cursor-copy" style={{ top: 12, height: (to - from) * HOUR }} onClick={addAt} title="Click to add a task here" />
            <div className="absolute left-16 right-4 pointer-events-none" style={{ top: 12, height: (to - from) * HOUR }}>
              {blocks.map(({ t, s, e, lane, lanes }) => {
                const c = colorOf(categoryById(t.category).color)
                const done = t.status === 'completed'
                const live = isToday && nowMin >= s && nowMin < e && !done
                const h = Math.max(26, ((e - s) / 60) * HOUR - 4)
                return (
                  <button key={t.id} type="button" onClick={() => setSelectedId(t.id)}
                    className={cx('pointer-events-auto absolute rounded-xl pl-3.5 pr-2 py-1.5 text-left overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-lift hover:z-10',
                      done && 'opacity-50', live && 'ring-2 ring-accent/70 shadow-lift')}
                    style={{
                      top: y(s) + 2, height: h,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`,
                      background: cssVar(c.bgVar),
                    }}>
                    <span className="absolute left-1.5 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: cssVar(c.var) }} />
                    <p className={cx('text-[12px] font-bold leading-4 truncate text-ink', done && 'line-through')}>{t.interruption && <Zap size={11} className="inline -mt-0.5 mr-1 text-peach-fg" aria-label="Interruption" />}{t.title}</p>
                    {h >= 36 && <p className="text-[11px] leading-4 font-medium tnum truncate" style={{ color: cssVar(c.var) }}>{hh(s)} – {hh(e)}{t.status === 'working' ? ' · working' : done && totalMinutes(t, now) >= 1 ? ` · took ${fmtMinutes(totalMinutes(t, now))}` : ''}</p>}
                  </button>
                )
              })}
              {ghosts.map(({ t, s, e }) => (
                <div key={`ghost-${t.id}`} className="absolute inset-x-0.5 rounded-xl border-2 border-dashed border-accent/70 bg-accent-soft/60 px-3 py-1.5 animate-fade-in"
                  style={{ top: y(s) + 2, height: Math.max(26, ((e - s) / 60) * HOUR - 4) }}>
                  <p className="text-[12px] font-bold leading-4 truncate text-ink">{t.title}</p>
                  <p className="text-[11px] leading-4 font-medium text-accent tnum">{hh(s)} – {hh(e)} · proposed</p>
                </div>
              ))}
            </div>
            {showNow && (
              <div className="absolute left-0 right-4 flex items-center pointer-events-none z-20" style={{ top: y(nowMin) + 12 - 10 }}>
                <span className="w-16 pr-1.5 flex justify-end">
                  <span className="rounded-full bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 tnum shadow-[0_4px_12px_-2px_rgb(var(--accent)/0.6)]">{hh(nowMin)}</span>
                </span>
                <span className="h-2.5 w-2.5 -ml-1 rounded-full bg-accent ring-4 ring-accent/20" />
                <span className="flex-1 h-[2px] bg-gradient-to-r from-accent to-accent/0" />
              </div>
            )}
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setQuickAdd({ date: dayKey, durationMinutes: 60 })}
        className="mx-3 my-3 h-10 rounded-full inline-flex items-center justify-center gap-2 text-[12px] font-semibold text-muted bg-subtle ring-hair hover:text-ink transition">
        <CalendarPlus size={14} /> Block time
      </button>
    </Panel>
  )
}

function FocusTime({ day, isToday, className, i }) {
  const { tasks, now } = usePlanner()
  const hours = useMemo(() => focusByHour(tasks, day, now), [tasks, day, now])
  const total = hours.reduce((s, h) => s + h.minutes, 0)
  const active = hours.filter((h) => h.minutes > 0).map((h) => h.hour)
  const from = Math.min(6, ...active), to = Math.max(22, ...active)
  const data = hours.slice(from, to + 1)
  const cur = isToday ? now.getHours() : -1
  return (
    <Panel title="Focus time" className={className} i={i}>
      <p className="font-serif text-[44px] leading-none tnum">{fmtMinutes(total)}</p>
      <p className="text-[12px] text-faint mt-1.5 mb-3">Time spent working{isToday ? ' today' : ' that day'}</p>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={3}>
            <XAxis dataKey="hour" axisLine={false} tickLine={false} interval={3} tick={{ fontSize: 10, fill: cssVar('--faint') }}
              tickFormatter={(h) => (h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`)} />
            <Tooltip cursor={{ fill: cssVar('--subtle') }} content={({ active: a, payload }) => a && payload?.length ? (
              <div className="card px-2.5 py-1 text-[11px] shadow-lift tnum"><b>{hh(payload[0].payload.hour * 60)}</b> · {fmtMinutes(payload[0].value)}</div>) : null} />
            <Bar dataKey="minutes" radius={[6, 6, 6, 6]} minPointSize={3}>
              {data.map((h) => <Cell key={h.hour} fill={h.hour === cur ? cssVar('--accent') : h.minutes > 0 ? cssVar('--ink', 0.85) : cssVar('--line')} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

function Categories({ list, className, i }) {
  const { settings } = usePlanner()
  const rows = settings.categories.map((c) => {
    const mine = list.filter((t) => t.category === c.id)
    return { cat: c, minutes: mine.reduce((s, t) => s + t.durationMinutes, 0), count: mine.length }
  }).filter((r) => r.count > 0).sort((a, b) => b.minutes - a.minutes)
  const total = rows.reduce((s, r) => s + r.minutes, 0)
  return (
    <Panel title="Time by category" className={className} i={i}>
      {rows.length === 0 ? <p className="text-[13px] text-faint">No tasks planned.</p> : (
        <>
          <div className="h-3 rounded-full overflow-hidden flex gap-[3px] mb-4">
            {rows.map(({ cat, minutes }) => <div key={cat.id} className="rounded-full transition-all duration-700" style={{ width: `${total ? (minutes / total) * 100 : 0}%`, background: cssVar(colorOf(cat.color).var) }} />)}
          </div>
          <ul className="space-y-2">
            {rows.map(({ cat, minutes, count }) => (
              <li key={cat.id} className="flex items-center justify-between text-[13px]">
                <span className="inline-flex items-center gap-2 font-semibold min-w-0"><i className={cx('h-2.5 w-2.5 rounded-full shrink-0', colorOf(cat.color).dot)} /><span className="truncate">{cat.name}</span></span>
                <span className="text-muted font-medium tnum shrink-0">{fmtMinutes(minutes)} <span className="text-faint">· {count}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

function Insights({ day, className, i }) {
  const { tasks, now, settings } = usePlanner()
  const items = useMemo(() => buildInsights({ tasks, day, now, categories: settings.categories }), [tasks, day, now, settings.categories])
  return (
    <Panel title="Insights" className={className} i={i} bodyClass="px-3 pb-3">
      <ul className="space-y-1.5">
        {items.map((it, k) => {
          const c = colorOf(it.tone)
          const Icon = INSIGHT_ICON[it.icon] || Sparkles
          return (
            <li key={k} className="flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-subtle transition">
              <span className={cx('h-8 w-8 rounded-full flex items-center justify-center shrink-0', c.bg, c.text)}><Icon size={15} /></span>
              <p className="text-[13px] leading-snug text-ink pt-1.5">{it.text}</p>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function Habits({ dayKey, day, className, i }) {
  const { habits, addHabit, removeHabit, toggleHabit, toggleHabitRest, now } = usePlanner()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const strip = Array.from({ length: 7 }, (_, k) => subDays(day, 6 - k))

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
    <Panel title="Habits" meta={habits.length ? `${habits.filter((h) => h.done.includes(dayKey)).length}/${habits.length}` : null}
      className={className} i={i} bodyClass="px-2 pb-2"
      right={<RoundBtn label="Add habit" onClick={() => setAdding(true)} className="h-8 w-8 bg-subtle ring-hair"><Plus size={15} /></RoundBtn>}>
      {habits.length === 0 && !adding && <p className="px-3 pb-3 text-[13px] text-faint">Track small daily wins. Add your first habit.</p>}
      {habits.length > 0 && (
        <ul>
          {habits.map((h) => (
            <li key={h.id} className="group flex items-center gap-3 px-3 h-[52px] rounded-2xl hover:bg-subtle transition">
              <CheckCircle checked={h.done.includes(dayKey)} onToggle={() => toggleHabit(h.id, dayKey)} />
              <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">{h.name}</span>
              <div className="hidden sm:flex gap-1.5">
                {strip.map((d) => {
                  const k = dateKey(d)
                  const on = h.done.includes(k)
                  const rest = (h.rest || []).includes(k)
                  return (
                    <span key={k} title={`${format(d, 'EEE d')}${rest ? ' · rest day' : ''}`}
                      className={cx('h-6 w-6 rounded-full inline-flex items-center justify-center text-[9px] font-bold transition',
                        on ? 'bg-mint-fg text-white' : rest ? 'bg-lav text-lav-fg' : 'bg-subtle text-faint ring-hair')}>
                      {rest ? <Moon size={10} /> : format(d, 'EEEEE')}
                    </span>
                  )
                })}
              </div>
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-accent w-10 justify-end tnum"><Flame size={13} />{streakOf(h)}</span>
              <button type="button" onClick={() => toggleHabitRest(h.id, dayKey)}
                aria-label={(h.rest || []).includes(dayKey) ? `Undo rest day for ${h.name}` : `Rest day for ${h.name}: keeps the streak`}
                title={(h.rest || []).includes(dayKey) ? 'Undo rest day' : 'Rest day (keeps your streak)'}
                className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center transition',
                  (h.rest || []).includes(dayKey) ? 'bg-lav text-lav-fg' : 'text-faint opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-card hover:text-ink')}>
                <Moon size={13} />
              </button>
              <button type="button" aria-label="Remove habit" onClick={() => removeHabit(h.id)}
                className="h-7 w-7 rounded-full inline-flex items-center justify-center text-faint opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-coral hover:text-coral-fg transition"><X size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form onSubmit={submit} className="p-2 flex gap-2">
          <input autoFocus className="input !rounded-full !py-2" placeholder="e.g. Read 20 minutes" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
          <button type="submit" className="btn-black">Add</button>
        </form>
      )}
    </Panel>
  )
}
