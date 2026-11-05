import React from 'react'
import { Lock } from 'lucide-react'
import { checkGate } from '../lib/tasks'
import { cx } from './ui'

// "🔒 1/2": how many of a task's required steps are ticked, shown wherever the task is
// listed. Gone once the task is completed (the checklist then shows the outcome).
export default function RequiredBadge({ task, className }) {
  if (task.status === 'completed') return null
  const g = checkGate(task)
  if (!g.explicit) return null // plain checklists already show their step count
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-semibold tnum shrink-0', g.blocked ? 'text-lav-fg' : 'text-mint-fg', className)}
      title={`${g.ticked} of ${g.required} required steps ticked (${g.rule === 'any' ? 'one is enough' : 'all are needed'}) before it can be finished`}>
      <Lock size={11} aria-hidden="true" /> {Math.min(g.ticked, g.needed)}/{g.needed}
    </span>
  )
}
