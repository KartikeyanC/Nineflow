import React, { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { activate } from '../lib/licence'
import { forgetAccount, revokeToken } from '../lib/google'
import * as supa from '../lib/supabase'
import { signOut } from '../lib/profiles'
import { BrandMark, Wordmark } from '../components/Brand'

// Shown by AuthGate when the installed app is opened by an account without a licence key
// (src/lib/licence.js). Dark, like sign-in.
export default function LicenceLock({ account, onUnlocked }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (await activate(account.email, key)) { onUnlocked(); return }
    setBusy(false)
    setError(`That key isn't for ${account.email}. Check you copied all of it, starting with NF1-.`)
  }

  // Another account: sign this one out of the device (its planner stays in its own Drive).
  const switchAccount = async () => {
    setBusy(true)
    if (account.provider === 'email') await supa.signOut().catch(() => {})
    else await revokeToken().catch(() => {})
    signOut()
    forgetAccount()
    window.location.reload()
  }

  return (
    <div className="dark [color-scheme:dark] min-h-screen bg-page text-ink flex items-center justify-center p-4"
      data-theme={document.documentElement.getAttribute('data-theme') || undefined}
      style={{ '--page': '17 18 20', '--card': '17 18 20' }}>
      <form onSubmit={submit} className="card p-6 sm:p-8 w-full max-w-md animate-modal-in">
        <div className="flex items-center gap-2.5 mb-6"><BrandMark size={32} /><Wordmark /></div>
        <h1 className="h-display text-2xl">Enter your licence key</h1>
        <p className="text-sm text-muted mt-2">
          This copy of NineFlow opens only for accounts with a licence key. Signed in as <b className="text-ink break-all">{account.email}</b>.
        </p>
        <label className="block mt-5">
          <span className="block text-xs font-semibold text-muted mb-1">Licence key</span>
          <textarea className="input font-mono text-xs h-24 resize-none break-all" autoFocus spellCheck={false} placeholder="NF1-…"
            value={key} onChange={(e) => { setKey(e.target.value); setError(null) }} />
        </label>
        {error && <p role="alert" className="text-xs font-semibold text-coral-fg mt-2">{error}</p>}
        <button type="submit" className="btn-black w-full h-11 mt-4 justify-center" disabled={busy || !key.trim()}>
          <KeyRound size={15} /> {busy ? 'Checking…' : 'Unlock NineFlow'}
        </button>
        <p className="text-xs text-faint mt-4">Ask the person who gave you NineFlow for a key for this email. A key works on all your devices.</p>
        <button type="button" className="btn-ghost h-9 py-0 mt-3 w-full justify-center" disabled={busy} onClick={switchAccount}>
          <LogOut size={14} /> Use a different account
        </button>
        <p className="text-[11px] text-faint mt-5 text-center">© 2026 Kartikeyan. All rights reserved.</p>
      </form>
    </div>
  )
}
