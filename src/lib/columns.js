// Board columns. A task always has one of four statuses (todo, working, review,
// completed), which is what the timer, the reports and the capacity bar use.
// A column is a name on the Board that counts as one of those statuses, so you
// can add "Blocked" (counts as In review) or "Waiting" (counts as To do)
// without changing how anything is measured.
//
//   settings.columns: [{ id, name, base, color }]   (the three originals always exist)
//   task.column:      id of a custom column, or null for the original of its status
export const BASES = ['todo', 'working', 'review', 'completed']
export const BASE_LABEL = { todo: 'To do', working: 'Working', review: 'In review', completed: 'Completed' }
// The four originals plus up to five of your own.
export const MAX_COLUMNS = 9
export const COLUMN_NAME_MAX = 24

export const DEFAULT_COLUMNS = [
  { id: 'todo', name: 'To Do', base: 'todo', color: 'accent' },
  { id: 'working', name: 'Working', base: 'working', color: 'sky' },
  { id: 'review', name: 'In review', base: 'review', color: 'lav' },
  { id: 'completed', name: 'Completed', base: 'completed', color: 'mint' },
]

// "In review" used to be a custom column seeded once, counting as To do. It is a
// status of its own now with an original column like the others, so on load the
// old column is dropped (migrateColumns) and the cards in it move to the new
// status (normalizeTask in storage.js). Nothing is lost either way.
export const LEGACY_REVIEW_ID = 'col_review'
export const COLUMNS_VERSION = 3

// Literal class names, so Tailwind builds every one of them. `edge` is the dashed outline of the
// "Add new task" button and the empty-column drop zone, in the column's own colour.
export const COLUMN_STYLE = {
  accent: { label: 'Theme colour', panel: 'bg-todo-soft/60', text: 'text-todo', header: 'bg-todo-soft', dot: 'bg-todo', edge: 'border-todo/50' },
  sky: { label: 'Sky', panel: 'bg-sky/60', text: 'text-sky-fg', header: 'bg-sky', dot: 'bg-sky-fg', edge: 'border-sky-fg/50' },
  mint: { label: 'Mint', panel: 'bg-mint/60', text: 'text-mint-fg', header: 'bg-mint', dot: 'bg-mint-fg', edge: 'border-mint-fg/50' },
  lav: { label: 'Lavender', panel: 'bg-violet/60', text: 'text-violet-fg', header: 'bg-violet', dot: 'bg-violet-fg', edge: 'border-violet-fg/50' },
  butter: { label: 'Butter', panel: 'bg-butter/60', text: 'text-butter-fg', header: 'bg-butter', dot: 'bg-butter-fg', edge: 'border-butter-fg/50' },
  coral: { label: 'Coral', panel: 'bg-coral/60', text: 'text-coral-fg', header: 'bg-coral', dot: 'bg-coral-fg', edge: 'border-coral-fg/50' },
  peach: { label: 'Peach', panel: 'bg-peach/60', text: 'text-peach-fg', header: 'bg-peach', dot: 'bg-peach-fg', edge: 'border-peach-fg/50' },
  rose: { label: 'Rose', panel: 'bg-rose/60', text: 'text-rose-fg', header: 'bg-rose', dot: 'bg-rose-fg', edge: 'border-rose-fg/50' },
  teal: { label: 'Teal', panel: 'bg-teal/60', text: 'text-teal-fg', header: 'bg-teal', dot: 'bg-teal-fg', edge: 'border-teal-fg/50' },
}
// In dark mode a Board card takes the colour of the column it sits in (light mode keeps
// white cards on pastel columns). Keyed by the column's colour, not its status, so a
// lavender "Waiting" column that counts as To do has lavender cards.
export const CARD_STYLE = {
  accent: 'dark:bg-todo-soft dark:border-todo/30',
  sky: 'dark:bg-sky dark:border-sky-fg/30',
  mint: 'dark:bg-mint dark:border-mint-fg/30',
  lav: 'dark:bg-violet dark:border-violet-fg/30',
  butter: 'dark:bg-butter dark:border-butter-fg/30',
  coral: 'dark:bg-coral dark:border-coral-fg/30',
  peach: 'dark:bg-peach dark:border-peach-fg/30',
  rose: 'dark:bg-rose dark:border-rose-fg/30',
  teal: 'dark:bg-teal dark:border-teal-fg/30',
}
// A card shown outside a column follows its status's original colour.
export const STATUS_CARD_COLOR = { todo: 'accent', working: 'sky', review: 'lav', completed: 'mint' }
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
  // Originals missing from the saved list go in their natural place: todo and
  // working first, then the ones you added, then review and completed.
  const RANK = { todo: -2, working: -1, review: 1e5, completed: 1e6 }
  const rank = (c) => RANK[c.id] ?? 0
  // The cap only ever drops columns you added; the originals always survive.
  let room = MAX_COLUMNS - DEFAULT_COLUMNS.length
  const fixed = out.filter((c) => isOriginal(c) || room-- > 0)
  const wasSaved = new Set(saved.map((c) => c?.id))
  return DEFAULT_COLUMNS.every((d) => wasSaved.has(d.id)) ? fixed : [...fixed].sort((a, b) => rank(a) - rank(b))
}

// v3: drop the old seeded "In review" column. cleanColumns has already put the
// new original in its place, and its cards move to the review status on load.
export function migrateColumns(cols) {
  return cols.filter((c) => c.id !== LEGACY_REVIEW_ID)
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
