// Google Drive REST calls for the planner's one data file:
//   My Drive / Daily Planner / planner-data.json
// With the drive.file scope the app only ever sees files it created.
import { getToken } from './google'
import { AuthError, OfflineError } from './syncErrors'

export { AuthError, OfflineError }
export const FOLDER_NAME = 'Daily Planner'
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
  if (r.status === 401 || r.status === 403) throw new AuthError('Google Drive access expired.')
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

export async function findFolder() {
  return findOne(`name='${esc(FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
}

export async function ensureFolder() {
  const found = await findFolder()
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
// `googleType` is the Google type to convert to; the file goes into the "Daily Planner" folder.
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
