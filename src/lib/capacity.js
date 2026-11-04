// Capacity and estimates: how much planned work fits into the hours you have,
// when you'd finish, and what your past tasks say a new one will take.
// Pure helpers over the task array, like tasks.js.
import { dateKey, tasksOn, totalMinutes } from './tasks'

export const DEFAULT_WORK_HOURS = { start: '09:00', end: '18:00', breakMinutes: 60 }

export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
// End of the working day in minutes from its start's midnight: a night shift (22:00-06:00) ends past 1440.
export const workEnd = (hours) => { const s = toMin(hours.start), e = toMin(hours.end); return e < s ? e + 1440 : e }
export const hhmm = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Work a task still needs: its estimate minus the time already logged on it.
export const remainingMinutes = (t, now = new Date()) =>
  t.status === 'completed' ? 0 : Math.max(0, (t.durationMinutes || 0) - totalMinutes(t, now))

// The load of one day against your working hours.
//   capacity  - working minutes in the whole day (break excluded)
//   available - working minutes still ahead (today: from now on)
//   review    - estimated minutes sitting with someone else (not part of left)
//   left      - estimated minutes of open work still to do
//   over      - left - available (positive = more than fits)
//   finish    - minute of day you'd finish if you started now and kept going
export function dayLoad(tasks, key, now = new Date(), hours = DEFAULT_WORK_HOURS) {
  const start = toMin(hours.start), end = workEnd(hours)
  const brk = Math.min(hours.breakMinutes || 0, end - start)
  const capacity = end - start - brk
  const list = tasksOn(tasks, key)
  const isToday = key === dateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const from = isToday ? Math.max(nowMin, start) : start
  // The break still ahead shrinks in proportion to the day that has passed.
  const breakLeft = end > start ? Math.round(brk * Math.max(0, Math.min(1, (end - from) / (end - start)))) : 0
  const available = Math.max(0, end - from - breakLeft)

  const sum = (xs, f) => xs.reduce((s, t) => s + f(t), 0)
  const done = sum(list.filter((t) => t.status === 'completed'), (t) => t.durationMinutes || 0)
  const working = sum(list.filter((t) => t.status === 'working'), (t) => remainingMinutes(t, now))
  const todo = sum(list.filter((t) => t.status === 'todo'), (t) => remainingMinutes(t, now))
  // Work in review is waiting on someone else, so it never eats your capacity.
  // It is still shown on the bar, so the time doesn't quietly disappear.
  const review = sum(list.filter((t) => t.status === 'review'), (t) => remainingMinutes(t, now))
  const left = working + todo
  // Assumes you still take the rest of your break.
  const finish = left > 0 ? from + left + breakLeft : null

  return {
    key, isToday, start, end, capacity, available, done, working, todo, review, left,
    planned: done + left + review, over: left - available, finish, afterHours: isToday && nowMin >= end,
  }
}

const PRI = { high: 0, medium: 1, low: 2 }

// Which carried-over tasks fit into `room` minutes: most important first,
// then shortest, so the important ones land and small ones fill the gaps.
export function fitInto(candidates, room, now = new Date()) {
  const picked = []
  let used = 0
  const sorted = [...candidates].sort((a, b) => PRI[a.priority] - PRI[b.priority] || remainingMinutes(a, now) - remainingMinutes(b, now))
  for (const t of sorted) {
    const need = Math.max(remainingMinutes(t, now), 5)
    if (used + need <= room) { picked.push(t); used += need }
  }
  return { picked, used }
}

// Least important open tasks to move off an overfull day, until it fits or
// only high-priority work is left.
export function trimDay(tasks, key, over, now = new Date()) {
  // Repeating tasks stay put: their series already has a copy on the next day.
  const open = tasksOn(tasks, key).filter((t) => t.status === 'todo' && !t.seriesId)
  const order = [...open].sort((a, b) => PRI[b.priority] - PRI[a.priority] || remainingMinutes(b, now) - remainingMinutes(a, now))
  const picked = []
  let freed = 0
  for (const t of order) {
    if (freed >= over) break
    if (t.priority === 'high') break
    picked.push(t)
    freed += remainingMinutes(t, now)
  }
  return picked
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Finished tasks with logged time, newest first.
const timedDone = (tasks, now) => tasks
  .filter((t) => t.status === 'completed' && t.sessions.length)
  .map((t) => ({ t, actual: totalMinutes(t, now) }))
  .filter((x) => x.actual >= 5)
  .sort((a, b) => (b.t.completedAt || '').localeCompare(a.t.completedAt || ''))

// What a new task in this category usually takes: the median actual time of
// your last 12 finished ones (needs at least 3), rounded to 5 minutes.
export function learnedDuration(tasks, categoryId, now = new Date()) {
  const xs = timedDone(tasks, now).filter((x) => x.t.category === categoryId).slice(0, 12)
  if (xs.length < 3) return null
  return { minutes: Math.max(10, Math.round(median(xs.map((x) => x.actual)) / 5) * 5), samples: xs.length }
}

// Actual / estimate per category over a date range (needs 3+ tasks each).
export function categoryAccuracy(tasks, fromKey, toKey, now = new Date()) {
  const by = new Map()
  for (const x of timedDone(tasks, now)) {
    if (!x.t.date || x.t.date < fromKey || x.t.date > toKey) continue
    const r = by.get(x.t.category) || { est: 0, act: 0, n: 0 }
    r.est += x.t.durationMinutes || 0
    r.act += x.actual
    r.n += 1
    by.set(x.t.category, r)
  }
  return [...by.entries()]
    .filter(([, r]) => r.n >= 3 && r.est > 0)
    .map(([category, r]) => ({ category, ratio: r.act / r.est, n: r.n }))
}
