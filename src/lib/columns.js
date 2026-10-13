// Board columns. A task always has one of three statuses (todo, working,
// completed), which is what the timer, the reports and the capacity bar use.
// A column is a name on the Board that counts as one of those statuses, so you
// can add "In review" (counts as Working) or "Waiting" (counts as To do)
// without changing how anything is measured.
//
//   settings.columns: [{ id, name, base, color }]   (the three originals always exist)
//   task.column:      id of a custom column, or null for the original of its status
export const BASES = ['todo', 'working', 'completed']
export const BASE_LABEL = { todo: 'To do', working: 'Working', completed: 'Completed' }
export const MAX_COLUMNS = 8
export const COLUMN_NAME_MAX = 24

export const DEFAULT_COLUMNS = [
  { id: 'todo', name: 'To Do', base: 'todo', color: 'accent' },
  { id: 'working', name: 'Working', base: 'working', color: 'sky' },
  { id: 'completed', name: 'Completed', base: 'completed', color: 'mint' },
]

// Everyone starts with an "In review" column between Working and Completed. It
// counts as To do, so moving a card there stops its timer. It is added once
// (settings.columnsV) and can be deleted for good.
export const REVIEW_COLUMN = { id: 'col_review', name: 'In review', base: 'todo', color: 'lav' }
export const COLUMNS_VERSION = 2

// Literal class names, so Tailwind builds every one of them.
export const COLUMN_STYLE = {
  accent: { label: 'Orange', panel: 'bg-accent-soft/60', text: 'text-accent', header: 'bg-accent-soft', dot: 'bg-accent' },
  sky: { label: 'Sky', panel: 'bg-sky/60', text: 'text-sky-fg', header: 'bg-sky', dot: 'bg-sky-fg' },
  mint: { label: 'Mint', panel: 'bg-mint/60', text: 'text-mint-fg', header: 'bg-mint', dot: 'bg-mint-fg' },
  lav: { label: 'Lavender', panel: 'bg-violet/60', text: 'text-violet-fg', header: 'bg-violet', dot: 'bg-violet-fg' },
  butter: { label: 'Butter', panel: 'bg-butter/60', text: 'text-butter-fg', header: 'bg-butter', dot: 'bg-butter-fg' },
  coral: { label: 'Coral', panel: 'bg-coral/60', text: 'text-coral-fg', header: 'bg-coral', dot: 'bg-coral-fg' },
  peach: { label: 'Peach', panel: 'bg-peach/60', text: 'text-peach-fg', header: 'bg-peach', dot: 'bg-peach-fg' },
  rose: { label: 'Rose', panel: 'bg-rose/60', text: 'text-rose-fg', header: 'bg-rose', dot: 'bg-rose-fg' },
  teal: { label: 'Teal', panel: 'bg-teal/60', text: 'text-teal-fg', header: 'bg-teal', dot: 'bg-teal-fg' },
}
export const COLUMN_COLORS = Object.keys(COLUMN_STYLE)
export const styleOf = (col) => COLUMN_STYLE[col.color] || COLUMN_STYLE.sky

export const isOriginal = (col) => BASES.includes(col.id)
export const newColumnId = () => `col_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// The saved list, made safe: the three originals are always there (renameable and
// recolourable, but not removable, and they keep their status), custom columns
// keep their order, and there are never more than MAX_COLUMNS.
export function cleanColumns(list) {
  const saved = Array.isArray(list) ? list : []
  const seen = new Set()
  const out = []
  for (const c of saved) {
    if (!c || typeof c.id !== 'string' || seen.has(c.id)) continue
    const original = DEFAULT_COLUMNS.find((d) => d.id === c.id)
    if (!original && !c.id.startsWith('col_')) continue
    if (!original && !BASES.includes(c.base)) continue
    seen.add(c.id)
    out.push({
      id: c.id,
      name: clip(c.name, COLUMN_NAME_MAX) || original?.name || 'Column',
      base: original ? original.base : c.base,
      color: COLUMN_COLORS.includes(c.color) ? c.color : original?.color || 'sky',
    })
  }
  for (const d of DEFAULT_COLUMNS) if (!seen.has(d.id)) out.push({ ...d })
  // Originals missing from the saved list go in their natural place: todo first, completed last.
  const rank = (c) => (c.id === 'todo' ? -1 : c.id === 'completed' ? 1e6 : 0)
  const fixed = out.slice(0, MAX_COLUMNS)
  const wasSaved = new Set(saved.map((c) => c?.id))
  return DEFAULT_COLUMNS.every((d) => wasSaved.has(d.id)) ? fixed : [...fixed].sort((a, b) => rank(a) - rank(b))
}

// Adds the In review column once, before Completed, unless one by that name already exists.
export function seedReview(cols) {
  if (cols.some((c) => c.id === REVIEW_COLUMN.id || c.name.toLowerCase() === REVIEW_COLUMN.name.toLowerCase()) || cols.length >= MAX_COLUMNS) return cols
  const at = cols.findIndex((c) => c.id === 'completed')
  const next = [...cols]
  next.splice(at < 0 ? cols.length : at, 0, { ...REVIEW_COLUMN })
  return next
}

// The column a task sits in: its own custom column while that still exists and
// counts as the task's status, otherwise the original column of its status.
export function columnOf(task, cols) {
  if (task.column) {
    const c = cols.find((x) => x.id === task.column)
    if (c && c.base === task.status) return c.id
  }
  return task.status
}

export const baseOfColumn = (id, cols) => cols.find((c) => c.id === id)?.base || (BASES.includes(id) ? id : 'todo')
