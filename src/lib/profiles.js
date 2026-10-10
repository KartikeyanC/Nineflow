// Local profiles ("accounts" without a server). Each profile owns a storage
// namespace, so several people can share one browser without mixing data.
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
]
export const REASONS = ['Works offline and keeps my data private', 'Everything in one place', 'Time tracking built in', 'Pomodoro focus mode', 'A friend recommended it', 'Just trying it out']
export const AVATAR_COLORS = ['lav', 'sky', 'mint', 'peach', 'coral', 'butter', 'rose', 'teal']

const read = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v) } catch { return fb } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

export const listProfiles = () => read(PROFILES_KEY, [])
export const currentProfileId = () => { try { return localStorage.getItem(CURRENT_KEY) || null } catch { return null } }
export const currentProfile = () => listProfiles().find((p) => p.id === currentProfileId()) || null

// Storage key for a data name inside the current profile's namespace.
export const storageKey = (name) => {
  const id = currentProfileId()
  return id ? `daily-planner:${id}:${name}` : `daily-planner:${name}`
}

export function createProfile(fields) {
  const profiles = listProfiles()
  const id = `p${Date.now().toString(36)}`
  const profile = {
    id, name: fields.name.trim(), email: (fields.email || '').trim(), occupation: fields.occupation || '', occupationOther: fields.occupationOther || '',
    reasons: fields.reasons || [], needs: fields.needs || [], pin: fields.pin || '', createdAt: new Date().toISOString(),
    color: AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
  }
  write(PROFILES_KEY, [...profiles, profile])
  return profile
}

export function updateProfile(id, patch) {
  write(PROFILES_KEY, listProfiles().map((p) => (p.id === id ? { ...p, ...patch } : p)))
}

export function deleteProfile(id) {
  write(PROFILES_KEY, listProfiles().filter((p) => p.id !== id))
  for (const k of LEGACY_KEYS) { try { localStorage.removeItem(`daily-planner:${id}:${k}`) } catch { /* ignore */ } }
  if (currentProfileId() === id) signOut()
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
