import React, { useEffect, useSyncExternalStore } from 'react'
import { currentProfile, accountProfileId } from '../lib/profiles'
import { rememberedAccount } from '../lib/google'
import { isOnboarded } from '../lib/storage'
import { startSync, stopSync } from '../lib/cloud'
import { isRecovering, onAuthChange } from '../lib/supabase'
import Onboarding from '../components/Onboarding'

// Sign-in is required. The planner opens only for an account (Google, or
// email + password) that has finished setup on this device; everything else
// goes through Onboarding (sign in, bring local data, setup). Once open, the
// account's data is kept in sync with its Google Drive or its email account.
// A "reset your password" link opens the new-password screen first.
export default function AuthGate({ children }) {
  const recovering = useSyncExternalStore(onAuthChange, isRecovering)
  const account = rememberedAccount()
  const p = currentProfile()
  const ready = !!account && !!p && p.id === accountProfileId(account) && isOnboarded()

  useEffect(() => {
    if (!ready) return undefined
    startSync(p.id)
    return () => stopSync()
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  if (recovering) return <Onboarding key="reset" initial="reset" />
  return ready ? children : <Onboarding key="main" />
}
