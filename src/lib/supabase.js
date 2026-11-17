// Email + password accounts, hosted on Supabase. Supabase Auth holds the
// account (sign-up, log-in, confirmation and password-reset emails); one
// row per person in the `planner_data` table holds their planner, the same
// bundle Google accounts keep in Drive. Row-level security means a signed-in
// person can only ever read or write their own row (see docs/SUPABASE_SETUP.md).
//
// The session lives in localStorage and renews itself, so unlike Google's
// hourly token, people stay signed in until they sign out.

import { SignInError } from './google'
import { AuthError, OfflineError } from './syncErrors'
import { mockEnabled, createMockDriver } from './supabaseMock'
import { HandoffError } from './syncErrors'

const URL_ = import.meta.env.VITE_SUPABASE_URL || ''
const KEY = import.meta.env.VITE_SUPABASE_KEY || ''
export const isConfigured = () => mockEnabled || !!(URL_ && KEY)
export const MIN_PASSWORD = 8
// New sign-ups confirm their email by typing the code from the email (Supabase
// "Email OTP Length" must match; see docs/SUPABASE_SETUP.md).
export const CODE_LENGTH = 6

// ---- session state ------------------------------------------------------------
let session // undefined until Supabase has looked, then the session or null
let recovering = false // opened from a "reset your password" email
const listeners = new Set()
const emit = () => listeners.forEach((f) => f())
const onEvent = (event, s) => {
  session = s || null
  if (event === 'PASSWORD_RECOVERY') recovering = true
  emit()
}
export const onAuthChange = (f) => { listeners.add(f); return () => listeners.delete(f) }
// Unknown counts as signed in: a call made without a session fails with AuthError anyway.
export const hasSession = () => session !== null
export const isRecovering = () => recovering
export const endRecovery = () => { recovering = false; emit() }

const toAccount = (u) => ({ provider: 'email', sub: u.id, email: u.email, name: u.user_metadata?.name || '', picture: '' })

// ---- errors -------------------------------------------------------------------
// Supabase error codes → the SignInError codes the sign-in screen explains.
const AUTH_CODES = {
  invalid_credentials: 'invalid_credentials', email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'user_already_exists', email_exists: 'user_already_exists',
  weak_password: 'weak_password', same_password: 'same_password',
  over_email_send_rate_limit: 'rate_limited', over_request_rate_limit: 'rate_limited',
  email_address_invalid: 'invalid_email', signup_disabled: 'signup_disabled', email_provider_disabled: 'signup_disabled',
  // Supabase answers a wrong code and an expired one the same way.
  otp_expired: 'bad_code', otp_disabled: 'bad_code',
}
const isNetwork = (e) => e?.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed/i.test(e?.message || '')
function authFail(e) {
  if (isNetwork(e)) return new SignInError('offline', 'Could not reach the sign-in service.')
  return new SignInError(AUTH_CODES[e?.code] || e?.code || 'unknown', e?.message || 'Sign-in failed.')
}
// Handoffs (sending work to another account, lib/transfer.js): their own messages.
export { HandoffError }
function handoffFail(e) {
  if (['42P01', 'PGRST205'].includes(e?.code)) return new HandoffError('Sending to an account isn\'t set up on this NineFlow yet. Use the transfer file instead.')
  if (/too_many_handoffs/.test(e?.message || '')) return new HandoffError('You already have 20 waiting to be taken over. Take some back, or wait for them to be taken.')
  return dataFail(e)
}
export const HANDOFF_COLUMNS = 'id, from_user, from_email, from_name, to_email, title, created_at, expires_at'
const toHandoff = (r, me) => ({
  id: r.id, fromName: r.from_name, fromEmail: r.from_email, toEmail: r.to_email, title: r.title,
  createdAt: r.created_at, expiresAt: r.expires_at, mine: r.from_user === me, expired: Date.parse(r.expires_at) <= Date.now(),
})

function dataFail(e) {
  const msg = e?.message || ''
  if (!e?.code && isNetwork(e)) return new OfflineError('No connection to your account.')
  if (['PGRST301', 'PGRST303', '42501'].includes(e?.code) || /jwt/i.test(msg)) return new AuthError('Your session ended.')
  if (['42P01', 'PGRST205'].includes(e?.code)) return new Error('The planner_data table is missing. Run the SQL in docs/SUPABASE_SETUP.md.')
  return new Error(msg || 'Saving failed.')
}

// ---- the real Supabase ----------------------------------------------------------
let clientPromise = null
function client() {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      const c = createClient(URL_, KEY, {
        auth: { storageKey: 'daily-planner:supabase-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
      c.auth.onAuthStateChange(onEvent)
      return c
    })
  }
  return clientPromise
}
const redirect = () => window.location.origin

