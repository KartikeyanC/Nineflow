import React, { useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { BookOpen, CalendarClock, Check, ChevronDown, ExternalLink, Eye, EyeOff, Flag, Newspaper, Plus, RotateCcw, Target, Trash2, TrendingDown, ArrowRight } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, fmtMinutes, totalMinutes } from '../lib/tasks'
import { CheckCircle, EmptyState, Modal, ProgressBar, Segmented, cx } from '../components/ui'
import { CA_CATEGORIES, CATEGORIES, EXAM_ID, EXAM_NAME, subjectById } from '../exams/ntpc/syllabus'
import { CHECKPOINTS, DEFAULT_INTERVALS, STATUSES, accuracy, examTasks, isWeak, planRevisions, practiceTotals, statusLabel, studyMinutes, summarize, topicCompletion, topicStatus } from '../exams/ntpc/calc'
import { DIFFICULTIES, PRACTICE_LEVELS, PRIORITY_LEVELS, topicsOf, useNtpc } from '../exams/ntpc/store'
import { PLAN_NAME, PLAN_ROWS, planTasks } from '../exams/ntpc/plan40'
import { rowId } from '../lib/taskImport'

// RRB NTPC study planner (Settings → Preferences → RRB NTPC). The syllabus comes from
// exams/ntpc/syllabus.js, the person's progress from exams/ntpc/store.js, and every study task is an
// ordinary planner task carrying `exam: { id, subject, topic, kind }`, so the timer, Board, reminders
// and carry-forward all work on it unchanged.

const KINDS = [
  { id: 'learn', label: 'Learn the concept' }, { id: 'notes', label: 'Notes and formulas' }, { id: 'practice', label: 'Practice' },
  { id: 'pyq', label: 'Previous year questions' }, { id: 'test', label: 'Topic-wise test' }, { id: 'revision', label: 'Revision' }, { id: 'reading', label: 'Reading' },
]
const kindLabel = (k) => KINDS.find((x) => x.id === k)?.label || 'Study'
const DURATIONS = [15, 30, 45, 60, 90, 120, 180]
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')
const STATUS_TONE = {
  'not-started': 'bg-page text-muted border border-line', progress: 'bg-sky text-sky-fg', revise: 'bg-coral text-coral-fg', done: 'bg-mint text-mint-fg', ongoing: 'bg-lav text-lav-fg',
}
const SUBJECT_BAR = { sky: 'bg-sky-fg', lav: 'bg-lav-fg', mint: 'bg-mint-fg' }

function StatusPill({ status, className }) {
  return <span className={cx('pill text-[11px] px-2 py-0.5 whitespace-nowrap', STATUS_TONE[status], className)}>{statusLabel(status)}</span>
}

const pct = (v) => `${Math.round((v || 0) * 100)}%`

export default function Ntpc() {
  const planner = usePlanner()
  const { allTasks, now, settings } = planner
  const { data, change, changeTopic } = useNtpc()
  const [tab, setTab] = useState('overview')
  const [openTopic, setOpenTopic] = useState(null)
  const [filters, setFilters] = useState({ subject: 'all', status: 'all', priority: 'all', difficulty: 'all', when: 'any' })
  const today = dateKey(now)

  const subjects = useMemo(() => topicsOf(data), [data])
  const allTopics = useMemo(() => subjects.flatMap((s) => s.topics), [subjects])
  const linkedAll = useMemo(() => examTasks(allTasks), [allTasks])
  const statusOf = (t) => topicStatus(t, data.topics[t.id], linkedAll.filter((x) => x.exam.topic === t.id), data.required, today)

  // The category new study tasks go into: the chosen one, else Learning, else the first.
  const taskCategory = settings.categories.some((c) => c.id === data.taskCategory) ? data.taskCategory
    : settings.categories.find((c) => c.id === 'learning')?.id || settings.categories[0]?.id

  const ctx = { data, change, changeTopic, statusOf, linkedAll, today, taskCategory, subjects, allTopics, setOpenTopic }
  const daysLeft = data.examDate ? differenceInCalendarDays(parseISO(data.examDate), now) : null

  return (
    <div className="animate-view-in max-w-5xl">
      <header className="mb-5 max-sm:mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Exams</p>
          <h1 className="h-display text-3xl max-sm:text-2xl">{EXAM_NAME}</h1>
          <p className="text-sm text-muted mt-0.5">
            {CATEGORIES.find((c) => c.id === data.category)?.label || 'Choose your level in Setup'}
            {daysLeft !== null && <> · <b className="text-ink tnum">{daysLeft >= 0 ? `${daysLeft} days to the exam` : 'Exam date passed'}</b></>}
          </p>
        </div>
        <div className="max-sm:w-full overflow-x-auto [scrollbar-width:none]">
          <Segmented size="sm" value={tab} onChange={setTab}
            options={[{ value: 'overview', label: 'Overview' }, { value: 'syllabus', label: 'Syllabus' }, { value: 'ca', label: 'Current affairs' }, { value: 'setup', label: 'Setup' }]} />
        </div>
      </header>

      {!data.category && tab !== 'setup' && <FirstRun change={change} />}
      {tab === 'overview' && <Overview ctx={ctx} planner={planner} goSyllabus={(f) => { setFilters((x) => ({ ...x, ...f })); setTab('syllabus') }} />}
      {tab === 'syllabus' && <Syllabus ctx={ctx} filters={filters} setFilters={setFilters} />}
      {tab === 'ca' && <CurrentAffairs ctx={ctx} planner={planner} />}
      {tab === 'setup' && <Setup ctx={ctx} planner={planner} />}

      {openTopic && <TopicSheet topicId={openTopic} ctx={ctx} planner={planner} onClose={() => setOpenTopic(null)} />}
    </div>
  )
}

function FirstRun({ change }) {
  return (
    <section className="card p-5 mb-4">
      <h2 className="h-display text-base">Which NTPC exam are you preparing for?</h2>
      <p className="text-sm text-muted mt-1 max-w-prose">The stages and pattern differ between the Graduate and Undergraduate levels and between notifications. Check the official RRB notice for yours; you can change this any time in Setup.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => <button key={c.id} type="button" className="btn-black" onClick={() => change(() => ({ category: c.id }))}>{c.label}</button>)}
      </div>
    </section>
  )
}

