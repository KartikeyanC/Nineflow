// Finding notes once there are many: tags written in the text, a search, quick filters,
// a sort order and month headings. Pure functions; the Notes screen draws the result.
import { isValid, parseISO } from 'date-fns'
import { format } from './dateFormat'
import { linksIn } from './noteImages'
import { countCards } from './flashcards'

// #gk, #maths, #railway-exam: a # at the start of the text or after a space (so a link's #part isn't one).
const TAG_RE = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{0,30})/gu
export function tagsIn(text) {
  const out = new Set()
  for (const m of String(text || '').matchAll(TAG_RE)) out.add(m[2].toLowerCase())
  return [...out]
}

// Every tag used, most used first: [{ tag, count }].
export function allTags(notes) {
  const counts = new Map()
  for (const n of notes) for (const t of tagsIn(n.text)) counts.set(t, (counts.get(t) || 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export const titleOf = (n) => (String(n.text || '').split('\n').find((l) => l.trim()) || 'Untitled note').trim()

// What each note has, worked out once per text.
export function facts(n) {
  const text = String(n.text || '')
  return { tags: tagsIn(text), pictures: (n.images || []).length, links: linksIn(text).length, cards: countCards(text) }
}

export const SORTS = [
  { id: 'edited', label: 'Recently edited' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'az', label: 'A–Z' },
]
export const QUICK = [
  { id: 'pinned', label: 'Pinned' },
  { id: 'pictures', label: 'Has pictures' },
  { id: 'links', label: 'Has links' },
  { id: 'cards', label: 'Has flashcards' },
]

// The words of a search, each of which must appear somewhere in the note (any order, any case).
const words = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean)

/**
 * The notes to show, in groups: [{ key, label, notes }].
 *  find: { query, tags: [], quick: [], colors: [], sort }
 *  keep: ids always shown (a note just made, so it doesn't vanish while it's still empty)
 */
export function findNotes(notes, find, keep = new Set()) {
  const q = words(find.query)
  const want = (find.tags || []).map((t) => t.toLowerCase())
  const quick = new Set(find.quick || [])
  const colors = new Set(find.colors || [])
  const list = notes.filter((n) => {
    if (keep.has(n.id)) return true
    const f = facts(n)
    const hay = String(n.text || '').toLowerCase()
    if (q.length && !q.every((w) => hay.includes(w))) return false
    if (want.length && !want.every((t) => f.tags.includes(t))) return false
    if (quick.has('pinned') && !n.pinned) return false
    if (quick.has('pictures') && !f.pictures) return false
    if (quick.has('links') && !f.links) return false
    if (quick.has('cards') && !f.cards) return false
    if (colors.size && !colors.has(n.color)) return false
    return true
  })

  const sort = find.sort || 'edited'
  const when = (n) => (sort === 'edited' ? n.updatedAt || n.createdAt : n.createdAt || n.updatedAt) || ''
  const sorted = [...list].sort((a, b) => {
    if (sort === 'az') return titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' })
    if (sort === 'oldest') return when(a).localeCompare(when(b))
    return when(b).localeCompare(when(a))
  })

  // Pinned notes first, under their own heading; the rest by month (A–Z has no month headings).
  const pinned = sorted.filter((n) => n.pinned)
  const rest = sorted.filter((n) => !n.pinned)
  const groups = []
  if (pinned.length) groups.push({ key: 'pinned', label: 'Pinned', notes: pinned })
  if (sort === 'az') {
    if (rest.length) groups.push({ key: 'all', label: pinned.length ? 'Other notes' : null, notes: rest })
  } else {
    for (const n of rest) {
      const d = when(n) ? parseISO(when(n)) : null
      const key = d && isValid(d) ? format(d, 'yyyy-MM') : 'undated'
      let g = groups.find((x) => x.key === key)
      if (!g) { g = { key, label: key === 'undated' ? 'No date' : format(d, 'MMMM yyyy'), notes: [] }; groups.push(g) }
      g.notes.push(n)
    }
  }
  return { groups, count: list.length }
}

// A short piece of the note around the first search word, for the list view.
// Tags are left out, since the list shows them as chips beside it.
export function snippet(text, query, max = 110) {
  const t = String(text || '').split('\n').slice(1).join(' ').replace(TAG_RE, '$1').replace(/\s+/g, ' ').trim()
  const w = words(query)[0]
  if (!w) return t.slice(0, max)
  const full = String(text || '').replace(/\s+/g, ' ')
  const i = full.toLowerCase().indexOf(w)
  if (i < 0) return t.slice(0, max)
  const start = Math.max(0, i - 40)
  return `${start > 0 ? '…' : ''}${full.slice(start, start + max)}${start + max < full.length ? '…' : ''}`
}
