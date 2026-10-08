// Google Calendar hand-off without an API or login: a pre-filled "add event"
// URL for one task, and an .ics file for everything (Google imports it).
import { addDays, addMinutes, format, parseISO } from 'date-fns'

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const stamp = (d) => format(d, "yyyyMMdd'T'HHmmss") // local time, no Z
const dateOnly = (d) => format(d, 'yyyyMMdd')

export function taskWindow(task) {
  const day = parseISO(task.date)
  if (!task.startTime) return { allDay: true, start: day, end: addDays(day, 1) }
  const start = addMinutes(day, toMin(task.startTime))
  return { allDay: false, start, end: addMinutes(start, task.durationMinutes || 30) }
}

// Opens Google Calendar's event editor pre-filled; the user saves it in their own account.
export function googleCalendarUrl(task, categoryName) {
  if (!task.date) return null
  const { allDay, start, end } = taskWindow(task)
  const dates = allDay ? `${dateOnly(start)}/${dateOnly(end)}` : `${stamp(start)}/${stamp(end)}`
  const details = [task.description, categoryName ? `Category: ${categoryName}` : null, `Priority: ${task.priority}`, 'From Daily Planner'].filter(Boolean).join('\n')
  const p = new URLSearchParams({ action: 'TEMPLATE', text: task.title, dates, details })
  if (task.recurrence) p.set('recur', `RRULE:${rrule(task.recurrence)}`)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

function rrule(rec) {
  const parts = []
  if (rec.freq === 'daily') parts.push('FREQ=DAILY')
  else if (rec.freq === 'weekdays') parts.push('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
  else if (rec.freq === 'weekly') parts.push('FREQ=WEEKLY')
  else if (rec.freq === 'monthly') parts.push('FREQ=MONTHLY')
  if (rec.until) parts.push(`UNTIL=${rec.until.replace(/-/g, '')}T235959`)
  return parts.join(';')
}

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)

// iCalendar text for all dated tasks. A recurring series becomes one event
// with an RRULE (plus EXDATEs for skipped days); its generated occurrences are left out.
export function buildIcs(tasks, categories = []) {
  const catName = (id) => categories.find((c) => c.id === id)?.name
  const now = format(new Date(), "yyyyMMdd'T'HHmmss")
  const seenSeries = new Set()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daily Planner//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Daily Planner']
  const sorted = [...tasks].filter((t) => t.date).sort((a, b) => a.date.localeCompare(b.date))
  for (const t of sorted) {
    if (t.seriesId && t.recurrence) {
      if (seenSeries.has(t.seriesId)) continue
      seenSeries.add(t.seriesId)
    }
    const { allDay, start, end } = taskWindow(t)
    lines.push('BEGIN:VEVENT', `UID:${t.id}@daily-planner`, `DTSTAMP:${now}`)
    if (allDay) lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`, `DTEND;VALUE=DATE:${dateOnly(end)}`)
    else lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`)
    lines.push(`SUMMARY:${esc(t.title)}`)
    const desc = [t.description, catName(t.category) ? `Category: ${catName(t.category)}` : null, `Priority: ${t.priority}`].filter(Boolean).join('\n')
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`)
    if (t.recurrence) {
      lines.push(`RRULE:${rrule(t.recurrence)}`)
      for (const k of t.recurrence.skip || []) lines.push(`EXDATE${allDay ? ';VALUE=DATE' : ''}:${allDay ? k.replace(/-/g, '') : stamp(addMinutes(parseISO(k), toMin(t.startTime)))}`)
    }
    if (t.status === 'completed') lines.push('STATUS:CONFIRMED', 'X-DAILY-PLANNER-DONE:TRUE')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(tasks, categories) {
  const blob = new Blob([buildIcs(tasks, categories)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: 'daily-planner.ics' })
  a.click()
  URL.revokeObjectURL(url)
}