// ---- Overview --------------------------------------------------------------------------
function Overview({ ctx, planner, goSyllabus }) {
  const { data, allTopics, subjects, linkedAll, today, setOpenTopic } = ctx
  const { toggleComplete, setSelectedId, now } = planner
  const all = summarize(allTopics, data.topics, linkedAll, data.required, now)
  const bySubject = subjects.map((s) => ({ s, sum: summarize(s.topics, data.topics, linkedAll, data.required, now) }))
  const todays = linkedAll.filter((t) => t.date === today).sort((a, b) => (a.status === 'completed') - (b.status === 'completed'))
  const revisions = linkedAll.filter((t) => t.exam.kind === 'revision' && t.status !== 'completed' && t.date && t.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
  const topicName = (id) => allTopics.find((t) => t.id === id)?.name || 'Topic'

  return (
    <div className="grid gap-4">
      <PlanCard ctx={ctx} planner={planner} />
      <section className="card p-5 grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-center">
        <div>
          <p className="text-xs font-semibold text-muted">Syllabus completion</p>
          <p className="h-display text-4xl tnum mt-0.5">{pct(all.completion)}</p>
          <p className="text-xs text-faint mt-1 tnum">{all.finished} of {all.measured} topics completed · current affairs not counted</p>
        </div>
        <ul className="grid gap-3">
          {bySubject.map(({ s, sum }) => (
            <li key={s.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold truncate">{s.name}</span><span className="tnum text-muted shrink-0">{pct(sum.completion)} · {sum.finished}/{sum.measured}</span></div>
              <ProgressBar value={sum.completion} tone={SUBJECT_BAR[s.color]} className="mt-1.5" />
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {STATUSES.map((st) => (
          <button key={st.id} type="button" onClick={() => goSyllabus({ status: st.id, subject: 'all' })}
            className="card p-3.5 text-left hover:shadow-lift transition">
            <StatusPill status={st.id} />
            <p className="h-display text-2xl tnum mt-2">{all.counts[st.id]}</p>
            <p className="text-[11px] text-faint">topics · show them</p>
          </button>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="h-display text-base flex items-center gap-2"><Target size={16} /> Today's study tasks</h2>
          {todays.length === 0 ? <p className="text-sm text-muted mt-2">Nothing planned for today. Open a topic in Syllabus and add it to today.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {todays.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <CheckCircle checked={t.status === 'completed'} onToggle={() => toggleComplete(t.id)} size="sm" />
                  <button type="button" onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left">
                    <span className={cx('block text-sm font-semibold truncate', t.status === 'completed' && 'line-through text-muted')}>{t.title}</span>
                    <span className="block text-[11px] text-faint">{t.startTime ? `${t.startTime} · ` : ''}{subjectById(t.exam.subject)?.short || 'All subjects'} · {fmtMinutes(t.durationMinutes)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <h2 className="h-display text-base flex items-center gap-2"><RotateCcw size={16} /> Upcoming revisions</h2>
          {revisions.length === 0 ? <p className="text-sm text-muted mt-2">No revisions planned. Finish a topic and schedule its revisions from the topic.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {revisions.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpenTopic(t.exam.topic)} className="w-full flex items-center gap-3 py-2 text-left">
                    <span className="w-16 shrink-0 text-xs font-semibold tnum text-muted">{t.date === today ? 'Today' : format(parseISO(t.date), 'EEE d MMM')}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold truncate">{topicName(t.exam.topic)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="h-display text-base">Practice accuracy</h2>
          <p className="text-xs text-faint mt-0.5">Correct ÷ attempted. Unanswered questions are not counted as attempted.</p>
          <ul className="mt-3 grid gap-2.5">
            {[{ id: 'all', name: 'All subjects', sum: all }, ...bySubject.map(({ s, sum }) => ({ id: s.id, name: s.name, sum }))].map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cx('truncate', r.id === 'all' && 'font-semibold')}>{r.name}</span>
                <span className="tnum shrink-0">{r.sum.accuracy === null ? <span className="text-faint">No practice yet</span> : <><b>{r.sum.accuracy}%</b> <span className="text-faint">of {r.sum.attempted}</span></>}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="h-display text-base flex items-center gap-2"><TrendingDown size={16} /> Weak topics</h2>
          <p className="text-xs text-faint mt-0.5">Under 60% accuracy after at least 10 questions.</p>
          {all.weak.length === 0 ? <p className="text-sm text-muted mt-2">None so far.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {all.weak.slice(0, 8).map((w) => (
                <li key={w.topic.id}>
                  <button type="button" onClick={() => setOpenTopic(w.topic.id)} className="w-full flex items-center gap-3 py-2 text-left">
                    <span className="min-w-0 flex-1 text-sm font-semibold truncate">{w.topic.name}</span>
                    <span className="shrink-0 text-xs tnum text-coral-fg font-semibold">{w.accuracy}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

// ---- The 40-day plan (exams/ntpc/plan40.js) ------------------------------------------------
// One press adds the whole plan to the planner open now (account and workspace), from today on.
// Every task has a fixed id, so pressing again only adds what is missing; one Undo removes them.
function PlanCard({ ctx, planner }) {
  const { today, taskCategory } = ctx
  const { addTasks, removeTasks, allTasks, setView, setDashboardDate } = planner
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [alsoDone, setAlsoDone] = useState(false)
  // The plan's tasks in this planner, however they came: the Add button (ids ntpc-40-…), or the CSV
  // through Import tasks (ids made from each row, see lib/taskImport.js rowId). Matching on ids, not
  // dates, still finds a task that was carried over to a later day or renamed.
  const mine = useMemo(() => {
    const byRow = new Map()
    for (const r of PLAN_ROWS) { byRow.set(r.id, r); byRow.set(rowId(r.title, r.date, r.time), r) }
    const found = new Map() // row id -> task
    for (const t of allTasks) { const r = byRow.get(t.id); if (r && !t.dropped && !found.has(r.id)) found.set(r.id, t) }
    return found
  }, [allTasks])
  const inPlanner = PLAN_ROWS.filter((r) => mine.has(r.id))
  const done = inPlanner.filter((r) => mine.get(r.id).status === 'completed').length
  const toAdd = planTasks({ category: taskCategory, fromDate: today }).filter((t) => !mine.has(t.id))
  const skipped = PLAN_ROWS.filter((r) => r.date < today && !mine.has(r.id)).length
  const toRemove = inPlanner.map((r) => mine.get(r.id)).filter((t) => alsoDone || t.status !== 'completed')
  const remove = () => {
    removeTasks(toRemove.map((t) => t.id), `Removed the 40-day plan (${toRemove.length} tasks)`)
    setRemoving(false); setAlsoDone(false)
  }
  const first = PLAN_ROWS[0].date, last = PLAN_ROWS.at(-1).date
  if (today > last && !inPlanner.length) return null
  const nice = (k) => format(parseISO(k), 'EEE d MMM')
  const add = () => {
    addTasks(toAdd, `Added the 40-day plan (${toAdd.length} tasks)`)
    setConfirm(false)
    setDashboardDate(toAdd[0]?.date || today)
  }
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="h-display text-base flex items-center gap-2"><CalendarClock size={16} /> {PLAN_NAME}</h2>
          <p className="text-sm text-muted mt-1">{format(parseISO(first), 'd MMM')} to {format(parseISO(last), 'd MMM yyyy')} · mornings 5:00 to 7:30, evenings 8:00 to 9:30 · {PLAN_ROWS.length} tasks with times, sources and topics</p>
          {inPlanner.length > 0 && <p className="text-xs text-faint mt-1 tnum">{inPlanner.length} in your planner · {done} done</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {toAdd.length > 0
            ? <button type="button" className="btn-black" onClick={() => setConfirm(true)}><Plus size={14} /> {inPlanner.length ? `Add the missing ${toAdd.length}` : 'Add the 40-day plan'}</button>
            : <button type="button" className="btn-ghost" onClick={() => { setDashboardDate(today); setView('dashboard') }}>See today's plan</button>}
          {inPlanner.length > 0 && <button type="button" className="btn-ghost text-coral-fg" onClick={() => setRemoving(true)}><Trash2 size={14} /> Remove the plan</button>}
        </div>
      </div>
      {inPlanner.length > 0 && <ProgressBar value={done / PLAN_ROWS.length} tone="bg-mint-fg" className="mt-3" />}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Add the 40-day plan?">
        <p className="text-sm text-muted">
          {toAdd.length} tasks go into this planner, from {nice(toAdd[0]?.date || today)} to {nice(last)}, each at its time with its notes and syllabus topic.
          {skipped > 0 && ` The ${skipped} tasks for days already past are left out, so today isn't filled with overdue work.`}
          {' '}Your other tasks stay as they are, and Undo removes all of these at once.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
          <button type="button" className="btn-black" onClick={add}>Add {toAdd.length} tasks</button>
        </div>
      </Modal>
      <Modal open={removing} onClose={() => { setRemoving(false); setAlsoDone(false) }} title="Remove the 40-day plan?">
        <p className="text-sm text-muted">
          {toRemove.length} task{toRemove.length === 1 ? '' : 's'} of the plan will be deleted from this planner{done && !alsoDone ? `. The ${done} you finished stay, so your study history is kept` : ''}.
          {' '}Your other tasks, your RRB NTPC progress and your practice records are not touched. Undo, right after, brings the plan back.
        </p>
        {done > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={alsoDone} onChange={(e) => setAlsoDone(e.target.checked)} /> Also delete the {done} finished task{done === 1 ? '' : 's'}
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => { setRemoving(false); setAlsoDone(false) }}>Cancel</button>
          <button type="button" className="btn-danger" disabled={!toRemove.length} onClick={remove}>Remove {toRemove.length} task{toRemove.length === 1 ? '' : 's'}</button>
        </div>
      </Modal>
    </section>
  )
}

// ---- Syllabus ---------------------------------------------------------------------------
function Syllabus({ ctx, filters, setFilters }) {
  const { data, change, subjects, statusOf, linkedAll, today, setOpenTopic } = ctx
  const [closed, setClosed] = useState({})
  const [adding, setAdding] = useState(null) // subject id
  const [newName, setNewName] = useState('')
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target ? e.target.value : e }))
  const weekEnd = dateKey(addDays(parseISO(today), 6))
  const scheduled = (t) => linkedAll.filter((x) => x.exam.topic === t.id && x.status !== 'completed' && x.date)

  const match = (t) => {
    const st = data.topics[t.id] || {}
    const s = statusOf(t)
    if (filters.status !== 'all' && s !== filters.status) return false
    if (filters.priority !== 'all' && (st.priority || 'medium') !== filters.priority) return false
    if (filters.difficulty !== 'all' && st.difficulty !== filters.difficulty) return false
    const open = scheduled(t)
    if (filters.when === 'today' && !open.some((x) => x.date === today)) return false
    if (filters.when === 'week' && !open.some((x) => x.date >= today && x.date <= weekEnd)) return false
    if (filters.when === 'overdue' && !open.some((x) => x.date < today)) return false
    if (filters.when === 'none' && open.length) return false
    return true
  }
  const shown = subjects.filter((s) => filters.subject === 'all' || s.id === filters.subject).map((s) => ({ ...s, list: s.topics.filter(match) }))
  const anyFilter = filters.status !== 'all' || filters.priority !== 'all' || filters.difficulty !== 'all' || filters.when !== 'any'

  const addTopic = (subject) => {
    if (!newName.trim()) return
    change((d) => ({ custom: [...d.custom, { id: `${subject}:custom-${Date.now().toString(36)}`, subject, name: newName.trim() }] }))
    setNewName(''); setAdding(null)
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2.5">
        <div className="overflow-x-auto [scrollbar-width:none]">
          <Segmented size="sm" value={filters.subject} onChange={set('subject')}
            options={[{ value: 'all', label: 'All' }, ...subjects.map((s) => ({ value: s.id, label: s.short }))]} />
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <select className="input w-auto py-1.5 text-sm" aria-label="Status" value={filters.status} onChange={set('status')}>
            <option value="all">Any status</option>{[...STATUSES, { id: 'ongoing' }].map((s) => <option key={s.id} value={s.id}>{statusLabel(s.id)}</option>)}
          </select>
          <select className="input w-auto py-1.5 text-sm" aria-label="Priority" value={filters.priority} onChange={set('priority')}>
            <option value="all">Any priority</option>{PRIORITY_LEVELS.map((p) => <option key={p} value={p}>{cap(p)} priority</option>)}
          </select>
          <select className="input w-auto py-1.5 text-sm" aria-label="Difficulty" value={filters.difficulty} onChange={set('difficulty')}>
            <option value="all">Any difficulty</option>{DIFFICULTIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
          </select>
          <select className="input w-auto py-1.5 text-sm" aria-label="Scheduled" value={filters.when} onChange={set('when')}>
            <option value="any">Any schedule</option><option value="today">Planned today</option><option value="week">Planned this week</option><option value="overdue">Overdue tasks</option><option value="none">Nothing planned</option>
          </select>
          {anyFilter && <button type="button" className="btn-ghost h-9 py-0 text-sm" onClick={() => setFilters((f) => ({ ...f, status: 'all', priority: 'all', difficulty: 'all', when: 'any' }))}>Clear filters</button>}
        </div>
      </div>

      {shown.map((s) => {
        const sum = summarize(s.topics, data.topics, linkedAll, data.required)
        const isClosed = closed[s.id]
        return (
          <section key={s.id} className="card overflow-hidden">
            <button type="button" onClick={() => setClosed((c) => ({ ...c, [s.id]: !c[s.id] }))} aria-expanded={!isClosed}
              className="w-full p-4 flex items-center gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2"><span className="h-display text-base truncate">{s.name}</span><span className="text-xs tnum text-muted shrink-0">{pct(sum.completion)} · {s.list.length} shown</span></span>
                <ProgressBar value={sum.completion} tone={SUBJECT_BAR[s.color]} className="mt-2" />
              </span>
              <ChevronDown size={18} className={cx('text-faint shrink-0 transition-transform', isClosed && '-rotate-90')} />
            </button>
            {!isClosed && (
              <div className="border-t border-line">
                {s.list.length === 0 && <p className="px-4 py-3 text-sm text-muted">No topics match these filters.</p>}
                <ul className="divide-y divide-line">
                  {s.list.map((t) => {
                    const st = data.topics[t.id] || {}
                    const status = statusOf(t)
                    const c = topicCompletion(t, st, data.required)
                    const next = scheduled(t).sort((a, b) => a.date.localeCompare(b.date))[0]
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => setOpenTopic(t.id)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-page transition">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{t.name}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                              <StatusPill status={status} />
                              {c !== null && <span className="tnum">{Math.round(c * data.required.length)}/{data.required.length} steps</span>}
                              {st.priority && st.priority !== 'medium' && <span className={st.priority === 'high' ? 'text-coral-fg font-semibold' : ''}>{cap(st.priority)} priority</span>}
                              {st.difficulty && <span>{cap(st.difficulty)}</span>}
                              {next && <span className={next.date < today ? 'text-coral-fg font-semibold' : ''}>{next.date < today ? 'Overdue task' : `Next: ${next.date === today ? 'today' : format(parseISO(next.date), 'd MMM')}`}</span>}
                            </span>
                          </span>
                          <ArrowRight size={15} className="text-faint shrink-0" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <div className="px-4 py-3 border-t border-line">
                  {adding === s.id ? (
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addTopic(s.id) }}>
                      <input autoFocus className="input flex-1 min-w-0" placeholder="Topic name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} aria-label="New topic name" />
                      <button type="submit" className="btn-black" disabled={!newName.trim()}>Add</button>
                      <button type="button" className="btn-ghost" onClick={() => { setAdding(null); setNewName('') }}>Cancel</button>
                    </form>
                  ) : (
                    <button type="button" className="text-sm font-semibold text-lav-fg inline-flex items-center gap-1.5" onClick={() => setAdding(s.id)}><Plus size={14} /> Add a topic to {s.short}</button>
                  )}
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ---- One topic --------------------------------------------------------------------------
function TopicSheet({ topicId, ctx, planner, onClose }) {
  const { data, change, changeTopic, statusOf, linkedAll, today, taskCategory, allTopics } = ctx
  const { addTask, addTasks, toggleComplete, updateTask, setSelectedId, allTasks, now } = planner
  const topic = allTopics.find((t) => t.id === topicId) || ctx.subjects.flatMap((s) => s.topics).find((t) => t.id === topicId)
  const st = data.topics[topicId] || { checks: {}, practice: [] }
  const linked = linkedAll.filter((t) => t.exam.topic === topicId).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const [plan, setPlan] = useState({ kind: 'learn', date: today, minutes: 60, priority: st.priority || 'medium', deadline: '', notes: '' })
  const [practice, setPractice] = useState({ date: today, attempted: '', correct: '', incorrect: '', unanswered: '', minutes: '', level: 'basic', score: '', mistakes: '' })
  const [msg, setMsg] = useState('')
  if (!topic) return null
  const status = statusOf(topic)
  const totals = practiceTotals(st.practice)
  const subject = subjectById(topic.subject)

  const link = (kind, deadline = null) => ({ id: EXAM_ID, subject: topic.subject, topic: topic.id, kind, deadline })
  const baseTask = (kind) => ({ category: taskCategory, tags: ['ntpc', topic.subject], priority: st.priority || 'medium' })

  const scheduleRevisions = (from = today) => {
    const made = planRevisions({ topicId: topic.id, from, intervals: data.revision.intervals, minutes: data.revision.minutes, dailyMinutes: data.dailyMinutes, tasks: allTasks })
    if (!made.length) { setMsg('Its revisions are already planned.'); return }
    addTasks(made.map((r) => ({ ...baseTask('revision'), id: r.id, title: `Revision ${r.n}: ${topic.name}`, date: r.date, durationMinutes: data.revision.minutes, exam: link('revision') })),
      `Planned ${made.length} revision${made.length === 1 ? '' : 's'} for ${topic.name}`)
    setMsg(`Planned ${made.length} revision${made.length === 1 ? '' : 's'}: ${made.map((r) => format(parseISO(r.date), 'd MMM')).join(', ')}.`)
  }

  const toggleCheck = (id) => {
    const next = { ...st.checks, [id]: !st.checks?.[id] }
    if (!next[id]) delete next[id]
    changeTopic(topic.id, () => ({ checks: next }))
    const nowDone = data.required.length && data.required.every((c) => next[c])
    const wasDone = data.required.length && data.required.every((c) => st.checks?.[c])
    // Revisions are created automatically only when the person turned that on in Setup.
    if (nowDone && !wasDone && data.revision.auto && !topic.recurring) scheduleRevisions()
  }

  const addPlanned = (date = plan.date) => {
    addTask({ ...baseTask(plan.kind), title: `${kindLabel(plan.kind)}: ${topic.name}`, date, durationMinutes: Number(plan.minutes), priority: plan.priority, description: plan.notes.trim(), exam: link(plan.kind, plan.deadline || null) })
    setMsg(`Added to ${date === today ? 'today' : format(parseISO(date), 'EEE d MMM')}.`)
    setPlan((p) => ({ ...p, notes: '', deadline: '' }))
  }

  const n = (v) => (v === '' ? 0 : Math.max(0, Number(v) || 0))
  const att = n(practice.attempted), cor = n(practice.correct)
  const inc = practice.incorrect === '' ? Math.max(0, att - cor) : n(practice.incorrect)
  const practiceError = cor > att ? 'Correct answers cannot be more than attempted.' : cor + inc > att ? 'Correct plus incorrect cannot be more than attempted.' : ''
  const savePractice = (e) => {
    e.preventDefault()
    if (practiceError || (!att && !n(practice.minutes))) return
    const entry = { id: `p${Date.now().toString(36)}`, date: practice.date || today, attempted: att, correct: cor, incorrect: inc, unanswered: n(practice.unanswered), minutes: n(practice.minutes), level: practice.level, score: practice.score.trim(), mistakes: practice.mistakes.trim() }
    changeTopic(topic.id, (cur) => ({ practice: [...cur.practice, entry] }))
    setPractice((p) => ({ ...p, attempted: '', correct: '', incorrect: '', unanswered: '', minutes: '', score: '', mistakes: '' }))
    const tot = practiceTotals([...(st.practice || []), entry])
    setMsg(isWeak(tot) ? `Saved. Accuracy is ${tot.accuracy}%, so this topic is marked for revision.` : 'Practice saved.')
  }

  return (
    <Modal open onClose={onClose} width="max-w-2xl" title={topic.name}>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2 -mt-1 text-xs text-muted">
          <StatusPill status={status} />
          <span>{subject?.name}</span>
          <span className="tnum">· {fmtMinutes(studyMinutes(st, linked, now))} studied</span>
        </div>
        {msg && <p role="status" className="rounded-xl bg-mint/60 text-mint-fg px-3 py-2 text-[13px] font-semibold">{msg}</p>}

        {!topic.recurring && (
          <section>
            <h3 className="text-sm font-bold">Checkpoints</h3>
            <p className="text-xs text-faint mt-0.5">Tick each one when it's done. Starred ones count towards Completed (change that in Setup).</p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CHECKPOINTS.map((c) => {
                const on = !!st.checks?.[c.id]
                return (
                  <button key={c.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggleCheck(c.id)}
                    className={cx('rounded-xl border px-2.5 py-2 text-left text-[12px] font-semibold flex items-start gap-2 transition', on ? 'bg-mint border-transparent text-mint-fg' : 'border-line text-muted hover:text-ink')}>
                    <span className={cx('mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center', on ? 'bg-mint-fg border-mint-fg text-white' : 'border-line')}>{on && <Check size={10} strokeWidth={4} />}</span>
                    <span>{c.label}{data.required.includes(c.id) && <span aria-label=" (counts towards Completed)"> *</span>}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section className="grid sm:grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-semibold text-muted">Priority
            <Segmented size="sm" value={st.priority || 'medium'} onChange={(v) => changeTopic(topic.id, () => ({ priority: v }))} options={PRIORITY_LEVELS.map((p) => ({ value: p, label: cap(p) }))} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">Difficulty
            <Segmented size="sm" value={st.difficulty || ''} onChange={(v) => changeTopic(topic.id, () => ({ difficulty: v }))} options={DIFFICULTIES.map((p) => ({ value: p, label: cap(p) }))} />
          </label>
        </section>

        <section className="rounded-2xl border border-line p-3.5">
          <h3 className="text-sm font-bold flex items-center gap-2"><CalendarClock size={15} /> Plan a study task</h3>
          <p className="text-xs text-faint mt-0.5">It goes into your planner like any task: timer, reminders and moving unfinished work all work as usual.</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Type
              <select className="input py-1.5 text-sm" value={plan.kind} onChange={(e) => setPlan((p) => ({ ...p, kind: e.target.value }))}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Day
              <input type="date" className="input py-1.5 text-sm" value={plan.date} min={today} onChange={(e) => setPlan((p) => ({ ...p, date: e.target.value || today }))} />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Time needed
              <select className="input py-1.5 text-sm" value={plan.minutes} onChange={(e) => setPlan((p) => ({ ...p, minutes: e.target.value }))}>{DURATIONS.map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}</select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Priority
              <select className="input py-1.5 text-sm" value={plan.priority} onChange={(e) => setPlan((p) => ({ ...p, priority: e.target.value }))}>{PRIORITY_LEVELS.map((p) => <option key={p} value={p}>{cap(p)}</option>)}</select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Deadline (optional)
              <input type="date" className="input py-1.5 text-sm" value={plan.deadline} min={plan.date} onChange={(e) => setPlan((p) => ({ ...p, deadline: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted col-span-2 sm:col-span-1">Notes
              <input className="input py-1.5 text-sm" value={plan.notes} maxLength={500} placeholder="Chapter, book, video…" onChange={(e) => setPlan((p) => ({ ...p, notes: e.target.value }))} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-black" onClick={() => addPlanned(today)}><Plus size={14} /> Add to today</button>
            {plan.date !== today && <button type="button" className="btn-ghost" onClick={() => addPlanned()}>Add on {format(parseISO(plan.date), 'EEE d MMM')}</button>}
            {!topic.recurring && <button type="button" className="btn-ghost" onClick={() => scheduleRevisions()}><RotateCcw size={14} /> Plan revisions ({data.revision.intervals.join(', ')} days)</button>}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold">Tasks for this topic</h3>
          {linked.length === 0 ? <p className="text-sm text-muted mt-1">None yet.</p> : (
            <ul className="mt-1.5 divide-y divide-line">
              {linked.map((t) => {
                const open = t.status !== 'completed'
                const late = open && t.date && t.date < today
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                    <CheckCircle checked={!open} onToggle={() => toggleComplete(t.id)} size="sm" />
                    <button type="button" onClick={() => { setSelectedId(t.id); onClose() }} className="min-w-0 flex-1 text-left">
                      <span className={cx('block text-sm font-semibold truncate', !open && 'line-through text-muted')}>{t.title}</span>
                      <span className={cx('block text-[11px] tnum', late ? 'text-coral-fg font-semibold' : 'text-faint')}>
                        {t.date ? (t.date === today ? 'Today' : format(parseISO(t.date), 'EEE d MMM')) : 'No day'} · {fmtMinutes(t.durationMinutes)} planned · {fmtMinutes(totalMinutes(t, now))} logged{t.exam.deadline ? ` · due ${format(parseISO(t.exam.deadline), 'd MMM')}` : ''}
                      </span>
                    </button>
                    {open && t.date && t.date <= today && (
                      <button type="button" className="btn-ghost h-8 py-0 text-xs" onClick={() => updateTask(t.id, { date: dateKey(addDays(parseISO(today), 1)) })}>Move to tomorrow</button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line p-3.5">
          <h3 className="text-sm font-bold">Practice</h3>
          <p className="text-xs text-faint mt-0.5 tnum">
            {totals.attempted ? <>Accuracy <b className={cx(isWeak(totals) ? 'text-coral-fg' : 'text-ink')}>{totals.accuracy}%</b> · {totals.correct} right of {totals.attempted} attempted · {totals.unanswered} unanswered · {fmtMinutes(totals.minutes)}</> : 'Record each practice session or test.'}
          </p>
          <form onSubmit={savePractice} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['attempted', 'Attempted'], ['correct', 'Correct'], ['incorrect', 'Incorrect'], ['unanswered', 'Unanswered'], ['minutes', 'Minutes']].map(([k, label]) => (
              <label key={k} className="grid gap-1 text-[11px] font-semibold text-muted">{label}
                <input type="number" inputMode="numeric" min={0} className="input py-1.5 text-sm tnum" value={practice[k]}
                  placeholder={k === 'incorrect' && att ? String(Math.max(0, att - cor)) : ''} onChange={(e) => setPractice((p) => ({ ...p, [k]: e.target.value }))} />
              </label>
            ))}
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Level
              <select className="input py-1.5 text-sm" value={practice.level} onChange={(e) => setPractice((p) => ({ ...p, level: e.target.value }))}>{PRACTICE_LEVELS.map((l) => <option key={l} value={l}>{cap(l)}</option>)}</select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Date
              <input type="date" className="input py-1.5 text-sm" value={practice.date} max={today} onChange={(e) => setPractice((p) => ({ ...p, date: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted">Test score
              <input className="input py-1.5 text-sm" value={practice.score} maxLength={40} placeholder="e.g. 18/25" onChange={(e) => setPractice((p) => ({ ...p, score: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted col-span-2 sm:col-span-4">Mistakes to remember
              <input className="input py-1.5 text-sm" value={practice.mistakes} maxLength={2000} onChange={(e) => setPractice((p) => ({ ...p, mistakes: e.target.value }))} />
            </label>
            {att > 0 && <p className={cx('col-span-2 sm:col-span-4 text-xs tnum', practiceError ? 'text-coral-fg font-semibold' : 'text-muted')}>{practiceError || `This session: ${accuracy(cor, att)}% accuracy`}</p>}
            <div className="col-span-2 sm:col-span-4"><button type="submit" className="btn-black" disabled={!!practiceError || (!att && !n(practice.minutes))}>Save practice</button></div>
          </form>
          {(st.practice || []).length > 0 && (
            <ul className="mt-3 divide-y divide-line text-[13px]">
              {[...st.practice].reverse().slice(0, 12).map((p) => (
                <li key={p.id} className="py-2 flex items-start gap-3">
                  <span className="w-14 shrink-0 text-xs text-faint tnum">{p.date ? format(parseISO(p.date), 'd MMM') : '—'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="tnum"><b>{accuracy(p.correct, p.attempted) ?? '—'}{p.attempted ? '%' : ''}</b> · {p.correct}/{p.attempted}{p.unanswered ? ` · ${p.unanswered} unanswered` : ''}{p.minutes ? ` · ${fmtMinutes(p.minutes)}` : ''}{p.level ? ` · ${cap(p.level)}` : ''}{p.score ? ` · score ${p.score}` : ''}</span>
                    {p.mistakes && <span className="block text-xs text-muted">{p.mistakes}</span>}
                  </span>
                  <button type="button" aria-label="Delete this practice entry" className="h-7 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-faint hover:text-coral-fg hover:bg-coral/60"
                    onClick={() => changeTopic(topic.id, (cur) => ({ practice: cur.practice.filter((x) => x.id !== p.id) }))}><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <label htmlFor="ntpc-topic-notes" className="text-sm font-bold">Notes and formulas</label>
          <textarea id="ntpc-topic-notes" className="input mt-1.5 min-h-[96px] resize-y" defaultValue={st.notes || ''} maxLength={5000}
            onBlur={(e) => { if (e.target.value !== (st.notes || '')) changeTopic(topic.id, () => ({ notes: e.target.value })) }} />
        </section>

        <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
          {!topic.recurring && (
            <button type="button" className="btn-ghost text-sm" onClick={() => changeTopic(topic.id, (cur) => ({ flag: cur.flag === 'revise' ? null : 'revise' }))}>
              <Flag size={14} /> {st.flag === 'revise' ? 'Remove the revision mark' : 'Mark as needs revision'}
            </button>
          )}
          <button type="button" className="btn-ghost text-sm" onClick={() => { changeTopic(topic.id, () => ({ hidden: true })); onClose() }}><EyeOff size={14} /> Hide this topic</button>
          {topic.custom && (
            <button type="button" className="btn-ghost text-sm text-coral-fg" onClick={() => { change((d) => ({ custom: d.custom.filter((c) => c.id !== topic.id) })); onClose() }}><Trash2 size={14} /> Remove my topic</button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ---- Current affairs --------------------------------------------------------------------
const DAILY_ID = 'ntpc-ca-daily'
const MONTHLY_ID = 'ntpc-ca-monthly'

function CurrentAffairs({ ctx, planner }) {
  const { data, change, today, taskCategory } = ctx
  const { addTask, allTasks } = planner
  const thisMonth = today.slice(0, 7)
  const months = [...new Set([thisMonth, ...data.ca.map((r) => r.date.slice(0, 7))])].sort().reverse()
  const [month, setMonth] = useState(thisMonth)
  const [cat, setCat] = useState('all')
  const [form, setForm] = useState({ date: today, category: CA_CATEGORIES[0], headline: '', url: '', notes: '' })
  const [err, setErr] = useState('')
  const has = (id) => allTasks.some((t) => (t.id === id || t.seriesId === id) && !t.dropped)
  const series = (id, freq, title, minutes, kind) => {
    if (has(id)) return
    addTask({ id, title, date: today, durationMinutes: minutes, category: taskCategory, priority: 'medium', tags: ['ntpc', 'current-affairs'],
      recurrence: { freq, until: null, skip: [] }, exam: { id: EXAM_ID, subject: 'ga', topic: 'ga:national-current-affairs', kind } })
  }

  const add = (e) => {
    e.preventDefault()
    if (!form.headline.trim()) return
    if (form.url && !/^https?:\/\//i.test(form.url.trim())) { setErr('The source link must start with http:// or https://'); return }
    setErr('')
    change((d) => ({ ca: [...d.ca, { id: `ca${Date.now().toString(36)}`, date: form.date || today, category: form.category, headline: form.headline.trim(), url: form.url.trim(), notes: form.notes.trim(), revised: false, quiz: 'none' }] }))
    setForm((f) => ({ ...f, headline: '', url: '', notes: '' }))
    setMonth((form.date || today).slice(0, 7))
  }
  const patch = (id, p) => change((d) => ({ ca: d.ca.map((r) => (r.id === id ? { ...r, ...p } : r)) }))
  const rows = data.ca.filter((r) => r.date.startsWith(month) && (cat === 'all' || r.category === cat)).sort((a, b) => b.date.localeCompare(a.date))
  const monthAll = data.ca.filter((r) => r.date.startsWith(month))
  const mState = data.caMonths[month] || {}
  const byDay = rows.reduce((m, r) => { (m[r.date] ||= []).push(r); return m }, {})

  return (
    <div className="grid gap-4">
      <section className="card p-4 grid gap-3">
        <p className="text-sm text-muted max-w-prose">Add each news item yourself with its date and source. NineFlow doesn't fetch or write news, so what you see here is only what you saved.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" disabled={has(DAILY_ID)} onClick={() => series(DAILY_ID, 'daily', 'Read current affairs', 30, 'reading')}>
            <Newspaper size={14} /> {has(DAILY_ID) ? 'Daily reading task is on' : 'Add a daily reading task'}
          </button>
          <button type="button" className="btn-ghost" disabled={has(MONTHLY_ID)} onClick={() => series(MONTHLY_ID, 'monthly', 'Revise this month’s current affairs', 60, 'revision')}>
            <RotateCcw size={14} /> {has(MONTHLY_ID) ? 'Monthly revision task is on' : 'Add a monthly revision task'}
          </button>
        </div>
      </section>

      <form onSubmit={add} className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <h2 className="h-display text-base col-span-2 sm:col-span-4">Add a news item</h2>
        <label className="grid gap-1 text-[11px] font-semibold text-muted">Date
          <input type="date" className="input py-1.5 text-sm" value={form.date} max={today} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-muted">Category
          <select className="input py-1.5 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-muted col-span-2">Headline or topic
          <input className="input py-1.5 text-sm" value={form.headline} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} />
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-muted col-span-2">Source link
          <input type="url" className="input py-1.5 text-sm" value={form.url} maxLength={1000} placeholder="https://" onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
        </label>
        <label className="grid gap-1 text-[11px] font-semibold text-muted col-span-2">Notes
          <input className="input py-1.5 text-sm" value={form.notes} maxLength={3000} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </label>
        {err && <p role="alert" className="col-span-2 sm:col-span-4 text-xs font-semibold text-coral-fg">{err}</p>}
        <div className="col-span-2 sm:col-span-4"><button type="submit" className="btn-black" disabled={!form.headline.trim()}><Plus size={14} /> Save news item</button></div>
      </form>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5 text-sm" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{format(parseISO(`${m}-01`), 'MMMM yyyy')}</option>)}
          </select>
          <select className="input w-auto py-1.5 text-sm" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All categories</option>{CA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <span className="text-xs text-faint tnum">{monthAll.length} saved · {monthAll.filter((r) => r.revised).length} revised · {monthAll.filter((r) => r.quiz === 'done').length} quizzed</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[['revised', 'Month revised'], ['quiz', 'Monthly quiz done']].map(([k, label]) => (
            <button key={k} type="button" role="checkbox" aria-checked={!!mState[k]}
              onClick={() => change((d) => ({ caMonths: { ...d.caMonths, [month]: { ...(d.caMonths[month] || {}), [k]: !mState[k] } } }))}
              className={cx('pill h-8 px-3 text-xs border transition', mState[k] ? 'bg-mint text-mint-fg border-transparent' : 'border-line text-muted')}>
              {mState[k] && <Check size={12} strokeWidth={3} />} {label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? <div className="mt-4"><EmptyState icon={Newspaper} title={`Nothing saved for ${format(parseISO(`${month}-01`), 'MMMM')}`} hint="Add news as you read it, with its source." /></div> : (
          <div className="mt-4 grid gap-4">
            {Object.entries(byDay).map(([day, list]) => (
              <div key={day}>
                <p className="text-xs font-bold text-muted">{format(parseISO(day), 'EEEE d MMMM yyyy')}</p>
                <ul className="mt-1.5 divide-y divide-line">
                  {list.map((r) => (
                    <li key={r.id} className="py-2.5 grid gap-1.5">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{r.headline}</span>
                          <span className="block text-[11px] text-faint">{r.category}</span>
                          {r.notes && <span className="block text-[13px] text-muted mt-0.5">{r.notes}</span>}
                        </span>
                        <button type="button" aria-label="Delete this news item" className="h-7 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-faint hover:text-coral-fg hover:bg-coral/60"
                          onClick={() => change((d) => ({ ca: d.ca.filter((x) => x.id !== r.id) }))}><Trash2 size={13} /></button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-lav-fg inline-flex items-center gap-1 max-w-full truncate"><ExternalLink size={12} /> Source</a>}
                        <button type="button" role="checkbox" aria-checked={r.revised} onClick={() => patch(r.id, { revised: !r.revised })}
                          className={cx('pill h-7 px-2.5 text-[11px] border', r.revised ? 'bg-mint text-mint-fg border-transparent' : 'border-line text-muted')}>{r.revised ? 'Revised' : 'Not revised'}</button>
                        <button type="button" role="checkbox" aria-checked={r.quiz === 'done'} onClick={() => patch(r.id, { quiz: r.quiz === 'done' ? 'none' : 'done' })}
                          className={cx('pill h-7 px-2.5 text-[11px] border', r.quiz === 'done' ? 'bg-mint text-mint-fg border-transparent' : 'border-line text-muted')}>{r.quiz === 'done' ? 'Quiz done' : 'No quiz yet'}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---- Setup ------------------------------------------------------------------------------
function Row({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6">
      <div><p className="text-sm font-semibold">{label}</p>{hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}</div>
      {children}
    </div>
  )
}

function Setup({ ctx, planner }) {
  const { data, change, changeTopic, taskCategory } = ctx
  const { settings } = planner
  const hidden = topicsOf(data, { withHidden: true }).flatMap((s) => s.topics).filter((t) => data.topics[t.id]?.hidden)
  const [intervals, setIntervals] = useState(data.revision.intervals.join(', '))
  const parsed = intervals.split(/[\s,]+/).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 365)
  return (
    <div className="grid gap-4 max-w-3xl">
      <section className="card p-5 grid gap-5">
        <Row label="Exam level" hint="Patterns differ by level and notification; check the official RRB notice.">
          <Segmented size="sm" value={data.category || ''} onChange={(v) => change(() => ({ category: v }))} options={CATEGORIES.map((c) => ({ value: c.id, label: c.label.replace('NTPC ', '') }))} />
        </Row>
        <Row label="Exam date" hint="Optional. Shows the days left.">
          <input type="date" className="input w-auto py-1.5" value={data.examDate || ''} onChange={(e) => change(() => ({ examDate: e.target.value || null }))} />
        </Row>
        <Row label="Daily study time" hint="Planned revisions don't go over this on any day.">
          <select className="input w-auto py-1.5" value={data.dailyMinutes} onChange={(e) => change(() => ({ dailyMinutes: Number(e.target.value) }))}>
            {[60, 90, 120, 180, 240, 300, 360, 480, 600].map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
          </select>
        </Row>
        <Row label="Category for study tasks" hint="Which planner category NTPC tasks go into.">
          <select className="input w-auto py-1.5" value={taskCategory} onChange={(e) => change(() => ({ taskCategory: e.target.value }))}>
            {settings.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Row>
      </section>

      <section className="card p-5">
        <h2 className="h-display text-base">What counts as Completed</h2>
        <p className="text-sm text-muted mt-1">A topic is Completed when every checkpoint ticked here is done. Pick at least one.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHECKPOINTS.map((c) => {
            const on = data.required.includes(c.id)
            return (
              <button key={c.id} type="button" role="checkbox" aria-checked={on} disabled={on && data.required.length === 1}
                onClick={() => change((d) => ({ required: on ? d.required.filter((x) => x !== c.id) : [...d.required, c.id] }))}
                className={cx('pill h-8 px-3 text-xs border transition', on ? 'bg-ink text-page border-transparent' : 'border-line text-muted hover:text-ink')}>
                {on && <Check size={12} strokeWidth={3} />} {c.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="card p-5 grid gap-4">
        <h2 className="h-display text-base">Revisions</h2>
        <Row label="Plan revisions automatically" hint="When a topic is completed, add its revision tasks. Off: use “Plan revisions” on the topic.">
          <Segmented size="sm" value={data.revision.auto ? 'on' : 'off'} onChange={(v) => change((d) => ({ revision: { ...d.revision, auto: v === 'on' } }))} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
        </Row>
        <Row label="Days after finishing" hint={`Default ${DEFAULT_INTERVALS.join(', ')}.`}>
          <div className="flex items-center gap-2">
            <input className="input w-44 py-1.5 tnum" value={intervals} onChange={(e) => setIntervals(e.target.value)} aria-label="Revision days"
              onBlur={() => { if (parsed.length) change((d) => ({ revision: { ...d.revision, intervals: parsed.slice(0, 8) } })) }} />
          </div>
        </Row>
        <Row label="Time per revision">
          <select className="input w-auto py-1.5" value={data.revision.minutes} onChange={(e) => change((d) => ({ revision: { ...d.revision, minutes: Number(e.target.value) } }))}>
            {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
          </select>
        </Row>
      </section>

      <section className="card p-5">
        <h2 className="h-display text-base flex items-center gap-2"><BookOpen size={16} /> Hidden topics</h2>
        {hidden.length === 0 ? <p className="text-sm text-muted mt-1">None. Hide a topic from its details if it isn't in your exam.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {hidden.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm truncate">{t.name}</span>
                <button type="button" className="btn-ghost h-8 py-0 text-xs" onClick={() => changeTopic(t.id, () => ({ hidden: false }))}><Eye size={13} /> Show</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
