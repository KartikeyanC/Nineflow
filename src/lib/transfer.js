// Transfer file: hand one company's / client's work (lib/workFor.js) to the next person's NineFlow,
// whatever account they use. The sender makes `<Name>.nineflow`; the receiver opens it in Settings →
// Who it's for → Take over work from a file.
//
// What goes in: that name's tasks (open ones, repeating duties, and what was finished in the last
// year) with their notes, checklists, Asked by, Why, tags, Drive links and change history, plus its
// colour, handover notes, people and words. What stays out: personal and dropped tasks, time logs
// (they would land in the new person's hours), hourly rates, custom fields and Board columns (theirs
// are different), reminders (theirs follow their own settings).
//
// Locked by default: AES-GCM with a key made from a password (PBKDF2, SHA-256). Without the password
// the file says only that it is a NineFlow transfer and when it was made.
//
// A file from someone else is untrusted: every field is checked and capped here before it reaches
// the planner, every task gets a new id, and nothing it contains can replace an existing task.
import { normalizeTasks, uid } from './storage'
import { cleanName, cleanWorkFor } from './workFor'

export const FORMAT = 'nineflow-transfer'
export const VERSION = 1
export const EXT = '.nineflow'
export const MAX_BYTES = 8 * 1024 * 1024
export const MAX_TASKS = 3000
export const MIN_PASSWORD = 6
export const FINISHED_DAYS = 365
const ITERATIONS = 310000

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/
const STATUSES = ['todo', 'working', 'review', 'completed']
const PRIORITIES = ['high', 'medium', 'low']
const FREQS = ['daily', 'weekdays', 'weekly', 'monthly']

export class TransferError extends Error {}

// ---- making the bundle (sender) -------------------------------------------------------------------
const ISO = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)

export function buildBundle({ tasks, settings, name, from, now = new Date() }) {
  const since = now.getTime() - FINISHED_DAYS * 864e5
  const pick = (tasks || []).filter((t) => t.client === name && !t.private && !t.dropped
    && (t.status !== 'completed' || t.recurrence || (Date.parse(t.completedAt || '') || 0) >= since))
  const cats = new Map((settings?.categories || []).map((c) => [c.id, c.name]))
  const wf = settings?.workFor || {}
  return {
    name,
    from: from || '',
    madeAt: now.toISOString(),
    color: wf.colors?.[name] || null,
    notes: wf.notes?.[name] || '',
    people: wf.people?.[name] || [],
    glossary: wf.glossary?.[name] || [],
    tasks: pick.map((t) => ({
      id: t.id, title: t.title, description: t.description, date: t.date, startDate: t.startDate, dueDate: t.dueDate,
      startTime: t.startTime, durationMinutes: t.durationMinutes, category: cats.get(t.category) || '', priority: t.priority,
      status: t.status, completedAt: t.completedAt, createdAt: t.createdAt, subtasks: t.subtasks, requireRule: t.requireRule,
      tags: t.tags, askedBy: t.askedBy, why: t.why, billable: t.billable, seriesId: t.seriesId, recurrence: t.recurrence,
      hold: t.hold, files: t.files, history: t.history, handedOver: t.handedOver || null,
    })),
  }
}

// ---- locking ---------------------------------------------------------------------------------------
const subtle = () => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new TransferError('This device can\'t lock or unlock files here. Try NineFlow in a browser.')
  return s
}
const b64 = (bytes) => { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s) }
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
async function keyFrom(password, salt, iterations) {
  const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

// The file's text. With a password the bundle is locked; without one it is plain JSON.
export async function makeFile(bundle, password) {
  const head = { format: FORMAT, v: VERSION, madeAt: bundle.madeAt }
  if (!password) return JSON.stringify({ ...head, locked: false, bundle })
  if (password.length < MIN_PASSWORD) throw new TransferError(`Use a password of at least ${MIN_PASSWORD} characters.`)
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const key = await keyFrom(password, salt, ITERATIONS)
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(bundle)))
  return JSON.stringify({ ...head, locked: true, kdf: { name: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt) }, iv: b64(iv), data: b64(data) })
}

