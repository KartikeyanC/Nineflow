// The phone app's bridge: the same shape as the desktop app's window.nineflowDesktop (desktop/preload.cjs),
// so src/lib/google.js and the planner treat both alike. Two jobs:
//
//  1. Google sign-in. Google blocks its sign-in page inside an app's own web view, so this opens it in
//     Chrome (a Custom Tab), and Google sends the person back through a link that belongs to this app
//     (app.nineflow.mobile:/oauth2redirect). The answer is a one-time code, swapped for an access token
//     and a refresh token with PKCE, so no secret is needed in the app. The refresh token stays in the
//     app's private storage; the one-hour access tokens are renewed from it.
//     Needs the "Android" OAuth client ID of the site's Google Cloud project: VITE_GOOGLE_ANDROID_CLIENT_ID
//     (docs/MOBILE.md).
//  2. Reminders. The planner sends the upcoming schedule (src/lib/taskMeta.js → reminderSchedule), and it
//     becomes phone notifications that arrive with NineFlow closed.
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { LocalNotifications } from '@capacitor/local-notifications'

const PACKAGE = 'app.nineflow.mobile'
const REDIRECT = `${PACKAGE}:/oauth2redirect`
const CLIENT_ID = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID || ''
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SESSION_KEY = 'nineflow:android:google-session'
const SIGN_IN_TIMEOUT = 5 * 60_000

// Errors carry a code the sign-in screen already knows (see Onboarding SIGNIN_HELP).
const fail = (code, message) => Object.assign(new Error(message), { code })

// ---- stored session ---------------------------------------------------------------------------
// { refresh, access: { access_token, expiresAt, scope } | null }
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || { refresh: '', access: null } } catch { return { refresh: '', access: null } } }
let session = readSession()
const saveSession = () => { try { session.refresh || session.access ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY) } catch { /* the session just won't survive a restart */ } }

const forRenderer = () => session.access && { access_token: session.access.access_token, expires_in: Math.max(0, Math.round((session.access.expiresAt - Date.now()) / 1000)), scope: session.access.scope }
export const cached = () => (session.access && session.access.expiresAt - 60_000 > Date.now() ? forRenderer() : null)

const listeners = new Set()
const push = (t) => listeners.forEach((fn) => { try { fn(t) } catch { /* a listener must not break the others */ } })

function remember(t) {
  session.access = { access_token: t.access_token, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000, scope: t.scope || session.access?.scope || SCOPES }
  if (t.refresh_token) session.refresh = t.refresh_token
  saveSession()
  schedule()
  push(forRenderer())
}

// Renew five minutes before expiry (only while the app is running; it also renews when it comes back to the front).
let timer = null
function schedule(delay) {
  clearTimeout(timer)
  if (!session.refresh) return
  const wait = delay ?? Math.max(30_000, (session.access?.expiresAt ?? 0) - Date.now() - 5 * 60_000)
  timer = setTimeout(() => refresh().catch(() => schedule(60_000)), wait)
}

async function tokenRequest(params) {
  let r
  try {
    r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID, ...params }) })
  } catch { throw fail('offline', "Couldn't reach Google. Check your connection and try again.") }
  let d = null
  try { d = await r.json() } catch { /* handled below */ }
  if (!r.ok || !d?.access_token) throw fail(d?.error === 'invalid_grant' ? 'invalid_grant' : d?.error || 'unknown', d?.error_description || 'Google sign-in failed.')
  return d
}

let refreshing = null
async function refresh() {
  if (!session.refresh) throw fail('signed_out', 'Not signed in.')
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      remember(await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refresh }))
    } catch (e) {
      // Revoked, expired (apps in Testing mode: after 7 days) or the password changed.
      if (e.code === 'invalid_grant') { session = { refresh: '', access: null }; saveSession(); clearTimeout(timer); push(null) }
      throw e
    }
    return forRenderer()
  })().finally(() => { refreshing = null })
  return refreshing
}

// ---- interactive sign-in (Chrome Custom Tab → app link) --------------------------------------
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomString = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)))

let pending = null // one sign-in at a time

