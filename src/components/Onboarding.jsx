import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Sparkles, ArrowRight, ArrowLeft, Check, ListChecks, Timer, BarChart3, Briefcase, Flame, Send, GraduationCap,
  Clock3, CalendarDays, KeyRound, Cloud, HardDrive, AlertTriangle, Loader2, FolderInput, Mail, Eye, EyeOff, MailCheck,
} from 'lucide-react'
import {
  NEEDS, OCCUPATIONS, REASONS, ensureAccountProfile, accountProfileId, isEmailAccount, isEmailProfile, signIn, currentProfile, updateProfile, legacyProfiles,
  moveProfileData, checkPin, migrateLegacyInto, hasLegacyData, initials, firstName, isGuestProfile, startGuest, GUEST_ID,
} from '../lib/profiles'
import { needsLicence } from '../lib/licence'
import { loadSettings, saveSettings, loadTasks, saveTasks, saveHabits, markOnboarded, isOnboarded, DEFAULT_CATEGORIES, uid } from '../lib/storage'
import { loadWork, saveWork, SATURDAY_RULES } from '../work/workStore'
import { generateSample } from '../lib/sample'
import { isNativeApp } from '../lib/platform'
import { isConfigured, isDesktop, rememberedAccount, rememberAccount, signInWithGoogle, lastAccount, forgetLastAccount } from '../lib/google'
import * as supa from '../lib/supabase'
import { mockEnabled as supaMockEnabled, mockCodeFor } from '../lib/supabaseMock'
import { apply, fetchRemote, hasLocalData, markSynced } from '../lib/cloud'
import { colorOf, cssVar } from '../lib/colors'
import { cx } from './ui'
import { BrandMark, Wordmark } from './Brand'
import { TimeField } from './TimePicker'

const NEED_STYLE = {
  plan: { icon: ListChecks, tone: 'lav' }, focus: { icon: Timer, tone: 'sky' }, hours: { icon: BarChart3, tone: 'mint' },
  habits: { icon: Flame, tone: 'peach' }, work: { icon: Briefcase, tone: 'coral' }, report: { icon: Send, tone: 'butter' },
  exam: { icon: GraduationCap, tone: 'teal' },
}
const DAYS = [['Mo', 1], ['Tu', 2], ['We', 3], ['Th', 4], ['Fr', 5], ['Sa', 6], ['Su', 0]]
const PRESETS = [['9 – 5', '09:00', '17:00'], ['9:30 – 6:30', '09:30', '18:30'], ['10 – 7', '10:00', '19:00'], ['Night 10 – 6', '22:00', '06:00']]
const STEP_LABEL = ['Your goals', 'Your rhythm', 'About you', 'All set']
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

// Local profiles (and pre-profile data) that hold something worth bringing in.
const importable = () => {
  const list = legacyProfiles().filter((p) => hasLocalData(p.id))
  if (hasLegacyData()) list.push({ id: '__legacy', name: 'Data from before profiles', email: '', pin: '' })
  return list
}

