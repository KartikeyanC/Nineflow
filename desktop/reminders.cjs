// Reminders fired by the desktop app's main process, so they arrive while the planner
// window is closed (NineFlow keeps running in the tray) and right after a restart.
//
// The planner sends the upcoming schedule (src/lib/taskMeta.js → reminderSchedule)
// whenever tasks or settings change. It is saved to disk, so a fresh start (or a start
// at sign-in) can fire reminders before the planner has even loaded.

const fs = require('node:fs')

const LATE_GRACE = 15 * 60_000 // fire up to 15 min late (the computer slept, or the app just started); older ones are dropped
const MAX = 300
const TICK = 20_000

// Keep only well-formed entries: { id, at, title, body?, taskId? }.
function clean(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => r && typeof r.id === 'string' && Number.isFinite(r.at) && typeof r.title === 'string')
    .slice(0, MAX)
    .map((r) => ({ id: r.id.slice(0, 200), at: r.at, title: r.title.slice(0, 200), body: typeof r.body === 'string' ? r.body.slice(0, 300) : '', taskId: typeof r.taskId === 'string' ? r.taskId : null }))
}

// What should fire now. Several for one task at once (the app was off for a while):
// only the latest is shown; the earlier ones are just marked as done.
function due(list, fired, now) {
  const ready = list.filter((r) => !fired.has(r.id) && r.at <= now && now - r.at <= LATE_GRACE)
  const latest = new Map()
  for (const r of ready) {
    const key = r.taskId || r.id
    if (!latest.has(key) || r.at > latest.get(key).at) latest.set(key, r)
  }
  const show = new Set([...latest.values()].map((r) => r.id))
  return { show: ready.filter((r) => show.has(r.id)), silent: ready.filter((r) => !show.has(r.id)) }
}

function createScheduler({ file, notify, clock = () => Date.now() }) {
  let list = []
  let fired = new Set()
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    list = clean(saved.list)
    fired = new Set(Array.isArray(saved.fired) ? saved.fired.filter((x) => typeof x === 'string') : [])
  } catch { /* first run */ }

  const save = () => {
    try { fs.writeFileSync(file, JSON.stringify({ list, fired: [...fired] })) } catch { /* ignore */ }
  }

  const tick = () => {
    const { show, silent } = due(list, fired, clock())
    if (!show.length && !silent.length) return
    for (const r of [...show, ...silent]) fired.add(r.id)
    save()
    for (const r of show) { try { notify(r) } catch { /* keep going */ } }
  }

  // A new schedule replaces the old one. What already fired stays fired, and ids that
  // are no longer scheduled are forgotten so the file doesn't grow.
  const set = (next) => {
    list = clean(next)
    const ids = new Set(list.map((r) => r.id))
    fired = new Set([...fired].filter((id) => ids.has(id)))
    save()
    tick()
  }

  const timer = setInterval(tick, TICK)
  if (timer.unref) timer.unref()
  tick()
  return { set, tick, stop: () => clearInterval(timer), get size() { return list.length } }
}

module.exports = { createScheduler, due, clean, LATE_GRACE }
