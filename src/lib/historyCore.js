// Version history's plain rules (no imports, so Node tests load them): which copies to keep, and
// what changed between a copy and now. lib/history.js does the saving and restoring.
export const KEEP_HOURS = 24
export const KEEP_DAYS = 30
const HOUR = 3600_000

// Which copies to keep (pure, tested): all from the last KEEP_HOURS hours, then the newest of each
// calendar day for KEEP_DAYS days. `snaps` are { id, at }; returns the ids to delete.
export function toPrune(snaps, now = Date.now()) {
  const sorted = [...snaps].sort((a, b) => b.at - a.at)
  const seenDay = new Set()
  const drop = []
  for (const s of sorted) {
    if (now - s.at < KEEP_HOURS * HOUR) continue
    const day = new Date(s.at).toDateString()
    if (now - s.at > KEEP_DAYS * 24 * HOUR || seenDay.has(day)) drop.push(s.id)
    else seenDay.add(day)
  }
  return drop
}

// The task lists inside a copy: { [listKey]: tasks[] } for every workspace (keys end in 'tasks').
export function tasksIn(data) {
  const out = {}
  for (const [k, v] of Object.entries(data?.json || {})) if (/(^|\.)tasks$/.test(k) && Array.isArray(v)) out[k] = v
  return out
}

// What changed between a copy's tasks and now (pure, tested): tasks only in the copy (deleted since),
// tasks only now (added since), and tasks in both that differ.
export function taskDiff(then = [], now = []) {
  const byId = new Map(now.map((t) => [t.id, t]))
  const was = new Set(then.map((t) => t.id))
  const deleted = then.filter((t) => !byId.has(t.id))
  const added = now.filter((t) => !was.has(t.id))
  const changed = then.filter((t) => byId.has(t.id) && JSON.stringify(t) !== JSON.stringify(byId.get(t.id)))
  return { deleted, added, changed }
}
