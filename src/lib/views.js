// Saved views (filters) and task templates. Both live in the workspace's
// settings, so they sync with everything else.
import { addDays } from 'date-fns'
import { dateKey, isOverdue, newSubtask } from './tasks'
import { cleanTags } from './taskMeta'

// ---- views ---------------------------------------------------------------------------
// A view is a name plus what to show: a text search and any of
// When (all | today | week | overdue | nodate), Category, Priority and Tag.
export const MAX_VIEWS = 20
export const WHEN_OPTIONS = [
  { value: 'all', label: 'Any day' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'overdue', label: 'Carried over' },
  { value: 'nodate', label: 'No date' },
]
export const blankCrit = () => ({ when: 'all', category: '', priority: '', tag: '' })

export const critCount = (c, text = '') => (c.when !== 'all' ? 1 : 0) + (c.category ? 1 : 0) + (c.priority ? 1 : 0) + (c.tag ? 1 : 0) + (text.trim() ? 1 : 0)

export function matches(task, crit, text, now) {
  const q = text.trim().toLowerCase()
  if (q && !`${task.title} ${task.description} ${(task.tags || []).map((g) => `#${g}`).join(' ')}`.toLowerCase().includes(q)) return false
  if (crit.category && task.category !== crit.category) return false
  if (crit.priority && task.priority !== crit.priority) return false
  if (crit.tag && !(task.tags || []).includes(crit.tag)) return false
  if (crit.when === 'all') return true
  const today = dateKey(now)
  if (crit.when === 'today') return task.date === today
  if (crit.when === 'week') return !!task.date && task.date >= today && task.date <= dateKey(addDays(now, 6))
  if (crit.when === 'overdue') return isOverdue(task, now)
  if (crit.when === 'nodate') return !task.date
  return true
}

const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
export function cleanViews(list) {
  const seen = new Set()
  return (Array.isArray(list) ? list : []).filter((v) => v && typeof v.id === 'string' && str(v.name, 1) && !seen.has(v.id) && seen.add(v.id)).slice(0, MAX_VIEWS).map((v) => ({
    id: v.id,
    name: str(v.name, 30),
    text: str(v.text, 60),
    crit: {
      when: WHEN_OPTIONS.some((o) => o.value === v.crit?.when) ? v.crit.when : 'all',
      category: str(v.crit?.category, 40),
      priority: ['high', 'medium', 'low'].includes(v.crit?.priority) ? v.crit.priority : '',
      tag: str(v.crit?.tag, 24),
    },
  }))
}

// ---- templates -------------------------------------------------------------------------
// A template is a task to start from: title, notes, length, priority, category,
// tags, reminders and a checklist (steps are plain titles).
export const MAX_TEMPLATES = 30

export function templateFromTask(task, name, id) {
  return {
    id,
    name: str(name, 30) || str(task.title, 30) || 'Template',
    title: str(task.title, 120),
    description: String(task.description || '').slice(0, 1000),
    durationMinutes: task.durationMinutes || 30,
    priority: task.priority || 'medium',
    category: task.category || '',
    tags: cleanTags(task.tags),
    client: task.client || null,
    billable: task.billable === true,
    reminders: Array.isArray(task.reminders) ? task.reminders.filter((m) => Number.isFinite(m) && m >= 0).slice(0, 6) : null,
    ...stepsOf((task.subtasks || []).map((s) => [s.title, s.required === true, s.depth || 0])),
    rule: task.requireRule === 'any' ? 'any' : 'all',
  }
}

// Steps are plain titles; `required` is a list of booleans in the same order (so templates saved
// before required steps existed still load: none of their steps are required).
function stepsOf(pairs) {
  const kept = pairs.map(([title, req, depth]) => [str(title, 120), req === true, Math.max(0, Math.min(2, Number.isInteger(depth) ? depth : 0))]).filter(([title]) => title).slice(0, 30)
  return { steps: kept.map(([title]) => title), required: kept.map(([, req]) => req), depths: kept.map(([, , d]) => d) }
}

export function cleanTemplates(list) {
  const seen = new Set()
  return (Array.isArray(list) ? list : []).filter((t) => t && typeof t.id === 'string' && !seen.has(t.id) && seen.add(t.id)).slice(0, MAX_TEMPLATES).map((t) => ({
    id: t.id,
    name: str(t.name, 30) || str(t.title, 30) || 'Template',
    title: str(t.title, 120),
    description: String(t.description || '').slice(0, 1000),
    durationMinutes: Number.isFinite(t.durationMinutes) ? Math.min(480, Math.max(5, t.durationMinutes)) : 30,
    priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
    category: str(t.category, 40),
    tags: cleanTags(t.tags),
    client: typeof t.client === 'string' && t.client.trim() ? t.client.trim().slice(0, 60) : null,
    billable: t.billable === true,
    reminders: Array.isArray(t.reminders) ? t.reminders.filter((m) => Number.isFinite(m) && m >= 0).slice(0, 6) : null,
    ...stepsOf((Array.isArray(t.steps) ? t.steps : []).map((s, i) => [s, Array.isArray(t.required) && t.required[i] === true, Array.isArray(t.depths) ? t.depths[i] : 0])),
    rule: t.rule === 'any' ? 'any' : 'all',
  }))
}

// The fields a template fills into a new task (fresh checklist ids, all unticked).
export function taskFieldsFromTemplate(t, categories) {
  return {
    title: t.title,
    description: t.description,
    durationMinutes: t.durationMinutes,
    priority: t.priority,
    ...(categories.some((c) => c.id === t.category) ? { category: t.category } : {}),
    tags: t.tags,
    ...(t.client ? { client: t.client, billable: t.billable === true } : {}),
    reminders: t.reminders,
    subtasks: t.steps.map((s, i) => newSubtask(s, t.required?.[i] === true, t.depths?.[i] || 0)),
    requireRule: t.rule === 'any' ? 'any' : 'all',
  }
}
