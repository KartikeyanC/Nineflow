// "Work for": who a task is for (a company, a client, a project…), so old lists still make sense
// months later and work for several places can sit in one planner. It is the task's `client` field,
// the same one Charts (Hours by client) and invoices use, so nothing is stored twice.
//
// settings.workFor = {
//   label: 'auto' | 'company' | 'client' | 'project' | 'subject' | 'area',  what it is called
//   colors: { [name]: colourId },  a colour picked for a name (otherwise one is chosen from the name)
//   stamp: name | null,            put on every new task (unless one is being shown, see below)
//   notes: { [name]: text },       notes for whoever takes the work over (lib/handover.js)
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
  return {
    label: LABELS[w.label] && w.label !== 'work' ? w.label : 'auto',
    colors,
    stamp: cleanName(w.stamp) || null,
    notes,
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

// What a new task gets: the one being shown, otherwise the one set to stamp new tasks.
export const stampFor = (focus, settings) => (focus && focus !== NONE ? focus : settings?.workFor?.stamp || null)
