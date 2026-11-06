// Version history: copies of the whole planner on this device (every key of the signed-in profile:
// tasks, settings, habits, notes, Work OS, exams, every workspace), so a bad change or a lost task can
// be brought back. Saved in IndexedDB (room for many copies, unlike localStorage), never synced: each
// device keeps its own history. Settings → Version history shows them (features/History.jsx).
//
// A copy is taken when the planner opens and then at most once an hour while things change; one is
// also taken just before a restore, so a restore can itself be undone. Kept: every copy from the
// last 24 hours, then the newest copy of each day for 30 days.
import { apply, collect, fingerprint } from './cloud'
import { tasksIn, toPrune } from './historyCore'

export { KEEP_DAYS, KEEP_HOURS, taskDiff, tasksIn, toPrune } from './historyCore'

const DB = 'nineflow-history'
const STORE = 'snapshots'
// A short hash of the planner's contents (FNV-1a, 2 × 32 bits), to skip a copy when nothing changed.
function hash(text) {
  let a = 0x811c9dc5, b = 0x01000193
  for (let i = 0; i < text.length; i += 1) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995) }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}:${text.length}`
}

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Version history needs a browser database, which is not available here.')); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' })
      s.createIndex('profile', 'profile')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
const run = async (mode, fn) => {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    let out
    Promise.resolve(fn(tx.objectStore(STORE))).then((v) => { out = v })
    tx.oncomplete = () => { db.close(); resolve(out) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
const req2p = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })

// The copies of one profile, newest first, without their data (cheap to list).
export async function listSnapshots(profile) {
  const all = await run('readonly', (s) => req2p(s.index('profile').getAll(profile)))
  return (all || []).map(({ data, ...meta }) => meta).sort((a, b) => b.at - a.at)
}
export const getSnapshot = (id) => run('readonly', (s) => req2p(s.get(id)))

// Take a copy of `profile` now, unless nothing changed since the last one (or `force`).
// `reason`: 'open' | 'hourly' | 'before-restore'. Returns the copy's summary, or null.
export async function takeSnapshot(profile, reason = 'hourly', { force = false } = {}) {
  if (!profile) return null
  const data = collect(profile)
  const fp = hash(fingerprint(data))
  const list = await listSnapshots(profile)
  if (!force && list[0]?.fp === fp) return null
  const at = Date.now()
  const meta = { id: `${profile}:${at}`, profile, at, reason, fp, tasks: countTasks(data) }
  await run('readwrite', (s) => {
    s.put({ ...meta, data })
    for (const id of toPrune([meta, ...list], at)) s.delete(id)
  })
  return meta
}

// Put a copy back: first a copy of how things are now (so this can be undone), then the old copy.
export async function restoreSnapshot(profile, id) {
  const snap = await getSnapshot(id)
  if (!snap || snap.profile !== profile) throw new Error('That copy is no longer here.')
  await takeSnapshot(profile, 'before-restore', { force: true })
  apply(profile, snap.data)
}

const countTasks = (data) => Object.values(tasksIn(data)).reduce((n, l) => n + l.length, 0)
