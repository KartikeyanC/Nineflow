// "Add tasks from a file" (Settings → Your data): a .json list of tasks is added to the planner, next to
// what is already there (a backup import replaces everything; this never does). The file is either a list
// of tasks or { tasks: [...] }, so a NineFlow backup works too. Each task needs a title; the rest is optional:
//   { id, title, description, date: 'yyyy-MM-dd', startTime: 'HH:mm', durationMinutes, priority, category, tags }
// `category` may be a category's id or its name ("Work"); unknown ones fall back to the first category.
// A task that keeps the same `id` is recognised next time ("Already added"), so a file can be added twice safely.
import { isValid, parseISO } from 'date-fns'
import { PRIORITIES } from './tasks'

const MAX = 500
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const ID = /^[A-Za-z0-9_:.-]{1,80}$/
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parseTaskFile(text, categories) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error('That file is not valid JSON.') }
  const list = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : null
  if (!list) throw new Error('No task list found. The file should hold a list of tasks, or { "tasks": [...] }.')
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const ids = new Set(categories.map((c) => c.id))
  const fallback = categories[0]?.id || 'work'

  const items = list.slice(0, MAX).flatMap((t, i) => {
    const title = str(t?.title, 200)
    if (!title) return []
    const date = typeof t.date === 'string' && DATE.test(t.date) && isValid(parseISO(t.date)) ? t.date : null
    const cat = str(t.category, 60)
    const minutes = Number(t.durationMinutes)
    return [{
      id: typeof t.id === 'string' && ID.test(t.id) ? t.id : `file-${Date.now().toString(36)}-${i}`,
      title,
      description: str(t.description, 5000),
      date,
      startTime: date && typeof t.startTime === 'string' && TIME.test(t.startTime) ? t.startTime : null,
      durationMinutes: Number.isFinite(minutes) && minutes >= 5 ? Math.min(720, Math.round(minutes)) : undefined,
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
      category: ids.has(cat) ? cat : byName.get(cat.toLowerCase()) || fallback,
      tags: Array.isArray(t.tags) ? t.tags.map((x) => str(x, 30).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')).filter(Boolean).slice(0, 6) : [],
    }]
  })
  if (!items.length) throw new Error('The file has no tasks with a title.')
  return { items, cut: list.length > MAX }
}
