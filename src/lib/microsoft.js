// Microsoft Outlook Calendar and Microsoft To Do, through Microsoft Graph, with the person's own
// Microsoft account (work, school or personal). Sign-in is Microsoft's standard flow for web apps:
// a pop-up window, a one-time code, and "PKCE" so no secret is needed in the page. The access and
// refresh tokens stay on this device (lib/connections.js).
//
// Needs one value from an Azure app registration, set in .env.local like the Google client id:
//   VITE_MS_CLIENT_ID   the Application (client) ID
//   VITE_MS_TENANT      optional: 'common' (default: work, school and personal accounts), 'organizations' or 'consumers'
// and this address registered as a "Single-page application" redirect:  <site>/ms-callback.html
// Web only: the desktop app's address (app://) can't be a redirect address.
import { getConn, markSent, patchConn, setConn, wasSent } from './connections'
import { isDesktop } from './google'
import { cleanTag } from './taskMeta'

const CLIENT_ID = import.meta.env.VITE_MS_CLIENT_ID || ''
const TENANT = import.meta.env.VITE_MS_TENANT || 'common'
const SCOPE = 'openid profile offline_access User.Read Calendars.ReadWrite Tasks.ReadWrite'
const AUTH = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`
const GRAPH = 'https://graph.microsoft.com/v1.0'

export const microsoftAvailable = () => !!CLIENT_ID && !isDesktop && typeof location !== 'undefined' && location.protocol !== 'app:'
const redirectUri = () => `${location.origin}/ms-callback.html`

// ---- PKCE ----------------------------------------------------------------------------------------
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)))
const challengeOf = async (verifier) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))

async function tokenRequest(params) {
  let r
  try { r = await fetch(`${AUTH}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID, ...params }) }) }
  catch { throw new Error("Couldn't reach Microsoft. Check your connection and try again.") }
  let d = null
  try { d = await r.json() } catch { /* handled below */ }
  if (!r.ok || !d?.access_token) {
    const why = d?.error === 'invalid_grant' ? 'Microsoft asks you to sign in again.' : (d?.error_description || '').split('\r\n')[0].slice(0, 160) || 'Microsoft refused the sign-in.'
    throw Object.assign(new Error(why), { code: d?.error || 'failed' })
  }
  return d
}

// Opens Microsoft's sign-in window (run from a click) and resolves to { access, refresh, expiresAt }.
async function signIn() {
  if (!CLIENT_ID) throw new Error('Microsoft sign-in is not set up yet (VITE_MS_CLIENT_ID is missing).')
  // The window must open straight from the click, so it opens blank first and is pointed at Microsoft once the challenge is ready.
  const popup = window.open('', 'nineflow-ms', 'width=520,height=700')
  if (!popup) throw new Error('Your browser blocked the Microsoft window. Allow pop-ups for this site and try again.')
  const verifier = random(48)
  const state = random(16)
  const channel = new BroadcastChannel('nineflow-ms')
  try {
    const challenge = await challengeOf(verifier)
    popup.location.href = `${AUTH}/authorize?${new URLSearchParams({
      client_id: CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query', scope: SCOPE,
      state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
    })}`
    const answer = await new Promise((resolve, reject) => {
      const watch = setInterval(() => { if (popup.closed) { clearInterval(watch); reject(new Error('The Microsoft window was closed before connecting.')) } }, 600)
      const timeout = setTimeout(() => { clearInterval(watch); reject(new Error('Microsoft took too long. Try again.')) }, 5 * 60_000)
      channel.onmessage = (e) => {
        if (e.data?.state !== state) return // some other window's answer
        clearInterval(watch); clearTimeout(timeout)
        e.data.error || !e.data.code ? reject(new Error(e.data.error || 'Microsoft did not send a code.')) : resolve(e.data)
      }
    })
    const t = await tokenRequest({ grant_type: 'authorization_code', code: answer.code, redirect_uri: redirectUri(), code_verifier: verifier, scope: SCOPE })
    return { access: t.access_token, refresh: t.refresh_token || '', expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000 }
  } finally {
    channel.close()
    try { popup.close() } catch { /* already closed */ }
  }
}

// The saved sign-in, as { conn, label } for the Settings list.
export async function connectMicrosoft() {
  const conn = await signIn()
  const me = await (await graphFetch('/me?$select=displayName,userPrincipalName', conn.access)).json()
  return { conn, label: me.displayName || me.userPrincipalName || 'your Microsoft account' }
}

