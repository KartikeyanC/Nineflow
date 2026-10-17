// Google sign-in for the browser (Google Identity Services, token model).
// No server: the browser gets a short-lived access token (about an hour)
// for the person's email/profile and for files this app creates in their
// Drive (drive.file scope; the rest of their Drive stays out of reach).

// In the phone app, the bridge (window.nineflowDesktop) must exist before this file reads it just below. An
// import always finishes before the importing file runs, however the bundler splits chunks (a script tag or
// an import in main.jsx was not enough: shared code can be loaded before an entry's own imports).
import '../native/boot'
import { mockEnabled } from './googleMock'

// In the desktop app (desktop/preload.cjs) sign-in happens in the system
// browser and the app renews tokens itself; this module just stores them.
const desktop = typeof window !== 'undefined' ? window.nineflowDesktop || null : null
export const isDesktop = !!desktop

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || (mockEnabled ? 'mock-client-id' : '')
export const isConfigured = () => (desktop ? desktop.googleConfigured : !!CLIENT_ID)
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file'
// Calendar access is asked for separately, when someone presses "Connect Google
// Calendar" (never at sign-in), so people who don't use it never see it.
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const CAL_TOKEN_KEY = 'daily-planner:gcal-token'
const TOKEN_KEY = 'daily-planner:google-token' // sessionStorage: cleared when the browser session ends
const ACCOUNT_KEY = 'daily-planner:account' // localStorage: who is signed in on this device (Google, or an email account with provider: 'email')
const LAST_KEY = 'daily-planner:last-account' // localStorage: name/email/picture/provider only, kept after sign-out for "Continue as"

// Sign-in failures carry a `code` so the screen can say what to do next.
export class SignInError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

let gisPromise = null
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => resolve(window.google)
      s.onerror = () => { gisPromise = null; reject(new Error('Could not reach Google. Check your connection and try again.')) }
      document.head.appendChild(s)
    })
  }
  return gisPromise
}

// ---- token -----------------------------------------------------------------
export function getToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null')
    return t && t.expiresAt - 60_000 > Date.now() ? t.token : null
  } catch { return null }
}
function saveToken(token, expiresIn) {
  try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresIn * 1000 })) } catch { /* ignore */ }
}
export function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } }

// The Calendar token. In the desktop app one token carries every granted
// scope, so it is the same token; in the browser it is a second one.
export function getCalendarToken() {
  if (desktop) return getToken()
  try {
    const t = JSON.parse(sessionStorage.getItem(CAL_TOKEN_KEY) || 'null')
    return t && t.expiresAt - 60_000 > Date.now() ? t.token : null
  } catch { return null }
}
export function clearCalendarToken() { try { sessionStorage.removeItem(CAL_TOKEN_KEY) } catch { /* ignore */ } }

// Asks for the Calendar permission (Google's window; run it from a click).
export async function requestCalendarToken({ hint } = {}) {
  if (desktop) {
    const r = await desktop.getToken({ interactive: true, scope: CALENDAR_SCOPE, hint })
    if (!r.ok) throw new SignInError(r.code, r.message)
    saveToken(r.token.access_token, r.token.expires_in)
    return r.token.access_token
  }
  if (!CLIENT_ID) throw new SignInError('not_configured', 'Google sign-in is not set up yet (VITE_GOOGLE_CLIENT_ID is missing).')
  const google = await loadGis().catch((e) => { throw new SignInError('offline', e.message) })
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: (r) => {
        if (r.error) return reject(new SignInError(r.error, r.error_description || r.error))
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, CALENDAR_SCOPE)) {
          return reject(new SignInError('calendar_not_granted', 'Calendar access was not allowed. Tick the calendar box in the Google window to connect.'))
        }
        try { sessionStorage.setItem(CAL_TOKEN_KEY, JSON.stringify({ token: r.access_token, expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 })) } catch { /* ignore */ }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new SignInError(e?.type || 'unknown', e?.type === 'popup_closed' ? 'The Google window was closed before connecting.' : e?.message || 'Google could not connect the calendar.')),
    })
    client.requestAccessToken({ prompt: '', ...(hint ? { hint, login_hint: hint } : {}) })
  })
}

// ---- other permissions, asked for only when a feature needs them (never at sign-in) ------------------
// Google Tasks, and the list of the person's calendars (for "show my other calendars"). Each is its own
// token in the browser (the desktop app's single token carries everything granted), kept for the
// browser session like the Calendar one, and asked for again about once an hour.
export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'
export const CALENDARS_SCOPE = `${CALENDAR_SCOPE} https://www.googleapis.com/auth/calendar.calendarlist.readonly`
const EXTRA_PREFIX = 'daily-planner:g-token:'

export function getExtraToken(name) {
  if (desktop) return getToken()
  try {
    const t = JSON.parse(sessionStorage.getItem(EXTRA_PREFIX + name) || 'null')
    return t && t.expiresAt - 60_000 > Date.now() ? t.token : null
  } catch { return null }
}
export function clearExtraTokens() {
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(EXTRA_PREFIX)) sessionStorage.removeItem(k) } catch { /* ignore */ }
}

