import React, { useEffect, useState } from 'react'
import { Pause, Play, SkipForward, Check, X, ChevronDown, Timer } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { fmtMinutes, totalMinutes } from '../lib/tasks'
import { colorOf, cssVar } from '../lib/colors'
import { CategoryTag, cx } from './ui'

const PHASE = {
  focus: { label: 'Focus', ring: '--lav-fg', bg: 'bg-lav', text: 'text-lav-fg', dot: 'bg-lav-fg' },
  short: { label: 'Short break', ring: '--mint-fg', bg: 'bg-mint', text: 'text-mint-fg', dot: 'bg-mint-fg' },
  long: { label: 'Long break', ring: '--sky-fg', bg: 'bg-sky', text: 'text-sky-fg', dot: 'bg-sky-fg' },
}
const R = 96
const CIRC = 2 * Math.PI * R

// Full-screen pomodoro overlay plus a floating pill when minimized.
export default function FocusMode() {
  const { focus, tasks, settings, now, categoryById, pauseFocus, resumeFocus, advanceFocus, stopFocus, setFocusOpen } = usePlanner()
  const task = focus ? tasks.find((t) => t.id === focus.taskId) : null

  // Local 1s tick for the countdown display.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!focus) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [focus])

  useEffect(() => {
    if (!focus?.open) return
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === ' ') { e.preventDefault(); focus.running ? pauseFocus() : resumeFocus() }
      if (e.key === 'Escape') setFocusOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, pauseFocus, resumeFocus, setFocusOpen])

  if (!focus || !task) return null
  const p = PHASE[focus.phase]
  const pomo = settings.pomodoro
  const totalMs = (focus.phase === 'focus' ? pomo.focus : focus.phase === 'short' ? pomo.short : pomo.long) * 60_000
  const leftMs = focus.running ? Math.max(0, focus.endsAt - Date.now()) : (focus.remainingMs ?? totalMs)
  const mm = Math.floor(leftMs / 60_000), ss = Math.floor((leftMs % 60_000) / 1000)
  const clock = `${mm}:${String(ss).padStart(2, '0')}`
  const progress = 1 - leftMs / totalMs
  const spent = totalMinutes(task, now)
  const inCycle = focus.completed % pomo.every

  if (!focus.open) {
    return (
      <button type="button" onClick={() => setFocusOpen(true)}
        className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 card px-4 h-12 flex items-center gap-3 shadow-lift hover:-translate-y-0.5 transition animate-view-in max-w-[calc(100vw-1rem)]">
        <span className={cx('h-2.5 w-2.5 rounded-full', p.dot, focus.running && 'animate-pulse')} />
        <span className="font-bold tabular-nums">{clock}</span>
        <span className={cx('pill', p.bg, p.text)}>{p.label}</span>
        <span className="text-sm font-semibold text-muted max-w-[200px] truncate">{task.title}</span>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-page flex flex-col animate-fade-in">
      <header className="flex items-center justify-between px-6 py-4">
        <button type="button" onClick={() => setFocusOpen(false)} className="btn-ghost h-9 py-0" title="Minimize (Esc)">
          <ChevronDown size={16} /> Minimize
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: pomo.every }, (_, i) => (
            <span key={i} className={cx('h-2 w-2 rounded-full transition', i < inCycle || (inCycle === 0 && focus.completed > 0 && focus.phase === 'long') ? 'bg-lav-fg' : 'bg-line')} />
          ))}
          <span className="text-xs text-faint font-semibold ml-1">{focus.completed} done</span>
        </div>
        <button type="button" onClick={() => stopFocus(false)} className="btn-ghost h-9 py-0 text-coral-fg" title="End focus session">
          <X size={16} /> End
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-6">
        <span className={cx('pill text-sm px-3 py-1', p.bg, p.text)}>{p.label}</span>
        <h1 className="h-display text-3xl sm:text-4xl text-center mt-4 max-w-2xl">{task.title}</h1>
        <div className="mt-2"><CategoryTag category={categoryById(task.category)} /></div>

        <div className="relative mt-8">
          <svg width={R * 2 + 24} height={R * 2 + 24} className="-rotate-90">
            <circle cx={R + 12} cy={R + 12} r={R} fill="none" stroke={cssVar('--line')} strokeWidth="10" />
            <circle cx={R + 12} cy={R + 12} r={R} fill="none" stroke={cssVar(p.ring)} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="h-display text-5xl tabular-nums">{clock}</span>
            <span className="text-xs text-faint font-semibold mt-1">{focus.running ? 'remaining' : 'paused'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-8">
          <button type="button" onClick={() => stopFocus(true)} className="btn-ghost h-11 w-11 p-0 rounded-full" title="Mark task done"><Check size={18} /></button>
          <button type="button" onClick={focus.running ? pauseFocus : resumeFocus} className="btn-black h-14 px-7 text-base rounded-full" title="Space">
            {focus.running ? <><Pause size={18} /> Pause</> : <><Play size={18} /> {focus.remainingMs == null ? 'Start' : 'Resume'}</>}
          </button>
          <button type="button" onClick={advanceFocus} className="btn-ghost h-11 w-11 p-0 rounded-full" title={focus.phase === 'focus' ? 'Skip to break' : 'Skip break'}><SkipForward size={18} /></button>
        </div>

        <p className="text-xs text-faint mt-6 inline-flex items-center gap-1.5">
          <Timer size={12} /> {fmtMinutes(spent)} focused on this task · estimate {fmtMinutes(task.durationMinutes)}
          {focus.phase === 'focus' && <span className="ml-2">· long break after {pomo.every - inCycle} more</span>}
        </p>
        <p className="text-[11px] text-faint/80 mt-1">Stays in Working for the whole session · breaks and pauses aren't logged as focus time</p>
      </div>
    </div>
  )
}
