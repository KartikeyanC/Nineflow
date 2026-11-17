// A task's change history: every change to the things you can see and set on a task, with what it
// was, what it became and when. Recorded in one place (the planner store's setTasks), so a change
// made anywhere — the task panel, a drag on the Board, a bulk move, voice, carrying work forward —
// is noted. Stored on the task as `history: [{ at, field, from, to }]`, oldest first.
//
// Typing a title makes a change per key; typed text changed again within a couple of minutes is
// folded into one entry ("from" the first value, "to" the last), and dropped if they end where they began.

export const HISTORY_LIMIT = 300
const FOLD_MS = 2 * 60 * 1000
const TYPED = new Set(['title', 'description', 'client', 'tags', 'fields'])

const text = (v, n = 160) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, n) : null)

// Each tracked thing → a small, comparable value (string, number, boolean or null).
const TRACKED = {
  title: (t) => text(t.title, 120),
  description: (t) => text(t.description),
  status: (t) => t.status || null,
  column: (t) => t.column || null,
  date: (t) => t.date || null,
  dueDate: (t) => t.dueDate || null,
  startTime: (t) => t.startTime || null,
  durationMinutes: (t) => (Number.isFinite(t.durationMinutes) ? t.durationMinutes : null),
  priority: (t) => t.priority || null,
  category: (t) => t.category || null,
  recurrence: (t) => (t.recurrence?.freq ? `${t.recurrence.freq}${t.recurrence.until ? `|${t.recurrence.until}` : ''}` : null),
  tags: (t) => ((t.tags || []).length ? t.tags.join(', ') : null),
  client: (t) => t.client || null,
  billable: (t) => !!t.billable,
  private: (t) => !!t.private,
  askedBy: (t) => t.askedBy || null,
  why: (t) => t.why || null,
  reminders: (t) => (Array.isArray(t.reminders) ? (t.reminders.length ? t.reminders.join(',') : 'none') : null), // null = the Settings default
  steps: (t) => { const s = t.subtasks || []; return s.length ? `${s.filter((x) => x.done).length}/${s.length}` : null },
  files: (t) => ((t.files || []).length || null),
  hold: (t) => (t.hold ? text(t.hold.reason, 120) || 'Paused' : null),
  dropped: (t) => (t.dropped ? text(t.dropped.reason, 120) || 'Dropped' : null),
  fields: (t) => { const f = t.fields && typeof t.fields === 'object' ? t.fields : {}; const k = Object.keys(f).filter((x) => f[x] !== '' && f[x] != null).sort(); return k.length ? JSON.stringify(k.map((x) => [x, f[x]])) : null },
}
export const TRACKED_FIELDS = Object.keys(TRACKED)

/** The changes between two versions of one task: [{ field, from, to }]. */
export function diffTask(before, after) {
  const out = []
  for (const field of TRACKED_FIELDS) {
    const from = TRACKED[field](before)
    const to = TRACKED[field](after)
    if (from !== to) out.push({ field, from, to })
  }
  return out
}

/** `history` with new changes added (folding quick repeats of the same thing). */
export function addChanges(history, changes, at = new Date()) {
  const list = Array.isArray(history) ? history.slice() : []
  const iso = at.toISOString()
  for (const c of changes) {
    // The last entry for this field, if it is recent and nothing else was changed after it.
    // Only typed text folds: a date, status or priority picked twice is two changes, both kept.
    const last = list[list.length - 1]
    if (TYPED.has(c.field) && last && last.field === c.field && at - new Date(last.at) < FOLD_MS) {
      if (last.from === c.to) list.pop() // back where it began
      else list[list.length - 1] = { ...last, to: c.to, at: iso }
      continue
    }
    list.push({ at: iso, field: c.field, from: c.from, to: c.to })
  }
  return list.slice(-HISTORY_LIMIT)
}

/**
 * The next task list with each changed task's history brought up to date. Tasks that are new or
 * removed get no entry here (a task's created time is kept on the task already).
 */
export function withHistory(prev, next, at = new Date()) {
  if (prev === next || !Array.isArray(next)) return next
  const byId = new Map(prev.map((t) => [t.id, t]))
  let changed = false
  const out = next.map((t) => {
    const before = byId.get(t.id)
    if (!before || before === t) return t
    const changes = diffTask(before, t)
    if (!changes.length) return t
    changed = true
    return { ...t, history: addChanges(before.history, changes, at) }
  })
  return changed ? out : next
}

/** A saved history, checked: drops anything malformed. */
export function cleanHistory(h) {
  if (!Array.isArray(h)) return []
  const ok = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
  return h.filter((e) => e && typeof e.at === 'string' && TRACKED_FIELDS.includes(e.field) && ok(e.from) && ok(e.to))
    .slice(-HISTORY_LIMIT)
    .map((e) => ({ at: e.at, field: e.field, from: e.from, to: e.to }))
}
