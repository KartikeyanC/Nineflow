import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Activity, CalendarDays, Clock, Timer, Tag, Flag, Trash2, X, Repeat, ArrowRight, CalendarPlus } from 'lucide-react'
import { googleCalendarUrl } from '../lib/calendar'
import { usePlanner } from '../store/PlannerContext'
import { STATUSES, STATUS_LABEL, fmtMinutes, isOverdue, todayKey, totalMinutes } from '../lib/tasks'
import { FREQS, FREQ_LABEL, describe } from '../lib/recurrence'
import { CategoryPills, IconButton, PriorityPills, Segmented, cx } from './ui'
import { DateField } from './DatePicker'
import { TimeField } from './TimePicker'

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240]
const STATUS_PILL = { todo: 'bg-lav text-lav-fg', working: 'bg-sky text-sky-fg', completed: 'bg-mint text-mint-fg' }

// Floating side panel that edits the selected task in place.
export default function TaskPanel() {
  const { tasks, settings, selectedId, setSelectedId, updateTask, setStatus, removeTask, removeSeries, setRecurrence, applyToUpcoming, focus, startFocus, categoryById, now } = usePlanner()
  const task = tasks.find((t) => t.id === selectedId)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => { setConfirm(false) }, [selectedId])
  useEffect(() => {
    if (!task) return
    const onKey = (e) => e.key === 'Escape' && setSelectedId(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [task, setSelectedId])

  if (!task) return null
  const close = () => setSelectedId(null)
  const overdue = isOverdue(task, now)
  const logged = totalMinutes(task, now)

  // Future open occurrences of this series, and how many differ from this one.
  const upcoming = task.seriesId
    ? tasks.filter((x) => x.seriesId === task.seriesId && x.id !== task.id && x.date > task.date && x.status === 'todo')
    : []
  const FIELDS = ['title', 'description', 'startTime', 'durationMinutes', 'category', 'priority']
  const differing = upcoming.filter((x) => FIELDS.some((f) => x[f] !== task[f])).length

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink/25 animate-fade-in" onClick={close} />
      <aside className="absolute top-4 right-4 bottom-4 w-[min(460px,calc(100vw-2rem))] card shadow-modal animate-panel-in flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <span className={cx('pill', STATUS_PILL[task.status])}>{STATUS_LABEL[task.status]}</span>
            {overdue && <span className="pill bg-coral text-coral-fg text-[10px] tracking-wide">OVERDUE</span>}
            {task.recurrence && <span className="pill bg-page text-muted border border-line"><Repeat size={11} /> {describe(task.recurrence)}</span>}
          </div>
          <IconButton label="Close" onClick={close}><X size={16} /></IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {task.status !== 'completed' && (
            <button type="button" onClick={() => { startFocus(task.id); close() }}
              className={cx('mb-3 inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-semibold transition',
                focus?.taskId === task.id ? 'bg-lav text-lav-fg' : 'bg-ink text-page hover:opacity-90')}>
              <Timer size={13} /> {focus?.taskId === task.id ? 'Focusing on this' : `Focus · ${settings.pomodoro.focus} min`}
            </button>
          )}
          <input
            className="w-full bg-transparent outline-none font-bold tracking-tight placeholder:text-faint"
            style={{ fontSize: 22 }}
            placeholder="Untitled task"
            value={task.title}
            onChange={(e) => updateTask(task.id, { title: e.target.value })}
          />
          <textarea
            className="mt-2 w-full bg-transparent outline-none text-sm text-muted resize-none placeholder:text-faint min-h-[56px]"
            placeholder="Add a description…"
            rows={3}
            value={task.description}
            onChange={(e) => updateTask(task.id, { description: e.target.value })}
          />

          <div className="mt-3 divide-y divide-line">
            <Row icon={Activity} label="Status">
              <Segmented size="sm" value={task.status} onChange={(s) => setStatus(task.id, s)}
                options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
            </Row>
            <Row icon={CalendarDays} label="Date">
              <div className="flex items-center gap-2">
                <DateField value={task.date} onChange={(date) => updateTask(task.id, { date })} placeholder="No date" className="w-40" />
                {task.date !== todayKey() && (
                  <button type="button" className="text-xs font-semibold text-lav-fg hover:underline" onClick={() => updateTask(task.id, { date: todayKey() })}>Today →</button>
                )}
              </div>
            </Row>
            <Row icon={Clock} label="Start time">
              <div className="flex items-center gap-2">
                <TimeField value={task.startTime} onChange={(startTime) => updateTask(task.id, { startTime })} className="w-32" />
                {task.startTime && (
                  <button type="button" className="text-xs font-semibold text-muted hover:text-ink" onClick={() => updateTask(task.id, { startTime: null })}>Clear</button>
                )}
              </div>
            </Row>
            <Row icon={Timer} label="Estimate">
              <select className="input w-auto py-1.5" value={task.durationMinutes} onChange={(e) => updateTask(task.id, { durationMinutes: Number(e.target.value) })}>
                {[...new Set([...ESTIMATES, task.durationMinutes])].sort((a, b) => a - b).map((d) => (
                  <option key={d} value={d}>{fmtMinutes(d)}</option>
                ))}
              </select>
            </Row>
            <Row icon={Repeat} label="Repeat" top={!!task.recurrence}>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto py-1.5" value={task.recurrence?.freq || ''}
                  onChange={(e) => setRecurrence(task.id, e.target.value ? { freq: e.target.value, until: task.recurrence?.until ?? null } : null)}>
                  <option value="">Does not repeat</option>
                  {FREQS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                </select>
                {task.recurrence && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-faint">until</span>
                    <DateField value={task.recurrence.until} onChange={(until) => setRecurrence(task.id, { freq: task.recurrence.freq, until })}
                      placeholder="forever" className="w-32" />
                  </div>
                )}
              </div>
            </Row>
            <Row icon={Tag} label="Category" top>
              <CategoryPills categories={settings.categories} value={task.category} onChange={(category) => updateTask(task.id, { category })} />
            </Row>
            <Row icon={Flag} label="Priority" top>
              <PriorityPills value={task.priority} onChange={(priority) => updateTask(task.id, { priority })} />
            </Row>
          </div>

          {upcoming.length > 0 && (
            <div className="mt-4 rounded-2xl bg-lav/60 border border-lav-fg/15 px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-xs text-lav-fg">
                <span className="font-semibold">Edits apply to this occurrence only.</span>
                {differing > 0
                  ? ` ${differing} of ${upcoming.length} upcoming ${upcoming.length === 1 ? 'differs' : 'differ'}.`
                  : ` All ${upcoming.length} upcoming match.`}
              </p>
              <button type="button" disabled={differing === 0} onClick={() => applyToUpcoming(task.id)}
                className="btn-black h-8 py-0 px-3 text-xs shrink-0 disabled:opacity-40">
                Apply to {upcoming.length} upcoming <ArrowRight size={12} />
              </button>
            </div>
          )}

          <dl className="mt-4 rounded-2xl bg-page border border-line p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Meta label="Created" value={task.createdAt} />
            <Meta label="Started" value={task.startedAt} />
            <Meta label="Completed" value={task.completedAt} />
            <dt className="text-faint">Focus time logged</dt>
            <dd className={cx('text-right font-semibold', task.status === 'working' ? 'text-lav-fg' : 'text-ink')}>{fmtMinutes(logged)}</dd>
          </dl>

          {task.date && (
            <a href={googleCalendarUrl(task, categoryById(task.category)?.name)} target="_blank" rel="noopener noreferrer"
              className="mt-3 btn-ghost w-full h-9 py-0 text-xs">
              <CalendarPlus size={14} /> Add to Google Calendar
            </a>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-line flex items-center justify-between gap-3">
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-coral-fg">{task.recurrence ? 'Delete…' : 'Delete this task?'}</span>
              <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={() => setConfirm(false)}>Cancel</button>
              {task.recurrence ? (
                <>
                  <button type="button" className="btn-black h-8 py-0 px-3 bg-coral-fg" onClick={() => removeTask(task.id)}>This occurrence</button>
                  <button type="button" className="btn-black h-8 py-0 px-3 bg-coral-fg" onClick={() => removeSeries(task.seriesId)}>Whole series</button>
                </>
              ) : (
                <button type="button" className="btn-black h-8 py-0 px-3 bg-coral-fg" onClick={() => removeTask(task.id)}>Delete</button>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-coral text-coral-fg px-3.5 h-9 text-sm font-semibold hover:opacity-90 transition">
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button type="button" className="btn-black" onClick={close}>Done</button>
        </footer>
      </aside>
    </div>
  )
}

function Row({ icon: Icon, label, children, top }) {
  return (
    <div className={cx('flex gap-3 py-3', top ? 'items-start' : 'items-center')}>
      <span className={cx('w-28 shrink-0 inline-flex items-center gap-2 text-xs font-semibold text-muted', top && 'pt-1')}>
        <Icon size={14} className="text-faint" /> {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="text-right text-muted">{value ? format(parseISO(value), 'd MMM, HH:mm') : '—'}</dd>
    </>
  )
}
