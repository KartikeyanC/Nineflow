import React, { useEffect, useState } from 'react'
import { addDays } from 'date-fns'
import { format } from '../lib/dateFormat'
import { PauseCircle, XCircle } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { DROP_KEEP_DAYS, DROP_REASONS, PAUSE_REASONS, dateKey } from '../lib/tasks'
import { Modal, cx } from './ui'

// Pause or drop a task, with a reason (and, for a pause, a day to check again).
// mode: 'pause' | 'drop'. See views/Paused.jsx.
export default function ParkDialog({ task, mode, onClose }) {
  const { pauseTask, dropTask, now } = usePlanner()
  const reasons = mode === 'drop' ? DROP_REASONS : PAUSE_REASONS
  const [reason, setReason] = useState(reasons[0])
  const [other, setOther] = useState('')
  const [when, setWhen] = useState('none') // 'none' | 'tomorrow' | 'week' | 'pick'
  const [picked, setPicked] = useState(dateKey(addDays(now, 3)))
  useEffect(() => { setReason(reasons[0]); setOther(''); setWhen('none') }, [task?.id, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!task) return null

  const until = when === 'tomorrow' ? dateKey(addDays(now, 1)) : when === 'week' ? dateKey(addDays(now, 7)) : when === 'pick' ? picked : null
  const finalReason = reason === 'Other' ? (other.trim().slice(0, 120) || 'Other') : reason
  const confirm = () => {
    if (mode === 'drop') dropTask(task.id, finalReason)
    else pauseTask(task.id, { reason: finalReason, until })
    onClose()
  }
  const chip = (on) => cx('pill h-8 px-3 text-[12px] border transition', on ? 'bg-brand text-white border-transparent' : 'bg-card text-muted border-line hover:text-ink')

  return (
    <Modal open onClose={onClose} width="max-w-md">
      <div className="flex items-start gap-3">
        <span className={cx('h-10 w-10 rounded-2xl flex items-center justify-center shrink-0', mode === 'drop' ? 'bg-coral text-coral-fg' : 'bg-sky text-sky-fg')}>
          {mode === 'drop' ? <XCircle size={18} /> : <PauseCircle size={18} />}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold">{mode === 'drop' ? 'Drop this task?' : 'Pause this task?'}</h2>
          <p className="text-sm text-muted truncate">{task.title}</p>
        </div>
      </div>
      <p className="mt-4 text-xs font-semibold text-muted">{mode === 'drop' ? 'Why let it go?' : 'Why is it stopped?'}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
        {reasons.map((r) => <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={chip(reason === r)}>{r}</button>)}
      </div>
      {reason === 'Other' && <input autoFocus className="input mt-2" maxLength={120} placeholder="In a few words" value={other} onChange={(e) => setOther(e.target.value)} />}

      {mode === 'pause' && (
        <>
          <p className="mt-4 text-xs font-semibold text-muted">Check again</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Check again">
            {[['none', 'No date'], ['tomorrow', 'Tomorrow'], ['week', 'In a week'], ['pick', 'On a day…']].map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={when === k} onClick={() => setWhen(k)} className={chip(when === k)}>{label}</button>
            ))}
            {when === 'pick' && <input type="date" className="input h-8 py-0 w-auto" min={dateKey(addDays(now, 1))} value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Day to check again" />}
          </div>
          <p className="mt-2 text-xs text-faint">
            {until ? `It comes back to your plan on ${format(new Date(`${until}T12:00:00`), 'EEE, MMM d')}.` : 'It stays in Paused until you resume it.'} Until then it's off every list, board and reminder.
          </p>
        </>
      )}
      {mode === 'drop' && <p className="mt-3 text-xs text-faint">It leaves every list. You can restore it from Paused for {DROP_KEEP_DAYS} days.</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className={mode === 'drop' ? 'btn-danger' : 'btn-black'} onClick={confirm}>{mode === 'drop' ? 'Drop task' : 'Pause task'}</button>
      </div>
    </Modal>
  )
}
