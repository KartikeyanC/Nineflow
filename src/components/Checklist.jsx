import React, { useRef, useState } from 'react'
import { Check, ListChecks, Plus, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { newSubtask, subProgress } from '../lib/tasks'
import { ProgressBar, cx } from './ui'

// The steps inside one task. Each has its own tick; the task is finished
// separately, so ticking the last step never completes it behind your back.
export default function Checklist({ task }) {
  const { updateTask } = usePlanner()
  const [text, setText] = useState('')
  const input = useRef(null)
  const subs = task.subtasks || []
  const { done, total } = subProgress(task)
  const save = (next) => updateTask(task.id, { subtasks: next })

  // Pasting several lines adds one step per line.
  const addLines = (raw) => {
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim()).filter(Boolean)
    if (!lines.length) return false
    save([...subs, ...lines.slice(0, 30).map(newSubtask)])
    setText('')
    input.current?.focus()
    return true
  }
  const add = () => addLines(text)
  const patch = (id, change) => save(subs.map((s) => (s.id === id ? { ...s, ...change } : s)))

  return (
    <section className="mt-4" aria-label="Checklist">
      <div className="flex items-center gap-2 mb-1.5">
        <ListChecks size={14} className="text-faint" />
        <h3 className="text-xs font-semibold text-muted">Checklist</h3>
        {total > 0 && <span className="text-[11px] font-semibold text-faint tnum">{done} of {total}</span>}
      </div>
      {total > 0 && <ProgressBar value={done / total} tone="bg-mint-fg" className="mb-2" />}

      <ul className="space-y-0.5">
        {subs.map((s) => (
          <li key={s.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-page">
            <button type="button" role="checkbox" aria-checked={s.done} aria-label={s.done ? 'Mark step as not done' : 'Mark step as done'}
              onClick={() => patch(s.id, { done: !s.done })}
              className={cx('shrink-0 h-[18px] w-[18px] rounded-md border-2 flex items-center justify-center transition-colors',
                s.done ? 'bg-mint-fg border-mint-fg text-white' : 'border-line hover:border-mint-fg')}>
              {s.done && <Check size={11} strokeWidth={3.5} />}
            </button>
            <input value={s.title} aria-label="Step"
              onChange={(e) => patch(s.id, { title: e.target.value.slice(0, 120) })}
              onBlur={() => { if (!s.title.trim()) save(subs.filter((x) => x.id !== s.id)) }}
              className={cx('flex-1 min-w-0 bg-transparent outline-none text-sm py-1', s.done && 'line-through text-faint')} />
            <button type="button" aria-label="Remove step" onClick={() => save(subs.filter((x) => x.id !== s.id))}
              className="h-6 w-6 shrink-0 rounded-full inline-flex items-center justify-center text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-card hover:text-ink transition">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={(e) => { e.preventDefault(); add() }} className="mt-1 flex items-center gap-2.5 px-1">
        <Plus size={16} className="shrink-0 text-faint" />
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step"
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\r\n]/.test(t) && addLines(t)) e.preventDefault() }}
          aria-label="Add a step" className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1.5 placeholder:text-faint" />
      </form>
    </section>
  )
}
