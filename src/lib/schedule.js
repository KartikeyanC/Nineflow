// "Plan my day": timebox a day's unscheduled open tasks into free slots.
import { dateKey, tasksOn } from './tasks'

const PRI = { high: 0, medium: 1, low: 2 }
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const ceil15 = (m) => Math.ceil(m / 15) * 15

export const toHHMMPublic = (min) => toHHMM(min)

// Returns { patches: [{id, startTime}], unplaced: [task], end }.
// Fills from `start` (or from now, if the day is today) to `end`, highest
// priority first, longest first within a priority, leaving a short gap.
export function planDay(tasks, key, now = new Date(), { start = 9 * 60, end = 18 * 60, gap = 5, busy: extraBusy = [] } = {}) {
  const list = tasksOn(tasks, key)
  // Timed tasks, plus anything else that blocks the day (calendar meetings), as [start, end] minutes.
  const busy = list.filter((t) => t.startTime).map((t) => { const s = toMin(t.startTime); return [s, s + t.durationMinutes] }).concat(extraBusy.map(([a, b]) => [a, b]))
  const candidates = list
    .filter((t) => !t.startTime && t.status === 'todo')
    .sort((a, b) => PRI[a.priority] - PRI[b.priority] || b.durationMinutes - a.durationMinutes)

  let cursor = start
  if (key === dateKey(now)) {
    cursor = Math.max(start, ceil15(now.getHours() * 60 + now.getMinutes() + 5))
    // Planning after hours: let the evening run until 23:00.
    if (cursor >= end - 30) end = Math.max(end, 23 * 60)
  }

  const patches = []
  const unplaced = []
  for (const t of candidates) {
    const dur = t.durationMinutes || 30
    let s = cursor
    let placed = false
    while (s + dur <= end) {
      const clash = busy.find(([bs, be]) => s < be + gap && s + dur + gap > bs)
      if (!clash) {
        patches.push({ id: t.id, startTime: toHHMM(s) })
        busy.push([s, s + dur])
        placed = true
        break
      }
      s = ceil15(clash[1] + gap)
    }
    if (!placed) unplaced.push(t)
  }
  return { patches, unplaced, end }
}

// One-line summary of a plan result for the UI.
export function describePlan(plan) {
  const n = plan.patches.length, u = plan.unplaced.length
  if (!n && !u) return 'Nothing to plan.'
  if (!u) return `Scheduled ${n} task${n === 1 ? '' : 's'}.`
  if (!n) return `No free slot before ${toHHMM(plan.end)} for ${u} task${u === 1 ? '' : 's'}.`
  return `Scheduled ${n}, ${u} didn't fit before ${toHHMM(plan.end)}.`
}

export const unscheduledOn = (tasks, key) => tasksOn(tasks, key).filter((t) => !t.startTime && t.status === 'todo')
