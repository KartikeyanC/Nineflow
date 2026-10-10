import React, { useEffect } from 'react'
import { CalendarPlus, X, Check } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { googleCalendarUrl } from '../lib/calendar'

// After a task is added, offer to put it on the user's Google Calendar.
export default function CalendarToast() {
  const { lastAdded, setLastAdded, tasks, settings, categoryById } = usePlanner()
  const task = lastAdded ? tasks.find((t) => t.id === lastAdded.id) : null
  const enabled = settings.calendar.promptOnAdd

  useEffect(() => {
    if (!lastAdded) return
    const id = setTimeout(() => setLastAdded(null), 8000)
    return () => clearTimeout(id)
  }, [lastAdded, setLastAdded])

  if (!enabled || !task) return null
  const url = googleCalendarUrl(task, categoryById(task.category)?.name)
  if (!url) return null

  return (
    <div className="fixed top-16 sm:top-auto sm:bottom-24 right-4 sm:right-6 z-30 card shadow-lift px-4 py-3 flex items-center gap-3 animate-view-in max-w-[calc(100vw-2rem)]">
      <span className="h-8 w-8 rounded-full bg-mint text-mint-fg flex items-center justify-center shrink-0"><Check size={15} /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">Added “{task.title}”</p>
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setLastAdded(null)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-lav-fg hover:underline">
          <CalendarPlus size={12} /> Add to Google Calendar
        </a>
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => setLastAdded(null)} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-faint hover:bg-page hover:text-ink transition"><X size={14} /></button>
    </div>
  )
}