// NineFlow orange: main buttons, and the selected state of choices, on these screens.
const ORANGE_BTN = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white bg-brand shadow-[0_10px_28px_-10px_rgb(242_66_14/0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-45 disabled:shadow-none disabled:pointer-events-none'
const ORANGE_ON = 'bg-brand text-white border-transparent'

const GOOGLE_ON = isConfigured()
const EMAIL_ON = supa.isConfigured()
const savedWhere = (p) => (isGuestProfile(p) ? 'this browser only' : isEmailProfile(p) ? 'your account' : 'your Google Drive')

// After any sign-in: load the account's planner from its store (Drive or
// the email account), keep this device's copy if it has one, or carry on
// to "bring your data" / setup.
async function enter(account, onNext, setBusy) {
  rememberAccount(account)
  const profile = ensureAccountProfile(account)
  signIn(profile.id)
  setBusy?.(isEmailAccount(account) ? 'account' : 'drive')
  const remote = await fetchRemote(profile.id)
  if (remote) {
    // A planner already exists for this account: load it.
    apply(profile.id, remote.bundle.data)
    markSynced(profile.id, remote.bundle.data, remote.meta)
    markOnboarded()
    window.location.reload()
    return
  }
  if (hasLocalData(profile.id)) { markOnboarded(); window.location.reload(); return } // this device's copy goes up next
  onNext(importable().length ? 'import' : 'setup')
}

// Sign-in is required: a Google account (planner saved in that person's own
// Google Drive) or an email + password account (planner saved with the
// account). First sign-in on a device continues with "bring your local
// data" (when there is some) or the setup questions.
export default function Onboarding({ initial }) {
  const account = rememberedAccount()
  const p = currentProfile()
  const signedIn = account && p?.id === accountProfileId(account)
  const [screen, setScreen] = useState(initial || (signedIn ? (importable().length ? 'import' : 'setup') : isGuestProfile(p) && !needsLicence() ? 'setup' : 'signin'))
  return (
    // Sign-in and setup are always dark, to sit with the black and orange poster
    // (the app itself follows the theme chosen in Settings; the colour theme's accent still applies here). The page and card
    // colours are the poster's black (#111214), so everything reads as one
    // surface; the card and inputs keep their thin borders as outlines.
    <div className="dark [color-scheme:dark] min-h-screen bg-page text-ink lg:grid lg:grid-cols-[minmax(440px,46%)_1fr]"
      data-theme={document.documentElement.getAttribute('data-theme') || undefined}
      style={{ '--page': '17 18 20', '--card': '17 18 20' }}>
      <Poster />
      <main className="flex items-center justify-center p-4 sm:p-8 lg:min-h-screen">
        <div className="w-full max-w-xl">
          {screen === 'signin' && <SignIn onNext={setScreen} />}
          {screen === 'reset' && <ResetPassword />}
          {screen === 'import' && <Import onFresh={() => setScreen('setup')} />}
          {screen === 'setup' && <Setup />}
        </div>
      </main>
    </div>
  )
}

function Poster() {
  const driveOnly = GOOGLE_ON && !EMAIL_ON
  const logo = (
    <div className="inline-flex items-center gap-2.5">
      <BrandMark size={40} />
      <Wordmark className="text-lg" />
    </div>
  )
  return (
    <>
      {/* Desktop: a full-height dark panel, edge to edge, with the logo's orange flowing through it. */}
      <aside className="hidden lg:flex relative overflow-hidden sticky top-0 h-screen flex-col justify-between p-12 xl:p-16 text-white"
        style={{ background: `${POSTER_GLOW}, #111214` }}>
        <PosterFlow />
        <div className="relative">{logo}</div>
        <div className="relative max-w-md">
          <h1 className="text-[56px] xl:text-[64px] leading-[0.98] font-black tracking-tight">Plan better.<br /><span className="bg-gradient-to-r from-[#FF9F1C] to-[#F2420E] bg-clip-text text-transparent">Flow forward.</span></h1>
          <p className="mt-5 text-lg text-white/75">A planner, a focus timer and a work log in one place, {driveOnly ? 'saved in your own Google Drive' : 'saved to your account'}.</p>
          <ul className="mt-9 space-y-3.5">
            {[[ListChecks, 'Board, week and month views'], [Timer, 'Pomodoro that logs real focus time'], [BarChart3, 'Daily insights, habits and reports']].map(([Icon, t]) => (
              <li key={t} className="flex items-center gap-3 text-[15px] font-semibold text-white/90">
                <span className="h-10 w-10 rounded-xl bg-accent/15 ring-1 ring-accent/30 text-lav-fg flex items-center justify-center"><Icon size={18} /></span>{t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/90 font-semibold">
          {driveOnly && <span className="inline-flex items-center gap-1.5"><HardDrive size={13} /> Your data, your Drive</span>}
          <span className="inline-flex items-center gap-1.5"><Cloud size={13} /> Same planner on every device</span>
        </p>
      </aside>

      {/* Phones and tablets: the same dark and orange, as a band across the top. */}
      <header className="lg:hidden relative overflow-hidden text-white px-5 pt-6 pb-9 sm:px-8 rounded-b-[28px]"
        style={{ background: `${POSTER_GLOW}, #111214` }}>
        <PosterFlow compact />
        <div className="relative">{logo}</div>
        <p className="relative mt-5 text-[32px] sm:text-[40px] leading-[1.02] font-black tracking-tight">Plan better.<br /><span className="bg-gradient-to-r from-[#FF9F1C] to-[#F2420E] bg-clip-text text-transparent">Flow forward.</span></p>
      </header>
    </>
  )
}

// Orange light pooling in the corners of the dark poster.
const POSTER_GLOW = 'radial-gradient(70% 55% at 100% 100%, rgb(242 66 14 / 0.55) 0%, rgb(242 66 14 / 0.12) 55%, transparent 75%), radial-gradient(60% 45% at 0% 0%, rgb(255 159 28 / 0.22) 0%, transparent 70%)'

// Two broad orange ribbons sweeping across the poster, echoing the logo's swoosh.
// The short phone header only gets the dot: the ribbons would sit behind its text.
function PosterFlow({ compact = false }) {
  // Each copy needs its own gradient ids: the desktop copy is hidden on phones,
  // and a gradient inside a hidden element doesn't paint for the other copy.
  const uid = `poster${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${uid}a`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#F2420E" />
          <stop offset="0.55" stopColor="#FF6A13" />
          <stop offset="1" stopColor="#FF9F1C" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF9F1C" stopOpacity="0" />
          <stop offset="1" stopColor="#F2420E" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {!compact && (
        <>
          <path d="M-40 760 C 140 640, 260 900, 420 760 S 600 520, 680 560 L 680 980 L -40 980 Z" fill={`url(#${uid}a)`} opacity="0.95" />
          <path d="M-40 700 C 120 600, 280 820, 440 690 S 620 470, 700 500" fill="none" stroke={`url(#${uid}b)`} strokeWidth="26" strokeLinecap="round" opacity="0.55" />
        </>
      )}
      {compact
        ? <circle cx="560" cy="430" r="110" fill={`url(#${uid}a)`} opacity="0.9" />
        : <circle cx="520" cy="130" r="54" fill={`url(#${uid}a)`} opacity="0.9" />}
    </svg>
  )
}

function Frame({ children, step, kicker, title, lead }) {
  return (
    <div className="card p-6 sm:p-8 animate-modal-in">
      {step != null && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-faint">
            <span>Step {step + 1} of {STEP_LABEL.length} · {STEP_LABEL[step]}</span>
            <span>{Math.round(((step + 1) / STEP_LABEL.length) * 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${((step + 1) / STEP_LABEL.length) * 100}%` }} /></div>
        </div>
      )}
      {kicker && <p className="text-xs font-bold uppercase tracking-wider text-lav-fg mb-2">{kicker}</p>}
      {title && <h1 className="h-display text-[26px] sm:text-3xl leading-tight">{title}</h1>}
      {lead && <p className="text-muted mt-2">{lead}</p>}
      {children}
    </div>
  )
}

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

// ---- 1. Sign up / log in (required) ---------------------------------------------
// Google, or email + password (when Supabase is set up). Either way an
// account that already has a planner gets it loaded, a new one goes on to
// setup. The wording differs so a first visit reads as signing up and a
// return visit as logging in.

// What to tell the person for each Google SignInError code (see lib/google).
const SIGNIN_HELP = {
  // The desktop app signs in through the system browser instead of a pop-up.
  popup_closed: isDesktop
    ? ["The sign-in in your browser wasn't finished.", 'Try again, choose your account in the browser tab that opens, then come back to NineFlow.']
    : ['The Google window closed before you finished.', 'Try again, and pick your account in the Google window.'],
  popup_failed_to_open: isDesktop
    ? ["Your web browser didn't open.", 'Check that a default browser is set on this computer, then try again.']
    : ['Your browser blocked the Google window.', 'Allow pop-ups for this site (the icon at the right of the address bar), then try again.'],
  access_denied: ["Google didn't give the planner access.", 'If you pressed Cancel, just try again. If Google said "Access blocked" or "app not verified", this planner is still in testing and your account isn\'t on its tester list yet: ask whoever runs it to add you.'],
  drive_not_granted: ["Google Drive wasn't allowed.", `NineFlow saves your planner in your Drive, so it needs this. Try again, and on Google's permissions page tick the box for "Google Drive files you use with this app" (or "Select all") before you continue.`],
  offline: ["Couldn't reach Google.", 'Check your internet connection, then try again.'],
  invalid_client: ["Google sign-in isn't set up correctly for this site.", "The app's Google client ID isn't valid here."],
  unauthorized_client: ["Google sign-in isn't set up correctly for this site.", "The app's Google client ID isn't allowed to sign in from this address."],
}
const DEV_TIP_CODES = ['popup_closed', 'access_denied', 'invalid_client', 'unauthorized_client']

// The same for email accounts (see lib/supabase).
const EMAIL_HELP = {
  invalid_credentials: ["That email and password don't match.", 'Check for typos, or use "Forgot password?" to set a new one.'],
  email_not_confirmed: ['Confirm your email first.', 'Enter the code we emailed you when you signed up. We can send a new one.'],
  bad_code: ["That code didn't work.", 'Check the digits, or the code may have expired: send a new one and use the newest email.'],
  user_already_exists: ['That email already has a planner.', 'Log in instead, or use "Forgot password?" if you don\'t remember the password.'],
  weak_password: ['Choose a stronger password.', `Use at least ${supa.MIN_PASSWORD} characters. A few words together works well.`],
  same_password: ["That's your current password.", 'Choose a different one.'],
  invalid_email: ['That email address looks wrong.', 'Check it and try again.'],
  rate_limited: ['Too many tries in a row.', 'Wait a minute, then try again.'],
  signup_disabled: ['New accounts are switched off.', 'Ask whoever runs this planner.'],
  offline: ["Couldn't reach the sign-in service.", 'Check your internet connection, then try again.'],
}
const helpFor = (e, table) => table[e.code] || [e.message || 'Something went wrong.', 'Please try again.']

function ErrorBox({ headline, help, children }) {
  return (
    <div role="alert" className="mt-4 rounded-2xl border border-coral-fg/25 bg-coral/50 p-4 text-sm">
      <p className="font-semibold text-coral-fg inline-flex items-start gap-1.5"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {headline}</p>
      <p className="mt-1 text-ink/80">{help}</p>
      {children}
    </div>
  )
}


function PasswordInput({ id, value, onChange, autoComplete, autoFocus }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} className="input h-12 pr-12" value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} autoFocus={autoFocus} required minLength={autoComplete === 'new-password' ? supa.MIN_PASSWORD : undefined} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full inline-flex items-center justify-center text-faint hover:text-ink hover:bg-page">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function SignIn({ onNext }) {
  const [last, setLast] = useState(() => lastAccount())
  const [mode, setMode] = useState(() => (lastAccount() ? 'login' : 'signup')) // 'signup' | 'login'
  const [busy, setBusy] = useState(null) // null | 'google' | 'drive' | 'email' | 'account'
  const [error, setError] = useState(null) // Google SignInError

  // Back from an email-confirmation link: Supabase has a session but this
  // device hasn't opened the account yet.
  useEffect(() => {
    if (!EMAIL_ON) return
    let live = true
    supa.currentAccount().then((a) => {
      if (live && a && !supa.isRecovering()) { setBusy('account'); enter(a, onNext, setBusy).catch(() => setBusy(null)) }
    })
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (hint) => {
    setError(null)
    setBusy('google')
    try {
      await enter(await signInWithGoogle({ hint }), onNext, setBusy)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }
  const useAnother = () => { forgetLastAccount(); setLast(null); go() }

  if (!GOOGLE_ON && !EMAIL_ON) {
    // End users never see developer instructions.
    if (!import.meta.env.DEV) {
      return (
        <Frame kicker="Sign-in unavailable" title="We can't sign you in right now." lead="Sign-in for this planner isn't switched on yet. Please try again later.">
          <p className="mt-4 text-xs text-faint">Anything already saved stays safe in your account.</p>
        </Frame>
      )
    }
    return (
      <Frame kicker="Setup needed" title="Connect a sign-in method first." lead="This planner needs Google sign-in, email + password accounts (through Supabase), or both, before anyone can sign in.">
        <ul className="mt-5 space-y-2 text-sm list-disc pl-5 text-muted">
          <li><b className="text-ink">Email + password:</b> create a Supabase project, run the SQL in <code>docs/SUPABASE_SETUP.md</code>, then put <code className="text-ink">VITE_SUPABASE_URL</code> and <code className="text-ink">VITE_SUPABASE_KEY</code> in <code className="text-ink">.env.local</code>.</li>
          <li><b className="text-ink">Google:</b> create an OAuth client ID with the Drive API on, add <code className="text-ink">{window.location.origin}</code> as an authorised JavaScript origin, and put it in <code className="text-ink">.env.local</code> as <code className="text-ink">VITE_GOOGLE_CLIENT_ID</code> (see <code>docs/GOOGLE_SETUP.md</code>).</li>
        </ul>
        <p className="mt-4 text-xs text-faint">Restart the app after changing <code>.env.local</code>.</p>
      </Frame>
    )
  }

  const signup = mode === 'signup'
  const googleLabel = busy === 'google' ? (isDesktop ? 'Finish signing in in your browser…' : 'Waiting for Google…') : busy === 'drive' ? 'Looking for your planner in Drive…' : null
  const [headline, help] = error ? helpFor(error, SIGNIN_HELP) : []
  const lastGoogle = GOOGLE_ON && !signup && last && !isEmailAccount(last) ? last : null
  const lastEmail = last && isEmailAccount(last) ? last.email : ''
  const switchMode = () => { setMode(signup ? 'login' : 'signup'); setError(null) }
  const lead = signup
    ? (EMAIL_ON ? "Your planner is saved to your account, so it's the same on every device." : "Sign up with Google. Your planner is saved in your own Google Drive, so it's the same on every device.")
    : (EMAIL_ON ? 'Pick up where you left off. Your planner loads from your account.' : 'Pick up where you left off. Your planner loads from your Google Drive.')

  return (
    <Frame kicker={signup ? 'Get started · free' : 'Welcome back'} title={signup ? 'Create your planner.' : 'Log in to your planner.'} lead={lead}>

      {GOOGLE_ON && (lastGoogle ? (
        <div className="mt-7">
          <button type="button" onClick={() => go(lastGoogle.email)} disabled={!!busy} autoFocus
            className="w-full rounded-2xl border-2 border-line bg-card p-3 pr-4 flex items-center gap-3 text-left transition hover:border-ink disabled:opacity-60">
            {lastGoogle.picture
              ? <img src={lastGoogle.picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full shrink-0" />
              : <span className="h-10 w-10 rounded-full bg-lav text-lav-fg font-bold flex items-center justify-center shrink-0">{initials(lastGoogle.name)}</span>}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold truncate">{googleLabel || `Continue as ${firstName(lastGoogle.name)}`}</span>
              <span className="block text-sm text-muted truncate">{lastGoogle.email}</span>
            </span>
            {busy === 'google' || busy === 'drive' ? <Loader2 size={18} className="animate-spin text-muted" /> : <GoogleMark />}
          </button>
          <button type="button" onClick={useAnother} disabled={!!busy} className="mt-3 text-sm font-semibold text-muted hover:text-ink disabled:opacity-60">
            Use another Google account
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => go()} disabled={!!busy} autoFocus={!EMAIL_ON}
          className="mt-7 w-full h-12 rounded-full border-2 border-line bg-card font-semibold text-base inline-flex items-center justify-center gap-3 transition hover:border-ink disabled:opacity-60">
          {busy === 'google' || busy === 'drive' ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />}
          {googleLabel || (signup ? 'Sign up with Google' : 'Continue with Google')}
        </button>
      ))}

      {error && (
        <ErrorBox headline={headline} help={help}>
          {import.meta.env.DEV && DEV_TIP_CODES.includes(error.code) && (
            <p className="mt-2 text-xs text-muted">
              Developer tip: if Google showed "origin_mismatch", add <code className="text-ink">{window.location.origin}</code> to the client ID's Authorised JavaScript origins in Google Cloud.
            </p>
          )}
        </ErrorBox>
      )}

      {GOOGLE_ON && EMAIL_ON && (
        <div className="mt-6 flex items-center gap-3 text-xs font-semibold text-faint" aria-hidden="true">
          <span className="h-px flex-1 bg-line" /> or use your email <span className="h-px flex-1 bg-line" />
        </div>
      )}

      {EMAIL_ON && (
        <EmailForm key={mode} signup={signup} initialEmail={lastEmail} busy={busy} setBusy={setBusy} onNext={onNext}
          onSwitch={switchMode} autoFocus={!lastGoogle} spaced={!GOOGLE_ON} />
      )}

      {signup && !EMAIL_ON && (
        <ol className="mt-6 space-y-3 text-sm">
          {[
            ['Choose your Google account', isDesktop ? 'In your web browser, which opens for a moment.' : 'In the Google window that opens.'],
            ['Tick the "Google Drive" box', "Google may show it unticked. It lets NineFlow save its own file; it can't see anything else in your Drive."],
            ['Answer four quick questions', 'About a minute. You can skip any of them.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="h-6 w-6 rounded-full bg-page border border-line text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span><span className="font-semibold">{t}</span><span className="block text-muted text-xs mt-0.5">{d}</span></span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 pt-5 border-t border-line flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          {signup ? 'Already have a planner? ' : 'New here? '}
          <button type="button" className="font-semibold text-ink underline underline-offset-4 decoration-line hover:decoration-ink" onClick={switchMode}>
            {signup ? 'Log in' : 'Create a planner'}
          </button>
        </p>
        <a href="/privacy.html" target="_blank" rel="noopener" className="text-xs font-semibold text-faint hover:text-ink">Privacy</a>
      </div>
      {!needsLicence() && (
        <p className="mt-4 text-sm text-muted">
          Just looking?{' '}
          <button type="button" className="font-semibold text-ink underline underline-offset-4 decoration-line hover:decoration-ink" onClick={() => { startGuest(); onNext('setup') }}>
            Try it without an account
          </button>
          <span className="block text-xs text-faint mt-0.5">Your planner stays in this browser. Sign in any time to keep it.</span>
        </p>
      )}
    </Frame>
  )
}

// Email + password: sign up, log in, or ask for a reset link.
function EmailForm({ signup, initialEmail, busy, setBusy, onNext, onSwitch, autoFocus, spaced }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [password, setPassword] = useState('')
  const [view, setView] = useState('form') // 'form' | 'forgot' | 'reset-sent' | 'confirm'
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  const run = async (fn) => {
    setError(null)
    setNote(null)
    setBusy('email')
    try { await fn() } catch (e) { setError(e) } finally { setBusy(null) }
  }
  const submit = (e) => {
    e.preventDefault()
    if (signup && password.length < supa.MIN_PASSWORD) { setError({ code: 'weak_password' }); return }
    run(async () => {
      if (signup) {
        const r = await supa.signUp(email.trim(), password)
        if (r.needsConfirm) { setView('confirm'); return }
        await enter(r.account, onNext, setBusy)
      } else {
        await enter(await supa.signIn(email.trim(), password), onNext, setBusy)
      }
    })
  }
  const confirmNow = () => run(async () => { await supa.resendConfirmation(email.trim()); setView('confirm') })
  const sendReset = (e) => { e.preventDefault(); run(async () => { await supa.sendPasswordReset(email.trim()); setView('reset-sent') }) }

  const working = busy === 'email' || busy === 'account'
  const label = busy === 'account' ? 'Loading your planner…' : busy === 'email' ? (signup ? 'Creating your account…' : 'Logging in…') : (signup ? 'Create account' : 'Log in')
  const [headline, help] = error ? helpFor(error, EMAIL_HELP) : []
  const errorBox = error && (
    <ErrorBox headline={headline} help={error.code === 'weak_password' && error.message ? error.message : help}>
      {error.code === 'email_not_confirmed' && <button type="button" onClick={confirmNow} disabled={!!busy} className="mt-2 text-sm font-semibold underline underline-offset-4">Send a code and confirm now</button>}
      {error.code === 'user_already_exists' && <button type="button" onClick={onSwitch} className="mt-2 text-sm font-semibold underline underline-offset-4">Log in instead</button>}
    </ErrorBox>
  )
  const noteLine = note && <p role="status" className="mt-3 text-sm text-mint-fg font-semibold">{note}</p>

  if (view === 'confirm') {
    return <CodeEntry email={email.trim()} busy={busy} setBusy={setBusy} onNext={onNext} spaced={spaced}
      onBack={() => { setView('form'); setError(null); setNote(null) }} />
  }

  if (view === 'reset-sent') {
    return (
      <div className={cx('rounded-2xl border border-line bg-page p-5 animate-view-in', spaced ? 'mt-7' : 'mt-5')}>
        <p className="inline-flex items-center gap-2 font-bold"><MailCheck size={18} className="text-mint-fg" /> Check your inbox</p>
        <p className="mt-1.5 text-sm text-muted">
          If <b className="text-ink">{email.trim()}</b> has a planner, a link to choose a new password is on its way.
          {' '}Nothing after a few minutes? Check your spam folder.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
          <button type="button" onClick={() => { setView('form'); setError(null); setNote(null) }} className="text-muted hover:text-ink">Back</button>
        </div>
        {noteLine}
        {errorBox}
      </div>
    )
  }

  if (view === 'forgot') {
    return (
      <form onSubmit={sendReset} className={cx('animate-view-in', spaced ? 'mt-7' : 'mt-5')}>
        <p className="font-bold">Forgot your password?</p>
        <p className="text-sm text-muted mt-0.5">We'll email you a link to choose a new one.</p>
        <label htmlFor="reset-email" className="block text-xs font-bold text-muted mt-4 mb-1">Email</label>
        <input id="reset-email" type="email" className="input h-12" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
        <button type="submit" disabled={!!busy || !email.trim()} className={cx(ORANGE_BTN, 'mt-4 w-full h-12 px-4 text-base')}>
          {busy === 'email' ? <><Loader2 size={17} className="animate-spin" /> Sending…</> : 'Send reset link'}
        </button>
        <button type="button" onClick={() => { setView('form'); setError(null) }} className="mt-3 text-sm font-semibold text-muted hover:text-ink">Back to log in</button>
        {errorBox}
      </form>
    )
  }

  return (
    <form onSubmit={submit} className={spaced ? 'mt-7' : 'mt-5'}>
      <label htmlFor="auth-email" className="block text-xs font-bold text-muted mb-1">Email</label>
      <input id="auth-email" type="email" className="input h-12" value={email} onChange={(e) => setEmail(e.target.value)}
        autoComplete="email" autoFocus={autoFocus && !initialEmail} required />
      <div className="flex items-baseline justify-between mt-4 mb-1">
        <label htmlFor="auth-password" className="block text-xs font-bold text-muted">Password</label>
        {!signup && <button type="button" onClick={() => { setView('forgot'); setError(null) }} className="text-xs font-semibold text-muted hover:text-ink">Forgot password?</button>}
      </div>
      <PasswordInput id="auth-password" value={password} onChange={setPassword} autoComplete={signup ? 'new-password' : 'current-password'} autoFocus={autoFocus && !!initialEmail} />
      {signup && <p className="mt-1.5 text-xs text-faint">At least {supa.MIN_PASSWORD} characters.</p>}
      <button type="submit" disabled={!!busy || !email.trim() || !password}
 className={cx(ORANGE_BTN, 'mt-5 w-full h-12 px-4 text-base')}>
        {working && <Loader2 size={17} className="animate-spin" />} {label} {!working && <Mail size={16} />}
      </button>
      {errorBox}
    </form>
  )
}

// Confirm a new email account: type the 6-digit code from the sign-up email.
// Pasting or the phone's "from Messages/Mail" autofill fills every box; the
// last digit submits on its own and the planner carries on to the next step.
const RESEND_WAIT = 60 // seconds; Supabase refuses a new email sooner

function CodeEntry({ email, busy, setBusy, onNext, onBack, spaced }) {
  const N = supa.CODE_LENGTH
  const blank = () => Array(N).fill('')
  const [digits, setDigits] = useState(blank)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [wait, setWait] = useState(RESEND_WAIT)
  const refs = useRef([])

  useEffect(() => { refs.current[0]?.focus() }, [])
  useEffect(() => {
    if (wait <= 0) return undefined
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const verify = async (code) => {
    setError(null)
    setNote(null)
    setBusy('code')
    try {
      await enter(await supa.verifySignupCode(email, code), onNext, setBusy)
    } catch (e) {
      setError(e)
      setDigits(blank())
      setTimeout(() => refs.current[0]?.focus(), 0)
    } finally {
      setBusy(null)
    }
  }

  // Typing, pasting or autofill: spread the digits from box i onwards.
  const fill = (i, value) => {
    const typed = value.replace(/\D/g, '')
    const next = [...digits]
    if (!typed) { next[i] = ''; setDigits(next); return }
    let j = i
    for (const ch of typed) { if (j >= N) break; next[j++] = ch }
    setDigits(next)
    setError(null)
    if (next.every(Boolean)) { refs.current[N - 1]?.blur(); verify(next.join('')) }
    else refs.current[Math.min(j, N - 1)]?.focus()
  }
  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < N - 1) refs.current[i + 1]?.focus()
  }
  const resend = async () => {
    setError(null)
    setNote(null)
    setBusy('email')
    try {
      await supa.resendConfirmation(email)
      setDigits(blank())
      setWait(RESEND_WAIT)
      setNote('New code sent. Use the newest email; earlier codes stop working.')
      refs.current[0]?.focus()
    } catch (e) { setError(e) } finally { setBusy(null) }
  }

  const checking = busy === 'code' || busy === 'account'
  const [headline, help] = error ? helpFor(error, EMAIL_HELP) : []
  const testCode = supaMockEnabled ? mockCodeFor(email) : null

  return (
    <div className={cx('rounded-2xl border border-line bg-page p-5 animate-view-in', spaced ? 'mt-7' : 'mt-5')}>
      <p className="inline-flex items-center gap-2 font-bold"><MailCheck size={18} className="text-mint-fg" /> Enter the code we emailed you</p>
      <p className="mt-1.5 text-sm text-muted">
        We sent a {N}-digit code to <b className="text-ink">{email}</b>. It works for one hour.
      </p>

      <div role="group" aria-label="Verification code" className="mt-4 flex gap-2 sm:gap-2.5">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el }}
            value={d} onChange={(e) => fill(i, e.target.value)} onKeyDown={(e) => onKey(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric" pattern="[0-9]*" maxLength={N} autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1} of ${N}`} disabled={checking}
            className={cx('h-14 w-full min-w-0 max-w-[52px] rounded-xl border-2 bg-card text-center text-2xl font-bold tnum outline-none transition',
              'focus:border-lav-fg focus:ring-4 focus:ring-lav-fg/15 disabled:opacity-60',
              error ? 'border-coral-fg/60' : d ? 'border-ink/30' : 'border-line')} />
        ))}
      </div>

      {checking && <p role="status" className="mt-3 text-sm font-semibold text-muted inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> {busy === 'account' ? 'Opening your planner…' : 'Checking the code…'}</p>}
      {testCode && !checking && (
        <p className="mt-3 text-xs text-ink/80 rounded-xl bg-butter/60 border border-butter-fg/30 px-3 py-2">
          Test mode: no email is sent. Your code is <b className="tnum tracking-wider">{testCode}</b>.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold">
        <button type="button" onClick={resend} disabled={!!busy || wait > 0} className="text-ink underline underline-offset-4 disabled:no-underline disabled:text-faint">
          {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </button>
        <button type="button" onClick={onBack} disabled={checking} className="text-muted hover:text-ink">Use a different email</button>
      </div>
      <p className="mt-2 text-xs text-faint">Nothing after a few minutes? Check your spam folder.</p>
      {note && <p role="status" className="mt-3 text-sm text-mint-fg font-semibold">{note}</p>}
      {error && <ErrorBox headline={headline} help={help} />}
    </div>
  )
}

// ---- Reset password (opened from the emailed link) ----------------------------------
function ResetPassword() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const app = rememberedAccount()

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < supa.MIN_PASSWORD) { setError({ code: 'weak_password' }); return }
    setBusy(true)
    setError(null)
    try {
      await supa.setPassword(password)
      const account = await supa.currentAccount()
      // Already using this account here: just go back to it. Otherwise open it.
      if (!account || (app && accountProfileId(app) === accountProfileId(account) && isOnboarded())) { window.location.reload(); return }
      await enter(account, () => window.location.reload())
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }
  const cancel = async () => {
    const account = await supa.currentAccount()
    if (!(app && account && accountProfileId(app) === accountProfileId(account))) await supa.signOut()
    supa.endRecovery()
  }
  const [headline, help] = error ? helpFor(error, EMAIL_HELP) : []

  return (
    <Frame kicker="Reset password" title="Choose a new password." lead="You'll use it to log in from now on, on every device.">
      <form onSubmit={submit} className="mt-6">
        <label htmlFor="new-password" className="block text-xs font-bold text-muted mb-1">New password</label>
        <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
        <p className="mt-1.5 text-xs text-faint">At least {supa.MIN_PASSWORD} characters.</p>
        <button type="submit" disabled={busy || !password} className={cx(ORANGE_BTN, 'mt-5 w-full h-12 px-4 text-base')}>
          {busy ? <><Loader2 size={17} className="animate-spin" /> Saving…</> : <>Save and continue <ArrowRight size={16} /></>}
        </button>
        {error && <ErrorBox headline={headline} help={error.code === 'weak_password' && error.message ? error.message : help} />}
      </form>
      <button type="button" onClick={cancel} disabled={busy} className="mt-4 text-sm font-semibold text-muted hover:text-ink">Cancel</button>
    </Frame>
  )
}

// ---- 2. Bring data from a local profile (optional) -----------------------------
function Import({ onFresh }) {
  const list = importable()
  const me = currentProfile()
  const [picked, setPicked] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const bring = async (p) => {
    if (p.pin && !(await checkPin(p, pin))) { setError('That PIN doesn\'t match.'); setPin(''); return }
    if (p.id === '__legacy') migrateLegacyInto(me.id)
    else moveProfileData(p.id, me.id)
    markOnboarded()
    window.location.reload()
  }
  return (
    <Frame kicker={`Signed in as ${me?.email || ''}`} title="Bring your existing planner?" lead={`This browser has a planner made without an account. Move it into your account and it will be saved to ${savedWhere(me)}.`}>
      <div className="grid gap-2 mt-6">
        {list.map((p) => {
          const c = colorOf(p.color || 'lav')
          return (
            <button key={p.id} type="button" onClick={() => { setError(null); setPin(''); if (p.pin) setPicked(p); else bring(p) }}
              className={cx('group flex items-center gap-4 rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift', picked?.id === p.id ? 'border-ink bg-page' : 'border-line')}>
              <span className={cx('h-12 w-12 rounded-2xl flex items-center justify-center font-black text-lg', c.bg, c.text)}>{p.id === '__legacy' ? <FolderInput size={20} /> : initials(p.name)}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold truncate">{p.id === GUEST_ID ? `${p.name ? `${p.name}'s ` : 'Your '}guest planner` : p.name}</span><span className="block text-sm text-muted truncate">{p.email || (isNativeApp() ? 'Saved on this phone' : 'Saved in this browser')}</span></span>
              <span className="h-9 w-9 rounded-full flex items-center justify-center bg-page text-faint group-hover:text-ink">{p.pin ? <KeyRound size={15} /> : <ArrowRight size={16} />}</span>
            </button>
          )
        })}
      </div>
      {picked?.pin && (
        <form onSubmit={(e) => { e.preventDefault(); bring(picked) }} className="mt-5 rounded-2xl border border-line bg-page p-4 animate-view-in">
          <label htmlFor="import-pin" className="block text-xs font-bold text-muted mb-2">Enter that profile's 4-digit PIN</label>
          <div className="flex items-center gap-2">
            <input id="import-pin" autoFocus inputMode="numeric" maxLength={4} className="input h-12 w-40 text-center tracking-[0.5em] text-xl font-bold bg-card" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null) }} />
            <button type="submit" className={cx(ORANGE_BTN, 'h-12 px-5 text-sm')} disabled={pin.length < 4}>Bring it in <ArrowRight size={15} /></button>
          </div>
        </form>
      )}
      {error && <p className="text-xs text-coral-fg font-semibold mt-2">{error}</p>}
      <div className="flex items-center justify-end mt-7">
        <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={onFresh}>Start fresh instead</button>
      </div>
    </Frame>
  )
}

// ---- 3. Setup questions (new accounts) --------------------------------------
function Setup() {
  const me = currentProfile()
  // Sample data starts on for an empty planner (so no screen opens empty) and never replaces brought-in tasks.
  const [hasTasks] = useState(() => loadTasks().length > 0)
  const [step, setStep] = useState(0)
  const [a, setA] = useState({ needs: [], startTime: '09:30', endTime: '18:30', days: [1, 2, 3, 4, 5], saturdayRule: 'all', breakMinutes: 60, name: me?.name || '', occupation: '', occupationOther: '', reasons: [], sample: !hasTasks })
  const set = (p) => setA((x) => ({ ...x, ...p }))
  const toggle = (k, v) => setA((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))
  const TOTAL = STEP_LABEL.length
  const canNext = step === 2 ? a.name.trim().length > 0 : true
  const optional = step === 0 || step === 1
  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : finish())
  const back = () => step > 0 && setStep(step - 1)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && canNext && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); next() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const wantsWork = a.needs.includes('work') || a.needs.includes('report') || ['Marketer', 'Content creator'].includes(a.occupation)
  // A night shift (end before start) runs past midnight into the next day.
  const startMin = toMin(a.startTime)
  const span = ((toMin(a.endTime) - startMin) + 1440) % 1440
  const dayHours = Math.max(0, (span - a.breakMinutes) / 60)
  const summary = useMemo(() => [
    a.needs.includes('plan') && ['Quick list docked on the right', ListChecks, 'lav'],
    a.needs.includes('focus') && ['Pomodoro focus mode on every task', Timer, 'sky'],
    a.needs.includes('hours') && ['Estimate vs actual on finished tasks', BarChart3, 'mint'],
    a.needs.includes('habits') && ['Habit tracker on the dashboard', Flame, 'peach'],
    wantsWork && ['Work OS: task log, social calendar, ad tracker, reports', Briefcase, 'coral'],
    a.needs.includes('exam') && ['RRB NTPC syllabus and 40-day plan, and Revise flashcards with an example note', GraduationCap, 'teal'],
    [`${a.startTime}–${a.endTime}, ${a.days.length} days a week (${dayHours.toFixed(1).replace('.0', '')} h/day after breaks)${a.days.includes(6) && a.saturdayRule !== 'all' ? ` · ${SATURDAY_RULES.find((r) => r.id === a.saturdayRule)?.label}` : ''}`, Clock3, 'butter'],
    [isGuestProfile(me) ? 'Saved in this browser only, until you sign in' : `Saved to ${savedWhere(me)} automatically`, HardDrive, 'sky'],
  ].filter(Boolean), [a, wantsWork, dayHours, me])

  async function finish() {
    updateProfile(me.id, { name: a.name.trim(), occupation: a.occupation, occupationOther: a.occupationOther, reasons: a.reasons, needs: a.needs })
    // Email accounts keep the name with the account, so other devices know it.
    if (isEmailProfile(me)) await Promise.race([supa.setName(a.name.trim()), new Promise((r) => setTimeout(r, 3000))]).catch(() => {})
    const s = loadSettings()
    // Exam prep: the NTPC section, and one note showing how flashcards are written (Revise reads `question :: answer`).
    const exam = a.needs.includes('exam')
    const notes = exam && !(s.notes || []).length ? [{ id: uid(), text: ['How flashcards work', 'Write a question, two colons, then the answer. Revise asks them back on a schedule.', 'Capital of India :: New Delhi', '1 km is how many metres? :: 1000'].join('\n'), color: 'mint', pinned: true, createdAt: Date.now(), updatedAt: Date.now(), images: [] }] : s.notes
    saveSettings({ ...s, notes, modules: { ...s.modules, work: wantsWork, ntpc: exam || !!s.modules?.ntpc }, quickList: { ...s.quickList, position: a.needs.includes('plan') ? 'right' : 'off' }, weekStart: a.days.includes(0) && !a.days.includes(1) ? 0 : s.weekStart, workHours: { start: a.startTime, end: a.endTime, breakMinutes: a.breakMinutes } })
    const w = loadWork()
    saveWork({ ...w, settings: { ...w.settings, startTime: a.startTime, workingDays: a.days, saturdayRule: a.saturdayRule } })
    if (a.sample && !hasTasks) { const { tasks, habits } = generateSample(s.categories || DEFAULT_CATEGORIES); saveTasks(tasks); saveHabits(habits) }
    markOnboarded()
    window.location.reload()
  }

  const titles = [
    ['What do you want to get better at?', 'Tap everything that fits — this arranges the app for you. Change it any time.'],
    ['When do you usually work or study?', 'Sets your time plan and how many hours a day count as capacity.'],
    ['Tell us a little about you.', isEmailProfile(me) || isGuestProfile(me) ? 'What should the planner call you?' : 'Your name is filled in from Google; change it if you like.'],
    [`Hi ${firstName(a.name)}, you’re all set.`, 'Here’s how your planner is arranged:'],
  ]

  return (
    <Frame step={step} title={titles[step][0]} lead={titles[step][1]}>
      <div key={step} className="animate-view-in mt-6">
        {step === 0 && (
          <>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {NEEDS.map((n) => { const { icon: Icon, tone } = NEED_STYLE[n.id]; const c = colorOf(tone); const on = a.needs.includes(n.id); return (
                <button key={n.id} type="button" onClick={() => toggle('needs', n.id)} aria-pressed={on}
                  className={cx('relative flex items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition-all', on ? cx('border-transparent', c.bg) : 'border-line bg-card hover:border-faint hover:-translate-y-0.5')}>
                  <span className={cx('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition', on ? 'bg-card ' + c.text : cx(c.bg, c.text))}><Icon size={18} /></span>
                  <span className="min-w-0"><span className={cx('block font-bold text-sm', on && c.text)}>{n.label}</span><span className={cx('block text-xs mt-0.5', on ? c.text + ' opacity-80' : 'text-muted')}>{n.hint}</span></span>
                  {on && <span className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-accent text-white flex items-center justify-center animate-pop"><Check size={12} strokeWidth={3} /></span>}
                </button>
              ) })}
            </div>
            <p className="text-xs text-faint mt-3">{a.needs.length ? `${a.needs.length} selected` : 'Nothing selected yet — that’s fine, you can skip.'}</p>
          </>
        )}

        {step === 1 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(([l, s, e]) => <button key={l} type="button" onClick={() => set({ startTime: s, endTime: e })} className={cx('pill border transition', a.startTime === s && a.endTime === e ? ORANGE_ON : 'bg-card text-muted border-line hover:text-ink')}>{l}</button>)}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Start</span><TimeField value={a.startTime} onChange={(v) => v && set({ startTime: v })} allowClear={false} className="w-32" /></label>
              <span className="text-faint pb-3">→</span>
              <label className="block"><span className="block text-xs font-semibold text-muted mb-1">End</span><TimeField value={a.endTime} onChange={(v) => v && set({ endTime: v })} allowClear={false} className="w-32" /></label>
              <p className="pb-2.5 text-sm text-muted"><b className="text-ink">{dayHours.toFixed(1).replace('.0', '')} h</b> of work a day{startMin + span > 1440 ? ', ending the next morning' : ''}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Break">
              <span className="text-xs font-semibold text-muted mr-1">Break</span>
              {[0, 30, 45, 60].map((m) => <button key={m} type="button" onClick={() => set({ breakMinutes: m })} aria-pressed={a.breakMinutes === m} className={cx('pill border transition', a.breakMinutes === m ? ORANGE_ON : 'bg-card text-muted border-line hover:text-ink')}>{m ? `${m} min` : 'None'}</button>)}
            </div>
            <div className="mt-5 rounded-2xl border border-line bg-page p-4">
              <div className="relative h-3 rounded-full bg-line overflow-hidden">
                {/* A night shift wraps: one piece to midnight, the rest from 00:00 */}
                <div className="absolute inset-y-0 rounded-full bg-lav-fg/80" style={{ left: `${(startMin / 1440) * 100}%`, width: `${(Math.min(span, 1440 - startMin) / 1440) * 100}%` }} />
                {startMin + span > 1440 && <div className="absolute inset-y-0 left-0 rounded-full bg-lav-fg/80" style={{ width: `${((startMin + span - 1440) / 1440) * 100}%` }} />}
              </div>
              <div className="flex justify-between text-[11px] font-bold text-faint mt-1.5"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
            </div>
            <p className="text-xs font-semibold text-muted mt-5 mb-2 inline-flex items-center gap-1"><CalendarDays size={12} /> Working days</p>
            <div className="flex gap-1.5">{DAYS.map(([l, d]) => (
              <button key={d} type="button" onClick={() => toggle('days', d)} aria-pressed={a.days.includes(d)} className={cx('h-11 w-12 rounded-full text-sm font-bold transition', a.days.includes(d) ? ORANGE_ON : 'bg-page text-faint hover:text-ink')}>{l}</button>
            ))}</div>
            {a.days.includes(6) && (
              <div className="mt-4 rounded-2xl border border-line bg-page p-3.5 animate-view-in">
                <p className="text-xs font-bold text-muted mb-2">Which Saturdays do you work?</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {SATURDAY_RULES.map((r) => (
                    <button key={r.id} type="button" onClick={() => set({ saturdayRule: r.id })} aria-pressed={a.saturdayRule === r.id}
                      className={cx('rounded-xl border-2 px-3 py-2 text-left transition', a.saturdayRule === r.id ? 'border-ink bg-card' : 'border-transparent bg-card/60 hover:bg-card')}>
                      <span className="block text-sm font-semibold">{r.label}</span><span className="block text-xs text-muted">{r.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {me?.picture
                ? <img src={me.picture} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-2xl object-cover" />
                : <span className={cx('h-16 w-16 rounded-2xl flex items-center justify-center font-black text-2xl', colorOf(me?.color).bg, colorOf(me?.color).text)}>{a.name.trim() ? initials(a.name) : '?'}</span>}
              <div className="flex-1">
                <label htmlFor="setup-name" className="block text-xs font-bold text-muted mb-1">Your name <span className="text-coral-fg">*</span></label>
                <input id="setup-name" autoFocus className="input h-12 text-lg font-semibold" value={a.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
            </div>
            {!isGuestProfile(me) && (
              <div>
                <span className="block text-xs font-bold text-muted mb-1">Email</span>
                <p className="input h-11 flex items-center gap-2 bg-page text-muted">{isEmailProfile(me) ? <Mail size={16} /> : <GoogleMark />} {me?.email}</p>
              </div>
            )}
            <div>
              <span className="block text-xs font-bold text-muted mb-1.5">What do you do? <span className="text-faint font-medium">· optional</span></span>
              <div className="flex flex-wrap gap-1.5">{OCCUPATIONS.map((o) => (
                <button key={o} type="button" onClick={() => set({ occupation: a.occupation === o ? '' : o })} className={cx('pill border transition', a.occupation === o ? ORANGE_ON : 'bg-card text-muted border-line hover:text-ink')}>{o}</button>
              ))}</div>
              {a.occupation === 'Other' && <input className="input mt-2 animate-view-in" placeholder="Tell us in a word or two" value={a.occupationOther} onChange={(e) => set({ occupationOther: e.target.value })} />}
            </div>
            <div>
              <span className="block text-xs font-bold text-muted mb-1.5">Why NineFlow? <span className="text-faint font-medium">· optional, tap any</span></span>
              <div className="flex flex-wrap gap-1.5">{REASONS.map((r) => (
                <button key={r} type="button" onClick={() => toggle('reasons', r)} className={cx('pill border transition', a.reasons.includes(r) ? 'bg-lav text-lav-fg border-lav-fg/40' : 'bg-card text-muted border-line hover:text-ink')}>{a.reasons.includes(r) && <Check size={11} />}{r}</button>
              ))}</div>
            </div>
          </div>
        )}

        {step === 3 && (
          <>
            <ul className="grid sm:grid-cols-2 gap-2.5">
              {summary.map(([text, Icon, tone]) => { const c = colorOf(tone); return (
                <li key={text} className={cx('flex items-start gap-3 rounded-2xl p-3.5', c.bg)}><span className={cx('h-9 w-9 rounded-xl bg-card flex items-center justify-center shrink-0', c.text)}><Icon size={16} /></span><span className={cx('text-sm font-semibold', c.text)}>{text}</span></li>
              ) })}
            </ul>
            {!hasTasks && (
            <label className="mt-5 flex items-center gap-3 rounded-2xl border-2 border-line p-3.5 cursor-pointer hover:border-faint transition">
              <button type="button" role="switch" aria-checked={a.sample} aria-label="Start with sample data" onClick={() => set({ sample: !a.sample })}
                className={cx('h-6 w-11 shrink-0 rounded-full p-0.5 transition', a.sample ? ORANGE_ON : 'bg-line')}><span className={cx('block h-5 w-5 rounded-full bg-card transition', a.sample && 'translate-x-5')} /></button>
              <span><span className="block text-sm font-bold">Start with sample data</span><span className="block text-xs text-muted">Six weeks of example tasks so every screen has something to show. Clear it in Settings whenever you like.</span></span>
            </label>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-8">
        {step > 0
          ? <button type="button" className="text-sm font-semibold text-muted hover:text-ink inline-flex items-center gap-1" onClick={back}><ArrowLeft size={14} /> Back</button>
          : <span />}
        <div className="flex items-center gap-3">
          {optional && <button type="button" className="text-sm font-semibold text-faint hover:text-ink" onClick={() => setStep(step + 1)}>Skip</button>}
          <button type="button" className={cx(ORANGE_BTN, 'h-12 px-6 text-base')} disabled={!canNext} onClick={next}>
            {step === TOTAL - 1 ? <>Open my planner <Sparkles size={16} /></> : <>Continue <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </Frame>
  )
}
