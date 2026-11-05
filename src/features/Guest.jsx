import React, { useState } from 'react'
import { HardDrive, LogIn, Trash2 } from 'lucide-react'
import { currentProfile, deleteProfile, GUEST_ID, isGuestProfile, signOut } from '../lib/profiles'
import { cx } from '../components/ui'

// A guest planner (lib/profiles.js startGuest): the planner without an account, on the website only.
// Everything stays in this browser. "Save to an account" leaves the guest planner as it is and goes
// to sign-in; a new account then offers to bring it in (Onboarding: "Bring your existing planner?").

export const isGuest = () => isGuestProfile(currentProfile())

export function saveToAccount() {
  signOut() // only stops using the guest planner here; its data stays until it is brought in
  window.location.reload()
}

// The slim bar above every screen.
export function GuestBar() {
  if (!isGuest()) return null
  return (
    <div role="note" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-peach text-peach-fg px-4 py-2.5 text-[13px]">
      <HardDrive size={15} className="shrink-0" />
      <p className="flex-1 min-w-[12rem]"><b>Guest planner.</b> Saved only in this browser, so clearing it or switching device loses it.</p>
      <button type="button" onClick={saveToAccount} className="inline-flex items-center gap-1.5 h-8 rounded-full bg-card text-ink px-3 text-xs font-semibold shadow-soft">
        <LogIn size={13} /> Save to an account
      </button>
    </div>
  )
}

// Settings → Your account, for a guest.
export function GuestAccount() {
  const [confirm, setConfirm] = useState(false)
  const remove = () => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`daily-planner:${GUEST_ID}:`)) localStorage.removeItem(k)
    deleteProfile(GUEST_ID)
    window.location.reload()
  }
  return (
    <section className="card p-5">
      <h2 className="h-display text-base">No account yet</h2>
      <p className="text-sm text-muted mt-1">
        This guest planner is saved only in this browser. It isn't backed up, and other devices can't see it.
        Sign in to keep it: with a new account, NineFlow offers to bring this planner in. If the account already
        has a planner, that one opens instead and this guest planner stays here.
      </p>
      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" className="btn-black" onClick={saveToAccount}><LogIn size={14} /> Save to an account</button>
        <button type="button" className={cx('btn-ghost', confirm && 'text-coral-fg')} onClick={() => (confirm ? remove() : setConfirm(true))}>
          <Trash2 size={14} /> {confirm ? 'Delete it for good?' : 'Delete this guest planner'}
        </button>
      </div>
    </section>
  )
}

// The sidebar's save status, for a guest: nothing syncs.
export function GuestPill({ iconOnly = false }) {
  return (
    <span data-tip="Guest planner" data-tip-hint="Saved only in this browser" className={cx('inline-flex items-center gap-1.5 text-xs font-semibold text-peach-fg', !iconOnly && 'px-2 py-1')}>
      <HardDrive size={14} />{!iconOnly && 'This browser only'}
    </span>
  )
}
