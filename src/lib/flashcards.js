// Flashcards and spaced revision.
//
// A card is any line in a note written as `question :: answer`, for example
//   First train in India? :: 1853, Bombay to Thane
// so cards live with the rest of the study notes and need no separate place.
//
// Each card comes back for revision after 1, 3, 7, 21, 45, then 90 days while it's remembered;
// a forgotten card starts again from tomorrow. What was revised when is kept in
// settings.revision (so it syncs like everything else):
//   cards: { [key]: { step, due: 'yyyy-MM-dd', reps, lapses, last: 'yyyy-MM-dd' } }
//   days:  { 'yyyy-MM-dd': number of cards revised that day }

import { addDays, format, parseISO, subDays } from 'date-fns'

export const STEPS = [1, 3, 7, 21, 45, 90]
const MAX_RECORDS = 3000
const KEEP_DAYS = 400
const keyOf = (d) => format(d, 'yyyy-MM-dd')

// The cards in some notes, in note order: { key, noteId, q, a }.
// The key ties a card's progress to its note and question, so editing the answer keeps the progress.
export function cardsInNotes(notes) {
  const out = []
  const seen = new Set()
  for (const n of notes || []) {
    for (const line of String(n.text || '').split(/\r?\n/)) {
      const i = line.indexOf('::')
      if (i < 0) continue
      const q = line.slice(0, i).replace(/^\s*[-*•]\s*/, '').trim()
      const a = line.slice(i + 2).trim()
      if (!q || !a || /\b(?:https?:\/\/|www\.)\S*$/i.test(q)) continue // a web address that happens to contain ::
      const key = `${n.id}|${q.toLowerCase().replace(/\s+/g, ' ').slice(0, 120)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, noteId: n.id, q, a })
    }
  }
  return out
}

export const countCards = (text) => cardsInNotes([{ id: 'x', text }]).length

// The cards to revise on `today`: new ones and any whose day has come, oldest due first, new last.
export function dueCards(cards, revision, today) {
  const recs = revision?.cards || {}
  const due = cards.filter((c) => !recs[c.key] || recs[c.key].due <= today)
  return due.sort((a, b) => {
    const ra = recs[a.key], rb = recs[b.key]
    if (!ra !== !rb) return ra ? -1 : 1
    return ra && rb ? ra.due.localeCompare(rb.due) : 0
  })
}

// A card's record after one answer on `today`.
export function answer(rec, knew, today) {
  const step = knew ? Math.min((rec?.step ?? -1) + 1, STEPS.length - 1) : 0
  return {
    step,
    due: keyOf(addDays(parseISO(today), STEPS[step])),
    reps: (rec?.reps || 0) + 1,
    lapses: (rec?.lapses || 0) + (knew ? 0 : 1),
    last: today,
  }
}

// settings.revision after one answer, with the day's count raised.
export function withAnswer(revision, key, knew, today) {
  const cards = { ...(revision?.cards || {}), [key]: answer(revision?.cards?.[key], knew, today) }
  const days = { ...(revision?.days || {}), [today]: ((revision?.days || {})[today] || 0) + 1 }
  return { cards, days }
}

// Days in a row with any revision, counting today or (if nothing yet today) yesterday.
export function streak(days, today) {
  let d = parseISO(today)
  if (!days?.[today]) d = subDays(d, 1)
  let n = 0
  while (days?.[keyOf(d)]) { n++; d = subDays(d, 1) }
  return n
}

// The stored shape, from whatever was saved or synced.
export function cleanRevision(v) {
  const date = /^\d{4}-\d{2}-\d{2}$/
  const cards = {}
  let count = 0
  for (const [k, r] of Object.entries(v?.cards || {})) {
    if (count >= MAX_RECORDS) break
    if (typeof k !== 'string' || k.length > 200 || !r || !date.test(r.due || '')) continue
    cards[k] = {
      step: Math.max(0, Math.min(STEPS.length - 1, Number(r.step) || 0)),
      due: r.due,
      reps: Math.max(0, Number(r.reps) || 0),
      lapses: Math.max(0, Number(r.lapses) || 0),
      last: date.test(r.last || '') ? r.last : null,
    }
    count++
  }
  const days = {}
  const recent = Object.keys(v?.days || {}).filter((d) => date.test(d)).sort().slice(-KEEP_DAYS)
  for (const d of recent) days[d] = Math.max(0, Number(v.days[d]) || 0)
  return { cards, days }
}
