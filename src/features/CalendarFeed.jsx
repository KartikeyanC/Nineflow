import { useEffect, useMemo, useRef } from 'react'
import { usePlanner } from '../store/PlannerContext'
import { buildIcs } from '../lib/calendar'
import { feedAvailable, pushFeed, validFeedToken } from '../lib/calFeed'

// While the calendar subscription link is on (Settings → Connections), keeps the server's copy of
// the calendar file in step with the planner: shortly after the planner opens, and a little after
// each change (so a burst of edits is one upload). Nothing is sent when nothing changed.
export default function CalendarFeed() {
  const { tasks, settings } = usePlanner()
  const token = settings.feed?.token
  const on = validFeedToken(token) && feedAvailable()
  const ics = useMemo(() => (on ? buildIcs(tasks, settings.categories) : ''), [on, tasks, settings.categories])
  const sent = useRef('') // the last file that reached the server (compared without its timestamp line)
  const lastToken = useRef('') // a link that has just appeared goes up almost at once, so it works the moment it is copied

  useEffect(() => {
    if (!on) { sent.current = ''; lastToken.current = ''; return undefined }
    const sig = `${token}|${ics.replace(/DTSTAMP:\S+/g, '')}`
    if (sig === sent.current) return undefined
    const id = setTimeout(() => {
      pushFeed(token, ics).then(() => { sent.current = sig }).catch(() => { /* shown in Settings; retried on the next change */ })
    }, token !== lastToken.current ? 1000 : 15_000)
    lastToken.current = token
    return () => clearTimeout(id)
  }, [on, token, ics])

  return null
}
