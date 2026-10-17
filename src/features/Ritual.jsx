import React, { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format } from 'date-fns'
import { X, ArrowRight, ArrowLeft, Sunrise, Moon, Copy, Check, Target, Inbox, Plus, Send, Loader2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, fmtMinutes, isOverdue, sortByTime, tasksOn, totalMinutes } from '../lib/tasks'
import { dayReport } from '../lib/report'
import { currentProfile } from '../lib/profiles'
import { KINDS, defaultName, sendChat, sendToAll } from '../lib/notify'
import { useConnections } from '../lib/connections'
import { readDayNote, updateDayNote } from '../work/workStore'
import { colorOf } from '../lib/colors'
import { cx, useDialogFocus } from '../components/ui'
import { CapacityBar, CarriedOver } from './Planning'
import { EVENT, dueRitual, openRitual, useRitualState, writeState } from './ritualBus'

export { openRitual }

// A two-minute morning plan and evening shutdown. Both are optional and
// skippable; the shutdown writes the day's note into Work OS and builds the
// report from real focus sessions.

// Small prompt for the Today header.
export function RitualPrompt() {
  const { now, settings } = usePlanner()
  const state = useRitualState()
  const mode = dueRitual(now, settings.workHours, state)
  if (!mode) return null
  const plan = mode === 'plan'
  return (
    <div className="inline-flex items-center h-11 rounded-full bg-card shadow-soft p-1 animate-fade-in">
      <button type="button" onClick={() => openRitual(mode)}
        className="inline-flex items-center gap-2 h-9 rounded-full pl-2 pr-3.5 text-[13px] font-semibold hover:bg-subtle transition">
        <span className={cx('h-7 w-7 rounded-full inline-flex items-center justify-center', plan ? 'bg-butter text-butter-fg' : 'bg-lav text-lav-fg')}>
          {plan ? <Sunrise size={14} /> : <Moon size={14} />}
        </span>
        {plan ? 'Plan your day' : 'Shut down'} <span className="text-faint font-medium">· 2 min</span>
      </button>
      <button type="button" aria-label="Not today" title="Not today" onClick={() => writeState({ dismissed: dateKey(now) })}
        className="h-9 w-9 rounded-full inline-flex items-center justify-center text-faint hover:text-ink hover:bg-subtle transition">
        <X size={14} />
      </button>
    </div>
  )
}

