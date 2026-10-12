import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Timer, Repeat, CornerDownLeft, Sparkles, CalendarDays, Clock, Flag, Tag, Target, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { fmtMinutes, todayKey, PRIORITY_LABEL } from '../lib/tasks'
import { FREQS, FREQ_LABEL, describe } from '../lib/recurrence'
import { parseQuickAdd, fmtDateToken } from '../lib/nlp'
import { learnedDuration } from '../lib/capacity'
import { CategoryPills, Modal, PriorityPills, cx } from './ui'
import { DateField } from './DatePicker'
import { TimeField } from './TimePicker'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]
const blank = (preset = {}) => ({
  title: '', description: '', date: todayKey(), startTime: null, durationMinutes: 30,
  category: null, priority: 'medium', status: 'todo', recurrence: null, ...preset,
})
const TOKEN_ICON = { date: CalendarDays, time: Clock, duration: Timer, priority: Flag, category: Tag, repeat: Repeat }
// Shown while the title is empty, so the syntax is learnable by example.
const EXAMPLES = ['Edit trailer tomorrow 2pm 90m #work', 'Gym every weekday 7am', 'Call mom on sat 30m', 'Invoice client friday !high']

export default function QuickAddModal() {
  const { quickAdd, setQuickAdd, addTask, settings, now, tasks, setGoalPlannerOpen } = usePlanner()
  const open = quickAdd != null
  const [draft, setDraft] = useState(blank)
  // Fields the user set by hand win over anything parsed from the title.
  const manual = useRef(new Set())
  // Fields currently filled from the title, and what they were before, so a
  // token that disappears (deleted or dismissed) gives its field back.
  const fromParse = useRef(new Set())
  const base = useRef(blank())
  // Token texts the user dismissed with ×: they stay part of the title.
  const [ignored, setIgnored] = useState([])
  const set = (p, byHand = true) => {
    if (byHand) Object.keys(p).forEach((k) => manual.current.add(k))
    setDraft((d) => ({ ...d, ...p }))
  }

  useEffect(() => {
    if (open) {
      manual.current = new Set(Object.keys(quickAdd || {}))
      fromParse.current = new Set()
      base.current = blank({ category: settings.categories[0]?.id, ...quickAdd })
      setIgnored([])
      setDraft(base.current)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Parse the title as it's typed and mirror the findings into untouched fields.
  const parsed = useMemo(() => parseQuickAdd(draft.title, { categories: settings.categories, now, ignore: ignored }), [draft.title, settings.categories, now, ignored])
  // With no length typed or picked, the estimate comes from how long your
  // finished tasks in this category actually took (3+ of them needed).
  const learned = useMemo(() => learnedDuration(tasks, draft.category, now), [tasks, draft.category, now])
  useEffect(() => {
    const patch = {}
    for (const k of ['date', 'startTime', 'durationMinutes', 'priority', 'category', 'recurrence']) {
      if (manual.current.has(k)) continue
      if (parsed[k] !== undefined) { patch[k] = parsed[k]; fromParse.current.add(k) }
      else if (k === 'durationMinutes') { patch[k] = learned?.minutes ?? base.current[k]; fromParse.current.delete(k) }
      else if (fromParse.current.has(k)) { patch[k] = base.current[k]; fromParse.current.delete(k) }
    }
    if (Object.keys(patch).length) setDraft((d) => ({ ...d, ...patch }))
  }, [parsed, learned])
  const usingLearned = learned && !manual.current.has('durationMinutes') && parsed.durationMinutes === undefined

  const close = () => setQuickAdd(null)
  const cleanTitle = parsed.title.trim()
  const submit = (e) => {
    e?.preventDefault()
    if (!cleanTitle) return
    addTask({ ...draft, title: cleanTitle })
    close()
  }

  const chipLabel = (t) => {
    if (t.type === 'date') return fmtDateToken(parsed.date, now)
    if (t.type === 'time') return parsed.startTime
    if (t.type === 'duration') return fmtMinutes(parsed.durationMinutes)
    if (t.type === 'priority') return PRIORITY_LABEL[parsed.priority]
    if (t.type === 'category') return settings.categories.find((c) => c.id === parsed.category)?.name
    if (t.type === 'repeat') return describe(parsed.recurrence)
    return t.raw
  }

  return (
    <Modal open={open} onClose={close} width="max-w-xl">
      <form onSubmit={submit}>
        <input
          autoFocus
          className="w-full bg-transparent outline-none h-display text-2xl placeholder:text-faint placeholder:font-semibold"
          placeholder="What do you want to get done?"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value }, false)}
        />

        {/* Parsed tokens */}
        <div className="mt-2 min-h-[22px] flex flex-wrap items-center gap-1.5">
          {parsed.tokens.length === 0 ? (
            draft.title.trim() ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                <Sparkles size={11} /> Add a date, time or length: “tomorrow 3pm 30m #work !high”
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-[11px] text-faint mr-0.5"><Sparkles size={11} /> Try</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => set({ title: ex }, false)}
                    className="pill bg-page text-muted border border-line hover:text-ink hover:border-faint transition">{ex}</button>
                ))}
              </>
            )
          ) : parsed.tokens.map((t, i) => {
            const Icon = TOKEN_ICON[t.type]
            return (
              <span key={i} className="pill bg-lav text-lav-fg pr-1" title={`Read from “${t.raw}”`}>
                <Icon size={11} /> {chipLabel(t)}
                <button type="button" aria-label={`Keep “${t.raw}” as part of the title`} title={`Keep “${t.raw}” in the title`}
                  onClick={() => setIgnored((xs) => [...xs, t.raw.toLowerCase()])}
                  className="h-4 w-4 rounded-full inline-flex items-center justify-center hover:bg-lav-fg/15 transition">
                  <X size={10} />
                </button>
              </span>
            )
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <DateField value={draft.date} onChange={(date) => set({ date })} placeholder="No date" />
          <TimeField value={draft.startTime} onChange={(startTime) => set({ startTime })} />
          <IconField icon={Timer}>
            <select className="bg-transparent outline-none w-full text-sm font-semibold" value={draft.durationMinutes} onChange={(e) => set({ durationMinutes: Number(e.target.value) })}>
              {[...new Set([...DURATIONS, draft.durationMinutes])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)}h ${d % 60}m` : `${d / 60}h`}</option>)}
            </select>
          </IconField>
          <IconField icon={Repeat} active={!!draft.recurrence}>
            <select className="bg-transparent outline-none w-full text-sm font-semibold" value={draft.recurrence?.freq || ''}
              onChange={(e) => set({ recurrence: e.target.value ? { freq: e.target.value, until: null, skip: [] } : null })}>
              <option value="">No repeat</option>
              {FREQS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </select>
          </IconField>
        </div>

        {usingLearned && (
          <p className="mt-2 text-[11px] text-faint inline-flex items-center gap-1">
            <Timer size={11} /> Estimate from your last {learned.samples} {settings.categories.find((c) => c.id === draft.category)?.name} tasks
          </p>
        )}

        <div className="mt-4"><CategoryPills categories={settings.categories} value={draft.category} onChange={(category) => set({ category })} /></div>
        <div className="mt-3"><PriorityPills value={draft.priority} onChange={(priority) => set({ priority })} /></div>

        <button type="button" onClick={() => { setQuickAdd(null); setGoalPlannerOpen(true) }}
          className="mt-5 text-[12px] font-semibold text-muted hover:text-ink inline-flex items-center gap-1.5 transition">
          <Target size={13} /> Planning an exam or project? Plan a goal instead
        </button>

        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-faint">
            {draft.status !== 'todo' && <span className="pill bg-page text-muted mr-2">adds to {draft.status === 'working' ? 'Working' : 'Completed'}</span>}
            Esc to close
          </span>
          <button type="submit" className={cx('btn-black', !cleanTitle && 'opacity-40')} disabled={!cleanTitle}>
            Add task <CornerDownLeft size={14} />
          </button>
        </div>
      </form>
    </Modal>
  )
}

function IconField({ icon: Icon, children, active }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-line bg-page px-3 h-10 focus-within:border-lav-fg/60 focus-within:ring-2 focus-within:ring-lav-fg/20 transition">
      <Icon size={15} className={cx('shrink-0', active ? 'text-lav-fg' : 'text-faint')} />
      {children}
    </label>
  )
}
