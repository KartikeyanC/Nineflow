import React, { useState } from 'react'
import { LogOut, ExternalLink, RefreshCw, HardDrive, Cloud, KeyRound, Check } from 'lucide-react'
import { currentProfile, updateProfile, removeProfileRecord, signOut, initials, isEmailProfile, OCCUPATIONS } from '../lib/profiles'
import { forgetAccount, revokeToken } from '../lib/google'
import * as supa from '../lib/supabase'
import { clearLocal, flush, stopSync } from '../lib/cloud'
import { FOLDER_NAME, FILE_NAME } from '../lib/drive'
import { colorOf } from '../lib/colors'
import { cx } from '../components/ui'
import { describe, runAction, savedAgo, useCloudStatus, PasswordReconnect } from './CloudStatus'

// Settings → the signed-in account (Google or email) and where its data is saved.
export default function AccountSection() {
  const [p, setP] = useState(() => currentProfile())
  const s = useCloudStatus()
  const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState(false)
  const [error, setError] = useState(null)
  if (!p) return null
  const email = isEmailProfile(p)
  const where = email ? 'your account' : 'Google Drive'
  const c = colorOf(p.color)
  const save = (patch) => { updateProfile(p.id, patch); setP({ ...p, ...patch }) }
  const d = describe(s)
  const Icon = d.icon

  // Make sure the store has everything, then remove this device's copy.
  const doSignOut = async (force = false) => {
    setBusy(true)
    setError(null)
    const ok = await flush().catch(() => false)
    if (!ok && !force) { setWarn(true); setBusy(false); return }
    stopSync()
    if (email) await supa.signOut()
    else await revokeToken()
    clearLocal(p.id)
    removeProfileRecord(p.id)
    signOut()
    forgetAccount()
    window.location.reload()
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {p.picture
          ? <img src={p.picture} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded-full object-cover" />
          : <span className={cx('h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg', c.bg, c.text)}>{initials(p.name)}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="h-display text-base">Your account</h2>
          <p className="text-sm text-muted truncate">{email ? 'Signed in as' : 'Signed in with Google as'} <b className="text-ink">{p.email}</b></p>
        </div>
        <button type="button" className="btn-ghost h-9 py-0" disabled={busy} onClick={() => doSignOut(false)}>
          <LogOut size={14} /> {busy ? (email ? 'Saving…' : 'Saving to Drive…') : 'Sign out'}
        </button>
      </div>

      {warn && (
        <div role="alert" className="mb-4 rounded-2xl bg-coral/70 text-coral-fg p-3.5 text-sm">
          <p className="font-semibold">Some changes aren't saved to {where} yet.</p>
          <p className="mt-0.5">Signing out removes this device's copy, so those changes would be lost. {d.needsPassword ? 'Log in again below' : 'Reconnect'} and try again, or sign out anyway.</p>
          {d.needsPassword && <PasswordReconnect className="mt-2.5" onDone={() => setWarn(false)} />}
          <div className="flex flex-wrap gap-2 mt-2.5">
            {!d.needsPassword && <button type="button" className="btn-black h-8 py-0" onClick={() => { setWarn(false); runAction('reconnect', setError) }}><RefreshCw size={13} /> Reconnect</button>}
            <button type="button" className="btn-ghost h-8 py-0 text-coral-fg" onClick={() => doSignOut(true)}>Sign out anyway</button>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Name</span>
          <input className="input" value={p.name} onChange={(e) => save({ name: e.target.value })} onBlur={() => email && p.name.trim() && supa.setName(p.name.trim()).catch(() => {})} /></label>
        <div className="block"><span className="block text-xs font-semibold text-muted mb-1">Email</span><p className="input bg-page text-muted truncate">{p.email}</p></div>
        <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Occupation</span>
          <select className="input" value={p.occupation || ''} onChange={(e) => save({ occupation: e.target.value })}><option value="">Choose one</option>{OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
      </div>

      {email && <ChangePassword email={p.email} />}

      <div className="mt-4 rounded-2xl bg-page border border-line p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {email ? <Cloud size={16} className="text-sky-fg shrink-0" /> : <HardDrive size={16} className="text-sky-fg shrink-0" />}
          <p className="text-sm font-semibold flex-1 min-w-[180px]">{email ? 'Saved with your account' : `Google Drive · ${FOLDER_NAME} / ${FILE_NAME}`}</p>
          {!email && s.fileLink && <a href={s.fileLink} target="_blank" rel="noopener noreferrer" className="btn-ghost h-8 py-0"><ExternalLink size={13} /> Open in Drive</a>}
          {!d.needsPassword && <button type="button" className="btn-ghost h-8 py-0" onClick={() => runAction(d.action || 'retry', setError)}><RefreshCw size={13} /> {d.action === 'reconnect' ? 'Reconnect' : 'Sync now'}</button>}
        </div>
        <p className={cx('mt-2 text-xs inline-flex items-center gap-1.5', d.tone)}>
          <Icon size={13} className={cx(d.spin && 'animate-spin')} /> {d.text}{s.state === 'saved' && s.savedAt ? ` · last saved ${savedAgo(s.savedAt)}` : ''}
        </p>
        {d.needsPassword && !warn && <PasswordReconnect className="mt-2 text-peach-fg" />}
        {(error || s.error) && <p className="mt-1 text-xs text-coral-fg">{error || s.error}</p>}
        <p className="mt-2 text-[11px] text-faint">
          {email
            ? 'Changes save a couple of seconds after you make them, and load on any device you log in on. Only you can read your planner. To delete your data everywhere, use "Clear all data" below.'
            : `Changes save to Drive a couple of seconds after you make them, and load on any device you sign in on. The planner can only see the files it creates in your Drive. To delete your data everywhere, use "Clear all data" below, or delete the ${FOLDER_NAME} folder in Google Drive.`}
        </p>
      </div>
    </section>
  )
}

function ChangePassword({ email }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password.length < supa.MIN_PASSWORD) { setError(`Use at least ${supa.MIN_PASSWORD} characters.`); return }
    setBusy(true)
    try {
      await supa.setPassword(password)
      setPassword('')
      setOpen(false)
      setDone(true)
    } catch (err) {
      setError(err.code === 'same_password' ? "That's already your password." : err.code === 'offline' ? "Couldn't reach your account. Check your connection." : err.message)
    } finally {
      setBusy(false)
    }
  }
  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost h-8 py-0" onClick={() => { setOpen(true); setDone(false) }}><KeyRound size={13} /> Change password</button>
        {done && <p role="status" className="text-xs font-semibold text-mint-fg inline-flex items-center gap-1"><Check size={13} /> Password changed</p>}
      </div>
    )
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-2xl bg-page border border-line p-3.5">
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <label htmlFor="account-new-password" className="block text-xs font-semibold text-muted mb-1">New password</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="account-new-password" type="password" autoComplete="new-password" autoFocus className="input h-9 py-0 w-56 bg-card" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="btn-black h-9 py-0" disabled={busy || !password}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => { setOpen(false); setPassword(''); setError(null) }}>Cancel</button>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">At least {supa.MIN_PASSWORD} characters. Other devices stay signed in.</p>
      {error && <p role="alert" className="mt-1 text-xs text-coral-fg">{error}</p>}
    </form>
  )
}
