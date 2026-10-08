import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Timer, Repeat, CornerDownLeft, Sparkles, CalendarDays, Clock, Flag, Tag } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { fmtMinutes, todayKey, PRIORITY_LABEL } from '../lib/tasks'
import { FREQS, FREQ_LABEL, describe } from '../lib/recurrence'
import { parseQuickAdd, fmtDateToken } from '../lib/nlp'
import { CategoryPills, Modal, PriorityPills, cx } from './ui'
import { DateField } from './DatePicker'
import { TimeField } from './TimePicker'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]
const blank = (preset = {}) => ({
  title: '', description: '', date: todayKey(), startTime: null, durationMinutes: 30,
  category: null, priority: 'medium', status: 'todo', recurrence: null, ...preset,
})
const TOKEN_ICON = { date: CalendarDays, time: Clock, duration: Timer, priority: Flag, category: Tag, repeat: Repeat }

export default function QuickAddModal() {
  const { quickAdd, setQuickAdd, addTask, settings, now } = usePlanner()
  const open = quickAdd != null
  const [draft, setDraft] = useState(blank)
  // Fields the user set by hand win over anything parsed from the title.
  const manual = useRef(new Set())
  const set = (p, byHand = true) => {
    if (byHand) Object.keys(p).forEach((k) => manual.current.add(k))
    setDraft((d) => ({ ...d, ...p }))
  }

  useEffect(() => {
    if (open) {
      manual.current = new Set(Object.keys(quickAdd || {}))
      setDraft(blank({ category: settings.categories[0]?.id, ...quickAdd }))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Parse the title as it's typed and mirror the findings into untouched fields.
  const parsed = useMemo(() => parseQuickAdd(draft.title, { categories: settings.categories, now }), [draft.title, settings.categories, now])
  useEffect(() => {
    const patch = {}
    for (const k of ['date', 'startTime', 'durationMinutes', 'priority', 'category', 'recurrence']) {
      if (parsed[k] !== undefined && !manual.current.has(k)) patch[k] = parsed[k]
    }
    if (Object.keys(patch).length) setDraft((d) => ({ ...d, ...patch }))
  }, [parsed])

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
            <span className="inline-flex items-center gap-1 text-[11px] text-faint">
              <Sparkles size={11} /> Try “tomorrow 3pm 30m #work !high every weekday”
            </span>
          ) : parsed.tokens.map((t, i) => {
            const Icon = TOKEN_ICON[t.type]
            return (
              <span key={i} className="pill bg-lav text-lav-fg">
                <Icon size={11} /> {chipLabel(t)}
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

        <div className="mt-4"><CategoryPills categories={settings.categories} value={draft.category} onChange={(category) => set({ category })} /></div>
        <div className="mt-3"><PriorityPills value={draft.priority} onChange={(priority) => set({ priority })} /></div>

        <div className="flex items-center justify-between mt-6">
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
