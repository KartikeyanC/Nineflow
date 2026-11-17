// "Work for": who a task is for (a company, a client, a project…), so old lists still make sense
// months later and work for several places can sit in one planner. It is the task's `client` field,
// the same one Charts (Hours by client) and invoices use, so nothing is stored twice.
//
// settings.workFor = {
//   label: 'auto' | 'company' | 'client' | 'project' | 'subject' | 'area',  what it is called
//   colors: { [name]: colourId },  a colour picked for a name (otherwise one is chosen from the name)
//   stamp: name | null,            put on every new task (unless one is being shown, see below)
//   notes: { [name]: text },       notes for whoever takes the work over (lib/handover.js)
//   archived: [name],              finished with: its tasks leave the daily lists until brought back
//   glossary: { [name]: [{ term, meaning }] },  words and short forms used there
//   people: { [name]: [{ who, role, contact }] }, who to ask for what
// }
// Which one is being shown ("only Acme") is per device and per workspace, like the workspace itself.
import { COLOR_IDS } from './colors'
import { storageKey } from './profiles'

export const NAME_MAX = 60

export const LABELS = {
  company: { one: 'Company', many: 'Companies', none: 'No company' },
  client: { one: 'Client', many: 'Clients', none: 'No client' },
  project: { one: 'Project', many: 'Projects', none: 'No project' },
  subject: { one: 'Subject', many: 'Subjects', none: 'No subject' },
  area: { one: 'Area', many: 'Areas', none: 'No area' },
  work: { one: 'Work for', many: 'Work for', none: 'Not set' },
}
export const LABEL_CHOICES = ['company', 'client', 'project', 'subject', 'area']

// What it is called when left on "auto": from "What do you do?" in setup.
const BY_OCCUPATION = {
  Freelancer: 'client',
  Founder: 'project',
  Student: 'subject',
  Designer: 'company', Developer: 'company', Marketer: 'company', 'Content creator': 'company', Manager: 'company',
}
export const autoLabelId = (occupation) => BY_OCCUPATION[occupation] || 'work'
export const labelIdOf = (settings, occupation) => {
  const set = settings?.workFor?.label
  return LABELS[set] && set !== 'work' ? set : autoLabelId(occupation)
}
export const labelOf = (settings, occupation) => LABELS[labelIdOf(settings, occupation)]

export const cleanName = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '')

export function cleanWorkFor(v) {
  const w = v && typeof v === 'object' ? v : {}
  const colors = {}
  if (w.colors && typeof w.colors === 'object') {
    for (const [name, c] of Object.entries(w.colors).slice(0, 200)) {
      const n = cleanName(name)
      if (n && COLOR_IDS.includes(c)) colors[n] = c
    }
  }
  const notes = {}
  if (w.notes && typeof w.notes === 'object') {
    for (const [name, text] of Object.entries(w.notes).slice(0, 200)) {
      const n = cleanName(name)
      if (n && typeof text === 'string' && text.trim()) notes[n] = text.slice(0, 4000)
    }
  }
  const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
  const perName = (obj, row) => {
    const out = {}
    if (obj && typeof obj === 'object') {
      for (const [name, list] of Object.entries(obj).slice(0, 200)) {
        const n = cleanName(name)
        const rows = Array.isArray(list) ? list.map(row).filter(Boolean).slice(0, 100) : []
        if (n && rows.length) out[n] = rows
      }
    }
    return out
  }
  const archived = Array.isArray(w.archived) ? [...new Set(w.archived.map(cleanName).filter(Boolean))].slice(0, 200) : []
  const stamp = cleanName(w.stamp) || null
  return {
    label: LABELS[w.label] && w.label !== 'work' ? w.label : 'auto',
    colors,
    stamp: stamp && !archived.includes(stamp) ? stamp : null,
    notes,
    archived,
    glossary: perName(w.glossary, (r) => (r && str(r.term, 60) ? { term: str(r.term, 60), meaning: str(r.meaning, 300) } : null)),
    people: perName(w.people, (r) => (r && str(r.who, 80) ? { who: str(r.who, 80), role: str(r.role, 80), contact: str(r.contact, 120) } : null)),
  }
}

// A steady colour for a name nobody has picked one for: the same name is always the same colour.
export function colorFor(settings, name) {
  const picked = settings?.workFor?.colors?.[name]
  if (picked) return picked
  let h = 0
  for (const ch of String(name).toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0
  return COLOR_IDS[h % COLOR_IDS.length]
}

// Every name in use: on tasks, given a colour, or set to stamp new tasks. Sorted A to Z.
export function namesIn(tasks, settings) {
  const set = new Set()
  for (const t of tasks || []) if (t.client) set.add(t.client)
  for (const n of Object.keys(settings?.workFor?.colors || {})) set.add(n)
  for (const n of Object.keys(settings?.workFor?.notes || {})) set.add(n)
  for (const n of settings?.workFor?.archived || []) set.add(n)
  if (settings?.workFor?.stamp) set.add(settings.workFor.stamp)
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// "Only show this one", per device: a name, NONE for tasks with nothing set, or null for all.
export const NONE = ' none' // a leading space: names are trimmed, so no real name can be this
const FOCUS_KEY = () => storageKey('work-for-focus')
export const loadFocus = () => {
  try {
    const v = localStorage.getItem(FOCUS_KEY())
    if (v === 'none') return NONE
    return v ? cleanName(JSON.parse(v)) || null : null
  } catch { return null }
}
export const saveFocus = (v) => {
  // Stored as JSON ("Acme"), so a client really called none is not read back as "nothing set".
  try { if (v) localStorage.setItem(FOCUS_KEY(), v === NONE ? 'none' : JSON.stringify(v)); else localStorage.removeItem(FOCUS_KEY()) } catch { /* only a convenience */ }
}
export const matchesFocus = (task, focus) => !focus || (focus === NONE ? !task.client : task.client === focus)
export const isArchived = (settings, name) => !!name && (settings?.workFor?.archived || []).includes(name)
// What the plans and lists show: the one being shown, otherwise everything except archived names.
export const shows = (task, focus, settings) => (focus ? matchesFocus(task, focus) : !isArchived(settings, task.client))

// A task that may not make sense to someone else later: still open, a week old or more, a title of a
// few words, and nothing else to go on (no notes, no reason, no steps).
export const UNCLEAR_AFTER_DAYS = 7
export function isUnclear(task, now = new Date()) {
  if (!task || task.status === 'completed' || task.dropped) return false
  if ((task.description || '').trim() || (task.why || '').trim() || (task.subtasks || []).length) return false
  const made = task.createdAt ? new Date(task.createdAt) : null
  if (!made || Number.isNaN(made.getTime()) || now - made < UNCLEAR_AFTER_DAYS * 864e5) return false
  return (task.title || '').trim().split(/\s+/).filter(Boolean).length <= 3
}

// What a new task gets: the one being shown, otherwise the one set to stamp new tasks.
export const stampFor = (focus, settings) => (focus && focus !== NONE ? focus : settings?.workFor?.stamp || null)
