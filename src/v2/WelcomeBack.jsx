import React, { useEffect, useMemo, useRef, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Inbox, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, isOverdue } from '../lib/tasks'
import { storageKey, currentProfile, firstName } from '../lib/profiles'
import { openRitual } from './ritualBus'
import { useDialogFocus } from '../components/ui'

// After a few days away, unfinished work piles up and the app feels like a
// debt; people who stay away 8+ days rarely come back. Offer a fresh start:
// park the old tasks in Someday and plan just today.
const AWAY_DAYS = 3
const SEEN_KEY = () => storageKey('last-seen')

export default function WelcomeBack() {
  const { tasks, now, moveTasksTo } = usePlanner()
  const [away, setAway] = useState(0)

  // Read the last visit once, then record today.
  useEffect(() => {
    try {
      const last = localStorage.getItem(SEEN_KEY())
      const gap = last ? differenceInCalendarDays(now, parseISO(last)) : 0
      if (gap >= AWAY_DAYS) setAway(gap)
      localStorage.setItem(SEEN_KEY(), dateKey(now))
    } catch { /* storage unavailable: no prompt */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stale = useMemo(() => tasks.filter((t) => isOverdue(t, now)), [tasks, now])
  const dialogRef = useRef(null)
  useDialogFocus(dialogRef, !!(away && stale.length))
  if (!away || !stale.length) return null
  const close = () => setAway(0)
  const name = firstName(currentProfile()?.name)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-ink/30 backdrop-blur-sm animate-fade-in" onMouseDown={close}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="welcome-title" onMouseDown={(e) => e.stopPropagation()}
        className="outline-none w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] bg-card shadow-modal animate-modal-in p-6 sm:p-7 grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="welcome-title" className="font-serif text-[34px] leading-none">Welcome back{name ? <>, <em className="text-accent">{name}</em></> : ''}.</h2>
          <button type="button" onClick={close} aria-label="Close" className="h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center text-muted hover:bg-subtle hover:text-ink transition"><X size={16} /></button>
        </div>
        <p className="text-[14px] text-muted">
          You were away {away} days. <b className="text-ink">{stale.length} unfinished task{stale.length === 1 ? '' : 's'}</b> waited for you.
          You don't have to catch up on all of it. Park the old ones and plan just today.
        </p>
        <div className="grid gap-2">
          <button type="button" className="btn-black h-11"
            onClick={() => { moveTasksTo(stale.map((t) => t.id), null, `Moved ${stale.length} to Someday`); close(); openRitual('plan') }}>
            <Inbox size={15} /> Park them in Someday and plan today
          </button>
          <button type="button" className="btn-ghost h-11" onClick={close}>I'll go through them myself</button>
        </div>
      </div>
    </div>
  )
}
