import React, { useEffect, useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { checkGate } from '../lib/tasks'
import { Modal, cx } from './ui'

// "Before you finish": a task with required steps can't be completed until they
// are ticked (all of them, or just one, as the task is set). Whatever tried to
// complete it (the tick on a card, a drag to Completed, the status buttons) stops
// here; ticking the boxes unlocks "Finish", which then does what was asked.
// "Finish anyway" is the way out when a step doesn't apply: it asks for a reason
// and the task keeps it, so it stays visible what was skipped.
export default function FinishGate() {
  const { gateTaskId, tasks, updateTask, closeGate, finishGate } = usePlanner()
  const task = gateTaskId ? tasks.find((t) => t.id === gateTaskId) : null
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => { setSkipping(false); setReason('') }, [gateTaskId])
  // The task was deleted or finished somewhere else while this was open.
  useEffect(() => { if (gateTaskId && (!task || task.status === 'completed')) closeGate() }, [gateTaskId, task, closeGate])
  if (!task || task.status === 'completed') return null

  const g = checkGate(task)
  const steps = (task.subtasks || []).filter((s) => s.required)
  const tick = (id) => updateTask(task.id, { subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) })
  const why = reason.trim()

  return (
    <Modal open onClose={closeGate} width="max-w-md" title="Before you finish">
      <p className="text-sm text-muted -mt-1">
        <b className="text-ink">{task.title || 'This task'}</b> has {steps.length === 1 ? 'a required step' : 'required steps'}.
        {' '}{g.rule === 'any' ? 'Tick at least one to finish it.' : steps.length === 1 ? 'Tick it to finish.' : 'Tick every one to finish it.'}
      </p>

      <ul className="mt-4 space-y-1" aria-label="Required steps">
        {steps.map((s) => (
          <li key={s.id}>
            <button type="button" role="checkbox" aria-checked={s.done} onClick={() => tick(s.id)}
              className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-page transition">
              <span className={cx('shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors',
                s.done ? 'bg-mint-fg border-mint-fg text-white' : 'border-line')}>
                {s.done && <Check size={12} strokeWidth={3.5} />}
              </span>
              <span className={cx('flex-1 min-w-0 text-sm font-semibold', s.done && 'text-faint line-through')}>{s.title}</span>
              <Lock size={12} className="shrink-0 text-faint" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <p className={cx('mt-3 text-[12px] font-semibold tnum', g.blocked ? 'text-lav-fg' : 'text-mint-fg')} role="status">
        {g.blocked
          ? g.rule === 'any' ? 'None ticked yet. One is enough.' : `${g.ticked} of ${g.required} ticked`
          : g.rule === 'any' ? 'One is ticked. You can finish.' : 'All ticked. You can finish.'}
      </p>

      {skipping && g.blocked ? (
        <form className="mt-4 rounded-2xl bg-subtle ring-hair p-3.5 grid gap-2" onSubmit={(e) => { e.preventDefault(); if (why.length >= 3) finishGate(why) }}>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-muted">Why are you finishing without {g.rule === 'any' ? 'any of them' : 'all of them'}?</span>
            <input autoFocus className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The client has no email address" />
          </label>
          <p className="text-[11px] text-faint">This is saved on the task, so it's clear afterwards what was skipped.</p>
          <div className="flex items-center justify-between gap-2 mt-1">
            <button type="button" className="btn-ghost" onClick={() => setSkipping(false)}>Back</button>
            <button type="submit" disabled={why.length < 3} className="btn-black disabled:opacity-40">Finish without them</button>
          </div>
        </form>
      ) : (
        <div className="mt-6 flex items-center justify-between gap-2">
          {g.blocked
            ? <button type="button" onClick={() => setSkipping(true)} className="text-[12px] font-semibold text-muted hover:text-ink underline underline-offset-4 decoration-line hover:decoration-ink">Finish anyway…</button>
            : <span />}
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={closeGate}>Not yet</button>
            <button type="button" disabled={g.blocked} onClick={() => finishGate()} autoFocus={!g.blocked}
              className={cx('btn-black', g.blocked && 'opacity-40')}>
              <Check size={14} /> Finish
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
