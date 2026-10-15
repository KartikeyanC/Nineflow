// The planner file in the person's Google Drive: My Drive / Daily Planner / planner-data.json
// (the same file the NineFlow app syncs; see src/lib/drive.js and src/lib/cloud.js).
//
// Every change is read → change → save. Just before saving, the file's date is checked
// again; if NineFlow saved in between, the change is made again on the fresh copy, so
// neither side's work is lost. NineFlow picks up the new file within about a minute
// while it is open (or at its next start).

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'Daily Planner'
const FILE = 'planner-data.json'
const FIELDS = 'id,name,modifiedTime,trashed'
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

export function createDriveStore({ getToken, fetch: f = globalThis.fetch }) {
  let fileId = null

  async function call(url, opts = {}, retry = true) {
    const token = await getToken()
    let r
    try {
      r = await f(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } })
    } catch {
      throw new Error('Could not reach Google Drive. Check the internet connection.')
    }
    if (r.status === 401 && retry) return call(url, opts, false) // token just expired: getToken renews it
    if (r.status === 401 || r.status === 403) throw new Error('Google Drive refused access. Run "npm run login" in the mcp folder to sign in again.')
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`Google Drive error ${r.status}.`)
    return r
  }

  async function findOne(query) {
    const r = await call(`${API}/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(${FIELDS})&orderBy=modifiedTime desc&pageSize=1`)
    return r ? (await r.json()).files?.[0] || null : null
  }

  async function locate() {
    if (fileId) {
      const r = await call(`${API}/files/${fileId}?fields=${FIELDS}`)
      const m = r && (await r.json())
      if (m && !m.trashed) return m
      fileId = null
    }
    const folder = await findOne(`name='${esc(FOLDER)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
    const file = folder && (await findOne(`name='${esc(FILE)}' and '${folder.id}' in parents and trashed=false`))
    if (!file) throw new Error('No NineFlow planner found in this Google Drive. Sign in to NineFlow once with this Google account (it creates My Drive / Daily Planner / planner-data.json), then try again.')
    fileId = file.id
    return file
  }

  async function read() {
    const meta = await locate()
    const r = await call(`${API}/files/${meta.id}?alt=media`)
    if (!r) throw new Error('The planner file disappeared. Open NineFlow once, then try again.')
    return { meta, bundle: await r.json() }
  }

  // `change(bundle)` edits the bundle in place and returns { result, changed }.
  async function update(change) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { meta, bundle } = await read()
      const out = change(bundle)
      if (!out.changed) return out.result
      const now = await locate()
      if (now.modifiedTime !== meta.modifiedTime) continue // NineFlow saved meanwhile: redo on the fresh copy
      bundle.savedAt = new Date().toISOString()
      const r = await call(`${UPLOAD}/files/${meta.id}?uploadType=media&fields=${FIELDS}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(bundle),
      })
      if (!r) throw new Error('The planner file disappeared. Open NineFlow once, then try again.')
      return out.result
    }
    throw new Error('The planner kept changing while saving (NineFlow is saving too). Try again in a moment.')
  }

  return { read, update }
}