// Reads the outside of a file: is it a transfer, and is it locked? Throws TransferError if not one.
export function readHead(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES * 1.4) throw new TransferError('This file is too big to be a NineFlow transfer.')
  let f
  try { f = JSON.parse(text) } catch { throw new TransferError('This isn\'t a NineFlow transfer file.') }
  if (!f || typeof f !== 'object' || f.format !== FORMAT) throw new TransferError('This isn\'t a NineFlow transfer file.')
  if (f.v !== VERSION) throw new TransferError('This transfer was made by a newer NineFlow. Update NineFlow, then open it again.')
  return { file: f, locked: f.locked === true, madeAt: ISO(f.madeAt) }
}

// The bundle inside, unlocked with the password when the file is locked, and checked.
export async function openFile(text, password) {
  const { file, locked } = readHead(text)
  let raw = file.bundle
  if (locked) {
    if (!password) throw new TransferError('Enter the password for this file.')
    const iter = file.kdf?.iterations
    if (!Number.isInteger(iter) || iter < 100000 || iter > 5000000 || typeof file.iv !== 'string' || typeof file.data !== 'string' || typeof file.kdf?.salt !== 'string') {
      throw new TransferError('This transfer file is damaged.')
    }
    let plain
    try {
      const key = await keyFrom(password, unb64(file.kdf.salt), iter)
      plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data))
    } catch { throw new TransferError('That password doesn\'t open this file. Check it with whoever sent it.') }
    try { raw = JSON.parse(new TextDecoder().decode(plain)) } catch { throw new TransferError('This transfer file is damaged.') }
  }
  return checkBundle(raw)
}

