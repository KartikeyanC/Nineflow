import React, { useEffect, useState } from 'react'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Check, X } from 'lucide-react'
import { dismissNotice, getStatus, keepThisDevice, onStatus, reconnect, syncNow } from '../lib/cloud'
import { rememberedAccount } from '../lib/google'
import { cx } from '../components/ui'

// Sync status (Google Drive, or the email account), for the sidebars,
// Settings and a banner.

const WORDS = {
  drive: { saving: 'Saving to Drive…', saved: 'Saved to Drive', reconnect: 'Reconnect Google Drive', notSaved: 'Not saved to Drive · reconnect', problem: 'Drive sync problem · retry', connecting: 'Connecting to Drive…' },
  supabase: { saving: 'Saving…', saved: 'Saved to your account', reconnect: 'Logged out · log in again', notSaved: 'Not saved online · log in again', problem: 'Sync problem · retry', connecting: 'Connecting…' },
}

export function useCloudStatus() {
  const [s, setS] = useState(getStatus)
  useEffect(() => onStatus(setS), [])
  // Re-render every 30s so "saved 2 min ago" stays true.
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(id) }, [])
  return s
}

export const savedAgo = (iso) => (iso ? `${formatDistanceToNowStrict(parseISO(iso))} ago` : '')

// Email accounts reconnect with their password (the banner asks for it),
// so their status has no one-click 'reconnect' action.
export function describe(s) {
  const w = WORDS[s.store] || WORDS.drive
  if (s.state === 'saving') return { icon: RefreshCw, spin: true, text: w.saving, tone: 'text-muted' }
  if (s.state === 'needs-auth') return { icon: CloudOff, text: s.unsaved ? w.notSaved : w.reconnect, tone: 'text-peach-fg', action: s.store === 'supabase' ? null : 'reconnect', needsPassword: s.store === 'supabase' }
  if (s.state === 'offline') return { icon: CloudOff, text: s.unsaved ? 'Offline · saved on this device' : 'Offline', tone: 'text-muted' }
  if (s.state === 'error') return { icon: AlertTriangle, text: w.problem, tone: 'text-coral-fg', action: 'retry' }
  if (s.state === 'saved') return { icon: s.unsaved ? RefreshCw : Check, text: s.unsaved ? 'Saving soon…' : w.saved, tone: 'text-muted' }
  return { icon: Cloud, text: w.connecting, tone: 'text-faint' }
}

// Email accounts whose session ended: log in again without leaving the page.
export function PasswordReconnect({ className, onDone }) {
  const email = rememberedAccount()?.email || ''
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await reconnect(password)
      setPassword('')
      onDone?.()
    } catch (err) {
      setError(err.code === 'invalid_credentials' ? "That password isn't right. Forgot it? Sign out, then use \"Forgot password?\"." : err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className={cx('flex flex-wrap items-center gap-2', className)}>
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <input type="password" autoComplete="current-password" aria-label={`Password for ${email}`} placeholder="Password" value={password}
        onChange={(e) => setPassword(e.target.value)} className="input h-8 py-0 w-44 bg-card text-[13px]" required />
      <button type="submit" disabled={busy || !password} className="inline-flex items-center gap-1.5 h-8 rounded-full bg-brand text-white px-3 text-[12px] font-semibold disabled:opacity-60">
        <RefreshCw size={13} className={cx(busy && 'animate-spin')} /> {busy ? 'Logging in…' : 'Log in'}
      </button>
      {error && <p role="alert" className="w-full text-[12px]">{error}</p>}
    </form>
  )
}

export async function runAction(action, setError, setBusy) {
  setError?.(null)
  setBusy?.(true)
  try {
    if (action === 'reconnect') await reconnect()
    else await syncNow({ force: true })
  } catch (e) { setError?.(e.message) } finally { setBusy?.(false) }
}

