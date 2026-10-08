// Rule-based insight sentences for one day. No AI, just arithmetic.
import { isSameDay, parseISO, subDays } from 'date-fns'
import { dateKey, daysAgoLabel, focusByHour, isOverdue, tasksOn, totalMinutes } from './tasks'

const fmtHour = (h) => {
  const hour = h % 24
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

export function buildInsights({ tasks, day, now, categories }) {
  const key = dateKey(day)
  const isToday = isSameDay(day, now)
  const list = tasksOn(tasks, key)
  const out = []

  if (list.length === 0) {
    out.push({ tone: 'lav', icon: 'sparkles', text: isToday
      ? 'Nothing is planned for today. A clean slate: press ⌘K to add a task.'
      : 'Nothing was planned for this day.' })
  }

  // Overdue, only when looking at today.
  if (isToday) {
    const overdue = tasks.filter((t) => isOverdue(t, now)).sort((a, b) => a.date.localeCompare(b.date))
    if (overdue.length) {
      const first = overdue[0]
      const more = overdue.length - 1
      out.push({ tone: 'coral', icon: 'alert', text:
        `Overdue: '${first.title}' was due ${daysAgoLabel(first.date, now)}${more ? `, plus ${more} more unfinished task${more === 1 ? '' : 's'}` : ''}.` })
    }
  }

  // Completion vs the 7-day average (only days that had tasks).
  if (list.length) {
    const done = list.filter((t) => t.status === 'completed').length
    const rate = done / list.length
    const rates = []
    for (let i = 1; i <= 7; i++) {
      const d = tasksOn(tasks, dateKey(subDays(day, i)))
      if (d.length) rates.push(d.filter((t) => t.status === 'completed').length / d.length)
    }
    if (rates.length) {
      const avg = rates.reduce((s, r) => s + r, 0) / rates.length
      const pct = Math.round(rate * 100), avgPct = Math.round(avg * 100)
      if (rate > avg + 0.05) out.push({ tone: 'mint', icon: 'trend', text: `${pct}% done so far, better than your 7-day average of ${avgPct}%.` })
      else if (rate < avg - 0.05) out.push({ tone: 'butter', icon: 'trend', text: isToday
        ? `Your 7-day average is ${avgPct}%, so there's still time to catch up.`
        : `${pct}% done, below your 7-day average of ${avgPct}%.` })
      else out.push({ tone: 'sky', icon: 'trend', text: `${pct}% done, in line with your 7-day average.` })
    }
  }

  // Focus peak: best 3-hour window holding ≥40% of focus time.
  const hours = focusByHour(tasks, day, now)
  const total = hours.reduce((s, h) => s + h.minutes, 0)
  if (total >= 30) {
    let best = { start: 0, sum: 0 }
    for (let h = 0; h <= 21; h++) {
      const sum = hours[h].minutes + hours[h + 1].minutes + hours[h + 2].minutes
      if (sum > best.sum) best = { start: h, sum }
    }
    if (best.sum / total >= 0.4) {
      out.push({ tone: 'sky', icon: 'clock', text: `Most of your focus time was between ${fmtHour(best.start)} and ${fmtHour(best.start + 3)}.` })
    }
  }

  // High priority.
  const high = list.filter((t) => t.priority === 'high')
  if (high.length) {
    const pending = high.filter((t) => t.status !== 'completed').length
    out.push(pending
      ? { tone: 'coral', icon: 'flag', text: `${pending} high-priority task${pending === 1 ? ' is' : 's are'} still pending.` }
      : { tone: 'mint', icon: 'flag', text: `All ${high.length} high-priority task${high.length === 1 ? '' : 's'} ${high.length === 1 ? 'is' : 'are'} done.` })
  }

  // Estimate accuracy over the last 7 days: actual focus vs estimate on finished tasks.
  {
    const from = dateKey(subDays(day, 6)), to = key
    const done = tasks.filter((t) => t.status === 'completed' && t.date && t.date >= from && t.date <= to && t.sessions.length)
    if (done.length >= 3) {
      const est = done.reduce((s, t) => s + t.durationMinutes, 0)
      const act = done.reduce((s, t) => s + totalMinutes(t, now), 0)
      if (est > 0) {
        const ratio = act / est
        if (ratio > 1.15) out.push({ tone: 'peach', icon: 'clock', text: `You tend to underestimate: finished tasks took ${Math.round((ratio - 1) * 100)}% longer than planned this week.` })
        else if (ratio < 0.85) out.push({ tone: 'mint', icon: 'clock', text: `You finish faster than planned: about ${Math.round((1 - ratio) * 100)}% under estimate this week.` })
        else out.push({ tone: 'mint', icon: 'clock', text: `Your estimates are accurate: within ${Math.round(Math.abs(ratio - 1) * 100)}% of actual time this week.` })
      }
    }
  }

  // Top category by planned minutes.
  if (list.length) {
    const byCat = new Map()
    for (const t of list) byCat.set(t.category, (byCat.get(t.category) || 0) + t.durationMinutes)
    const planned = [...byCat.values()].reduce((s, m) => s + m, 0)
    const [topId, topMin] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
    const cat = categories.find((c) => c.id === topId)
    if (cat && planned) out.push({ tone: cat.color, icon: 'pie', text: `${cat.name} took up ${Math.round((topMin / planned) * 100)}% of your planned day.` })
  }

  return out.slice(0, 5)
}
