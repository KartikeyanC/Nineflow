import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarCheck, Info, Sparkles, Target } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { usePlanner } from '../store/PlannerContext'
import { dayLoad } from '../lib/capacity'
import { fmtMinutes } from '../lib/tasks'
import { parseTopics, planGoal } from '../lib/goalPlan'
import { parsePlanPrompt } from '../lib/promptPlan'
import { CategoryPills, CheckCircle, Field, Modal, cx } from './ui'
import { DateField } from './DatePicker'
import { TimeField } from './TimePicker'

// "Plan a goal": an exam, a launch, a trip. Say what it is, when it's due and
// what has to be covered, and the planner spreads the work over the free days
// (revision at the end, a free day before the deadline). Nothing is added until
// the preview is confirmed, and one Undo takes the whole plan back.

const MINUTES = [30, 45, 60, 90, 120, 180, 240]
const DAYS = [['Mo', 1, 'Monday'], ['Tu', 2, 'Tuesday'], ['We', 3, 'Wednesday'], ['Th', 4, 'Thursday'], ['Fr', 5, 'Friday'], ['Sa', 6, 'Saturday'], ['Su', 0, 'Sunday']]

const EXAMPLES = [
  '90 day UPSC exam plan, 6 hours a day, subjects: history, polity, geography, economics',
  'IELTS prep in 8 weeks, 1.5 hours a day, Mon-Fri',
  'Maths exam on 15 Dec, 2 hours daily except Sundays at 7pm',
]
const DAY_SHORT = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }
// "Mon–Sat", "every day", or a plain list.
function daysLabel(days) {
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d))
  if (order.length === 7) return 'every day'
  const idx = order.map((d) => [1, 2, 3, 4, 5, 6, 0].indexOf(d))
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  return run && order.length > 2 ? `${DAY_SHORT[order[0]]}–${DAY_SHORT[order[order.length - 1]]}` : order.map((d) => DAY_SHORT[d]).join(', ')
}

const blank = (categories) => ({
  name: '', deadline: null, topicsText: '', minutes: 60, days: [1, 2, 3, 4, 5, 6], startTime: '18:00',
  revision: true, restDayBefore: true, deadlineTask: true,
  category: (categories.find((c) => c.id === 'learning') || categories[0])?.id || null,
})

// The sidebar entry, styled like the Interruption button next to it.
export function PlanGoalButton() {
  const { setGoalPlannerOpen } = usePlanner()
  return (
    <button type="button" onClick={() => setGoalPlannerOpen(true)} title="Plan an exam, project or trip over the days before its deadline"
      className="group h-10 w-full inline-flex items-center justify-center wide:justify-start gap-2.5 rounded-full pl-1.5 wide:pr-3 bg-card shadow-soft text-ink transition duration-300 hover:-translate-y-px active:scale-[0.97]">
      <span className="h-7 w-7 rounded-full inline-flex items-center justify-center bg-lav text-lav-fg transition duration-500 group-hover:scale-110"><Target size={14} /></span>
      <span className="hidden wide:inline text-[13px] font-semibold">Plan a goal</span>
    </button>
  )
}

