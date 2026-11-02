// Licence keys: the Windows app and the phone app open only for a Google (or email) account that has
// a key made for it with `npm run licence -- <email>` (scripts/licence.mjs, docs/LICENCE-KEYS.md).
// A key is a signature of the account's email, so it works on every device for that account and
// for no one else. The website doesn't ask for one.
import { verifyAsync } from '@noble/ed25519'
import { isNativeApp } from './platform'
import { LICENCE_PUBLIC_KEY } from './licencePublicKey'

const KEY = (email) => `nineflow:licence:${norm(email)}`
const norm = (email) => String(email || '').trim().toLowerCase()
const message = (email) => new TextEncoder().encode(`nineflow-licence-v1:${norm(email)}`)
const fromB64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

// The owner's own accounts, so their installed apps keep opening without typing a key.
const BUILT_IN = {
  'kartikeyan4878@gmail.com': 'NF1-VyM2KwhLTzfbPCYBKY-FGMNiB1wQv6QL9LPEebiuFHFM2InmwQmrdqUvvEdBOaclT5MmKssRCY-8rFpLuKyVBg',
  'kartikeyan510@gmail.com': 'NF1-SKJiZsv6-dO1pgQNGd77mGOAUfz7it31Xeuj5RbW6MT0CSWd8toJIZ3XviWX7l8h1jBaxdn8MNACzt4QklRXAQ',
}

// Only the installed apps are locked. In development, localStorage['nineflow:licence-test'] = '1'
// turns the lock on in the browser too, to try it.
export function needsLicence() {
  if (typeof window === 'undefined') return false
  if (location.protocol === 'app:' || isNativeApp()) return true
  try { return import.meta.env.DEV && localStorage.getItem('nineflow:licence-test') === '1' } catch { return false }
}

// Whether `key` is a real key for `email`. Never throws.
export async function checkKey(email, key) {
  const k = String(key || '').replace(/\s+/g, '')
  if (!norm(email) || !k.startsWith('NF1-')) return false
  try {
    const sig = fromB64url(k.slice(4))
    return sig.length === 64 && await verifyAsync(sig, message(email), fromB64url(LICENCE_PUBLIC_KEY))
  } catch { return false }
}

const savedKey = (email) => { try { return localStorage.getItem(KEY(email)) } catch { return null } }

// Whether this account may open the app on this device.
export async function hasLicence(email) {
  return (await checkKey(email, BUILT_IN[norm(email)])) || checkKey(email, savedKey(email))
}

// Checks a typed key and remembers it on this device. Returns whether it was right.
export async function activate(email, key) {
  const k = String(key || '').replace(/\s+/g, '')
  if (!(await checkKey(email, k))) return false
  try { localStorage.setItem(KEY(email), k) } catch { /* it still opens this time */ }
  return true
}
