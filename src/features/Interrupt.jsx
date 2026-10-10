import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Zap, X, CornerUpLeft } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, fmtMinutes, totalMinutes } from '../lib/tasks'
import { dayLoad, hhmm, toMin } from '../lib/capacity'
import { CategoryPills, cx, useDialogFocus } from '../components/ui'

// Interruptions: someone hands you urgent work mid-plan. Log it in a few
// seconds; it goes onto today's plan, pauses what you were doing, and the
// day (capacity, report, insights) stays honest about where the time went.

const EVENT = 'planner:interrupt'
export const openInterrupt = () => window.dispatchEvent(new Event(EVENT))
const LENGTHS = [10, 15, 30, 45, 60, 90, 120]

export function InterruptButton({ compact = false }) {
  return (
    <button type="button" onClick={openInterrupt} title="Something came up (Ctrl+I)"
      className={cx('group inline-flex items-center justify-center lg:justify-start gap-2.5 rounded-full transition duration-300 hover:-translate-y-px active:scale-[0.97]',
        compact ? 'h-9 w-9 bg-card shadow-soft text-peach-fg' : 'mt-2 h-10 pl-1.5 lg:pr-3 bg-card shadow-soft text-ink')}>
      <span className={cx('rounded-full inline-flex items-center justify-center bg-peach text-peach-fg transition duration-500 group-hover:scale-110', compact ? 'h-9 w-9' : 'h-7 w-7')}>
        <Zap size={compact ? 16 : 14} />
      </span>
      {!compact && <>
        <span className="hidden lg:inline text-[13px] font-semibold">Interruption</span>
        <span className="hidden lg:inline-flex ml-auto text-[10px] font-semibold text-faint tracking-wide">CTRL I</span>
      </>}
    </button>
  )
}