const real = {
  async signUp(email, password) {
    const c = await client()
    const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } })
    if (error) throw authFail(error)
    // With email confirmation on, Supabase answers an existing address with a
    // user that has no identities (so addresses can't be probed).
    if (data.user && data.user.identities?.length === 0) throw new SignInError('user_already_exists', 'That email already has an account.')
    return data.session ? { account: toAccount(data.user) } : { needsConfirm: true }
  },
  async signIn(email, password) {
    const c = await client()
    const { data, error } = await c.auth.signInWithPassword({ email, password })
    if (error) throw authFail(error)
    return toAccount(data.user)
  },
  // Sends the sign-up email again, with a new code.
  async resendConfirmation(email) {
    const c = await client()
    const { error } = await c.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect() } })
    if (error) throw authFail(error)
  },
  // The code from the sign-up email: confirms the address and signs in.
  async verifySignupCode(email, code) {
    const c = await client()
    const { data, error } = await c.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw authFail(error)
    return toAccount(data.user)
  },
  async sendPasswordReset(email) {
    const c = await client()
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirect() })
    if (error) throw authFail(error)
  },
  async setPassword(password) {
    const c = await client()
    const { error } = await c.auth.updateUser({ password })
    if (error) throw authFail(error)
  },
  async setName(name) {
    const c = await client()
    await c.auth.updateUser({ data: { name } })
  },
  async signOut() {
    const c = await client()
    await c.auth.signOut({ scope: 'local' }).catch(() => {})
  },
  async currentAccount() {
    const c = await client()
    const { data } = await c.auth.getSession()
    return data.session ? toAccount(data.session.user) : null
  },

  // Data: one row per person. Returns { modifiedTime } like a Drive file.
  async rowInfo() {
    const c = await client()
    const { data, error } = await c.from('planner_data').select('updated_at').maybeSingle()
    if (error) throw dataFail(error)
    return data ? { id: 'planner_data', modifiedTime: new Date(data.updated_at).toISOString(), link: null } : null
  },
  async download() {
    const c = await client()
    const { data, error } = await c.from('planner_data').select('data').maybeSingle()
    if (error) throw dataFail(error)
    return data?.data || null
  },
  async save(bundle) {
    const c = await client()
    const user = (await c.auth.getSession()).data.session?.user
    if (!user) throw new AuthError('Your session ended.')
    const { data, error } = await c.from('planner_data').upsert({ user_id: user.id, data: bundle }).select('updated_at').single()
    if (error) throw dataFail(error)
    return { id: 'planner_data', modifiedTime: new Date(data.updated_at).toISOString(), link: null }
  },
  async saveConflict(bundle) {
    const c = await client()
    const { error } = await c.from('planner_conflicts').insert({ data: bundle })
    if (error) throw dataFail(error)
  },

  // Handoffs: the server sets who sent it, when, and when it expires (docs/SUPABASE_SETUP.md, step 5).
  async sendHandoff({ toEmail, fromName, title, file }) {
    const c = await client()
    const { data, error } = await c.from('handoffs').insert({ to_email: toEmail, from_name: fromName, title, file }).select('id').single()
    if (error) throw handoffFail(error)
    return data.id
  },
  async listHandoffs() {
    const c = await client()
    const me = (await c.auth.getSession()).data.session?.user?.id
    if (!me) throw new AuthError('Your session ended.')
    const { data, error } = await c.from('handoffs').select(HANDOFF_COLUMNS).order('created_at', { ascending: false }).limit(100)
    if (error) throw handoffFail(error)
    return (data || []).map((r) => toHandoff(r, me))
  },
  async fetchHandoff(id) {
    const c = await client()
    const { data, error } = await c.from('handoffs').select('file').eq('id', id).maybeSingle()
    if (error) throw handoffFail(error)
    if (!data) throw new HandoffError('This one is no longer waiting: it was taken back, taken over, or it expired.')
    return data.file
  },
  async deleteHandoff(id) {
    const c = await client()
    const { error } = await c.from('handoffs').delete().eq('id', id)
    if (error) throw handoffFail(error)
  },
}

const driver = mockEnabled ? createMockDriver(onEvent, toAccount) : real
// Start now when configured, so a confirmation or password-reset link in the
// address bar is picked up as the page opens.
if (!mockEnabled && URL_ && KEY) client()

export const {
  signUp, signIn, resendConfirmation, verifySignupCode, sendPasswordReset, setPassword, setName, signOut, currentAccount,
  rowInfo, download, save, saveConflict, sendHandoff, listHandoffs, fetchHandoff, deleteHandoff,
} = driver
