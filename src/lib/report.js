// A day's report built from planner tasks and their real focus sessions,
// so nothing has to be typed twice. Used by the shutdown flow and by the
// Work OS daily report.
import { format, parseISO } from 'date-fns'
import { fmtMinutes, minutesOnDay, tasksOn, totalMinutes } from './tasks'

export function dayReport({ tasks, key, now = new Date(), categories = [], note = {}, name = '' }) {
  const day = parseISO(key)
  const list = tasksOn(tasks, key)
  const done = list.filter((t) => t.status === 'completed')
  const open = list.filter((t) => t.status !== 'completed')
  // Focus counts every task worked on that day, whatever its date.
  const focus = tasks.reduce((s, t) => s + minutesOnDay(t, day, now), 0)
  const cat = (id) => categories.find((c) => c.id === id)?.name
  const took = (t) => {
    const m = totalMinutes(t, now)
    return m >= 1 ? `, took ${fmtMinutes(m)}` : ''
  }

  const lines = [
    `Daily report – ${format(day, 'EEEE, d MMM yyyy')}`,
    '',
    note.target ? `Main target: ${note.target}` : null,
    `Summary: ${done.length} of ${list.length} task${list.length === 1 ? '' : 's'} done, ${fmtMinutes(focus)} focused.`,
    '',
    'Done:',
    ...(done.length ? done.map((t) => `• ${t.title}${cat(t.category) ? ` (${cat(t.category)})` : ''} – estimate ${fmtMinutes(t.durationMinutes)}${took(t)}`) : ['• —']),
    open.length ? '' : null,
    open.length ? 'Still open:' : null,
    ...open.map((t) => `• ${t.title}${t.status === 'working' ? ' (in progress)' : ''}`),
    '',
    `Blockers: ${note.blockers || 'none'}`,
    `Tomorrow: ${note.tomorrow || '—'}`,
    name ? '' : null,
    name ? `— ${name}` : null,
  ].filter((l) => l !== null)

  return { list, done, open, focus, text: lines.join('\n') }
}
