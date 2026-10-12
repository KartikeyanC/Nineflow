import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarCheck, Info, Target } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { usePlanner } from '../store/PlannerContext'
import { dayLoad } from '../lib/capacity'
import { fmtMinutes } from '../lib/tasks'
import { parseTopics, planGoal } from '../lib/goalPlan'
import { CategoryPills, CheckCircle, Field, Modal, cx } from './ui'
import { DateField } from './DatePicker'
import { TimeField } from './TimePicker'

// "Plan a goal": an exam, a launch, a trip. Say what it is, when it's due and
// what has to be covered, and the planner spreads the work over the free days
// (revision at the end, a free day before the deadline). Nothing is added until
// the preview is confirmed, and one Undo takes the whole plan back.

const MINUTES = [30, 45, 60, 90, 120, 180, 240]
const DAYS = [['Mo', 1, 'Monday'], ['Tu', 2, 'Tuesday'], ['We', 3, 'Wednesday'], ['Th', 4, 'Thursday'], ['Fr', 5, 'Friday'], ['Sa', 6, 'Saturday'], ['Su', 0, 'Sunday']]

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
      className="group mt-2 h-10 w-full inline-flex items-center justify-center lg:justify-start gap-2.5 rounded-full pl-1.5 lg:pr-3 bg-card shadow-soft text-ink transition duration-300 hover:-translate-y-px active:scale-[0.97]">
      <span className="h-7 w-7 rounded-full inline-flex items-center justify-center bg-lav text-lav-fg transition duration-500 group-hover:scale-110"><Target size={14} /></span>
      <span className="hidden lg:inline text-[13px] font-semibold">Plan a goal</span>
    </button>
  )
}

export default function GoalPlanner() {
  const { goalPlannerOpen: open, setGoalPlannerOpen, tasks, now, settings, addTasks, setView, setDashboardDate, setCalendarMode } = usePlanner()
  const [form, setForm] = useState(() => blank(settings.categories))
  const [stage, setStage] = useState('form') // 'form' | 'preview'
  const [off, setOff] = useState(() => new Set()) // preview rows the person unticked
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const close = () => setGoalPlannerOpen(false)

  useEffect(() => {
    if (open) { setForm(blank(settings.categories)); setStage('form'); setOff(new Set()) }
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

          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <Field label="What is it?">
              <input autoFocus className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Maths exam, Website launch, Trip to Goa…" maxLength={60} />
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
                  className={cx('pill h-8 px-3 text-[12px] border transition', form.minutes === m ? 'bg-ink text-page border-ink' : 'bg-card text-muted border-line hover:text-ink')}>
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
                    className={cx('h-9 w-9 rounded-full text-[12px] font-bold transition', form.days.includes(d) ? 'bg-ink text-page' : 'bg-page text-faint hover:text-ink')}>{l}</button>
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
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#F2420E]" />
      <span><span className="block text-[13px] font-semibold">{title}</span><span className="block text-[11px] text-faint">{hint}</span></span>
    </label>
  )
}
