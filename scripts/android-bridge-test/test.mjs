// Tests for src/native/androidBridge.js, run against stand-ins for the Android plugins, Google's servers and
// the phone's storage:  npm run android:test
import './globals.mjs'
import { createHash } from 'node:crypto'
import { App } from './fake-app.mjs'
import { Browser } from './fake-browser.mjs'
import { LocalNotifications as LN } from './fake-ln.mjs'
import { installAndroidBridge } from '../../src/native/androidBridge.js'

let pass = 0
let fail = 0
const ok = (cond, label, extra = '') => { if (cond) pass += 1; else fail += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${!cond && extra ? `  -> ${extra}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (fn, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(10) } return null }
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const DRIVE = 'https://www.googleapis.com/auth/drive.file'
const SESSION = 'nineflow:android:google-session'

installAndroidBridge()
const bridge = window.nineflowDesktop
const tokens = []
bridge.onToken((t) => tokens.push(t))

ok(bridge.platform === 'android' && bridge.googleConfigured === true && bridge.initialToken === null, 'bridge installed: android, configured, no cached token yet')
ok(typeof bridge.getToken === 'function' && typeof bridge.signOut === 'function' && typeof bridge.reminders.set === 'function' && typeof bridge.reminders.onOpenTask === 'function' && typeof bridge.onToken === 'function', 'bridge has the whole desktop interface')

const nextUrl = async (n) => { await waitFor(() => Browser.opened.length > n); return new URL(Browser.opened[n]) }
const tokenCalls = () => __fetchLog.filter((f) => f.url.includes('/token'))

// ---- 1. a full sign-in
Browser.opened.length = 0
const p1 = bridge.getToken({ interactive: true })
const u1 = await nextUrl(0)
const q = u1.searchParams
ok(u1.origin + u1.pathname === 'https://accounts.google.com/o/oauth2/v2/auth', 'opens Google sign-in in Chrome')
ok(q.get('client_id') === '123-test.apps.googleusercontent.com', 'uses the Android client id')
ok(q.get('redirect_uri') === 'app.nineflow.mobile:/oauth2redirect', 'redirects back to the app link', q.get('redirect_uri'))
ok(q.get('response_type') === 'code' && q.get('code_challenge_method') === 'S256' && !!q.get('state'), 'authorisation code + PKCE S256 + state')
ok(q.get('scope').split(' ').includes(DRIVE) && q.get('scope').includes('email'), 'asks for Drive and the account details')
ok(q.get('access_type') === 'offline' && q.get('prompt') === 'select_account consent', 'asks for a refresh token and the account chooser')
ok(!Browser.opened[0].includes('client_secret'), 'no client secret anywhere')
ok(App.count('appUrlOpen') === 1, 'listening for the app link')

App.emit('appUrlOpen', { url: 'app.nineflow.mobile:/oauth2redirect?code=EVIL&state=wrong' })
await sleep(50)
ok(tokenCalls().length === 0, 'an answer with the wrong state is ignored (no token request)')
App.emit('appUrlOpen', { url: `https://example.com/?code=X&state=${q.get('state')}` })
await sleep(30)
ok(tokenCalls().length === 0, 'a link for some other app is ignored')

globalThis.__tokenReply = { body: { access_token: 'A1', refresh_token: 'R1', expires_in: 3600, scope: `openid email profile ${DRIVE}` } }
App.emit('appUrlOpen', { url: `app.nineflow.mobile:/oauth2redirect?code=CODE1&state=${q.get('state')}` })
const r1 = await p1
const tr = tokenCalls()[0]
ok(r1.ok === true && r1.token.access_token === 'A1' && r1.token.expires_in > 3500, 'sign-in succeeds with an access token', JSON.stringify(r1))
ok(tr.body.grant_type === 'authorization_code' && tr.body.code === 'CODE1' && tr.body.redirect_uri === 'app.nineflow.mobile:/oauth2redirect' && !('client_secret' in tr.body), 'code exchange: right grant, code and redirect, no secret')
ok(b64url(createHash('sha256').update(tr.body.code_verifier).digest()) === q.get('code_challenge'), 'PKCE: the verifier matches the challenge sent to Google')
ok(JSON.parse(localStorage.getItem(SESSION)).refresh === 'R1', 'refresh token saved in the apps private storage')
ok(tokens.at(-1)?.access_token === 'A1', 'listeners are told about the new token')
ok(Browser.closed >= 1 && App.count('appUrlOpen') === 0, 'Chrome tab closed and the listener cleaned up')

// ---- 2. signed in already: no browser
Browser.opened.length = 0
const r2 = await bridge.getToken({ interactive: true })
ok(r2.ok && r2.token.access_token === 'A1' && Browser.opened.length === 0, 'second call reuses the token without opening Chrome')

// ---- 3. three hours later: renewed silently from the refresh token
globalThis.__tokenReply = { body: { access_token: 'A2', expires_in: 3600, scope: `openid email profile ${DRIVE}` } }
__fetchLog.length = 0
const realNow = Date.now
Date.now = () => realNow() + 3 * 3600_000
const r3 = await bridge.getToken({ interactive: true })
Date.now = realNow
const rt = tokenCalls()[0]
ok(r3.ok && r3.token.access_token === 'A2' && Browser.opened.length === 0, 'expired token is renewed silently (no Chrome)', JSON.stringify(r3))
ok(rt?.body.grant_type === 'refresh_token' && rt.body.refresh_token === 'R1' && !('client_secret' in rt.body), 'renewal uses the refresh token, no secret')
ok(JSON.parse(localStorage.getItem(SESSION)).refresh === 'R1', 'the refresh token is kept when Google does not send a new one')

// ---- 4. the refresh is revoked
Date.now = () => realNow() + 6 * 3600_000
globalThis.__tokenReply = { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } }
const before = tokens.length
const r4 = await bridge.getToken({ interactive: false })
Date.now = realNow
ok(r4.ok === false && r4.code === 'invalid_grant', 'a revoked session reports invalid_grant (silent mode)', JSON.stringify(r4))
ok(tokens.length > before && tokens.at(-1) === null && localStorage.getItem(SESSION) === null, 'revoked session is wiped and the app is told (null token)')
const r4b = await bridge.getToken({ interactive: false })
ok(r4b.ok === false && r4b.code === 'signed_out', 'not signed in + silent mode -> signed_out', JSON.stringify(r4b))

// ---- 5. cancelling and errors
Browser.opened.length = 0
const p5 = bridge.getToken({ interactive: true })
const u5 = await nextUrl(0)
App.emit('appUrlOpen', { url: `app.nineflow.mobile:/oauth2redirect?error=access_denied&state=${u5.searchParams.get('state')}` })
const r5 = await p5
ok(r5.ok === false && r5.code === 'access_denied', 'cancelling in Google -> access_denied', JSON.stringify(r5))

Browser.opened.length = 0
const p6 = bridge.getToken({ interactive: true })
const u6 = await nextUrl(0)
globalThis.__tokenReply = { body: { access_token: 'AX', refresh_token: 'RX', expires_in: 3600, scope: 'openid email profile' } }
App.emit('appUrlOpen', { url: `app.nineflow.mobile:/oauth2redirect?code=C&state=${u6.searchParams.get('state')}` })
const r6 = await p6
ok(r6.ok === false && r6.code === 'drive_not_granted' && localStorage.getItem(SESSION) === null, 'Drive not ticked -> drive_not_granted and nothing saved', JSON.stringify(r6))

Browser.opened.length = 0
const p7 = bridge.getToken({ interactive: true })
await nextUrl(0)
Browser.emit('browserFinished')
const t0 = Date.now()
const r7 = await p7
ok(r7.ok === false && r7.code === 'popup_closed' && Date.now() - t0 >= 2400, 'closing the Chrome tab -> popup_closed (after a short wait)', JSON.stringify(r7))

Browser.opened.length = 0
const p8 = bridge.getToken({ interactive: true })
await nextUrl(0)
const p8b = bridge.getToken({ interactive: true })
const r8 = await p8
ok(r8.ok === false && r8.code === 'popup_closed', 'starting sign-in again cancels the first one')
const u8 = await nextUrl(1)
globalThis.__tokenReply = { body: { access_token: 'A8', refresh_token: 'R8', expires_in: 3600, scope: `openid email profile ${DRIVE}` } }
App.emit('appUrlOpen', { url: `app.nineflow.mobile:/oauth2redirect?code=C8&state=${u8.searchParams.get('state')}` })
ok((await p8b).ok === true, 'the second sign-in completes')

// ---- 6. an extra permission always goes through Chrome
Browser.opened.length = 0
const p9 = bridge.getToken({ interactive: true, hint: 'ada@example.com', scope: 'https://www.googleapis.com/auth/tasks' })
const u9 = await nextUrl(0)
ok(u9.searchParams.get('scope').includes(DRIVE) && u9.searchParams.get('scope').includes('auth/tasks') && u9.searchParams.get('prompt') === 'consent' && u9.searchParams.get('login_hint') === 'ada@example.com' && u9.searchParams.get('include_granted_scopes') === 'true', 'extra scope: asked together with Drive, consent shown, earlier grants kept')
globalThis.__tokenReply = { body: { access_token: 'A9', expires_in: 3600, scope: `openid email profile ${DRIVE} https://www.googleapis.com/auth/tasks` } }
App.emit('appUrlOpen', { url: `app.nineflow.mobile:/oauth2redirect?code=C9&state=${u9.searchParams.get('state')}` })
const r9 = await p9
ok(r9.ok && r9.token.scope.includes('auth/tasks'), 'extra scope granted and reported')
ok(JSON.parse(localStorage.getItem(SESSION)).refresh === 'R8', 'earlier refresh token kept when the extra grant sends none')

// ---- 7. reminders
const now = Date.now()
const list = [
  { id: 't1@2026-10-20@10:00@10', at: now + 3600_000, title: 'In 10 min: Standup', body: '10:00 - 30 min', taskId: 't1' },
  { id: 't2@2026-10-20@11:00@0', at: now + 7200_000, title: 'Starting now: Review', body: '11:00 - 45 min', taskId: 't2' },
  { id: 'past', at: now - 60_000, title: 'Old', taskId: 't3' },
  { id: 42, at: now + 1000, title: 'bad id' },
]
LN.calls.length = 0
await bridge.reminders.set(list)
ok(LN.calls.includes('requestPermissions') && LN.calls.includes('changeExact') && LN.calls.includes('schedule:2'), 'first reminders: asks notification permission, asks for exact alarms, schedules 2', LN.calls.join(','))
ok(LN.scheduled.every((n) => Number.isInteger(n.id) && n.id > 0 && n.id < 2 ** 31) && LN.scheduled[0].extra.taskId === 't1' && LN.scheduled[0].schedule.at instanceof Date && LN.scheduled[0].schedule.allowWhileIdle === true, 'notifications have valid ids, task link, date and work in doze mode')
ok(new Set(LN.scheduled.map((n) => n.id)).size === 2, 'distinct ids per reminder')
LN.calls.length = 0
await bridge.reminders.set(list.slice(0, 1))
ok(!LN.calls.includes('requestPermissions') && !LN.calls.includes('changeExact') && LN.calls.includes('cancel:2') && LN.calls.includes('schedule:1'), 'second set: no new prompts, replaces the old schedule', LN.calls.join(','))
LN.calls.length = 0
await bridge.reminders.set([])
ok(LN.calls.includes('cancel:1') && !LN.calls.some((c) => c.startsWith('schedule')) && LN.pending.length === 0, 'an empty schedule clears everything')
LN.display = 'prompt'
LN.willGrant = false
LN.calls.length = 0
LN.scheduled = []
await bridge.reminders.set(list)
ok(LN.calls.includes('requestPermissions') && LN.scheduled.length === 0, 'permission refused -> nothing scheduled, no crash')
let opened = null
const off = bridge.reminders.onOpenTask((id) => { opened = id })
await sleep(10)
;[...LN.actionListeners].forEach((f) => f({ notification: { extra: { taskId: 'abc' } } }))
ok(opened === 'abc', 'tapping a reminder opens its task')
off()
opened = null
;[...LN.actionListeners].forEach((f) => f({ notification: { extra: { taskId: 'zzz' } } }))
ok(opened === null, 'the unsubscribe stops it')

// ---- 8. sign out
__fetchLog.length = 0
const n = tokens.length
await bridge.signOut()
ok(localStorage.getItem(SESSION) === null && tokens.at(-1) === null && tokens.length > n, 'sign out clears the session and tells the app')
ok(__fetchLog.some((f) => f.url.startsWith('https://oauth2.googleapis.com/revoke?token=')), 'sign out revokes the token at Google')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
