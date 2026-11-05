// Google Drive REST calls for the planner's one data file:
//   My Drive / NineFlow / planner-data.json  (called "Daily Planner" at first; renamed on the next save)
// With the drive.file scope the app only ever sees files it created.
import { getToken } from './google'
import { AuthError, OfflineError } from './syncErrors'

export { AuthError, OfflineError }
export const FOLDER_NAME = 'NineFlow'
const OLD_FOLDER_NAME = 'Daily Planner'
export const FILE_NAME = 'planner-data.json'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FIELDS = 'id,name,modifiedTime,webViewLink,trashed'

async function call(url, opts = {}) {
  const token = getToken()
  if (!token) throw new AuthError('Not connected to Google Drive.')
  let r
  try {
    r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } })
  } catch {
    throw new OfflineError('No connection to Google Drive.')
  }
  if (r.status === 401) throw new AuthError('Google Drive access expired.')
  if (r.status === 403) {
    // 403 is also Drive's "slow down" and "API turned off"; only a permission problem needs a new sign-in.
    const err = (await r.json().catch(() => null))?.error
    const reason = err?.errors?.[0]?.reason || ''
    if (/rateLimit/i.test(reason)) throw new Error('Google Drive is busy. It will retry in a moment.')
    if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') throw new Error(`Google Drive refused: ${err?.message || reason}`)
    throw new AuthError('Google Drive did not allow access.')
  }
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Google Drive error ${r.status}`)
  return r
}

const q = (s) => encodeURIComponent(s)
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

async function findOne(query) {
  const r = await call(`${API}/files?q=${q(query)}&spaces=drive&fields=files(${FIELDS})&orderBy=modifiedTime desc&pageSize=1`)
  const d = r ? await r.json() : { files: [] }
  return d.files?.[0] || null
}

// The folder under either name. Devices already signed in reach the file by its id, so the rename
// never splits anyone's data.
export async function findFolder() {
  return findOne(`(name='${esc(FOLDER_NAME)}' or name='${esc(OLD_FOLDER_NAME)}') and mimeType='application/vnd.google-apps.folder' and trashed=false`)
}

export async function ensureFolder() {
  const found = await findFolder()
  if (found?.name === OLD_FOLDER_NAME) {
    const r = await call(`${API}/files/${found.id}?fields=${FIELDS}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME }),
    }).catch(() => null) // keeping the old name is fine; the next save tries again
    return (r && await r.json().catch(() => null)) || found
  }
  if (found) return found
  const r = await call(`${API}/files?fields=${FIELDS}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  return r.json()
}

export async function findFile(folderId, name = FILE_NAME) {
  return findOne(`name='${esc(name)}' and '${folderId}' in parents and trashed=false`)
}

export async function getMeta(fileId) {
  const r = await call(`${API}/files/${fileId}?fields=${FIELDS}`)
  if (!r) return null
  const m = await r.json()
  return m.trashed ? null : m
}

export async function download(fileId) {
  const r = await call(`${API}/files/${fileId}?alt=media`)
  return r ? r.json() : null
}

// New file in the folder (multipart: metadata + JSON body).
export async function createFile(folderId, name, data) {
  const boundary = `dp${Math.random().toString(36).slice(2)}`
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' }),
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify(data),
    `--${boundary}--`, '',
  ].join('\r\n')
  const r = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  })
  return r.json()
}

// Replace the file's contents. Returns null if the file is gone.
export async function updateFile(fileId, data) {
  const r = await call(`${UPLOAD}/files/${fileId}?uploadType=media&fields=${FIELDS}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(data),
  })
  return r ? r.json() : null
}

// A Google Sheet or Google Doc made by uploading plain content and letting Drive convert it
// (CSV → Sheet, HTML → Doc). Works with the drive.file scope, so no extra permission is needed.
// `googleType` is the Google type to convert to; the file goes into the NineFlow folder.
export async function createConverted({ name, content, sourceType, googleType }) {
  const folder = await ensureFolder()
  const boundary = `dp${Math.random().toString(36).slice(2)}`
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '',
    JSON.stringify({ name, parents: [folder.id], mimeType: googleType }),
    `--${boundary}`, `Content-Type: ${sourceType}; charset=UTF-8`, '',
    content,
    `--${boundary}--`, '',
  ].join('\r\n')
  const r = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  })
  return r.json() // { id, name, webViewLink, … }
}
