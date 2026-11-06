import React, { useRef, useState } from 'react'
import { Check, IndentDecrease, IndentIncrease, ListChecks, Lock, Plus, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { MAX_STEP_DEPTH, checkGate, cleanDepths, indentStep, newSubtask, subProgress, tickStep } from '../lib/tasks'
import { ProgressBar, Segmented, cx } from './ui'

// The steps themselves: one row each (tick, title, required lock, remove) and an "Add a step"
// row. Shared by a task's Checklist and by the New Task dialog, so both behave the same.
// It never submits a surrounding <form>: Enter adds a step (or moves on to the add row), and
// pasting several lines adds one step per line. Steps nest up to three levels: Tab and Shift+Tab
// (or the arrows that show on a focused step) move a step in or out, with the steps under it;
// ticking a step ticks the ones under it, and unticking one unticks the ones it sits under.
//   steps / onChange  the list and its updater: onChange(nextSteps)
//   ticks             show each step's tick box (a task still being created has nothing to tick)
//   commitOnBlur      keep half-typed text as a step when focus leaves, so clicking "Add task"
//                     straight after typing a step doesn't lose it
export function StepsEditor({ steps, onChange, ticks = true, commitOnBlur = false }) {
  const [text, setText] = useState('')
  const input = useRef(null)
  const subs = steps || []

  // Pasting several lines adds one step per line.
  // An indented paste keeps its nesting (a tab or two spaces per level).
  const addLines = (raw) => {
    const lines = raw.split(/\r?\n/)
      .map((l) => ({ indent: (l.match(/^[\t ]*/)[0].replace(/\t/g, '  ').length / 2) | 0, title: l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim() }))
      .filter((l) => l.title)
    if (!lines.length) return false
    const base = Math.min(...lines.map((l) => l.indent))
    onChange(cleanDepths([...subs, ...lines.slice(0, 30).map((l) => newSubtask(l.title, false, l.indent - base))]))
    setText('')
    return true
  }
  const patch = (id, change) => onChange(subs.map((s) => (s.id === id ? { ...s, ...change } : s)))
  const indent = (id, delta) => { const next = indentStep(subs, id, delta); if (next !== subs) onChange(next) }
  const remove = (id) => onChange(cleanDepths(subs.filter((x) => x.id !== id)))

  return (
    <>
      <ul className="space-y-0.5">
        {subs.map((s) => (
          <li key={s.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-page" style={{ paddingLeft: `${0.25 + (s.depth || 0) * 1.5}rem` }}>
            {ticks ? (
              <button type="button" role="checkbox" aria-checked={s.done} aria-label={s.done ? 'Mark step as not done' : 'Mark step as done'}
                onClick={() => onChange(tickStep(subs, s.id))}
                className={cx('shrink-0 h-[18px] w-[18px] rounded-md border-2 flex items-center justify-center transition-colors',
                  s.done ? 'bg-mint-fg border-mint-fg text-white' : 'border-line hover:border-mint-fg')}>
                {s.done && <Check size={11} strokeWidth={3.5} />}
              </button>
            ) : (
              <span aria-hidden="true" className="shrink-0 h-[18px] w-[18px] flex items-center justify-center"><i className="h-1.5 w-1.5 rounded-full bg-faint" /></span>
            )}
            <input value={s.title} aria-label="Step"
              onChange={(e) => patch(s.id, { title: e.target.value.slice(0, 120) })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); input.current?.focus() }
                else if (e.key === 'Tab' && (e.shiftKey ? (s.depth || 0) > 0 : indentStep(subs, s.id, 1) !== subs)) { e.preventDefault(); indent(s.id, e.shiftKey ? -1 : 1) }
              }}
              onBlur={() => { if (!s.title.trim()) remove(s.id) }}
              className={cx('flex-1 min-w-0 bg-transparent outline-none text-sm py-1', s.done && 'line-through text-faint')} />
            <span className="flex shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition">
              <button type="button" aria-label="Move step out a level" disabled={!(s.depth > 0)} onClick={() => indent(s.id, -1)}
                className="h-6 w-6 rounded-full inline-flex items-center justify-center text-faint hover:text-ink hover:bg-subtle disabled:hidden"><IndentDecrease size={13} /></button>
              <button type="button" aria-label="Move step in a level, under the one above" disabled={(s.depth || 0) >= MAX_STEP_DEPTH || indentStep(subs, s.id, 1) === subs} onClick={() => indent(s.id, 1)}
                className="h-6 w-6 rounded-full inline-flex items-center justify-center text-faint hover:text-ink hover:bg-subtle disabled:hidden"><IndentIncrease size={13} /></button>
            </span>
            <button type="button" aria-pressed={!!s.required} onClick={() => patch(s.id, { required: !s.required })}
              aria-label={s.required ? 'Required to finish the task. Press to make it optional' : 'Make this step required to finish the task'}
              title={s.required ? 'Required to finish' : 'Make required to finish'}
              className={cx('h-6 w-6 shrink-0 rounded-full inline-flex items-center justify-center transition',
                s.required ? 'text-lav-fg bg-accent-soft' : 'text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink hover:bg-subtle')}>
              <Lock size={12} />
            </button>
            <button type="button" aria-label="Remove step" onClick={() => remove(s.id)}
              className="h-6 w-6 shrink-0 rounded-full inline-flex items-center justify-center text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-card hover:text-ink transition">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-center gap-2.5 px-1">
        <Plus size={16} className="shrink-0 text-faint" />
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addLines(text) } }}
          onBlur={() => { if (commitOnBlur) addLines(text) }}
          onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\r\n]/.test(t) && addLines(t)) e.preventDefault() }}
          aria-label="Add a step" className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1.5 placeholder:text-faint" />
      </div>
    </>
  )
}

