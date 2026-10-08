// Generates ~6 weeks of realistic tasks, sessions and habit logs around today.
// Seeded so "Load sample data" is deterministic for a given day.
import { addDays, format, startOfDay } from 'date-fns'

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TITLES = {
  work: ['Review pull requests', 'Sprint planning', 'Write status update', 'Fix login bug', 'Refactor billing module', 'Customer call', '1:1 with manager', 'Prepare demo', 'Update roadmap', 'Triage inbox'],
  design: ['Design onboarding flow', 'Polish dashboard mockup', 'Icon set pass', 'Design review', 'Prototype settings page', 'Typography audit'],
  personal: ['Buy groceries', 'Call mom', 'Pay rent', 'Plan weekend trip', 'Water plants', 'Tidy desk', 'Book dentist', 'Renew passport'],
  health: ['Morning run', 'Gym session', 'Yoga', 'Meal prep', 'Evening walk', 'Stretch routine'],
  learning: ['Read chapter of book', 'Rust tutorial', 'Watch systems talk', 'Practice piano', 'Spanish lesson', 'Write blog notes'],
}
const PRIORITY_W = ['high', 'medium', 'medium', 'medium', 'low', 'low']
const DURATIONS = [30, 45, 60, 60, 90, 120]
const SLOTS = ['08:30', '09:00', '09:30', '10:00', '11:00', '13:00', '14:00', '15:30', '16:00', '17:30', '19:00']

export function generateSample(categories, now = new Date()) {
  const rand = mulberry32(Number(format(now, 'yyyyMMdd')))
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const catIds = categories.map((c) => c.id)
  const titleFor = (catId) => pick(TITLES[catId] || TITLES.work)
  const tasks = []
  let n = 0

  for (let off = -35; off <= 7; off++) {
    const day = addDays(startOfDay(now), off)
    const key = format(day, 'yyyy-MM-dd')
    const weekend = day.getDay() === 0 || day.getDay() === 6
    const count = weekend ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 4)
    const usedSlots = new Set()

    for (let i = 0; i < count; i++) {
      const category = pick(catIds)
      const durationMinutes = pick(DURATIONS)
      let startTime = null
      if (rand() < 0.65) {
        const s = pick(SLOTS)
        if (!usedSlots.has(s)) { usedSlots.add(s); startTime = s }
      }
      const task = {
        id: `s${++n}`,
        title: titleFor(category),
        description: rand() < 0.3 ? 'Added from sample data.' : '',
        date: key,
        startTime,
        durationMinutes,
        category,
        priority: pick(PRIORITY_W),
        status: 'todo',
        startedAt: null,
        completedAt: null,
        createdAt: addDays(day, -1 - Math.floor(rand() * 3)).toISOString(),
        sessions: [],
      }

      const [hh, mm] = (startTime || pick(SLOTS)).split(':').map(Number)
      const start = new Date(day); start.setHours(hh, mm, 0, 0)

      if (off < 0) {
        // Past: mostly done with a session, a few left unfinished (overdue).
        if (rand() < 0.85) {
          const worked = Math.round(durationMinutes * (0.7 + rand() * 0.6))
          const end = new Date(start.getTime() + worked * 60000)
          task.status = 'completed'
          task.startedAt = start.toISOString()
          task.completedAt = end.toISOString()
          task.sessions = [{ start: start.toISOString(), end: end.toISOString() }]
        } else if (off < -7 || (off < -1 && rand() < 0.6)) {
          // Older leftovers get closed late; only the last week stays overdue.
          task.status = 'completed'
          task.completedAt = addDays(start, 1).toISOString()
        }
      } else if (off === 0) {
        // Today: some done, one working, rest to do.
        const hoursNow = now.getHours() * 60 + now.getMinutes()
        const startMin = hh * 60 + mm
        if (startMin + durationMinutes < hoursNow && rand() < 0.7) {
          const end = new Date(start.getTime() + durationMinutes * 60000)
          task.status = 'completed'
          task.startedAt = start.toISOString()
          task.completedAt = end.toISOString()
          task.sessions = [{ start: start.toISOString(), end: end.toISOString() }]
        }
      }
      tasks.push(task)
    }
  }

  // Always leave exactly one of today's tasks running, started 25 min ago.
  // Prefer an open one; otherwise reopen the last task of the day.
  const todayKey = format(now, 'yyyy-MM-dd')
  const todays = tasks.filter((t) => t.date === todayKey)
  const running = todays.find((t) => t.status === 'todo') || todays[todays.length - 1]
  if (running) {
    const s = new Date(now.getTime() - 25 * 60000)
    running.status = 'working'
    running.startedAt = s.toISOString()
    running.completedAt = null
    running.sessions = [{ start: s.toISOString(), end: null }]
  }

  // Two recurring series; the app fills their upcoming occurrences itself.
  const todayStr = format(now, 'yyyy-MM-dd')
  tasks.push(
    { id: 'rs1', title: 'Morning run', description: '', date: todayStr, startTime: '07:30', durationMinutes: 30, category: 'health', priority: 'medium',
      status: 'todo', startedAt: null, completedAt: null, createdAt: now.toISOString(), sessions: [], seriesId: 'rs1', recurrence: { freq: 'weekdays', until: null, skip: [] } },
    { id: 'rs2', title: 'Weekly review', description: 'Plan the week ahead.', date: todayStr, startTime: '17:00', durationMinutes: 45, category: 'work', priority: 'high',
      status: 'todo', startedAt: null, completedAt: null, createdAt: now.toISOString(), sessions: [], seriesId: 'rs2', recurrence: { freq: 'weekly', until: null, skip: [] } },
  )

  const habits = [
    { id: 'hs1', name: 'Read 20 minutes', done: [] },
    { id: 'hs2', name: 'Drink 2L water', done: [] },
    { id: 'hs3', name: 'Stretch', done: [] },
  ].map((h) => {
    const done = []
    for (let off = -35; off <= 0; off++) {
      if (rand() < (off === 0 ? 0.5 : 0.72)) done.push(format(addDays(now, off), 'yyyy-MM-dd'))
    }
    return { ...h, createdAt: addDays(now, -36).toISOString(), done }
  })

  return { tasks, habits }
}
