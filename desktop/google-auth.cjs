// Google sign-in for the desktop app.
//
// Google doesn't allow its sign-in page inside an app's own window, so the
// desktop app uses the standard flow for installed apps: the person signs in
// in their normal browser, Google sends the answer to a one-off address on
// this computer (http://127.0.0.1:<random port>), and the app swaps it for an
// access token plus a refresh token (PKCE keeps the exchange private).
//
// The refresh token is kept encrypted with the OS keychain (Electron
// safeStorage), so people stay signed in and the one-hour access tokens are
// renewed in the background. Uses the "Desktop app" OAuth client from
// desktop/oauth.json (see docs/DESKTOP.md).

const { app, safeStorage, shell } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SIGN_IN_TIMEOUT = 5 * 60 * 1000

let config = null
function oauthConfig() {
  if (config) return config
  try {
    const file = path.join(__dirname, 'oauth.json')
    const c = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (c.client_id && c.client_secret) config = c
  } catch { /* missing: sign-in reports not_configured */ }
  return config
}
const configured = () => !!oauthConfig()

// Errors carry a code the sign-in screen already knows (see Onboarding SIGNIN_HELP).
const fail = (code, message) => Object.assign(new Error(message), { code })

// ---- stored session ----------------------------------------------------------
const sessionFile = () => path.join(app.getPath('userData'), 'google-session.bin')
let refreshToken = null
let access = null // { access_token, expiresAt, scope }
let timer = null
let push = () => {} // sends fresh tokens to the window (set by main)

function loadRefreshToken() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(fs.readFileSync(sessionFile()))
  } catch { return null }
}
function saveRefreshToken(token) {
  refreshToken = token
  try {
    if (token && safeStorage.isEncryptionAvailable()) fs.writeFileSync(sessionFile(), safeStorage.encryptString(token))
    else fs.rmSync(sessionFile(), { force: true })
  } catch { /* the session just won't survive a restart */ }
}

const forRenderer = () => access && { access_token: access.access_token, expires_in: Math.max(0, Math.round((access.expiresAt - Date.now()) / 1000)), scope: access.scope }

function remember(t) {
  access = { access_token: t.access_token, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000, scope: t.scope || access?.scope || SCOPES }
  if (t.refresh_token) saveRefreshToken(t.refresh_token)
  schedule()
  push(forRenderer())
}

// Renew five minutes before expiry; if offline, try again every minute.
function schedule(delay) {
  clearTimeout(timer)
  if (!refreshToken) return
  const wait = delay ?? Math.max(30_000, access.expiresAt - Date.now() - 5 * 60_000)
  timer = setTimeout(() => refresh().catch(() => schedule(60_000)), wait)
}

async function tokenRequest(body) {
  const c = oauthConfig()
  let r
  try {
    r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, ...body }),
    })
  } catch {
    throw fail('offline', 'Could not reach Google. Check your connection and try again.')
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw fail(data.error || 'unknown', data.error_description || 'Google sign-in failed.')
  return data
}

async function refresh() {
  if (!refreshToken) throw fail('signed_out', 'Not signed in.')
  try {
    remember(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }))
  } catch (e) {
    // Revoked, expired (Testing-mode apps: after 7 days) or the password changed.
    if (e.code === 'invalid_grant') { saveRefreshToken(null); access = null; push(null) }
    throw e
  }
  return forRenderer()
}

// ---- interactive sign-in -------------------------------------------------------
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · NineFlow</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAF7F0;color:#111;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.card{background:#fff;border:1px solid #ECE7DD;border-radius:20px;padding:32px 36px;max-width:420px;text-align:center}
h1{font-size:24px;margin:0 0 8px}p{color:#786F68;margin:0}b{color:#C9420B}
@media (prefers-color-scheme:dark){body{background:#161513;color:#F5F2EC}.card{background:#201F1C;border-color:#34322D}p{color:#A0998F}b{color:#FF9A5C}}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`
}

let pending = null // one sign-in at a time

function signIn({ hint, prompt } = {}) {
  if (!configured()) return Promise.reject(fail('not_configured', 'Google sign-in is not set up in this build (desktop/oauth.json is missing).'))
  if (pending) pending.cancel()
  return new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(32))
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
    const state = b64url(crypto.randomBytes(16))
    let done = false
    const finish = (err, value) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      server.close()
      pending = null
      if (err) reject(err); else resolve(value)
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (url.pathname !== '/') { res.writeHead(404).end(); return }
      const p = url.searchParams
      if (p.get('state') !== state) { res.writeHead(400).end(); return }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      if (p.get('error')) {
        res.end(page('Sign-in cancelled', 'You can close this tab and return to <b>NineFlow</b>.'))
        finish(fail(p.get('error') === 'access_denied' ? 'access_denied' : p.get('error'), 'Google sign-in was cancelled.'))
        return
      }
      res.end(page("You're signed in", 'You can close this tab and return to <b>NineFlow</b>.'))
      try {
        const port = server.address().port
        const t = await tokenRequest({ grant_type: 'authorization_code', code: p.get('code'), code_verifier: verifier, redirect_uri: `http://127.0.0.1:${port}` })
        if (!String(t.scope || '').includes('https://www.googleapis.com/auth/drive.file')) {
          finish(fail('drive_not_granted', 'Google Drive access is needed to save your planner. Please allow it.'))
          return
        }
        remember(t)
        finish(null, forRenderer())
      } catch (e) { finish(e) }
    })

    const timeout = setTimeout(() => finish(fail('popup_closed', 'The Google sign-in in your browser was not finished.')), SIGN_IN_TIMEOUT)
    pending = { cancel: () => finish(fail('popup_closed', 'Sign-in was started again.')) }

    server.on('error', () => finish(fail('unknown', 'Could not start Google sign-in on this computer.')))
    server.listen(0, '127.0.0.1', () => {
      const params = new URLSearchParams({
        client_id: oauthConfig().client_id,
        redirect_uri: `http://127.0.0.1:${server.address().port}`,
        response_type: 'code',
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        // Consent is asked so Google issues a refresh token for this computer.
        prompt: prompt === 'select_account' || !hint ? 'select_account consent' : 'consent',
        ...(hint ? { login_hint: hint } : {}),
      })
      shell.openExternal(`${AUTH_URL}?${params}`).catch(() => finish(fail('popup_failed_to_open', 'Could not open your web browser.')))
    })
  })
}

// ---- API for main.cjs ------------------------------------------------------------
module.exports = {
  configured,
  setPush(fn) { push = fn },

  // At start-up: load the stored session and renew it before the window opens,
  // so the planner starts already connected to Drive.
  async init() {
    refreshToken = loadRefreshToken()
    if (refreshToken && configured()) await refresh().catch(() => schedule(60_000))
  },

  // A still-valid token, for the window's first paint.
  cached() { return access && access.expiresAt - 60_000 > Date.now() ? forRenderer() : null },

  // Silent when this computer is already signed in; otherwise the browser opens.
  async getToken({ interactive = true, hint, prompt } = {}) {
    const c = this.cached()
    if (c && prompt !== 'select_account') return c
    if (refreshToken && prompt !== 'select_account') {
      try { return await refresh() } catch (e) { if (e.code === 'offline' || !interactive) throw e }
    }
    if (!interactive) throw fail('signed_out', 'Not signed in.')
    return signIn({ hint, prompt })
  },

  async signOut() {
    const t = refreshToken || access?.access_token
    clearTimeout(timer)
    access = null
    saveRefreshToken(null)
    push(null)
    if (t) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => {})
  },
}
