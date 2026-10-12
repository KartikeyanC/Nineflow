// Account sync. Everything a signed-in person has (tasks, settings,
// habits, Work OS, rituals…) lives under one localStorage namespace; this
// module mirrors that namespace to the account's store:
//   Google accounts (g_…): My Drive / Daily Planner / planner-data.json
//   Email accounts (e_…):  their row in Supabase's planner_data table
//
// The local copy is a cache: the app keeps working offline and while the
// sign-in is being renewed, and anything unsaved goes up as soon as the
// store is reachable again. Last save wins between devices; if two devices
// changed things at the same time, this device's version is kept as a
// separate "conflict" copy, so nothing is lost.
import { currentProfileId } from './profiles'
import { getToken, requestToken, rememberedAccount } from './google'
import * as drive from './drive'
import * as supa from './supabase'
import { AuthError, OfflineError } from './syncErrors'

const VERSION = 3
const SKIP = new Set(['cloud']) // per-device sync state, never uploaded
const prefix = (id) => `daily-planner:${id}:`
const metaKey = (id) => `${prefix(id)}cloud`

// ---- local bundle ------------------------------------------------------------
export function collect(id = currentProfileId()) {
  const json = {}, text = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(prefix(id))) continue
    const name = k.slice(prefix(id).length)
    if (SKIP.has(name)) continue
    const raw = localStorage.getItem(k)
    try { json[name] = JSON.parse(raw) } catch { text[name] = raw }
  }
  return { json, text }
}
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
const fingerprint = (data) => JSON.stringify({ json: sortKeys(data.json), text: sortKeys(data.text) })
export const hasLocalData = (id) => Object.keys(collect(id).json).some((k) => k === 'tasks' || k === 'settings' || k === 'work')

// Write a bundle into localStorage and tell the open screens to reload
// (they listen for 'storage' events on their keys).
export function apply(id, data) {
  const wanted = new Set()
  const put = (name, raw) => {
    wanted.add(name)
    const k = prefix(id) + name
    if (localStorage.getItem(k) === raw) return
    localStorage.setItem(k, raw)
    try { window.dispatchEvent(new StorageEvent('storage', { key: k })) } catch { /* ignore */ }
  }
  for (const [name, v] of Object.entries(data.json || {})) put(name, JSON.stringify(v))
  for (const [name, v] of Object.entries(data.text || {})) put(name, v)
  // Keys the other copy doesn't have are removed here too, so both match.
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith(prefix(id))) continue
    const name = k.slice(prefix(id).length)
    if (!SKIP.has(name) && !wanted.has(name)) {
      localStorage.removeItem(k)
      try { window.dispatchEvent(new StorageEvent('storage', { key: k })) } catch { /* ignore */ }
    }
  }
}

const readMeta = (id) => { try { return JSON.parse(localStorage.getItem(metaKey(id)) || '{}') } catch { return {} } }
const writeMeta = (id, patch) => { try { localStorage.setItem(metaKey(id), JSON.stringify({ ...readMeta(id), ...patch })) } catch { /* ignore */ } }

// ---- status (for the UI) -------------------------------------------------------
// state: 'idle' | 'saving' | 'saved' | 'offline' | 'needs-auth' | 'error'
// store: 'drive' | 'supabase' (which account kind is syncing, for the wording)
let status = { state: 'idle', store: 'drive', savedAt: null, error: null, fileLink: null, unsaved: false, notice: null }
const listeners = new Set()
const setStatus = (patch) => { status = { ...status, ...patch }; listeners.forEach((f) => f(status)) }
export const getStatus = () => status
export function onStatus(f) { listeners.add(f); return () => listeners.delete(f) }

