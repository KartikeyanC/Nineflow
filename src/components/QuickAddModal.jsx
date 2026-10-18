import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Timer, Repeat, CornerDownLeft, Sparkles, CalendarDays, Clock, Flag, Tag, Target, ListChecks, X, Loader2, WandSparkles, Hash, BookmarkPlus, Mic, MicOff } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { fmtMinutes, newSubtask, todayKey, PRIORITY_LABEL, STATUS_LABEL } from '../lib/tasks'
import { FREQS, FREQ_LABEL, describe } from '../lib/recurrence'
import { parseQuickAdd, fmtDateToken } from '../lib/nlp'
import { learnedDuration } from '../lib/capacity'
import { autofillTask } from '../lib/aiTasks'
import { cleanTemplates, taskFieldsFromTemplate } from '../lib/views'
import { CategoryPills, Modal, PriorityPills, cx } from './ui'
import { StepsEditor } from './Checklist'
import { DateField } from './DatePicker'
import { TimeField } from './TimePicker'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]
const blank = (preset = {}) => ({
  title: '', description: '', subtasks: [], tags: [], date: todayKey(), startTime: null, durationMinutes: 30,
  category: null, priority: 'medium', status: 'todo', recurrence: null, ...preset,
})
const TOKEN_ICON = { date: CalendarDays, time: Clock, duration: Timer, priority: Flag, category: Tag, repeat: Repeat, tag: Hash }
// Shown while the title is empty, so the syntax is learnable by example.
const EXAMPLES = ['Edit trailer tomorrow 2pm 90m #work @client-a', 'Gym every weekday 7am', 'Call mom on sat 30m', 'Invoice client friday !high']

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
  // "Auto-fill": Claude suggests category, priority, length and steps from the title.
  // Voice: dictated words land in the title, so "tomorrow 3pm" is parsed like typed text.
  const Speech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const stopListening = () => recRef.current?.stop()
  const startListening = () => {
    if (!Speech) return
    const rec = new Speech()
    rec.lang = navigator.language || 'en-US'
    rec.interimResults = false
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim()
      if (said) set({ title: draft.title ? `${draft.title} ${said}` : said }, false)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }
  useEffect(() => () => recRef.current?.abort(), [])
  const [ai, setAi] = useState({ busy: false, note: '', error: '' })
  const set = (p, byHand = true) => {
    if (byHand) Object.keys(p).forEach((k) => manual.current.add(k))
    setDraft((d) => ({ ...d, ...p }))
  }

  useEffect(() => {
    if (open) {
      // (a day passed in, like the Board's, is only the starting point: a day typed in the title still wins)
      manual.current = new Set(Object.keys(quickAdd || {}).filter((k) => k !== 'date'))
      fromParse.current = new Set()
      base.current = blank({ category: settings.categories[0]?.id, ...quickAdd })
      setIgnored([])
      setAi({ busy: false, note: '', error: '' })
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
    // Tags typed as @name fill the tags; removing the @name takes them back out.
    if (!manual.current.has('tags')) {
      if (parsed.tags.length) { patch.tags = parsed.tags; fromParse.current.add('tags') }
      else if (fromParse.current.has('tags')) { patch.tags = []; fromParse.current.delete('tags') }
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

  // Fills only what you haven't set or typed yourself (#work, 30m, !high…).
  const autofill = async () => {
    if (!cleanTitle || ai.busy) return
    setAi({ busy: true, note: '', error: '' })
    try {
      const r = await autofillTask(cleanTitle, { today: todayKey(), categories: settings.categories })
      const patch = {}
      const said = []
      if (r.category && !manual.current.has('category') && parsed.category === undefined) { patch.category = r.category; said.push(settings.categories.find((c) => c.id === r.category)?.name) }
      if (r.priority && !manual.current.has('priority') && parsed.priority === undefined) { patch.priority = r.priority; said.push(PRIORITY_LABEL[r.priority]) }
      if (r.durationMinutes && !manual.current.has('durationMinutes') && parsed.durationMinutes === undefined) { patch.durationMinutes = r.durationMinutes; said.push(fmtMinutes(r.durationMinutes)) }
      if (r.steps.length && draft.subtasks.length === 0) { patch.subtasks = r.steps.map(newSubtask); said.push(`${r.steps.length} ${r.steps.length === 1 ? 'step' : 'steps'}`) }
      if (Object.keys(patch).length) set(patch)
      setAi({ busy: false, note: said.length ? `Filled in: ${said.filter(Boolean).join(' · ')}` : 'Nothing to add. You already set those.', error: '' })
    } catch (e) {
      setAi({ busy: false, note: '', error: e.message })
    }
  }

  // Templates: start from a saved task (its checklist, notes, length, tags and so on).
  const templates = useMemo(() => cleanTemplates(settings.templates), [settings.templates])
  const useTemplate = (tpl) => {
    const f = taskFieldsFromTemplate(tpl, settings.categories)
    Object.keys(f).forEach((k) => manual.current.add(k))
    setDraft((d) => ({ ...d, ...f }))
    setAi({ busy: false, note: `Started from “${tpl.name}”`, error: '' })
  }

  const chipLabel = (t) => {
    if (t.type === 'date') return fmtDateToken(parsed.date, now)
    if (t.type === 'time') return parsed.startTime
    if (t.type === 'duration') return fmtMinutes(parsed.durationMinutes)
    if (t.type === 'priority') return PRIORITY_LABEL[parsed.priority]
    if (t.type === 'category') return settings.categories.find((c) => c.id === parsed.category)?.name
    if (t.type === 'repeat') return describe(parsed.recurrence)
    if (t.type === 'tag') return `#${t.raw.slice(1).toLowerCase()}`
    return t.raw
  }

  return (
    <Modal open={open} onClose={close} width="max-w-xl">
      <form onSubmit={submit}>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="flex-1 min-w-0 bg-transparent outline-none h-display text-2xl max-sm:text-xl placeholder:text-faint placeholder:font-semibold"
            placeholder="What do you want to get done?"
            value={draft.title}
            onChange={(e) => set({ title: e.target.value }, false)}
          />
          {Speech && (
            <button type="button" onClick={listening ? stopListening : startListening}
              title={listening ? 'Stop listening' : 'Say a task, e.g. "call mom tomorrow 3pm"'}
              aria-label={listening ? 'Stop voice input' : 'Add by voice'}
              className={cx('shrink-0 h-9 w-9 max-sm:h-11 max-sm:w-11 rounded-full flex items-center justify-center transition',
                listening ? 'bg-brand text-white animate-pulse' : 'bg-page text-muted hover:text-ink')}>
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>

        {templates.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Templates">
            <span className="text-[11px] text-faint mr-0.5 inline-flex items-center gap-1"><BookmarkPlus size={11} /> Templates</span>
            {templates.slice(0, 8).map((t) => (
              <button key={t.id} type="button" onClick={() => useTemplate(t)} title={t.steps.length ? `${t.title} · ${t.steps.length} steps` : t.title}
                className="pill bg-page text-muted border border-line hover:text-ink hover:border-faint transition max-w-[12rem] truncate">{t.name}</button>
            ))}
            {templates.length > 8 && (
              <select value="" aria-label="More templates" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) useTemplate(t) }}
                className="pill bg-page text-muted border border-line text-[11px] py-0.5">
                <option value="">More…</option>
                {templates.slice(8).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Parsed tokens */}
        <div className="mt-2 min-h-[22px] flex flex-wrap items-center gap-1.5 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:-mx-1 max-sm:px-1 max-sm:pb-1">
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
                    className="pill bg-page text-muted border border-line hover:text-ink hover:border-faint transition max-sm:shrink-0 max-sm:whitespace-nowrap">{ex}</button>
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

        {cleanTitle && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={autofill} disabled={ai.busy}
              title="Let AI suggest the category, priority, length and steps (sends the title to Claude)"
              className="pill h-7 px-3 text-[12px] font-semibold border border-line bg-card text-muted hover:text-ink hover:border-faint transition inline-flex items-center gap-1.5 disabled:opacity-60">
              {ai.busy ? <Loader2 size={12} className="animate-spin" /> : <WandSparkles size={12} />} Auto-fill with AI
            </button>
            {ai.note && <span role="status" className="text-[11px] text-mint-fg font-semibold">{ai.note}</span>}
            {ai.error && <span role="alert" className="text-[11px] text-coral-fg font-semibold">{ai.error}</span>}
          </div>
        )}

        {/* Checklist: steps typed here are created together with the task. */}
        <section className="mt-3" aria-label="Checklist">
          <div className="flex items-center gap-2 mb-1">
            <ListChecks size={14} className="text-faint" />
            <h3 className="text-xs font-semibold text-muted">Checklist</h3>
            {draft.subtasks.length > 0 && (
              <span className="text-[11px] font-semibold text-faint tnum">
                {draft.subtasks.length} {draft.subtasks.length === 1 ? 'step' : 'steps'}
                {draft.subtasks.some((s) => s.required) && ` · ${draft.subtasks.filter((s) => s.required).length} required to finish`}
              </span>
            )}
          </div>
          <StepsEditor steps={draft.subtasks} onChange={(subtasks) => set({ subtasks })} ticks={false} commitOnBlur />
        </section>

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

        <div className="flex items-center justify-between mt-3 max-sm:mt-4">
          <span className="text-xs text-faint">
            {draft.status !== 'todo' && <span className="pill bg-page text-muted mr-2">adds to {STATUS_LABEL[draft.status]}</span>}
            <span className="max-sm:hidden">Esc to close</span>
          </span>
          <button type="submit" className={cx('btn-black max-sm:h-12 max-sm:flex-1 max-sm:text-base', !cleanTitle && 'opacity-40')} disabled={!cleanTitle}>
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