function signIn({ hint, prompt, scope } = {}) {
  if (!CLIENT_ID) return Promise.reject(fail('not_configured', 'Google sign-in is not set up in this app yet (VITE_GOOGLE_ANDROID_CLIENT_ID is missing). See docs/MOBILE.md.'))
  pending?.cancel()
  return new Promise((resolve, reject) => {
    const verifier = randomString(48)
    const state = randomString(16)
    let urlHandle = null
    let closedHandle = null
    let closedTimer = null
    let done = false
    const finish = (err, value) => {
      if (done) return
      done = true
      clearTimeout(timeout); clearTimeout(closedTimer)
      urlHandle?.remove?.(); closedHandle?.remove?.()
      pending = null
      Browser.close().catch(() => { /* nothing to close */ })
      if (err) reject(err); else resolve(value)
    }
    const timeout = setTimeout(() => finish(fail('popup_closed', 'The Google sign-in was not finished.')), SIGN_IN_TIMEOUT)
    pending = { cancel: () => finish(fail('popup_closed', 'Sign-in was started again.')) }

    ;(async () => {
      try {
        const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
        urlHandle = await CapApp.addListener('appUrlOpen', async ({ url }) => {
          if (!String(url).startsWith(`${PACKAGE}:`)) return
          clearTimeout(closedTimer)
          const p = new URL(url).searchParams
          if (p.get('state') !== state) return // some other sign-in's answer
          if (p.get('error')) return finish(fail(p.get('error') === 'access_denied' ? 'access_denied' : p.get('error'), 'Google sign-in was cancelled.'))
          try {
            const t = await tokenRequest({ grant_type: 'authorization_code', code: p.get('code') || '', code_verifier: verifier, redirect_uri: REDIRECT })
            if (!String(t.scope || '').includes('https://www.googleapis.com/auth/drive.file')) return finish(fail('drive_not_granted', 'Google Drive access is needed to save your planner. Please allow it.'))
            remember(t)
            finish(null, forRenderer())
          } catch (e) { finish(e) }
        })
        // Closing the Chrome tab without finishing: wait a moment, since the answer may still be arriving.
        closedHandle = await Browser.addListener('browserFinished', () => {
          clearTimeout(closedTimer)
          closedTimer = setTimeout(() => finish(fail('popup_closed', 'The Google window was closed before signing in.')), 2500)
        })
        const params = new URLSearchParams({
          client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code',
          scope: scope ? `${SCOPES} ${scope}` : SCOPES, include_granted_scopes: 'true',
          code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline',
          // Consent is asked so Google issues a refresh token for this phone.
          prompt: prompt === 'select_account' || !hint ? 'select_account consent' : 'consent',
          ...(hint ? { login_hint: hint } : {}),
        })
        await Browser.open({ url: `${AUTH_URL}?${params}` })
      } catch (e) { finish(fail('popup_failed_to_open', e?.message || 'Could not open Chrome for Google sign-in.')) }
    })()
  })
}

// Same contract as the desktop bridge: { ok: true, token } or { ok: false, code, message }.
async function getToken({ interactive = true, hint, prompt, scope } = {}) {
  const wrap = async (fn) => { try { return { ok: true, token: await fn() } } catch (e) { return { ok: false, code: e.code || 'unknown', message: e.message } } }
  return wrap(async () => {
    // Asking for an extra permission (Calendar, Tasks) always opens Chrome.
    if (scope) return signIn({ hint, prompt: 'consent', scope })
    const c = cached()
    if (c && prompt !== 'select_account') return c
    if (session.refresh && prompt !== 'select_account') {
      try { return await refresh() } catch (e) { if (e.code === 'offline' || !interactive) throw e }
    }
    if (!interactive) throw fail('signed_out', 'Not signed in.')
    return signIn({ hint, prompt })
  })
}

async function signOut() {
  const t = session.refresh || session.access?.access_token
  clearTimeout(timer)
  session = { refresh: '', access: null }
  saveSession()
  push(null)
  if (t) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => {})
}

// ---- reminders ---------------------------------------------------------------------------------
const MAX = 300
const EXACT_ASKED = 'nineflow:android:exact-alarm-asked'
const hash31 = (s) => { let h = 5381; for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h & 0x7fffffff || 1 }

function clean(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => r && typeof r.id === 'string' && Number.isFinite(r.at) && typeof r.title === 'string')
    .slice(0, MAX)
    .map((r) => ({ id: r.id, at: r.at, title: r.title.slice(0, 200), body: typeof r.body === 'string' ? r.body.slice(0, 300) : '', taskId: typeof r.taskId === 'string' ? r.taskId : null }))
}

// Notifications need the person's OK (Android 13+), asked the first time there is something to remind about.
async function notificationsAllowed() {
  try {
    let p = await LocalNotifications.checkPermissions()
    if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LocalNotifications.requestPermissions()
    return p.display === 'granted'
  } catch { return false }
}

// Reminders at an exact minute need the "Alarms & reminders" setting on newer Android. Asked once.
async function askExactAlarms() {
  try {
    if (localStorage.getItem(EXACT_ASKED)) return
    const s = await LocalNotifications.checkExactNotificationSetting()
    if (s.exact_alarm === 'granted') return
    localStorage.setItem(EXACT_ASKED, '1')
    await LocalNotifications.changeExactNotificationSetting()
  } catch { /* older Android, or the setting is not needed */ }
}

async function setReminders(list) {
  const items = clean(list).filter((r) => r.at > Date.now() + 1000)
  try {
    const pendingNow = await LocalNotifications.getPending()
    if (pendingNow.notifications.length) await LocalNotifications.cancel({ notifications: pendingNow.notifications.map((n) => ({ id: n.id })) })
    if (!items.length) return
    if (!(await notificationsAllowed())) return
    await askExactAlarms()
    await LocalNotifications.schedule({
      notifications: items.map((r) => ({
        id: hash31(r.id), title: r.title, body: r.body, extra: { taskId: r.taskId },
        schedule: { at: new Date(r.at), allowWhileIdle: true },
      })),
    })
  } catch { /* reminders are a convenience: never break the planner */ }
}

function onOpenTask(fn) {
  let handle = null
  let removed = false
  LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    const id = e?.notification?.extra?.taskId
    if (id) fn(id)
  }).then((h) => { if (removed) h.remove(); else handle = h }).catch(() => {})
  return () => { removed = true; handle?.remove?.() }
}

// ---- the object the app sees -------------------------------------------------------------------
export function installAndroidBridge() {
  if (window.nineflowDesktop) return
  window.nineflowDesktop = {
    platform: 'android',
    googleConfigured: !!CLIENT_ID,
    initialToken: cached(),
    getToken,
    signOut,
    reminders: { set: setReminders, onOpenTask },
    onToken: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  }
  // Renew when the app comes back to the front (the timer may not have run while it was in the background).
  schedule()
  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive && session.refresh && !cached()) refresh().catch(() => {})
  }).catch(() => {})
}