// ---- stores ----------------------------------------------------------------------
// Each store keeps one copy of the bundle and answers in the same shapes:
// locate() → { id, modifiedTime, link } or null. Failures are AuthError /
// OfflineError (lib/syncErrors) or a plain Error.
const driveStore = {
  kind: 'drive',
  connected: () => !!getToken(),
  async locate(id) {
    const meta = readMeta(id)
    let f = meta.fileId ? await drive.getMeta(meta.fileId) : null
    if (!f) {
      const folder = await drive.findFolder()
      f = folder ? await drive.findFile(folder.id) : null
      if (f) writeMeta(id, { fileId: f.id, folderId: folder.id })
    }
    return f && { id: f.id, modifiedTime: f.modifiedTime, link: f.webViewLink }
  },
  download: (f) => drive.download(f.id),
  async save(id, bundle) {
    const meta = readMeta(id)
    let f = meta.fileId ? await drive.updateFile(meta.fileId, bundle) : null
    if (!f) {
      const folder = await drive.ensureFolder()
      const existing = await drive.findFile(folder.id)
      f = existing ? await drive.updateFile(existing.id, bundle) : await drive.createFile(folder.id, drive.FILE_NAME, bundle)
      writeMeta(id, { folderId: folder.id })
    }
    writeMeta(id, { fileId: f.id })
    return { id: f.id, modifiedTime: f.modifiedTime, link: f.webViewLink }
  },
  async saveConflict(id, bundle) {
    const folderId = readMeta(id).folderId || (await drive.ensureFolder()).id
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '')
    await drive.createFile(folderId, `planner-data (conflict ${stamp}).json`, bundle)
  },
  conflictNotice: 'Another device saved changes at the same time. This device\'s version was kept as a "conflict" file in your Daily Planner folder.',
  reconnect: () => requestToken({ prompt: '', hint: rememberedAccount()?.email }),
}

const supabaseStore = {
  kind: 'supabase',
  connected: () => supa.hasSession(),
  locate: () => supa.rowInfo(),
  download: () => supa.download(),
  save: (_id, bundle) => supa.save(bundle),
  saveConflict: (_id, bundle) => supa.saveConflict(bundle),
  conflictNotice: 'Another device saved changes at the same time. This device\'s version was kept as a backup copy in your account.',
  reconnect: (password) => supa.signIn(rememberedAccount()?.email, password),
}

export const storeFor = (id) => (id?.startsWith('e_') ? supabaseStore : driveStore)

// What the account's store holds, or null. Used at sign-in.
export async function fetchRemote(id = currentProfileId()) {
  const store = storeFor(id)
  const f = await store.locate(id)
  if (!f) return null
  const bundle = await store.download(f)
  return bundle && bundle.data ? { bundle, meta: f } : null
}

const makeBundle = (data) => ({
  app: 'daily-planner', version: VERSION, savedAt: new Date().toISOString(),
  account: rememberedAccount()?.email || '', data,
})

async function push(store, id, data) {
  const f = await store.save(id, makeBundle(data))
  writeMeta(id, { remoteModified: f.modifiedTime, pushed: fingerprint(data), fileLink: f.link })
  return f
}

// ---- the sync loop ---------------------------------------------------------------
let timer = null, running = null, lastSeen = null, changedAt = 0, busy = false, checkedAt = 0
// While the planner is on screen, look for other devices' changes this often
// even when nothing changed here (one small request: the file's or row's date).
const CHECK_EVERY = 60_000

const errorState = (e) => (e instanceof AuthError ? { state: 'needs-auth', error: null }
  : e instanceof OfflineError ? { state: 'offline', error: null }
  : { state: 'error', error: e.message })

