import React, { useEffect, useRef, useState } from 'react'
import { parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { Activity, CalendarCheck, CalendarDays, Clock, Timer, Tag, Flag, Trash2, X, Repeat, ArrowRight, CalendarPlus, Layers, Bell, Hash, Columns3, Video, Paperclip, MoreHorizontal, PauseCircle, XCircle, Briefcase, ListPlus } from 'lucide-react'
import { googleCalendarUrl } from '../lib/calendar'
import { meetLinkFor } from '../lib/gcal'
import { pickDriveFiles, pickerAvailable } from '../lib/picker'
import { MAX_FILES, cleanFiles } from '../lib/taskFiles'
import { useCalendarOn } from '../features/CalendarSync'
import { currentProfileId } from '../lib/profiles'
import { cleanColumns, columnOf } from '../lib/columns'
import { currentWorkspaceId, listWorkspaces } from '../lib/workspaces'
import { usePlanner } from '../store/PlannerContext'
import ParkDialog from './ParkDialog'
import { STATUSES, STATUS_LABEL, carriedLabel, daysOnPlan, endDayOf, fmtMinutes, isOverdue, startDayOf, todayKey, totalMinutes } from '../lib/tasks'
import { FREQS, FREQ_LABEL, describe } from '../lib/recurrence'
import { CategoryPills, IconButton, Menu, PriorityPills, Segmented, cx, useDialogFocus } from './ui'
import Checklist from './Checklist'
import { ClientField, FieldInput, RemindersField, SaveAsTemplate, TagsField } from './TaskExtras'
import { DateField } from './DatePicker'
import { TimeField } from './TimePicker'

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240]
const STATUS_PILL = { todo: 'bg-todo-soft text-todo', working: 'bg-sky text-sky-fg', review: 'bg-violet text-violet-fg', completed: 'bg-mint text-mint-fg' }