export default function GoalPlanner() {
  const { goalPlannerOpen: open, setGoalPlannerOpen, tasks, now, settings, addTasks, setView, setDashboardDate, setCalendarMode } = usePlanner()
  const [form, setForm] = useState(() => blank(settings.categories))
  const [stage, setStage] = useState('form') // 'form' | 'preview'
  const [off, setOff] = useState(() => new Set()) // preview rows the person unticked
  const [promptText, setPromptText] = useState('')
  const [understood, setUnderstood] = useState(null) // null | { chips: string[], missing: string[] }
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const close = () => setGoalPlannerOpen(false)

  useEffect(() => {
    if (open) { setForm(blank(settings.categories)); setStage('form'); setOff(new Set()); setPromptText(''); setUnderstood(null) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const topics = useMemo(() => parseTopics(form.topicsText), [form.topicsText])
  const plan = useMemo(() => {
    if (stage !== 'preview') return null
    return planGoal({
      name: form.name, deadline: form.deadline, topics, minutesPerDay: form.minutes, days: form.days, startTime: form.startTime,
      revision: form.revision, restDayBefore: form.restDayBefore, deadlineTask: form.deadlineTask, from: now,
      // A day that is already booked solid isn't piled on.
      isFull: (key) => { const l = dayLoad(tasks, key, now, settings.workHours); return l.capacity > 0 && l.left >= l.capacity },
    })
  }, [stage, form, topics, tasks, now, settings.workHours])

  // The sentence box: read it, fill in the form, and go to the preview when there is
  // a goal and a due date. Whatever wasn't mentioned keeps the form's current value.
  const buildFromPrompt = () => {
    if (!promptText.trim()) return
    const { fields } = parsePlanPrompt(promptText, { now })
    const next = { ...form, ...fields }
    const chips = []
    if (fields.name) chips.push(fields.name)
    if (fields.deadline) chips.push(`due ${format(parseISO(fields.deadline), 'EEE d MMM yyyy')}`)
    if (fields.minutes) chips.push(`${fmtMinutes(fields.minutes)} a day`)
    if (fields.days) chips.push(daysLabel(fields.days))
    if (fields.startTime) chips.push(`at ${fields.startTime}`)
    if (fields.topicsText) { const n = parseTopics(fields.topicsText).length; chips.push(`${n} ${n === 1 ? 'topic' : 'topics'}`) }
    if (fields.revision === false) chips.push('no revision')
    const missing = []
    if (!next.name.trim()) missing.push('what it is')
    if (!next.deadline) missing.push('the due date')
    setForm(next)
    setUnderstood({ chips, missing })
    if (!missing.length) { setOff(new Set()); setStage('preview') }
  }

  const preview = () => {
    setOff(new Set())
    setStage('preview')
  }
  const picked = plan ? plan.items.filter((_, i) => !off.has(i)) : []
  const toggle = (i) => setOff((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const add = () => {
    if (!picked.length) return
    addTasks(picked.map(({ kind, ...t }) => ({ ...t, category: form.category })), `Added ${picked.length} tasks for ${form.name.trim()}`)
    close()
    // Land on the first planned day, as a week, so the plan is the first thing you see.
    setDashboardDate(picked.map((t) => t.date).sort()[0])
    setCalendarMode('week')
    setView('week')
  }

  const toggleDay = (d) => set({ days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] })
  const ready = form.name.trim() && form.deadline

  return (
    <Modal open={open} onClose={close} width="max-w-xl" title={stage === 'form' ? 'Plan a goal' : 'Your plan'}>
      {stage === 'form' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (ready) preview() }}>
          <p className="text-sm text-muted -mt-1 mb-4">An exam, a launch, a trip: say what it is and when it's due, and NineFlow spreads the work over your free days.</p>

          <div className="rounded-2xl bg-page border border-line p-3.5 mb-5">
            <label htmlFor="goal-prompt" className="text-xs font-semibold text-muted inline-flex items-center gap-1.5 mb-1.5"><Sparkles size={13} className="text-lav-fg" /> Or just describe it in a sentence</label>
            <textarea id="goal-prompt" autoFocus className="input min-h-[64px] resize-y leading-relaxed" value={promptText} onChange={(e) => { setPromptText(e.target.value); setUnderstood(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); buildFromPrompt() } }}
              placeholder={EXAMPLES[0]} />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => { setPromptText(ex); setUnderstood(null) }} title={ex}
                  className="pill h-7 px-2.5 text-[11px] bg-card border border-line text-muted hover:text-ink transition max-w-[13rem] truncate">{ex.split(',')[0]}</button>
              ))}
              <button type="button" onClick={buildFromPrompt} disabled={!promptText.trim()} className={cx('btn-black h-9 py-0 ml-auto', !promptText.trim() && 'opacity-40')}>Build my plan <CalendarCheck size={14} /></button>
            </div>
            {understood && (
              <div className="mt-2.5 text-[12px]" role="status">
                {understood.chips.length > 0 && <p className="text-muted"><span className="font-semibold text-ink">Understood:</span> {understood.chips.join(' · ')}</p>}
                {understood.missing.length > 0 && <p className="mt-1 font-semibold text-peach-fg inline-flex items-center gap-1.5"><Info size={13} /> I couldn&#39;t find {understood.missing.join(' or ')}. Add it below, then see the plan.</p>}
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <Field label="What is it?">
              <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Maths exam, Website launch, Trip to Goa…" maxLength={60} />
            </Field>
            <Field label="Due on">
              <DateField value={form.deadline} onChange={(deadline) => set({ deadline })} allowClear={false} placeholder="Pick a date" className="w-full sm:w-44" />
            </Field>
          </div>

          <Field label="What needs covering? (one per line, optional)" className="mt-3">
            <textarea className="input min-h-[96px] resize-y leading-relaxed" value={form.topicsText} onChange={(e) => set({ topicsText: e.target.value })}
              placeholder={'Chapter 1: Algebra\nChapter 2: Geometry\nPast papers'} />
          </Field>
          {topics.length > 0 && <p className="mt-1 text-[11px] text-faint">{topics.length} {topics.length === 1 ? 'topic' : 'topics'}</p>}

          <div className="mt-4">
            <span className="block text-xs font-semibold text-muted mb-1.5">Time per day</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Time per day">
              {MINUTES.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={form.minutes === m} onClick={() => set({ minutes: m })}
                  className={cx('pill h-8 px-3 text-[12px] border transition', form.minutes === m ? 'bg-brand text-white border-transparent' : 'bg-card text-muted border-line hover:text-ink')}>
                  {fmtMinutes(m)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <span className="block text-xs font-semibold text-muted mb-1.5">Days you can work on it</span>
              <div className="flex gap-1.5">
                {DAYS.map(([l, d, full]) => (
                  <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={form.days.includes(d)} aria-label={full} title={full}
                    className={cx('h-9 w-9 rounded-full text-[12px] font-bold transition', form.days.includes(d) ? 'bg-brand text-white' : 'bg-page text-faint hover:text-ink')}>{l}</button>
                ))}
              </div>
            </div>
            <Field label="At" className="sm:w-32"><TimeField value={form.startTime} onChange={(startTime) => set({ startTime })} /></Field>
          </div>

          <div className="mt-4 space-y-1.5">
            <Check checked={form.revision} onChange={(revision) => set({ revision })} title="Revision at the end" hint="The last days go on going over everything, with a final revision on the last day." />
            <Check checked={form.restDayBefore} onChange={(restDayBefore) => set({ restDayBefore })} title="Keep the day before free" hint="Nothing planned the day before it's due." />
            <Check checked={form.deadlineTask} onChange={(deadlineTask) => set({ deadlineTask })} title="Add the deadline as a task" hint="So it shows on the calendar on the day." />
          </div>

          <div className="mt-4"><CategoryPills categories={settings.categories} value={form.category} onChange={(category) => set({ category })} /></div>

          <div className="flex items-center justify-between mt-6">
            <span className="text-xs text-faint">Nothing is added until you confirm.</span>
            <button type="submit" disabled={!ready} className={cx('btn-black', !ready && 'opacity-40')}>See the plan <CalendarCheck size={14} /></button>
          </div>
        </form>
      ) : (
        <div>
          {plan.problem ? (
            <div role="alert" className="rounded-2xl bg-coral/60 text-coral-fg p-4 text-sm">
              <p className="font-semibold inline-flex items-center gap-2"><Info size={15} /> This can't be planned yet</p>
              <p className="mt-1">{plan.problem}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted">
                <b className="text-ink">{form.name.trim()}</b> · {plan.studyDays} study {plan.studyDays === 1 ? 'day' : 'days'}
                {plan.revisionDays > 0 && <> + {plan.revisionDays} revision</>} · {fmtMinutes(plan.totalMinutes)} in total
              </p>
              {plan.skippedFull > 0 && (
                <p className="mt-1.5 text-[12px] text-peach-fg font-semibold inline-flex items-center gap-1.5"><Info size={13} /> Skipped {plan.skippedFull} {plan.skippedFull === 1 ? 'day' : 'days'} that {plan.skippedFull === 1 ? 'is' : 'are'} already full.</p>
              )}
              <ul className="mt-3 max-h-[46vh] overflow-y-auto -mx-1 px-1 space-y-0.5" aria-label="Planned tasks">
                {plan.items.map((t, i) => {
                  const on = !off.has(i)
                  return (
                    <li key={i} className={cx('flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-page', !on && 'opacity-45')}>
                      <CheckCircle checked={on} onToggle={() => toggle(i)} size="sm" />
                      <span className="w-[4.5rem] shrink-0 text-[12px] font-semibold tnum text-muted">{format(parseISO(t.date), 'EEE d MMM')}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cx('block text-[13px] font-semibold truncate', !on && 'line-through')} title={t.title}>{t.title}</span>
                        {t.kind === 'revision' && <span className="block text-[10px] font-semibold text-lav-fg">Revision</span>}
                        {t.kind === 'deadline' && <span className="block text-[10px] font-semibold text-coral-fg">Deadline</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-faint tnum">{t.startTime ? `${t.startTime} · ` : ''}{fmtMinutes(t.durationMinutes)}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <div className="flex items-center justify-between mt-6">
            <button type="button" onClick={() => setStage('form')} className="btn-ghost"><ArrowLeft size={14} /> Change</button>
            {!plan.problem && (
              <button type="button" onClick={add} disabled={!picked.length} className={cx('btn-black', !picked.length && 'opacity-40')}>
                Add {picked.length} {picked.length === 1 ? 'task' : 'tasks'}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Check({ checked, onChange, title, hint }) {
  return (
    <label className="flex items-start gap-3 rounded-xl px-2 py-1.5 cursor-pointer hover:bg-page transition">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" />
      <span><span className="block text-[13px] font-semibold">{title}</span><span className="block text-[11px] text-faint">{hint}</span></span>
    </label>
  )
}