// A valid access token: the saved one, or a fresh one made from the refresh token. If neither works the
// person has to connect again (Microsoft ends the refresh after a day or so for web apps).
async function accessToken() {
  const c = getConn('microsoft')
  if (!c?.access) throw new Error('Microsoft is not connected on this device.')
  if (c.expiresAt - 60_000 > Date.now()) return c.access
  if (!c.refresh) throw new Error('Microsoft asks you to connect again. Press Disconnect, then Connect.')
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refresh, scope: SCOPE })
    patchConn('microsoft', { access: t.access_token, refresh: t.refresh_token || c.refresh, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000 })
    return t.access_token
  } catch (e) {
    throw new Error(e.code === 'invalid_grant' ? 'Microsoft asks you to connect again. Press Disconnect, then Connect.' : e.message)
  }
}

async function graphFetch(path, token, init = {}) {
  let r
  try { r = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }) }
  catch { throw new Error("Couldn't reach Microsoft. Check your connection and try again.") }
  if (r.status === 401 || r.status === 403) throw new Error('Microsoft did not allow that. Disconnect and connect again, and accept the permissions.')
  if (r.status === 429) throw new Error('Microsoft says to slow down. Try again in a minute.')
  if (!r.ok) throw new Error(`Microsoft returned an error (${r.status}).`)
  return r
}
const graph = async (path, init) => graphFetch(path, await accessToken(), init)

export function disconnectMicrosoft() { setConn('microsoft', null) }

// ---- Microsoft To Do: open tasks to import --------------------------------------------------------
// [{ id, title, description, date, startTime, priority, tags, url }]
export async function msTodoCandidates() {
  const lists = (await (await graph('/me/todo/lists?$top=30')).json()).value || []
  const out = []
  for (const list of lists) {
    let next = `/me/todo/lists/${encodeURIComponent(list.id)}/tasks?${new URLSearchParams({ $filter: "status ne 'completed'", $top: '100' })}`
    for (let page = 0; next && page < 3; page += 1) {
      const d = await (await graph(next)).json()
      for (const t of d.value || []) {
        if (!t.title || t.status === 'completed') continue
        const body = t.body?.contentType === 'text' ? String(t.body.content || '').trim() : ''
        out.push({
          id: `mstodo-${t.id}`,
          title: t.title.slice(0, 200),
          description: [body, `From Microsoft To Do (${list.displayName})`].filter(Boolean).join('\n\n').slice(0, 4000),
          date: t.dueDateTime?.dateTime ? String(t.dueDateTime.dateTime).slice(0, 10) : null, // To Do keeps a date, not a time
          startTime: null,
          priority: t.importance === 'high' ? 'high' : 'medium',
          tags: [...new Set(['microsoft-todo', cleanTag(list.displayName)].filter(Boolean))].slice(0, 6),
          url: '',
        })
        if (out.length >= 300) return out
      }
      next = d['@odata.nextLink'] || ''
    }
  }
  return out
}

// ---- Outlook Calendar: a day's tasks as events -----------------------------------------------------
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } }
const pad = (n) => String(n).padStart(2, '0')
const nextDay = (key) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const plusMinutes = (key, hhmm, mins) => {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const dayOffset = Math.floor(total / 1440)
  const r = ((total % 1440) + 1440) % 1440
  let day = key
  for (let i = 0; i < dayOffset; i += 1) day = nextDay(day)
  return `${day}T${pad(Math.floor(r / 60))}:${pad(r % 60)}:00`
}

// The Graph event for one task: timed when it has a start time, all-day when it doesn't.
export function outlookEvent(task) {
  const timeZone = tz()
  const notes = [task.description, `Priority: ${task.priority}`, 'From NineFlow'].filter(Boolean).join('\n\n').slice(0, 8000)
  const base = { subject: (task.title || 'Untitled').slice(0, 250), body: { contentType: 'text', content: notes } }
  if (task.startTime) {
    return { ...base, start: { dateTime: `${task.date}T${task.startTime}:00`, timeZone }, end: { dateTime: plusMinutes(task.date, task.startTime, task.durationMinutes || 30), timeZone } }
  }
  return { ...base, isAllDay: true, start: { dateTime: `${task.date}T00:00:00`, timeZone }, end: { dateTime: `${nextDay(task.date)}T00:00:00`, timeZone } }
}

// Creates an event for each dated task not sent before. Resolves to { sent, skipped, error }.
export async function sendTasksToOutlook(tasks) {
  const dated = tasks.filter((t) => t.date)
  const todo = dated.filter((t) => !wasSent('outlook', t.id))
  const done = []
  let error = null
  for (const t of todo) {
    try { await graph('/me/events', { method: 'POST', body: JSON.stringify(outlookEvent(t)) }); done.push(t.id) } catch (e) { error = e; break }
  }
  if (done.length) markSent('outlook', done)
  return { sent: done.length, skipped: dated.length - todo.length, error }
}