// ---- checking what came in ---------------------------------------------------------------------------
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '')
const line = (v, n) => str(v, n * 2).replace(/\s+/g, ' ').trim().slice(0, n)
// A real calendar day ('2026-13-45' has the right shape but is not one).
const day = (v) => {
  if (typeof v !== 'string' || !DATE.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

function checkTask(t) {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || t.id.length > 80) return null
  const title = line(t.title, 200)
  if (!title) return null
  const rec = t.recurrence && FREQS.includes(t.recurrence.freq)
    ? { freq: t.recurrence.freq, until: day(t.recurrence.until), skip: Array.isArray(t.recurrence.skip) ? t.recurrence.skip.filter(day).slice(0, 400) : [] }
    : null
  const status = STATUSES.includes(t.status) ? t.status : 'todo'
  return {
    id: t.id,
    title,
    description: str(t.description, 4000),
    date: day(t.date),
    startDate: day(t.startDate),
    dueDate: day(t.dueDate),
    startTime: typeof t.startTime === 'string' && TIME.test(t.startTime) ? t.startTime : null,
    durationMinutes: Number.isFinite(t.durationMinutes) ? Math.max(0, Math.min(24 * 60, Math.round(t.durationMinutes))) : 30,
    category: line(t.category, 40),
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
    status,
    completedAt: status === 'completed' ? ISO(t.completedAt) : null,
    createdAt: ISO(t.createdAt),
    subtasks: Array.isArray(t.subtasks) ? t.subtasks.slice(0, 100).filter((s) => s && typeof s.title === 'string' && s.title.trim())
      .map((s) => ({ title: line(s.title, 200), done: s.done === true, required: s.required === true, depth: Number.isInteger(s.depth) ? Math.max(0, Math.min(2, s.depth)) : 0 })) : [],
    requireRule: t.requireRule === 'any' ? 'any' : 'all',
    tags: Array.isArray(t.tags) ? t.tags.filter((x) => typeof x === 'string').slice(0, 6) : [],
    askedBy: line(t.askedBy, 80),
    why: line(t.why, 200),
    billable: t.billable === true,
    seriesId: rec && typeof t.seriesId === 'string' && t.seriesId.length <= 80 ? t.seriesId : null,
    recurrence: rec,
    hold: t.hold && typeof t.hold === 'object' ? { reason: line(t.hold.reason, 120) || 'Not now', since: day(t.hold.since), until: day(t.hold.until) } : null,
    files: Array.isArray(t.files) ? t.files.slice(0, 20) : [],
    history: Array.isArray(t.history) ? t.history.slice(-200) : [],
    handedOver: t.handedOver && typeof t.handedOver === 'object' ? { from: line(t.handedOver.from, 80), at: ISO(t.handedOver.at) } : null,
  }
}

export function checkBundle(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new TransferError('This transfer file is damaged.')
  const name = cleanName(b.name)
  if (!name) throw new TransferError('This transfer file has no name in it.')
  if (!Array.isArray(b.tasks)) throw new TransferError('This transfer file is damaged.')
  if (b.tasks.length > MAX_TASKS) throw new TransferError(`This file has more than ${MAX_TASKS} tasks, more than one transfer can carry.`)
  const tasks = b.tasks.map(checkTask).filter(Boolean)
  // The handover parts go through the same cleaning as settings do.
  const wf = cleanWorkFor({ notes: { [name]: str(b.notes, 4000) }, people: { [name]: b.people }, glossary: { [name]: b.glossary }, colors: b.color ? { [name]: b.color } : {} })
  return {
    name,
    from: line(b.from, 80),
    madeAt: ISO(b.madeAt),
    color: wf.colors[name] || null,
    notes: wf.notes[name] || '',
    people: wf.people[name] || [],
    glossary: wf.glossary[name] || [],
    tasks,
    skipped: b.tasks.length - tasks.length,
  }
}

export function summary(bundle) {
  const open = bundle.tasks.filter((t) => t.status !== 'completed' && !t.recurrence).length
  const duties = new Set(bundle.tasks.filter((t) => t.recurrence && t.seriesId).map((t) => t.seriesId)).size
  const finished = bundle.tasks.filter((t) => t.status === 'completed' && !t.recurrence).length
  return { open, duties, finished, people: bundle.people.length, words: bundle.glossary.length }
}

// ---- fitting it into the receiver's planner ------------------------------------------------------------
// Tasks ready to add: new ids (a series keeps one shared new id), the name they go under, categories
// matched by name (or the first one), and who they came from. A task that was being worked on goes
// back to To do: the timer was the other person's.
export function tasksForPlanner(bundle, { as, categories, takenIds = new Set(), now = new Date() }) {
  const catByName = new Map((categories || []).map((c) => [String(c.name).toLowerCase(), c.id]))
  const firstCat = categories?.[0]?.id || 'work'
  const series = new Map()
  const newId = () => { let id; do id = uid(); while (takenIds.has(id)); takenIds.add(id); return id }
  const at = now.toISOString()
  const list = bundle.tasks.map((t) => {
    const seriesId = t.seriesId ? (series.get(t.seriesId) || series.set(t.seriesId, newId()).get(t.seriesId)) : null
    return {
      ...t,
      id: newId(),
      client: as,
      private: false,
      category: catByName.get(t.category.toLowerCase()) || firstCat,
      status: t.status === 'working' ? 'todo' : t.status,
      startedAt: null,
      sessions: [],
      seriesId,
      subtasks: t.subtasks.map((s) => ({ ...s, id: uid() })),
      handedOver: t.handedOver?.from ? t.handedOver : { from: bundle.from || 'the previous person', at: bundle.madeAt || at },
    }
  })
  return normalizeTasks(list)
}

// The receiver's settings.workFor with this name's colour, notes, people and words added in.
// Their own notes stay first; people and words already there are not listed twice.
export function mergeWorkFor(wf, bundle, as) {
  const w = cleanWorkFor(wf)
  const mine = w.notes[as]
  const theirs = bundle.notes ? (mine ? `${mine}\n\nFrom ${bundle.from || 'the handover'}:\n${bundle.notes}` : bundle.notes) : mine
  const people = [...(w.people[as] || [])]
  for (const p of bundle.people) if (!people.some((x) => x.who.toLowerCase() === p.who.toLowerCase())) people.push(p)
  const words = [...(w.glossary[as] || [])]
  for (const g of bundle.glossary) if (!words.some((x) => x.term.toLowerCase() === g.term.toLowerCase())) words.push(g)
  return cleanWorkFor({
    ...w,
    colors: w.colors[as] || !bundle.color ? w.colors : { ...w.colors, [as]: bundle.color },
    notes: theirs ? { ...w.notes, [as]: theirs.slice(0, 4000) } : w.notes,
    people: people.length ? { ...w.people, [as]: people.slice(0, 100) } : w.people,
    glossary: words.length ? { ...w.glossary, [as]: words.slice(0, 100) } : w.glossary,
    archived: (w.archived || []).filter((n) => n !== as),
  })
}