export default function Interrupt() {
  const { tasks, now, settings, focus, logInterruption } = usePlanner()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [by, setBy] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [category, setCategory] = useState(null)
  const [startNow, setStartNow] = useState(true)
  const [shift, setShift] = useState(true)
  const ref = useRef(null)
  useDialogFocus(ref, open)

  // Open from anywhere: the buttons, or Ctrl/Cmd+I.
  useEffect(() => {
    const show = () => {
      setTitle(''); setBy(''); setMinutes(30); setStartNow(true); setShift(true)
      setCategory(settings.categories.find((c) => c.id === 'work')?.id || settings.categories[0]?.id)
      setOpen(true)
    }
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); show() }
    }
    window.addEventListener(EVENT, show)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener(EVENT, show); window.removeEventListener('keydown', onKey) }
  }, [settings.categories])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const today = dateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  // What gets paused, and what gets pushed back.
  const current = useMemo(() => {
    if (focus) return tasks.find((t) => t.id === focus.taskId)
    return tasks.find((t) => t.status === 'working' && t.sessions.some((s) => s.end == null))
  }, [tasks, focus])
  const later = useMemo(() => tasks.filter((t) => t.date === today && t.status === 'todo' && t.startTime && toMin(t.startTime) >= nowMin), [tasks, today, nowMin])
  const people = useMemo(() => [...new Set(tasks.map((t) => t.interruption?.by).filter(Boolean))].slice(0, 8), [tasks])
  const load = useMemo(() => dayLoad(tasks, today, now, settings.workHours), [tasks, today, now, settings.workHours])
  const after = load.over + minutes
  const finish = (load.finish ?? Math.max(nowMin, toMin(settings.workHours.start))) + minutes

  if (!open) return null
  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    logInterruption({ title: title.trim(), by, minutes, category, startNow, shift: startNow && shift })
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-ink/30 backdrop-blur-sm animate-fade-in" onMouseDown={() => setOpen(false)}>
      <form ref={ref} tabIndex={-1} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="interrupt-title" onMouseDown={(e) => e.stopPropagation()}
        className="outline-none w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-card shadow-modal animate-modal-in p-6 grid gap-4">
        <header className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-full bg-peach text-peach-fg inline-flex items-center justify-center shrink-0"><Zap size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 id="interrupt-title" className="font-serif text-[30px] leading-none">Something came up?</h2>
            <p className="text-[13px] text-muted mt-1.5">Log it in a few seconds. It goes into today's plan and your report, so the day stays honest.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center text-muted hover:bg-subtle hover:text-ink transition"><X size={16} /></button>
        </header>

        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-muted">What needs doing?</span>
          <input id="interrupt-what" autoFocus className="input" placeholder="e.g. Fix the banner for the client" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-muted">Who asked? <span className="font-medium text-faint">(optional)</span></span>
          <input id="interrupt-by" className="input" list="interrupt-people" placeholder="Manager, client, teammate…" value={by} onChange={(e) => setBy(e.target.value)} />
          <datalist id="interrupt-people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        </label>

        <div className="grid gap-1.5">
          <span className="text-[12px] font-semibold text-muted">About how long?</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estimated length">
            {LENGTHS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}
                className={cx('pill h-8 px-3 text-[12px] transition', minutes === m ? 'bg-ink text-page' : 'bg-subtle text-ink ring-hair hover:-translate-y-px')}>
                {fmtMinutes(m)}
              </button>
            ))}
          </div>
        </div>

        <CategoryPills categories={settings.categories} value={category} onChange={setCategory} />

        <div className="grid gap-2 rounded-2xl bg-subtle ring-hair p-3.5">
          <Toggle checked={startNow} onChange={setStartNow} label="Start it now"
            hint={current ? `Pauses “${current.title}” (${fmtMinutes(totalMinutes(current, now))} logged) and starts the timer on this. You'll be offered to go back to it.` : 'Starts the timer on this now.'} />
          {startNow && later.length > 0 && (
            <Toggle checked={shift} onChange={setShift} label={`Push ${later.length} later task${later.length === 1 ? '' : 's'} back by ${fmtMinutes(minutes)}`}
              hint={`From ${later.map((t) => t.startTime).sort()[0]}, so nothing overlaps.`} />
          )}
        </div>

        <p className={cx('text-[12px] tnum', after > 0 ? 'text-peach-fg font-semibold' : 'text-muted')}>
          {load.afterHours
            ? `Your work day is over; this adds ${fmtMinutes(minutes)} to today.`
            : after > 0
              ? `Today will be ${fmtMinutes(after)} over capacity, finishing around ${hhmm(finish)}. You can move lower-priority work afterwards.`
              : `Still fits: you'd finish around ${hhmm(finish)}.`}
        </p>

        <footer className="flex items-center justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" disabled={!title.trim()}
            className="inline-flex items-center gap-2 h-10 rounded-full bg-accent text-white px-5 text-[13px] font-semibold transition hover:-translate-y-px active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none">
            <Zap size={14} /> {startNow ? 'Log and start' : 'Add to today'}
          </button>
        </footer>
      </form>
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cx('mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition', checked ? 'bg-ink' : 'bg-line')}>
        <span className={cx('block h-5 w-5 rounded-full bg-card transition', checked && 'translate-x-5')} />
      </button>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{label}</p>
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
      </div>
    </div>
  )
}

// After an interruption is done: offer to go back to what it paused.
export function ResumePrompt() {
  const { tasks, now, resumeAfter, dismissResume } = usePlanner()
  const it = useMemo(() => tasks.find((t) => t.interruption && !t.interruption.resolved && t.status === 'completed'
    && t.interruption.resume && tasks.some((x) => x.id === t.interruption.resume && x.status !== 'completed')), [tasks])
  if (!it) return null
  const back = tasks.find((t) => t.id === it.interruption.resume)
  const took = totalMinutes(it, now)
  return (
    <div role="status" aria-live="polite"
      className="fixed z-40 top-16 inset-x-3 sm:inset-x-auto sm:top-auto sm:bottom-20 sm:left-[108px] lg:left-[284px] animate-modal-in">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[22px] bg-card shadow-lift ring-hair pl-4 pr-1.5 py-1.5 sm:max-w-lg">
        <p className="text-[13px] min-w-0 flex-1 py-1.5">
          <b>Interruption done</b>{took >= 1 ? <span className="text-muted tnum"> · took {fmtMinutes(took)}</span> : null}. Back to <b>“{back.title}”</b>?
        </p>
        <button type="button" onClick={() => resumeAfter(it.id)}
          className="inline-flex items-center gap-2 h-9 rounded-full bg-ink text-page px-3.5 text-[12px] font-semibold transition hover:-translate-y-px active:scale-[0.97]">
          <CornerUpLeft size={13} /> Resume
        </button>
        <button type="button" onClick={() => dismissResume(it.id)} className="h-9 rounded-full px-3 text-[12px] font-semibold text-muted hover:text-ink hover:bg-subtle transition">Not now</button>
      </div>
    </div>
  )
}
