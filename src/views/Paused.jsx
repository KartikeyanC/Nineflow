import React, { useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import { PauseCircle, Play, RotateCcw, Scissors, Sun, Trash2, TrendingDown, XCircle, ListChecks } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { DROP_KEEP_DAYS, SLIP_DAYS, dateKey, fmtMinutes, slipping } from '../lib/tasks'
import { CategoryTag, EmptyState, cx } from '../components/ui'
import ParkDialog from '../components/ParkDialog'

// Tasks that stopped: ones that keep slipping (found automatically), ones you paused on
// purpose, and ones you let go (kept DROP_KEEP_DAYS days). Paused and dropped tasks are off
// every plan, list, board and reminder until resumed or restored. See lib/tasks.js isParked.
export default function Paused() {
  const { tasks, allTasks, now, categoryById, setSelectedId, moveTasksTo, updateTask, resumeTask, restoreTask, removeTask } = usePlanner()
  const [park, setPark] = useState(null) // { task, mode }
  const today = dateKey(now)

  const slips = useMemo(() => slipping(tasks, now), [tasks, now])
  const held = useMemo(() => allTasks.filter((t) => t.hold && !t.dropped).sort((a, b) => (a.hold.until || '9999').localeCompare(b.hold.until || '9999')), [allTasks])
  const dropped = useMemo(() => allTasks.filter((t) => t.dropped).sort((a, b) => b.dropped.at.localeCompare(a.dropped.at)), [allTasks])

  const ago = (iso) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : '')
  const Btn = ({ icon: Icon, children, onClick, tone, title }) => (
    <button type="button" onClick={onClick} title={title}
      className={cx('inline-flex items-center gap-1 h-7 rounded-full px-2.5 text-[12px] font-semibold border transition',
        tone === 'danger' ? 'border-line text-coral-fg hover:bg-coral' : 'border-line text-muted hover:text-ink hover:bg-page')}>
      {Icon && <Icon size={12} />}{children}
    </button>
  )
  const Row = ({ t, meta, children }) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 rounded-xl hover:bg-page transition">
      <button type="button" onClick={() => setSelectedId(t.id)} className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold truncate">{t.title || 'Untitled'}</span>
        <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <CategoryTag category={categoryById(t.category)} className="text-[10px] py-0" />
          <span className="text-[11px] text-faint">{meta}</span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </li>
  )
  const Section = ({ icon: Icon, tone, title, hint, count, children }) => (
    <section className="card p-4">
      <header className="flex items-start gap-3 mb-2">
        <span className={cx('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', tone)}><Icon size={16} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold">{title} <span className="ml-1 text-faint font-semibold text-[13px] tnum">{count}</span></h2>
          <p className="text-[12px] text-muted">{hint}</p>
        </div>
      </header>
      {children}
    </section>
  )

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="h-display text-3xl">Paused</h1>
        <p className="text-sm text-muted mt-1">Tasks that stopped. Decide what each one needs: a smaller first step, a pause with a reason, or letting it go.</p>
      </header>

      <Section icon={TrendingDown} tone="bg-peach text-peach-fg" title="Keeps slipping" count={slips.length}
        hint={`Still not started ${SLIP_DAYS} or more days after it was first planned. Usually it's too big, unclear, or not really wanted.`}>
        {slips.length === 0 ? <p className="text-sm text-faint px-3 py-2">Nothing is slipping. Nice.</p> : (
          <ul>
            {slips.map(({ task: t, days }) => (
              <Row key={t.id} t={t} meta={`planned ${days} days ago · ${fmtMinutes(t.durationMinutes)}${t.priority === 'high' ? ' · high priority' : ''}`}>
                <Btn icon={Sun} onClick={() => moveTasksTo([t.id], today, `“${t.title}” is on today`)}>Do today</Btn>
                {t.durationMinutes > 15 && <Btn icon={Scissors} title="Shrink it to a 15-minute first step" onClick={() => updateTask(t.id, { durationMinutes: 15, title: /^first step: /i.test(t.title) ? t.title : `First step: ${t.title}` })}>Make it 15 min</Btn>}
                <Btn icon={ListChecks} title="Open it and split it into steps" onClick={() => setSelectedId(t.id)}>Break into steps</Btn>
                <Btn icon={PauseCircle} onClick={() => setPark({ task: t, mode: 'pause' })}>Pause</Btn>
                <Btn icon={XCircle} tone="danger" onClick={() => setPark({ task: t, mode: 'drop' })}>Drop</Btn>
              </Row>
            ))}
          </ul>
        )}
      </Section>

      <Section icon={PauseCircle} tone="bg-sky text-sky-fg" title="Paused" count={held.length}
        hint="Stopped on purpose. Off every plan and reminder until you resume them, or until their check-again day.">
        {held.length === 0 ? <p className="text-sm text-faint px-3 py-2">Nothing paused. Pause a task from here or from its panel when it's blocked or waiting.</p> : (
          <ul>
            {held.map((t) => {
              const back = t.hold.until ? differenceInCalendarDays(parseISO(t.hold.until), parseISO(today)) : null
              return (
                <Row key={t.id} t={t} meta={`${t.hold.reason} · paused ${ago(t.hold.since)}${t.hold.until ? ` · back ${back <= 1 ? 'tomorrow' : format(parseISO(t.hold.until), 'EEE, MMM d')}` : ''}`}>
                  <Btn icon={Play} onClick={() => resumeTask(t.id, today)}>Resume today</Btn>
                  <Btn onClick={() => resumeTask(t.id, dateKey(addDays(now, 1)))}>Tomorrow</Btn>
                  <Btn icon={XCircle} tone="danger" onClick={() => setPark({ task: t, mode: 'drop' })}>Drop</Btn>
                </Row>
              )
            })}
          </ul>
        )}
      </Section>

      <Section icon={XCircle} tone="bg-coral text-coral-fg" title="Dropped" count={dropped.length}
        hint={`Let go, with the reason. Kept ${DROP_KEEP_DAYS} days so you can change your mind, then deleted.`}>
        {dropped.length === 0 ? <p className="text-sm text-faint px-3 py-2">Nothing dropped.</p> : (
          <ul>
            {dropped.map((t) => {
              const left = Math.max(0, DROP_KEEP_DAYS - differenceInCalendarDays(now, new Date(t.dropped.at)))
              return (
                <Row key={t.id} t={t} meta={`${t.dropped.reason} · dropped ${ago(t.dropped.at)} · deleted in ${left} day${left === 1 ? '' : 's'}`}>
                  <Btn icon={RotateCcw} onClick={() => restoreTask(t.id, today)}>Restore to today</Btn>
                  <Btn icon={Trash2} tone="danger" onClick={() => removeTask(t.id)}>Delete now</Btn>
                </Row>
              )
            })}
          </ul>
        )}
      </Section>

      {slips.length + held.length + dropped.length === 0 && (
        <div className="card p-6"><EmptyState icon={PauseCircle} title="Everything is moving" hint="Tasks you pause or drop, and tasks that keep slipping, show up here." /></div>
      )}
      {park && <ParkDialog task={park.task} mode={park.mode} onClose={() => setPark(null)} />}
    </div>
  )
}