// One round: pull newer remote changes, then push local ones.
export async function syncNow({ force = false } = {}) {
  const id = running
  if (!id || busy) return
  const store = storeFor(id)
  if (!store.connected()) { setStatus({ state: 'needs-auth' }); return }
  busy = true
  checkedAt = Date.now()
  try {
    const data = collect(id)
    const fp = fingerprint(data)
    const meta = readMeta(id)
    const dirty = fp !== meta.pushed
    const f = await store.locate(id)

    if (f && meta.remoteModified && f.modifiedTime > meta.remoteModified) {
      // Another device saved since we last looked.
      const remote = await store.download(f)
      if (dirty && remote?.data) {
        // Both sides changed: keep ours as a separate copy, then take theirs.
        await store.saveConflict(id, makeBundle(data))
        setStatus({ notice: store.conflictNotice })
      }
      if (remote?.data) {
        apply(id, remote.data)
        lastSeen = fingerprint(collect(id))
        writeMeta(id, { fileId: f.id, remoteModified: f.modifiedTime, pushed: fingerprint(remote.data), fileLink: f.link })
      }
    } else if (dirty || force || !f) {
      setStatus({ state: 'saving' })
      await push(store, id, data)
    } else if (!meta.remoteModified) {
      writeMeta(id, { remoteModified: f.modifiedTime, fileLink: f.link })
    }
    const m = readMeta(id)
    setStatus({ state: 'saved', savedAt: m.remoteModified || new Date().toISOString(), error: null, fileLink: m.fileLink || null, unsaved: fingerprint(collect(id)) !== m.pushed })
  } catch (e) {
    setStatus({ ...errorState(e), unsaved: fingerprint(collect(id)) !== readMeta(id).pushed })
  } finally {
    busy = false
  }
}

// Watch for local changes every couple of seconds; save once things settle.
// With nothing to save, check for other devices' changes once a minute while
// the planner is visible. After a sign-in failure it waits for reconnect()
// instead of retrying.
function tick() {
  const id = running
  if (!id || busy) return
  const store = storeFor(id)
  const fp = fingerprint(collect(id))
  if (fp !== lastSeen) { lastSeen = fp; changedAt = Date.now() }
  const unsaved = fp !== readMeta(id).pushed
  if (unsaved !== status.unsaved) setStatus({ unsaved })
  const connected = store.connected()
  const canSync = connected && status.state !== 'needs-auth'
  if (unsaved && canSync && Date.now() - changedAt > 1500) syncNow()
  else if (unsaved && !connected && status.state !== 'needs-auth') setStatus({ state: 'needs-auth' })
  else if (!unsaved && canSync && document.visibilityState === 'visible' && Date.now() - checkedAt > CHECK_EVERY) syncNow()
}

const onVisible = () => { if (document.visibilityState === 'visible') syncNow() }
const onOnline = () => syncNow()

export function startSync(id = currentProfileId()) {
  if (running === id) return
  stopSync()
  running = id
  lastSeen = fingerprint(collect(id))
  const m = readMeta(id)
  const store = storeFor(id)
  setStatus({ store: store.kind, state: store.connected() ? 'idle' : 'needs-auth', fileLink: m.fileLink || null, savedAt: m.remoteModified || null, notice: null })
  syncNow()
  timer = setInterval(tick, 2000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
}

export function stopSync() {
  clearInterval(timer)
  timer = null
  running = null
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('online', onOnline)
}

// From a click: sign in again (Google's window, or the email account's
// password), then save.
export async function reconnect(password) {
  await storeFor(running || currentProfileId()).reconnect(password)
  await syncNow()
}

// Save whatever is unsaved now (before signing out). True when the store has it all.
export async function flush() {
  await syncNow()
  const id = running || currentProfileId()
  return !!id && fingerprint(collect(id)) === readMeta(id).pushed
}

export const dismissNotice = () => setStatus({ notice: null })

// After first sign-in on this device: record that the local copy matches the store.
export function markSynced(id, data, meta) {
  writeMeta(id, { fileId: meta.id, remoteModified: meta.modifiedTime, pushed: fingerprint(data), fileLink: meta.link })
}

// Remove this device's copy of an account (after signing out).
export function clearLocal(id) {
  for (const k of Object.keys(localStorage)) if (k.startsWith(prefix(id))) localStorage.removeItem(k)
}