// Google's window for `scope` (run from a click). `name` is where the browser keeps the token.
export async function requestExtraToken(name, scope, { hint } = {}) {
  if (desktop) {
    const r = await desktop.getToken({ interactive: true, scope, hint })
    if (!r.ok) throw new SignInError(r.code, r.message)
    saveToken(r.token.access_token, r.token.expires_in)
    return r.token.access_token
  }
  if (!CLIENT_ID) throw new SignInError('not_configured', 'Google sign-in is not set up yet (VITE_GOOGLE_CLIENT_ID is missing).')
  const google = await loadGis().catch((e) => { throw new SignInError('offline', e.message) })
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope,
      callback: (r) => {
        if (r.error) return reject(new SignInError(r.error, r.error_description || r.error))
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...scope.split(' '))) {
          return reject(new SignInError('not_granted', 'That access was not allowed. Tick the box in the Google window to connect.'))
        }
        try { sessionStorage.setItem(EXTRA_PREFIX + name, JSON.stringify({ token: r.access_token, expiresAt: Date.now() + (Number(r.expires_in) || 3600) * 1000 })) } catch { /* ignore */ }
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new SignInError(e?.type || 'unknown', e?.type === 'popup_closed' ? 'The Google window was closed before connecting.' : e?.message || 'Google could not connect.')),
    })
    client.requestAccessToken({ prompt: '', ...(hint ? { hint, login_hint: hint } : {}) })
  })
}

// A valid token for `name`, asking in Google's window only when there isn't one (so call it from a click).
export async function ensureExtraToken(name, scope) {
  return getExtraToken(name) || requestExtraToken(name, scope, { hint: rememberedAccount()?.email })
}

if (desktop) {
  const keep = (t) => (t ? saveToken(t.access_token, t.expires_in) : clearToken())
  if (desktop.initialToken) keep(desktop.initialToken)
  desktop.onToken(keep)
}

// Opens Google's window (a quick flash when consent was already given).
// Must run from a click, or the browser blocks the window.
export async function requestToken({ prompt = '', hint } = {}) {
  if (desktop) {
    const r = await desktop.getToken({ interactive: true, prompt, hint })
    if (!r.ok) throw new SignInError(r.code, r.message)
    saveToken(r.token.access_token, r.token.expires_in)
    return r.token.access_token
  }
  if (!CLIENT_ID) throw new SignInError('not_configured', 'Google sign-in is not set up yet (VITE_GOOGLE_CLIENT_ID is missing).')
  const google = await loadGis().catch((e) => { throw new SignInError('offline', e.message) })
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (r) => {
        if (r.error) return reject(new SignInError(r.error, r.error_description || r.error))
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, 'https://www.googleapis.com/auth/drive.file')) {
          return reject(new SignInError('drive_not_granted', 'Google Drive access is needed to save your planner. Please allow it.'))
        }
        saveToken(r.access_token, Number(r.expires_in) || 3600)
        resolve(r.access_token)
      },
      error_callback: (e) => reject(new SignInError(e?.type || 'unknown', e?.type === 'popup_closed' ? 'The Google window was closed before signing in.' : e?.message || 'Google sign-in failed.')),
    })
    client.requestAccessToken({ prompt, ...(hint ? { hint, login_hint: hint } : {}) })
  })
}

// ---- account -----------------------------------------------------------------
export async function fetchAccount(token) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new SignInError('account_unreadable', 'Could not read your Google account.')
  const u = await r.json()
  if (!u.email) throw new SignInError('account_unreadable', 'Your Google account did not share an email address.')
  return { sub: u.sub, email: u.email, name: u.name || u.email.split('@')[0], picture: u.picture || '' }
}

export const rememberedAccount = () => { try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null') } catch { return null } }
export const rememberAccount = (a) => {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a))
    localStorage.setItem(LAST_KEY, JSON.stringify({ name: a.name, email: a.email, picture: a.picture, ...(a.provider ? { provider: a.provider } : {}) }))
  } catch { /* ignore */ }
}
export const forgetAccount = () => { try { localStorage.removeItem(ACCOUNT_KEY) } catch { /* ignore */ } }
export const lastAccount = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null') } catch { return null } }
export const forgetLastAccount = () => { try { localStorage.removeItem(LAST_KEY) } catch { /* ignore */ } }

// Full sign-in: Google window, then the account details. With a `hint`
// (the last account's email) Google skips its account chooser.
export async function signInWithGoogle({ hint } = {}) {
  const token = await requestToken(hint ? { hint } : { prompt: 'select_account' })
  const account = await fetchAccount(token)
  rememberAccount(account)
  return account
}

export async function revokeToken() {
  if (desktop) { clearToken(); await desktop.signOut(); return }
  const t = getToken()
  clearToken()
  clearCalendarToken()
  clearExtraTokens()
  if (!t) return
  try {
    const google = await loadGis()
    google.accounts.oauth2.revoke(t, () => {})
  } catch { /* offline: the token expires on its own within the hour */ }
}
