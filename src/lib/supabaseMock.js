// Development-only stand-in for Supabase (email accounts and their planner
// data), so sign-up, log-in and sync can be tried without a Supabase project.
// Turned on with VITE_SUPABASE_MOCK=1 in .env.local (dev server only; it
// never runs in a production build). Accounts and rows live in this
// browser's localStorage under `mock-supabase`.
//
// New sign-ups confirm their email with a 6-digit code, as with real
// Supabase. No email is sent: the code is logged to the console and shown on
// the code screen (mockCodeFor). Codes last an hour.
//
// Switches, set in localStorage:
//   mock-supabase-confirm = '0'  skip the code: new sign-ups go straight in
//   mock-supabase-offline = '1'  every call fails as if there were no connection
//   mock-supabase-expired = '1'  data calls fail as if the session had ended
// "Forgot password" logs a reset link to the console instead of emailing it.
import { SignInError } from './google'
import { AuthError, OfflineError } from './syncErrors'

export const mockEnabled = import.meta.env.DEV && import.meta.env.VITE_SUPABASE_MOCK === '1'

const STORE = 'mock-supabase'
const SESSION = 'mock-supabase-session'
const read = () => { try { return JSON.parse(localStorage.getItem(STORE)) || { users: {}, rows: {}, conflicts: [] } } catch { return { users: {}, rows: {}, conflicts: [] } } }
const write = (d) => localStorage.setItem(STORE, JSON.stringify(d))
const flag = (k) => localStorage.getItem(`mock-supabase-${k}`) === '1'
const wait = () => new Promise((r) => setTimeout(r, 200))
const hash = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mock:${s}`)))].map((b) => b.toString(16).padStart(2, '0')).join('')
const norm = (email) => (email || '').trim().toLowerCase()
const userById = (d, id) => Object.values(d.users).find((u) => u.id === id) || null
const asUser = (u) => ({ id: u.id, email: u.email, user_metadata: { name: u.name || '' } })
const CODE_TTL = 60 * 60 * 1000

// The pending sign-up code for an address, so the code screen can show it in test mode.
export function mockCodeFor(email) {
  if (!mockEnabled) return null
  const u = read().users[norm(email)]
  return u && !u.confirmed ? u.code || null : null
}

export function createMockDriver(onEvent, toAccount) {
  const sessionUser = () => userById(read(), localStorage.getItem(SESSION))
  const startSession = (u, event = 'SIGNED_IN') => { localStorage.setItem(SESSION, u.id); onEvent(event, { user: asUser(u) }) }
  const online = async () => { await wait(); if (flag('offline')) throw new SignInError('offline', 'Could not reach the sign-in service.') }
  const dataCall = async () => {
    await wait()
    if (flag('offline')) throw new OfflineError('No connection to your account.')
    const u = sessionUser()
    if (!u || flag('expired')) throw new AuthError('Your session ended.')
    return u
  }
  const link = (kind, id) => console.info(`[NineFlow] Mock Supabase ${kind} link: ${window.location.origin}/#mock-${kind}=${id}`)
  // A fresh sign-up code, "emailed" to the console.
  const newCode = (u) => {
    u.code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0')
    u.codeAt = Date.now()
    console.info(`[NineFlow] Mock Supabase sign-up code for ${u.email}: ${u.code}`)
  }

  // Links "from the email": confirm an address, or open the reset-password screen.
  const m = /^#mock-(confirm|recovery)=(.+)$/.exec(window.location.hash)
  if (m) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    const d = read()
    const u = userById(d, m[2])
    if (u) {
      if (m[1] === 'confirm') { u.confirmed = true; write(d) }
      localStorage.setItem(SESSION, u.id)
      setTimeout(() => onEvent(m[1] === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', { user: asUser(u) }), 0)
    }
  }
  const initial = sessionUser()
  onEvent('INITIAL_SESSION', initial ? { user: asUser(initial) } : null)
  console.info('[NineFlow] Using the development stand-in for Supabase email accounts (VITE_SUPABASE_MOCK=1).')

  return {
    async signUp(email, password) {
      await online()
      const d = read()
      const key = norm(email)
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) throw new SignInError('invalid_email', 'That email address looks wrong.')
      if (d.users[key]) throw new SignInError('user_already_exists', 'That email already has an account.')
      if (password.length < 6) throw new SignInError('weak_password', 'Password should be at least 6 characters.')
      const u = { id: `mock-${Math.random().toString(36).slice(2, 10)}`, email: key, pw: await hash(password), name: '', confirmed: localStorage.getItem('mock-supabase-confirm') === '0' }
      if (!u.confirmed) newCode(u)
      d.users[key] = u
      write(d)
      if (!u.confirmed) return { needsConfirm: true }
      startSession(u)
      return { account: toAccount(asUser(u)) }
    },
    async signIn(email, password) {
      await online()
      const u = read().users[norm(email)]
      if (!u || u.pw !== await hash(password)) throw new SignInError('invalid_credentials', 'Invalid login credentials')
      if (!u.confirmed) throw new SignInError('email_not_confirmed', 'Email not confirmed')
      startSession(u)
      return toAccount(asUser(u))
    },
    async resendConfirmation(email) {
      await online()
      const d = read()
      const u = d.users[norm(email)]
      if (u && !u.confirmed) { newCode(u); write(d) }
    },
    async verifySignupCode(email, code) {
      await online()
      const d = read()
      const u = d.users[norm(email)]
      if (!u || u.confirmed || !u.code || u.code !== String(code).trim() || Date.now() - u.codeAt > CODE_TTL) {
        throw new SignInError('bad_code', 'Token has expired or is invalid')
      }
      u.confirmed = true
      delete u.code
      delete u.codeAt
      write(d)
      startSession(u)
      return toAccount(asUser(u))
    },
    async sendPasswordReset(email) {
      await online()
      const u = read().users[norm(email)]
      if (u) link('recovery', u.id)
    },
    async setPassword(password) {
      await online()
      const d = read()
      const u = userById(d, localStorage.getItem(SESSION))
      if (!u) throw new SignInError('session_missing', 'Your reset link has expired. Ask for a new one.')
      if (password.length < 6) throw new SignInError('weak_password', 'Password should be at least 6 characters.')
      const next = await hash(password)
      if (next === u.pw) throw new SignInError('same_password', 'New password should be different from the old password.')
      u.pw = next
      write(d)
    },
    async setName(name) {
      const d = read()
      const u = userById(d, localStorage.getItem(SESSION))
      if (u) { u.name = name; write(d) }
    },
    async signOut() {
      localStorage.removeItem(SESSION)
      onEvent('SIGNED_OUT', null)
    },
    async currentAccount() {
      const u = sessionUser()
      return u ? toAccount(asUser(u)) : null
    },
    async rowInfo() {
      const u = await dataCall()
      const r = read().rows[u.id]
      return r ? { id: 'planner_data', modifiedTime: r.updated_at, link: null } : null
    },
    async download() {
      const u = await dataCall()
      return read().rows[u.id]?.data || null
    },
    async save(bundle) {
      const u = await dataCall()
      const d = read()
      d.rows[u.id] = { data: bundle, updated_at: new Date().toISOString() }
      write(d)
      return { id: 'planner_data', modifiedTime: d.rows[u.id].updated_at, link: null }
    },
    async saveConflict(bundle) {
      const u = await dataCall()
      const d = read()
      d.conflicts.push({ user_id: u.id, data: bundle, created_at: new Date().toISOString() })
      write(d)
    },
  }
}
