// Google sign-in for the MCP server: the standard flow for programs on your computer.
// You sign in once in your normal browser ("npm run login"); Google sends the answer to
// a one-off address on this computer (http://127.0.0.1:<port>), and the refresh token is
// kept in your home folder (~/.nineflow/mcp-google.json, readable only by you) so the
// one-hour access tokens can be renewed without asking again.
//
// Uses the "NineFlow desktop" OAuth client (Desktop app type) from desktop/oauth.json,
// the same one the desktop app uses, with the drive.file scope: only NineFlow's own
// files are visible, nothing else in the Drive.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCOPES = 'openid email https://www.googleapis.com/auth/drive.file'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const here = path.dirname(fileURLToPath(import.meta.url))

const home = () => process.env.NINEFLOW_MCP_HOME || path.join(os.homedir(), '.nineflow')
const tokenFile = () => path.join(home(), 'mcp-google.json')
const log = (...a) => console.error(...a) // stdout is the MCP channel: never print there

function clientConfig() {
  const file = process.env.NINEFLOW_OAUTH_FILE || path.join(here, '..', 'desktop', 'oauth.json')
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (c.client_id && c.client_secret) return c
  } catch { /* below */ }
  throw new Error(`Google sign-in isn't configured: ${file} is missing. It holds the "NineFlow desktop" OAuth client (see docs/DESKTOP.md).`)
}

function readSaved() {
  try { return JSON.parse(fs.readFileSync(tokenFile(), 'utf8')) } catch { return null }
}
function save(data) {
  fs.mkdirSync(home(), { recursive: true, mode: 0o700 })
  fs.writeFileSync(tokenFile(), JSON.stringify(data), { mode: 0o600 })
}

async function tokenRequest(body) {
  const c = clientConfig()
  let r
  try {
    r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, ...body }) })
  } catch { throw new Error('Could not reach Google. Check the internet connection.') }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(data.error_description || data.error || 'Google sign-in failed.'), { code: data.error })
  return data
}

let access = null // { token, expiresAt }

// A valid access token, renewed with the saved refresh token when needed.
export async function getToken() {
  if (access && access.expiresAt - Date.now() > 60_000) return access.token
  const saved = readSaved()
  if (!saved?.refresh_token) throw new Error('Not signed in to Google yet. In the mcp folder run "npm run login", then try again.')
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: saved.refresh_token })
    access = { token: t.access_token, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000 }
    return access.token
  } catch (e) {
    if (e.code === 'invalid_grant') throw new Error('The Google sign-in expired (in Testing mode Google ends it after 7 days). In the mcp folder run "npm run login" again.')
    throw e
  }
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const page = (title, msg) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;display:grid;place-items:center;min-height:90vh;background:#FAF7F0"><div style="background:#fff;border:1px solid #ECE7DD;border-radius:20px;padding:32px;max-width:420px;text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#786F68">${msg}</p></div>`

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${url}"`]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  try { spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref() } catch { /* the URL is printed too */ }
}

// Interactive sign-in in the browser (run from a terminal: "npm run login").
export function login({ timeoutMs = 5 * 60_000 } = {}) {
  const c = clientConfig()
  return new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(32))
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
    const state = b64url(crypto.randomBytes(16))
    let redirect = ''
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (url.pathname !== '/') { res.writeHead(404).end(); return }
      const finish = (ok, title, msg, value) => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, msg))
        clearTimeout(timer); server.close()
        if (ok) resolve(value); else reject(new Error(msg))
      }
      if (url.searchParams.get('state') !== state) return finish(false, 'Sign-in failed', 'The answer from Google did not match. Run "npm run login" again.')
      if (url.searchParams.get('error')) return finish(false, 'Sign-in cancelled', 'Nothing was changed. Run "npm run login" to try again.')
      try {
        const t = await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code'), code_verifier: verifier, redirect_uri: redirect })
        if (!t.refresh_token) throw new Error('Google sent no refresh token.')
        let email = ''
        try { email = JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString()).email || '' } catch { /* optional */ }
        save({ refresh_token: t.refresh_token, email, savedAt: new Date().toISOString() })
        access = { token: t.access_token, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000 }
        finish(true, 'Signed in', 'Claude can now reach your NineFlow planner. You can close this tab.', { email })
      } catch (e) { finish(false, 'Sign-in failed', e.message) }
    })
    const timer = setTimeout(() => { server.close(); reject(new Error('Sign-in timed out.')) }, timeoutMs)
    server.listen(0, '127.0.0.1', () => {
      redirect = `http://127.0.0.1:${server.address().port}`
      const url = `${AUTH_URL}?${new URLSearchParams({ client_id: c.client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' })}`
      log('Opening Google sign-in in your browser. If it does not open, visit:\n' + url)
      openBrowser(url)
    })
  })
}

export async function logout() {
  const saved = readSaved()
  if (saved?.refresh_token) await fetch(`${REVOKE_URL}?token=${encodeURIComponent(saved.refresh_token)}`, { method: 'POST' }).catch(() => {})
  fs.rmSync(tokenFile(), { force: true })
  access = null
}

export const signedInAs = () => readSaved()?.email || null