export default function Ritual() {
  const [mode, setMode] = useState(null)
  const dialogRef = useRef(null)
  useDialogFocus(dialogRef, !!mode)
  const [step, setStep] = useState(0)
  useEffect(() => {
    const on = (e) => { setMode(e.detail); setStep(0) }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  useEffect(() => {
    if (!mode) return
    const onKey = (e) => e.key === 'Escape' && setMode(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])
  if (!mode) return null
  const Flow = mode === 'plan' ? PlanFlow : ShutdownFlow
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-ink/30 backdrop-blur-sm animate-fade-in" onMouseDown={() => setMode(null)}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={mode === 'plan' ? 'Plan your day' : 'Shut down'} onMouseDown={(e) => e.stopPropagation()}
        className="outline-none w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-page shadow-modal animate-modal-in overflow-hidden">
        <Flow step={step} setStep={setStep} close={() => setMode(null)} />
      </div>
    </div>
  )
}

function Frame({ icon: Icon, tone, title, steps, step, setStep, close, onFinish, finishLabel, children }) {
  const last = step === steps.length - 1
  return (
    <>
      <header className="flex items-center gap-3 px-5 sm:px-6 pt-5 pb-3">
        <span className={cx('h-9 w-9 rounded-full inline-flex items-center justify-center shrink-0', tone)}><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{title} · step {step + 1} of {steps.length}</p>
          <h2 className="font-serif text-[28px] leading-tight">{steps[step]}</h2>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="h-9 w-9 rounded-full inline-flex items-center justify-center text-muted hover:bg-subtle hover:text-ink transition"><X size={16} /></button>
      </header>
      <div className="flex gap-1.5 px-5 sm:px-6 pb-4" aria-hidden="true">
        {steps.map((_, k) => <span key={k} className={cx('h-1 flex-1 rounded-full transition-colors duration-500', k <= step ? 'bg-ink' : 'bg-line')} />)}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 pb-4">{children}</div>
      <footer className="flex items-center justify-between gap-2 px-5 sm:px-6 py-4 border-t border-line bg-card/60">
        {step > 0
          ? <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Back</button>
          : <button type="button" className="text-[13px] font-semibold text-muted hover:text-ink px-2" onClick={close}>Skip for today</button>}
        {last
          ? <button type="button" className="btn-black" onClick={() => { onFinish(); close() }}>{finishLabel} <Check size={14} /></button>
          : <button type="button" className="btn-black" onClick={() => setStep(step + 1)}>Next <ArrowRight size={14} /></button>}
      </footer>
    </>
  )
}

// ---- Morning: leftovers, today's load, one main target --------------------
function PlanFlow({ step, setStep, close }) {
  const { tasks, now, categoryById, setQuickAdd } = usePlanner()
  const today = dateKey(now)
  const open = useMemo(() => sortByTime(tasksOn(tasks, today)).filter((t) => t.status !== 'completed'), [tasks, today])
  const [target, setTarget] = useState(() => readDayNote(today).target || '')

  return (
    <Frame icon={Sunrise} tone="bg-butter text-butter-fg" title="Plan your day" steps={['Leftovers first', 'How full is today?', 'One main target']}
      step={step} setStep={setStep} close={close} finishLabel="Start the day"
      onFinish={() => { updateDayNote(today, { target: target.trim() }); writeState({ plan: today }) }}>
      {step === 0 && (
        tasks.some((t) => isOverdue(t, now))
          ? <><p className="text-[13px] text-muted mb-3">Decide each one quickly. Nothing here is a failure; plans change.</p><CarriedOver /></>
          : <Empty icon={Check} text="Nothing carried over. A clean start." />
      )}
      {step === 1 && (
        <>
          <CapacityBar dayKey={today} />
          <ul className="card px-2 py-2">
            {open.length === 0 && <li className="px-3 py-3 text-[13px] text-faint">Nothing planned yet.</li>}
            {open.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <i className={cx('h-2 w-2 rounded-full', colorOf(categoryById(t.category).color).dot)} />
                <span className="flex-1 min-w-0 truncate font-semibold">{t.title}</span>
                <span className="text-faint tnum">{t.startTime || 'any time'} · {fmtMinutes(t.durationMinutes)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-ghost mt-3" onClick={() => setQuickAdd({ date: today })}><Plus size={14} /> Add a task</button>
        </>
      )}
      {step === 2 && (
        <>
          <p className="text-[13px] text-muted mb-3">If only one thing gets done today, which should it be? It goes into your daily report.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {open.map((t) => (
              <button key={t.id} type="button" onClick={() => setTarget(t.title)}
                className={cx('pill h-8 px-3.5 text-[12px] transition', target === t.title ? 'bg-brand text-white' : 'bg-card text-ink shadow-soft hover:-translate-y-px')}>
                <Target size={12} /> {t.title}
              </button>
            ))}
          </div>
          <input className="input" id="ritual-target" placeholder="Or write it in your own words" value={target} onChange={(e) => setTarget(e.target.value)} />
        </>
      )}
    </Frame>
  )
}

// ---- Evening: what got done, what moves, a note, the report ------------------
function ShutdownFlow({ step, setStep, close }) {
  const { tasks, now, settings, categoryById, moveTasksTo } = usePlanner()
  const today = dateKey(now)
  const tomorrow = dateKey(addDays(now, 1))
  const [note, setNote] = useState(() => readDayNote(today))
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState('') // hook id being sent to
  const [sentTo, setSentTo] = useState({}) // hook id -> 'ok' | error message
  const report = useMemo(() => dayReport({ tasks, key: today, now, categories: settings.categories, note, name: currentProfile()?.name }),
    [tasks, today, now, settings.categories, note])
  const saveNote = (patch) => setNote((n) => ({ ...n, ...patch }))
  const movable = report.open.filter((t) => !t.seriesId)
  const copy = async () => {
    try { await navigator.clipboard.writeText(report.text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }
  const conns = useConnections()
  const hooks = [...settings.chat.hooks, ...(conns.telegram?.chatId ? [{ id: 'telegram', kind: 'telegram', name: 'Telegram', url: '' }] : [])]
  const reportTitle = `Daily report · ${format(now, 'EEE d MMM')}`
  const sendOne = async (h) => {
    setSending(h.id)
    try { await sendChat(h, reportTitle, report.text); setSentTo((s) => ({ ...s, [h.id]: 'ok' })) }
    catch (e) { setSentTo((s) => ({ ...s, [h.id]: e.message })) }
    finally { setSending('') }
  }
  // "Close the day": with automatic sending on, the report goes to every chat that hasn't had it yet.
  const finish = () => {
    updateDayNote(today, { blockers: note.blockers || '', tomorrow: note.tomorrow || '' }); writeState({ shutdown: today })
    const pending = settings.chat.autoReport ? hooks.filter((h) => sentTo[h.id] !== 'ok') : []
    if (pending.length) sendToAll(pending, reportTitle, report.text)
  }

  return (
    <Frame icon={Moon} tone="bg-lav text-lav-fg" title="Shut down" steps={['What got done', 'What moves on', 'A note for tomorrow', 'Your report']}
      step={step} setStep={setStep} close={close} finishLabel="Close the day"
      onFinish={finish}>
      {step === 0 && (
        <>
          <p className="text-[13px] text-muted mb-3 tnum">
            <b className="text-ink">{report.done.length} of {report.list.length}</b> done · <b className="text-ink">{fmtMinutes(report.focus)}</b> focused today.
          </p>
          {report.done.length === 0 ? <Empty icon={Check} text="Nothing ticked off today. Some days are like that." /> : (
            <ul className="card px-2 py-2">
              {report.done.map((t) => {
                const took = totalMinutes(t, now)
                const ratio = took / Math.max(1, t.durationMinutes)
                return (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <span className="h-5 w-5 rounded-full bg-mint-fg text-white inline-flex items-center justify-center shrink-0"><Check size={11} strokeWidth={3} /></span>
                    <span className="flex-1 min-w-0 truncate font-semibold">{t.title}</span>
                    <span className={cx('tnum text-[12px]', took < 1 ? 'text-faint' : ratio > 1.25 ? 'text-peach-fg' : ratio < 0.8 ? 'text-mint-fg' : 'text-muted')}>
                      {fmtMinutes(t.durationMinutes)}{took >= 1 ? ` → took ${fmtMinutes(took)}` : ' · no time logged'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
      {step === 1 && (
        report.open.length === 0 ? <Empty icon={Check} text="Everything planned for today is done." /> : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-[13px] text-muted">{report.open.length} still open. Give each a day.</p>
              {movable.length > 0 && (
                <button type="button" className="btn-black h-8 py-0"
                  onClick={() => moveTasksTo(movable.map((t) => t.id), tomorrow, `Moved ${movable.length} to tomorrow`)}>
                  Move {movable.length === report.open.length ? 'all' : movable.length} to tomorrow
                </button>
              )}
            </div>
            <ul className="card px-2 py-2">
              {report.open.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-[13px]">
                  <i className={cx('h-2 w-2 rounded-full', colorOf(categoryById(t.category).color).dot)} />
                  <span className="flex-1 min-w-0 truncate font-semibold">{t.title}</span>
                  {t.seriesId
                    ? <span className="text-[11px] text-faint">repeats, comes round again</span>
                    : (
                      <span className="flex gap-1">
                        <button type="button" className="pill h-7 bg-card shadow-soft" onClick={() => moveTasksTo([t.id], tomorrow, `Moved “${t.title}” to tomorrow`)}>Tomorrow</button>
                        <button type="button" className="pill h-7 bg-card shadow-soft" onClick={() => moveTasksTo([t.id], null, `Moved “${t.title}” to Someday`)}><Inbox size={11} /> Someday</button>
                      </span>
                    )}
                </li>
              ))}
            </ul>
          </>
        )
      )}
      {step === 2 && (
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-muted">What got in the way?</span>
            <textarea id="ritual-blockers" className="input min-h-[80px]" placeholder="Waiting on feedback, an unexpected call… or nothing."
              value={note.blockers || ''} onChange={(e) => saveNote({ blockers: e.target.value })} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-muted">First thing tomorrow</span>
            <textarea id="ritual-tomorrow" className="input min-h-[80px]" placeholder="So tomorrow-you knows where to start."
              value={note.tomorrow || ''} onChange={(e) => saveNote({ tomorrow: e.target.value })} />
          </label>
        </div>
      )}
      {step === 3 && (
        <>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-[13px] text-muted">Built from today's tasks and focus sessions. It's also saved to Work OS.</p>
            <button type="button" className="btn-ghost h-8 py-0" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
          </div>
          <pre className="whitespace-pre-wrap text-[13px] font-sans leading-relaxed card p-4">{report.text}</pre>
          {hooks.length > 0 && (
            <div className="mt-3 grid gap-2" aria-label="Send the report to chat">
              {hooks.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-ghost h-8 py-0" disabled={!!sending || sentTo[h.id] === 'ok'} onClick={() => sendOne(h)}>
                    {sending === h.id ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : sentTo[h.id] === 'ok' ? <><Check size={13} /> Sent to {h.name || defaultName(h.kind)}</> : <><Send size={13} /> Send to {h.name || defaultName(h.kind)}</>}
                  </button>
                  {sentTo[h.id] && sentTo[h.id] !== 'ok' && <span role="alert" className="text-[12px] font-semibold text-coral-fg">{sentTo[h.id]}</span>}
                </div>
              ))}
              {settings.chat.autoReport && <p className="text-[12px] text-muted">When you close the day, it also goes to any chat above that hasn't had it yet.</p>}
            </div>
          )}
        </>
      )}
    </Frame>
  )
}

function Empty({ icon: Icon, text }) {
  return (
    <div className="card px-5 py-8 flex flex-col items-center gap-2 text-center">
      <span className="h-10 w-10 rounded-full bg-mint text-mint-fg inline-flex items-center justify-center"><Icon size={18} /></span>
      <p className="text-[13px] text-muted">{text}</p>
    </div>
  )
}