// Compact line for the sidebars. Icon-only when `iconOnly`.
export function CloudStatusPill({ iconOnly = false, className }) {
  const s = useCloudStatus()
  const d = describe(s)
  const Icon = d.icon
  const title = `${d.text}${s.state === 'saved' && s.savedAt ? ` · last saved ${savedAgo(s.savedAt)}` : ''}${s.error ? ` · ${s.error}` : ''}`
  const note = title.slice(d.text.length).replace(/^ · /, '') // everything after the headline: when it was last saved, or the error
  const body = (
    <>
      <Icon size={14} className={cx('shrink-0', d.spin && 'animate-spin')} />
      {!iconOnly && <span className="truncate">{d.text}</span>}
    </>
  )
  const cls = cx('inline-flex items-center gap-2 h-8 rounded-full px-2.5 text-[12px] font-semibold min-w-0', d.tone, className)
  return d.action
    ? <button type="button" data-tip={d.text} data-tip-hint={note} aria-label={title} onClick={() => runAction(d.action)} className={cx(cls, 'hover:bg-page transition')}>{body}</button>
    : <span role="status" data-tip={d.text} data-tip-hint={note} aria-label={title} className={cls}>{body}</span>
}

// Banner when changes can't reach Drive until Google is reconnected, and
// for one-off notices (two devices saving at once).
export function CloudBanner() {
  const s = useCloudStatus()
  const [error, setError] = useState(null)
  if (s.notice) {
    return (
      <div role="status" className="fixed z-40 top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(620px,calc(100vw-2rem))] animate-modal-in">
        <div className="flex items-start gap-3 rounded-[22px] bg-card shadow-lift ring-hair px-4 py-3">
          <Cloud size={16} className="mt-0.5 text-sky-fg shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px]">{s.notice}</p>
            {s.conflict && (
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" className="btn-ghost h-8 py-0" onClick={dismissNotice}>Keep the other device's</button>
                <button type="button" className="btn-black h-8 py-0" onClick={() => keepThisDevice().catch((e) => setError(e.message))}>Use this device's version</button>
              </div>
            )}
            {error && <p role="alert" className="mt-1 text-xs text-coral-fg">{error}</p>}
          </div>
          <button type="button" aria-label="Dismiss" onClick={dismissNotice} className="h-7 w-7 rounded-full inline-flex items-center justify-center text-faint hover:text-ink hover:bg-page"><X size={14} /></button>
        </div>
      </div>
    )
  }
  if (s.state !== 'needs-auth') return null
  if (s.store === 'supabase') {
    return (
      <div role="alert" className="fixed z-40 top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(620px,calc(100vw-2rem))] animate-modal-in">
        <div className="rounded-[22px] bg-peach text-peach-fg ring-1 ring-peach-fg/20 shadow-lift px-4 py-3">
          <p className="text-[13px] font-semibold inline-flex items-start gap-2">
            <CloudOff size={16} className="shrink-0 mt-px" />
            {s.unsaved
              ? 'You were logged out, so your latest changes are only on this device. Log in again to save them to your account.'
              : 'You were logged out. Log in again to keep your planner saved to your account.'}
          </p>
          <PasswordReconnect className="mt-2" />
        </div>
      </div>
    )
  }
  if (!s.unsaved) return null
  return (
    <div role="alert" className="fixed z-40 top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(620px,calc(100vw-2rem))] animate-modal-in">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[22px] bg-peach text-peach-fg ring-1 ring-peach-fg/20 shadow-lift px-4 py-3">
        <CloudOff size={16} className="shrink-0" />
        <p className="text-[13px] font-semibold flex-1 min-w-[200px]">
          Your latest changes are saved on this device but not in Google Drive yet. Google asks you to reconnect about once an hour.
        </p>
        <button type="button" onClick={() => runAction('reconnect', setError)}
          className="inline-flex items-center gap-1.5 h-8 rounded-full bg-card text-ink px-3 text-[12px] font-semibold shadow-soft">
          <RefreshCw size={13} /> Reconnect
        </button>
        {error && <p className="w-full text-[12px]">{error}</p>}
      </div>
    </div>
  )
}
