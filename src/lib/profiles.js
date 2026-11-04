// Local profiles ("accounts" without a server). Each profile owns a storage
// namespace, so several people can share one browser without mixing data.
import { ACCOUNT_LEVEL, workspacePrefix } from './workspaces'

const PROFILES_KEY = 'daily-planner:profiles'
const CURRENT_KEY = 'daily-planner:current'
const LEGACY_KEYS = ['tasks', 'settings', 'habits', 'focus', 'onboarded', 'work', 'work-tab']

export const OCCUPATIONS = ['Designer', 'Developer', 'Marketer', 'Content creator', 'Student', 'Manager', 'Freelancer', 'Founder', 'Other']
export const NEEDS = [
  { id: 'plan', label: 'Plan my day', hint: 'Time blocks, a quick list, a clear target' },
  { id: 'focus', label: 'Focus better', hint: 'Pomodoro timer, fewer distractions' },
  { id: 'hours', label: 'Track my hours', hint: 'Estimate vs actual, focus time' },
  { id: 'habits', label: 'Build habits', hint: 'Daily check-ins and streaks' },
  { id: 'work', label: 'Run my whole job', hint: 'Task log, social posts, ad campaigns, reports' },
  { id: 'report', label: 'Report to my manager', hint: 'A ready daily message' },
  { id: 'exam', label: 'Prepare for an exam', hint: 'Syllabus tracker, flashcards, a 40-day plan' },
]
export const REASONS = ['Works offline and keeps my data private', 'Everything in one place', 'Time tracking built in', 'Pomodoro focus mode', 'A friend recommended it', 'Just trying it out']
export const AVATAR_COLORS = ['lav', 'sky', 'mint', 'peach', 'coral', 'butter', 'rose', 'teal']

const read = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v) } catch { return fb } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

export const listProfiles = () => read(PROFILES_KEY, [])
export const currentProfileId = () => { try { return localStorage.getItem(CURRENT_KEY) || null } catch { return null } }
export const currentProfile = () => listProfiles().find((p) => p.id === currentProfileId()) || null

// Storage key for a data name inside the current profile's namespace, and
// inside the workspace this device is in (see lib/workspaces.js). Account-wide
// names (setup done, the workspace list) skip the workspace prefix.
export const storageKey = (name) => {
  const id = currentProfileId()
  if (!id) return `daily-planner:${name}`
  return `daily-planner:${id}:${ACCOUNT_LEVEL.has(name) ? '' : workspacePrefix(id)}${name}`
}

export function createProfile(fields) {
  const profiles = listProfiles()
  const id = `p${Date.now().toString(36)}`
  const profile = {
    id, name: fields.name.trim(), email: (fields.email || '').trim(), occupation: fields.occupation || '', occupationOther: fields.occupationOther || '',
    reasons: fields.reasons || [], needs: fields.needs || [], pin: '', createdAt: new Date().toISOString(),
    color: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
  }
  write(PROFILES_KEY, [...profiles, profile])
  return profile
}

// Signed-in accounts: one profile per account, keyed by the provider's
// stable user id. Google accounts are g_…, email (Supabase) accounts e_….
// Accounts remembered before email sign-in existed have no `provider`: Google.
export const isEmailAccount = (account) => account?.provider === 'email'
export const accountProfileId = (account) => `${isEmailAccount(account) ? 'e' : 'g'}_${account.sub}`
export const isGoogleProfile = (p) => !!p && p.id.startsWith('g_')
export const isEmailProfile = (p) => !!p && p.id.startsWith('e_')
export const isAccountProfile = (p) => isGoogleProfile(p) || isEmailProfile(p)
export function ensureAccountProfile(account) {
  const id = accountProfileId(account)
  const profiles = listProfiles()
  const existing = profiles.find((p) => p.id === id)
  if (existing) {
    const next = { ...existing, email: account.email, picture: account.picture || existing.picture || '', name: existing.name || account.name || '' }
    write(PROFILES_KEY, profiles.map((p) => (p.id === id ? next : p)))
    return next
  }
  const profile = {
    id, email: account.email, picture: account.picture || '',
    // Email accounts only have a name once setup asks for it.
    ...(isEmailAccount(account) ? { name: account.name || '', emailAccount: true } : { name: account.name || account.email, google: true }),
    occupation: '', occupationOther: '', reasons: [], needs: [], pin: '', createdAt: new Date().toISOString(),
    color: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
  }
  write(PROFILES_KEY, [...profiles, profile])
  return profile
}

// Profiles made before sign-in existed, which can be brought into an account.
export const legacyProfiles = () => listProfiles().filter((p) => !isAccountProfile(p))

// Copy every saved key of one profile into another (used when moving a
// local profile's data into a Google account), then remove the old one.
export function moveProfileData(fromId, toId) {
  const from = `daily-planner:${fromId}:`, to = `daily-planner:${toId}:`
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(from)) { localStorage.setItem(to + k.slice(from.length), localStorage.getItem(k)); localStorage.removeItem(k) }
  }
  write(PROFILES_KEY, listProfiles().filter((p) => p.id !== fromId))
}

export function removeProfileRecord(id) {
  write(PROFILES_KEY, listProfiles().filter((p) => p.id !== id))
}

export function updateProfile(id, patch) {
  write(PROFILES_KEY, listProfiles().map((p) => (p.id === id ? { ...p, ...patch } : p)))
}

export function deleteProfile(id) {
  write(PROFILES_KEY, listProfiles().filter((p) => p.id !== id))
  for (const k of LEGACY_KEYS) { try { localStorage.removeItem(`daily-planner:${id}:${k}`) } catch { /* ignore */ } }
  if (currentProfileId() === id) signOut()
}

// A PIN keeps other people on this browser out of a profile. It is stored as
// a SHA-256 hash salted with the profile id, never as the digits. It is a
// lock on a shared device, not encryption of the profile's data.
async function digest(text) {
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      return `sha256:${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    }
  } catch { /* fall through */ }
  // No Web Crypto (an insecure origin): a plain FNV-1a hash still keeps the digits out of storage.
  let h = 0x811c9dc5
  for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0 }
  return `fnv:${h.toString(16)}`
}
const hashPin = (id, pin) => digest(`daily-planner:${id}:${pin}`)
const isHashed = (v) => /^(sha256|fnv):/.test(v || '')

export async function setProfilePin(id, pin) {
  updateProfile(id, { pin: pin ? await hashPin(id, pin) : '' })
}

export async function checkPin(profile, pin) {
  if (!profile.pin) return true
  if (isHashed(profile.pin)) return profile.pin === await hashPin(profile.id, pin)
  // Profiles made before hashing stored the digits: accept once, then hash.
  if (profile.pin !== pin) return false
  await setProfilePin(profile.id, pin)
  return true
}

export function signIn(id) { try { localStorage.setItem(CURRENT_KEY, id) } catch { /* ignore */ } }
export function signOut() { try { localStorage.removeItem(CURRENT_KEY) } catch { /* ignore */ } }

// Data saved before profiles existed moves into the first profile created.
export function migrateLegacyInto(id) {
  for (const k of LEGACY_KEYS) {
    try {
      const v = localStorage.getItem(`daily-planner:${k}`)
      if (v != null) { localStorage.setItem(`daily-planner:${id}:${k}`, v); localStorage.removeItem(`daily-planner:${k}`) }
    } catch { /* ignore */ }
  }
}
export const hasLegacyData = () => { try { return localStorage.getItem('daily-planner:tasks') != null } catch { return false } }

export const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'
export const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''