// Floating side panel that edits the selected task in place.
export default function TaskPanel() {
  const calendarOn = useCalendarOn()
  const { allTasks: tasks, settings, selectedId, resumeTask, restoreTask, setSelectedId, updateTask, setStatus, removeTask, removeSeries, setRecurrence, applyToUpcoming, moveToWorkspace, moveTask, focus, startFocus, categoryById, now } = usePlanner()
  const task = tasks.find((t) => t.id === selectedId)
  const [park, setPark] = useState(null) // 'pause' | 'drop'
  const cols = cleanColumns(settings.columns)
  const [confirm, setConfirm] = useState(false)
  const panelRef = useRef(null)
  useDialogFocus(panelRef, !!task)

  useEffect(() => { setConfirm(false) }, [selectedId])

  // The other workspaces this task could go to (none until a second one exists).
  const pid = currentProfileId()
  const otherWorkspaces = pid ? listWorkspaces(pid).filter((w) => w.id !== currentWorkspaceId(pid)) : []
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
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Task: ${task.title || 'Untitled'}`}
        className="absolute top-4 right-4 bottom-4 w-[min(540px,calc(100vw-2rem))] card shadow-modal animate-panel-in flex flex-col overflow-hidden outline-none max-sm:inset-0 max-sm:w-full max-sm:rounded-none max-sm:border-0 max-sm:shadow-none">
        {/* Phones: a full-screen page, not a floating card. */}
        <header className="flex items-center justify-between gap-2 px-4 sm:px-6 pt-5 max-sm:pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className={cx('pill', STATUS_PILL[task.status])}>{cols.find((c) => c.id === columnOf(task, cols))?.name || STATUS_LABEL[task.status]}</span>
            {overdue && <span className="pill bg-page text-muted border border-line text-[11px]">carried over {carriedLabel(task.date, now)}</span>}
            {task.recurrence && <span className="pill bg-page text-muted border border-line"><Repeat size={11} /> {describe(task.recurrence)}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Phones: Pause, Drop and Delete live behind a menu, so the footer can be one big Done button. */}
            <span className="sm:hidden">
              <Menu items={[
                ...(!task.hold && !task.dropped && task.status !== 'completed'
                  ? [{ label: 'Pause…', icon: PauseCircle, onSelect: () => setPark('pause') }, { label: 'Drop…', icon: XCircle, onSelect: () => setPark('drop') }, 'divider']
                  : []),
                { label: 'Delete', icon: Trash2, danger: true, onSelect: () => setConfirm(true) },
              ]} trigger={({ toggle, open }) => (
                <IconButton label="More" onClick={toggle} active={open} className="max-sm:h-10 max-sm:w-10"><MoreHorizontal size={18} /></IconButton>
              )} />
            </span>
            <IconButton label="Close" onClick={close} className="max-sm:h-10 max-sm:w-10"><X size={18} /></IconButton>
          </div>
        </header>
        {(task.hold || task.dropped) && (
          <div className={cx('mx-4 sm:mx-6 mb-2 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3', task.dropped ? 'bg-coral' : 'bg-sky')}>
            <p className={cx('text-[13px] font-semibold flex-1 min-w-[12rem]', task.dropped ? 'text-coral-fg' : 'text-sky-fg')}>
              {task.dropped ? `Dropped: ${task.dropped.reason}` : `Paused: ${task.hold.reason}${task.hold.until ? ` · back on ${task.hold.until}` : ''}`}
            </p>
            <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={() => (task.dropped ? restoreTask(task.id) : resumeTask(task.id))}>
              {task.dropped ? 'Restore to today' : 'Resume today'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
          {task.status !== 'completed' && (
            <button type="button" onClick={() => { startFocus(task.id); close() }}
              className={cx('mb-3 inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-semibold transition',
                focus?.taskId === task.id ? 'bg-lav text-lav-fg' : 'bg-brand text-white hover:opacity-90')}>
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

          <Checklist task={task} />

          <div className="mt-3 divide-y divide-line">
            <Row icon={Activity} label="Status" stack>
              <div className="sm:hidden grid grid-cols-2 gap-2 w-full" role="group" aria-label="Status">
                {STATUSES.map((s) => (
                  <button key={s} type="button" aria-pressed={task.status === s} onClick={() => setStatus(task.id, s)}
                    className={cx('h-11 rounded-2xl text-sm font-semibold transition active:scale-[0.98]', task.status === s ? 'bg-brand text-white shadow-sm' : 'bg-page text-ink border border-line')}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="hidden sm:block">
                <Segmented size="sm" value={task.status} onChange={(s) => setStatus(task.id, s)}
                  options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
              </div>
            </Row>
            {/* Worked out for you, so plain text rather than fields: it cannot be edited here. */}
            <Row icon={CalendarDays} label="Start day">
              <AutoDay day={startDayOf(task)} empty="Not planned yet" title="Set automatically: the day this task was first planned for" />
            </Row>
            <Row icon={CalendarCheck} label="End day">
              {endDayOf(task)
                ? <AutoDay day={endDayOf(task)} note={daysOnPlan(task, now) > 1 ? `${daysOnPlan(task, now)} days` : 'same day'} title="Set automatically: the day this task was completed" />
                : <AutoDay empty="Not finished yet" note={daysOnPlan(task, now) ? `day ${daysOnPlan(task, now)}` : ''} title="Set automatically when the task is completed" />}
            </Row>
            {(task.trail || []).length > 0 && (
              <Row icon={CalendarDays} label="Day trail">
                <ol className="flex flex-wrap items-center gap-1 text-[12px]" aria-label="The days this task was on">
                  {task.trail.map((e) => (
                    <li key={e.date} className="inline-flex items-center gap-1">
                      <span className="pill bg-page border border-line text-muted">{format(parseISO(e.date), 'MMM d')} · {STATUS_LABEL[e.status]}</span>
                      <span className="text-faint" aria-hidden="true">→</span>
                    </li>
                  ))}
                  <li className="pill bg-lav text-lav-fg">{task.status === 'completed' ? 'Done' : task.date ? `${format(parseISO(task.date), 'MMM d')} · ${STATUS_LABEL[task.status]}` : 'Someday'}</li>
                </ol>
              </Row>
            )}
            {cols.length > STATUSES.length && (
              <Row icon={Columns3} label="Column">
                <select className="input w-auto min-w-[9rem] py-1.5" value={columnOf(task, cols)} aria-label="Board column"
                  onChange={(e) => moveTask(task.id, e.target.value)}>
                  {cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Row>
            )}
            <Row icon={CalendarDays} label="Date">
              <div className="flex items-center gap-2">
                <DateField value={task.date} onChange={(date) => updateTask(task.id, { date })} placeholder="No date" className="w-40" />
                {task.date !== todayKey() && (
                  <button type="button" className="text-xs font-semibold text-lav-fg hover:underline whitespace-nowrap shrink-0" onClick={() => updateTask(task.id, { date: todayKey() })}>Today →</button>
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
              <select className="input w-auto min-w-[7.5rem] py-1.5" value={task.durationMinutes} onChange={(e) => updateTask(task.id, { durationMinutes: Number(e.target.value) })}>
                {[...new Set([...ESTIMATES, task.durationMinutes])].sort((a, b) => a - b).map((d) => (
                  <option key={d} value={d}>{fmtMinutes(d)}</option>
                ))}
              </select>
            </Row>
            <Row icon={Repeat} label="Repeat" top={!!task.recurrence}>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto min-w-[10.5rem] py-1.5" value={task.recurrence?.freq || ''}
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
            <Row icon={Bell} label="Reminders" top>
              <RemindersField task={task} />
            </Row>
            <Row icon={Hash} label="Tags" top>
              <TagsField task={task} />
            </Row>
            <Row icon={Briefcase} label="Client">
              <ClientField key={task.id} task={task} />
            </Row>
            {(settings.fields || []).map((f) => (
              <Row key={f.id} icon={ListPlus} label={f.name}>
                <FieldInput task={task} field={f} />
              </Row>
            ))}
            <FilesRow task={task} onChange={(files) => updateTask(task.id, { files })} />
            {calendarOn && task.date && <MeetRow task={task} onChange={(meet) => updateTask(task.id, { meet })} />}
            {otherWorkspaces.length > 0 && focus?.taskId !== task.id && (
              <Row icon={Layers} label="Workspace">
                <select className="input h-9 py-0 w-full" value="" aria-label="Move this task to another workspace"
                  onChange={(e) => { const w = otherWorkspaces.find((x) => x.id === e.target.value); if (w) moveToWorkspace(task.id, w) }}>
                  <option value="">Move to…</option>
                  {otherWorkspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Row>
            )}
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

          <SessionLog task={task} now={now} />

          {task.date && (
            <a href={googleCalendarUrl(task, categoryById(task.category)?.name)} target="_blank" rel="noopener noreferrer"
              className="mt-3 btn-ghost w-full h-9 py-0 text-xs">
              <CalendarPlus size={14} /> Add to Google Calendar
            </a>
          )}
          <div className="mt-3"><SaveAsTemplate task={task} /></div>
        </div>

        <footer className="px-4 sm:px-6 py-3 sm:py-4 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line flex items-center justify-between gap-3">
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 text-sm max-sm:w-full">
              <span className="font-semibold text-coral-fg max-sm:w-full">{task.recurrence ? 'Delete…' : 'Delete this task?'}</span>
              <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={() => setConfirm(false)}>Cancel</button>
              {task.recurrence ? (
                <>
                  <button type="button" className="btn-danger h-8 py-0 px-3" onClick={() => removeTask(task.id)}>This occurrence</button>
                  <button type="button" className="btn-danger h-8 py-0 px-3" onClick={() => removeSeries(task.seriesId)}>Whole series</button>
                </>
              ) : (
                <button type="button" className="btn-danger h-8 py-0 px-3" onClick={() => removeTask(task.id)}>Delete</button>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm(true)}
              className="max-sm:hidden inline-flex items-center gap-1.5 rounded-full bg-coral text-coral-fg px-3.5 h-9 text-sm font-semibold hover:opacity-90 transition">
              <Trash2 size={14} /> Delete
            </button>
          )}
          <div className={cx('flex items-center gap-2', !confirm && 'max-sm:flex-1')}>
            {!task.hold && !task.dropped && task.status !== 'completed' && !confirm && (
              <span className="max-sm:hidden contents">
                <button type="button" className="btn-ghost h-9 py-0 px-3" onClick={() => setPark('pause')} title="Stopped or blocked: take it off your plan, with a reason">Pause…</button>
                <button type="button" className="btn-ghost h-9 py-0 px-3" onClick={() => setPark('drop')} title="Let it go, with a reason (restorable for 30 days)">Drop…</button>
              </span>
            )}
            <button type="button" className="btn-black max-sm:flex-1 max-sm:h-12 max-sm:text-base" onClick={close}>Done</button>
          </div>
        </footer>
        {park && <ParkDialog task={task} mode={park} onClose={() => setPark(null)} />}
      </aside>
    </div>
  )
}

// Google Drive files linked to the task, chosen in Google's own picker (lib/picker.js). A name and a link are
// kept on the task; nothing is copied. The button needs the picker set up for this site; files already attached
// still show (and can be removed) without it.
function FilesRow({ task, onChange }) {
  const files = task.files || []
  const canPick = pickerAvailable()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!files.length && !canPick) return null
  const add = async () => {
    setError(''); setBusy(true)
    try {
      const picked = await pickDriveFiles()
      onChange(cleanFiles([...files, ...picked.filter((p) => !files.some((f) => f.id === p.id))]))
    } catch (e) { setError(e.message || 'Could not open Google Drive.') } finally { setBusy(false) }
  }
  return (
    <Row icon={Paperclip} label="Files" top>
      <div className="min-w-0 flex-1">
        {files.length > 0 && (
          <ul className="mb-2 space-y-1" aria-label="Attached files">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 min-w-0">
                {f.icon ? <img src={f.icon} alt="" width="16" height="16" className="shrink-0" /> : <Paperclip size={13} className="shrink-0 text-faint" aria-hidden="true" />}
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-semibold text-lav-fg hover:underline">{f.name}</a>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="ml-auto shrink-0 h-6 w-6 rounded-full inline-flex items-center justify-center text-faint hover:bg-subtle hover:text-ink"><X size={12} /></button>
              </li>
            ))}
          </ul>
        )}
        {canPick && files.length < MAX_FILES && <button type="button" className="btn-ghost h-8 py-0 px-3 text-xs" disabled={busy} onClick={add}>{busy ? 'Opening…' : 'Attach from Google Drive'}</button>}
        {error && <p role="alert" className="mt-1.5 text-[12px] font-semibold text-coral-fg">{error}</p>}
      </div>
    </Row>
  )
}

// A Google Meet link on the task's calendar event. Needs Calendar sync (Settings); the link is made the
// next time the sync runs, and stays on the event if this is switched off again.
function MeetRow({ task, onChange }) {
  const link = meetLinkFor(task.id)
  return (
    <Row icon={Video} label="Meet" top>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={task.meet ? 'on' : 'off'} onChange={(v) => onChange(v === 'on')} options={[{ value: 'off', label: 'No link' }, { value: 'on', label: 'Add Meet link' }]} />
        {task.meet && (link
          ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-lav-fg underline underline-offset-2">Join the meeting</a>
          : <span className="text-[12px] text-muted">Added to the calendar event in a moment.</span>)}
      </div>
    </Row>
  )
}

function Row({ icon: Icon, label, children, top, stack }) {
  return (
    <div className={cx(
      'flex py-3',
      // `stack`: on a narrow panel the control drops under its label rather than
      // being cut off by the panel's edge. The fixed label column is what costs
      // the room, so giving it its own line is enough.
      stack
        ? 'flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3'
        : cx('gap-3', top ? 'items-start' : 'items-center'),
    )}>
      <span className={cx('w-28 shrink-0 inline-flex items-center gap-2 text-xs font-semibold text-muted', top && 'pt-1')}>
        <Icon size={14} className="text-faint" /> {label}
      </span>
      <div className={cx('flex-1 min-w-0 max-w-full', stack && 'w-full sm:w-auto')}>{children}</div>
    </div>
  )
}

// Every logged stretch of time, editable: fix a timer left running, correct a
// start or end, or delete an entry. Times keep the entry's own day.
function SessionLog({ task, now }) {
  const { setSessions } = usePlanner()
  if (!task.sessions.length) return null
  const at = (iso, hhmm) => {
    const d = new Date(iso)
    const [h, m] = hhmm.split(':').map(Number)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  const edit = (i, patch) => {
    const next = task.sessions.map((s, k) => (k === i ? { ...s, ...patch } : s))
    const s = next[i]
    if (s.end && new Date(s.end) <= new Date(s.start)) return // end must come after start
    setSessions(task.id, next)
  }
  const rows = task.sessions.map((s, i) => ({ s, i })).reverse()
  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold text-muted mb-1.5">Time log <span className="text-faint font-medium">· fix a forgotten timer here</span></h3>
      <ul className="rounded-2xl border border-line divide-y divide-line">
        {rows.map(({ s, i }) => {
          const start = new Date(s.start)
          const end = s.end ? new Date(s.end) : now
          const mins = Math.max(0, Math.round((end - start) / 60000))
          return (
            <li key={`${s.start}-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="w-14 text-faint">{format(start, 'd MMM')}</span>
              <input type="time" aria-label="Start time" className="input w-[92px] py-1 px-2 text-xs" value={format(start, 'HH:mm')}
                onChange={(e) => e.target.value && edit(i, { start: at(s.start, e.target.value) })} />
              <span className="text-faint">–</span>
              {s.end ? (
                <input type="time" aria-label="End time" className="input w-[92px] py-1 px-2 text-xs" value={format(new Date(s.end), 'HH:mm')}
                  onChange={(e) => e.target.value && edit(i, { end: at(s.end, e.target.value) })} />
              ) : (
                <button type="button" className="pill bg-sky text-sky-fg" onClick={() => setSessions(task.id, task.sessions.map((x, k) => (k === i ? { ...x, end: new Date().toISOString() } : x)), 'Stopped the running timer')}>
                  Running · stop now
                </button>
              )}
              <span className="ml-auto font-semibold tabular-nums">{fmtMinutes(mins)}</span>
              <button type="button" aria-label="Delete this time entry" title="Delete this entry"
                onClick={() => setSessions(task.id, task.sessions.filter((_, k) => k !== i), 'Deleted a time entry')}
                className="h-6 w-6 rounded-full inline-flex items-center justify-center text-faint hover:text-coral-fg hover:bg-coral transition">
                <Trash2 size={12} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// A day that is worked out for you: plain text, not a field.
function AutoDay({ day, empty, note, title }) {
  return (
    <p className="text-sm font-semibold" title={title}>
      {day ? format(parseISO(day), 'EEE, d MMM yyyy') : <span className="font-medium text-faint">{empty}</span>}
      {note && <>{" "}<span className="text-xs font-medium text-faint">· {note}</span></>}
    </p>
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
