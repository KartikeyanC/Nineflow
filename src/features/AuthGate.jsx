import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { currentProfile, accountProfileId } from '../lib/profiles'
import { rememberedAccount } from '../lib/google'
import { isOnboarded } from '../lib/storage'
import { startSync, stopSync } from '../lib/cloud'
import { isRecovering, onAuthChange } from '../lib/supabase'
import { hasLicence, needsLicence } from '../lib/licence'
import Onboarding from '../components/Onboarding'
import LicenceLock from './LicenceLock'

// Sign-in is required. The planner opens only for an account (Google, or
// email + password) that has finished setup on this device; everything else
// goes through Onboarding (sign in, bring local data, setup). Once open, the
// account's data is kept in sync with its Google Drive or its email account.
// A "reset your password" link opens the new-password screen first.
// The installed apps also need a licence key for the account (src/lib/licence.js).
export default function AuthGate({ children }) {
  const recovering = useSyncExternalStore(onAuthChange, isRecovering)
  const account = rememberedAccount()
  const p = currentProfile()
  const signedIn = !!account && !!p && p.id === accountProfileId(account) && isOnboarded()

  // 'checking' | true | false, for the signed-in account.
  const email = signedIn ? account.email : null
  const [licensed, setLicensed] = useState(() => (needsLicence() ? 'checking' : true))
  useEffect(() => {
    if (!email || !needsLicence()) return undefined
    let live = true
    setLicensed('checking')
    hasLicence(email).then((ok) => { if (live) setLicensed(ok) })
    return () => { live = false }
  }, [email])

  const ready = signedIn && licensed === true
  useEffect(() => {
    if (!ready) return undefined
    startSync(p.id)
    return () => stopSync()
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  if (recovering) return <Onboarding key="reset" initial="reset" />
  if (signedIn && licensed === 'checking') {
    return <div role="status" className="dark min-h-screen bg-page text-muted flex items-center justify-center text-sm">Checking your licence…</div>
  }
  if (signedIn && licensed === false) return <LicenceLock account={account} onUnlocked={() => setLicensed(true)} />
  return ready ? children : <Onboarding key="main" />
}