// The steps inside one task. Each has its own tick; the task is finished
// separately, so ticking the last step never completes it behind your back.
export default function Checklist({ task }) {
  const { updateTask } = usePlanner()
  const subs = task.subtasks || []
  const { done, total } = subProgress(task)
  const gate = checkGate(task)
  const save = (next) => updateTask(task.id, { subtasks: next })

  return (
    <section className="mt-4" aria-label="Checklist">
      <div className="flex items-center gap-2 mb-1.5">
        <ListChecks size={14} className="text-faint" />
        <h3 className="text-xs font-semibold text-muted">Checklist</h3>
        {total > 0 && <span className="text-xs font-semibold text-faint tnum">{done} of {total}</span>}
      </div>
      {total > 0 && <ProgressBar value={done / total} tone="bg-mint-fg" className="mb-2" />}

      {gate.explicit && (
        <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Required steps">
          <span className="text-xs font-semibold text-lav-fg inline-flex items-center gap-1"><Lock size={11} /> {gate.required} required to finish</span>
          {gate.required > 1 && (
            <Segmented size="sm" value={gate.rule} onChange={(requireRule) => updateTask(task.id, { requireRule })}
              options={[{ value: 'all', label: 'All needed' }, { value: 'any', label: 'Any one' }]} />
          )}
        </div>
      )}

      <StepsEditor steps={subs} onChange={save} />

      {task.status === 'completed' && gate.required > 0 && (task.skippedChecks ? (
        <p className="mt-2 text-[12px] font-semibold text-peach-fg">
          Finished without {task.skippedChecks.missing.length ? task.skippedChecks.missing.map((m) => `“${m}”`).join(', ') : 'some checks'}: {task.skippedChecks.reason}
        </p>
      ) : (
        <p className="mt-2 text-[12px] font-semibold text-mint-fg inline-flex items-center gap-1.5"><Check size={13} /> Checked: {gate.ticked} of {gate.required}{gate.explicit ? ' required' : ''}</p>
      ))}
    </section>
  )
}
