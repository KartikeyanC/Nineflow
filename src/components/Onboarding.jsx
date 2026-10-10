import React, { useEffect, useMemo, useState } from 'react'
import { Sparkles, ArrowRight, ArrowLeft, Check, LogIn, UserPlus, Lock, ListChecks, Timer, BarChart3, Briefcase, Flame, Send } from 'lucide-react'
import { NEEDS, OCCUPATIONS, REASONS, listProfiles, createProfile, signIn, migrateLegacyInto, hasLegacyData, initials, firstName } from '../lib/profiles'
import { loadSettings, saveSettings, saveTasks, saveHabits, markOnboarded, DEFAULT_CATEGORIES } from '../lib/storage'
import { loadWork, saveWork } from '../work/workStore'
import { generateSample } from '../lib/sample'
import { colorOf } from '../lib/colors'
import { cx } from './ui'
import { TimeField } from './TimePicker'

const NEED_ICON = { plan: ListChecks, focus: Timer, hours: BarChart3, habits: Flame, work: Briefcase, report: Send }
const DAYS = [['Mo', 1], ['Tu', 2], ['We', 3], ['Th', 4], ['Fr', 5], ['Sa', 6], ['Su', 0]]

// First-launch flow: welcome → needs → work rhythm → profile → done.
// Everything except the name is optional. Enter moves forward.
export default function Onboarding() {
  const profiles = listProfiles()
  const [screen, setScreen] = useState(profiles.length ? 'login' : 'welcome')
  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {screen === 'welcome' && <Welcome onStart={() => setScreen('signup')} onLogin={() => setScreen('login')} hasProfiles={profiles.length > 0} />}
        {screen === 'login' && <Login profiles={profiles} onSignup={() => setScreen('signup')} />}
        {screen === 'signup' && <Signup onLogin={() => setScreen('login')} hasProfiles={profiles.length > 0} />}
      </div>
    </div>
  )
}

function Card({ children, step, total }) {
  return (
    <div className="card p-6 sm:p-8 animate-modal-in">
      {step != null && (
        <div className="flex items-center gap-1.5 mb-6">
          {Array.from({ length: total }, (_, i) => <span key={i} className={cx('h-1.5 rounded-full transition-all', i <= step ? 'bg-ink w-8' : 'bg-line w-4')} />)}
          <span className="ml-auto text-xs text-faint font-semibold">{step + 1} / {total}</span>
        </div>
      )}
      {children}
    </div>
  )
}

function Welcome({ onStart, onLogin, hasProfiles }) {
  return (
    <Card>
      <div className="text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-ink text-page flex items-center justify-center mb-4"><Sparkles size={26} /></div>
        <h1 className="h-display text-3xl">Daily Planner</h1>
        <p className="text-muted mt-2">Plan the day, focus, track your time — all offline, all yours.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-7">
        {[['Plan', ListChecks, 'bg-lav text-lav-fg'], ['Focus', Timer, 'bg-sky text-sky-fg'], ['Review', BarChart3, 'bg-mint text-mint-fg']].map(([t, Icon, tone]) => (
          <div key={t} className="rounded-2xl border border-line p-3 text-center"><div className={cx('mx-auto h-9 w-9 rounded-full flex items-center justify-center', tone)}><Icon size={17} /></div><p className="text-sm font-bold mt-2">{t}</p></div>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mt-7">
        <button type="button" className="btn-black h-12 flex-1 text-base" onClick={onStart} autoFocus><UserPlus size={18} /> Get started</button>
        <button type="button" className="btn-ghost h-12 flex-1 text-base" onClick={onLogin}><LogIn size={18} /> {hasProfiles ? 'Log in' : 'I already have a profile'}</button>
      </div>
      <p className="text-[11px] text-faint text-center mt-4">No account on any server. Your profile and data stay in this browser.</p>
    </Card>
  )
}

function Login({ profiles, onSignup }) {
  const [picked, setPicked] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const go = (p) => { signIn(p.id); window.location.reload() }
  const submit = (e) => { e.preventDefault(); if (picked.pin && pin !== picked.pin) { setError(true); return } go(picked) }
  if (profiles.length === 0) return <Welcome onStart={onSignup} onLogin={() => {}} hasProfiles={false} />
  return (
    <Card>
      <h1 className="h-display text-2xl">Welcome back</h1>
      <p className="text-muted mt-1">Choose your profile.</p>
      <div className="grid gap-2 mt-5">
        {profiles.map((p) => {
          const c = colorOf(p.color)
          const active = picked?.id === p.id
          return (
            <button key={p.id} type="button" onClick={() => { if (p.pin) { setPicked(p); setPin(''); setError(false) } else go(p) }}
              className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift', active ? 'border-ink' : 'border-line')}>
              <span className={cx('h-11 w-11 rounded-full flex items-center justify-center font-bold', c.bg, c.text)}>{initials(p.name)}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold truncate">{p.name}</span><span className="block text-xs text-muted truncate">{[p.occupation === 'Other' ? p.occupationOther : p.occupation, p.email].filter(Boolean).join(' · ') || 'Local profile'}</span></span>
              {p.pin ? <Lock size={15} className="text-faint" /> : <ArrowRight size={16} className="text-faint" />}
            </button>
          )
        })}
      </div>
      {picked?.pin && (
        <form onSubmit={submit} className="mt-4 flex items-center gap-2 animate-view-in">
          <input autoFocus inputMode="numeric" maxLength={4} className={cx('input w-32 text-center tracking-[0.4em] text-lg', error && 'border-coral-fg ring-2 ring-coral-fg/20')} placeholder="PIN" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(false) }} />
          <button type="submit" className="btn-black h-10">Log in <ArrowRight size={15} /></button>
          {error && <span className="text-xs text-coral-fg font-semibold">Wrong PIN</span>}
        </form>
      )}
      <button type="button" className="mt-6 text-sm font-semibold text-lav-fg hover:underline inline-flex items-center gap-1" onClick={onSignup}><UserPlus size={14} /> Create a new profile</button>
    </Card>
  )
}

function Signup({ onLogin, hasProfiles }) {
  const [step, setStep] = useState(0)
  const [a, setA] = useState({ needs: [], startTime: '09:30', endTime: '18:30', days: [1, 2, 3, 4, 5], name: '', email: '', occupation: '', occupationOther: '', reasons: [], pin: '', sample: true })
  const set = (p) => setA((x) => ({ ...x, ...p }))
  const toggle = (k, v) => set({ [k]: a[k].includes(v) ? a[k].filter((x) => x !== v) : [...a[k], v] })
  const TOTAL = 4
  const canNext = step === 2 ? a.name.trim().length > 0 : true
  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : finish())
  const back = () => setStep((s) => Math.max(0, s - 1))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && canNext && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); next() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const wantsWork = a.needs.includes('work') || a.needs.includes('report') || ['Marketer', 'Content creator'].includes(a.occupation)
  const summary = useMemo(() => [
    a.needs.includes('plan') && 'Quick list docked on the right',
    a.needs.includes('focus') && 'Pomodoro focus mode on every task',
    a.needs.includes('hours') && 'Estimate vs actual on finished tasks',
    a.needs.includes('habits') && 'Habit tracker on the dashboard',
    wantsWork && 'Work OS tab: task log, social calendar, ad tracker, daily report',
    `Working day ${a.startTime}–${a.endTime}, ${a.days.length} days a week`,
  ].filter(Boolean), [a, wantsWork])

  function finish() {
    const profile = createProfile(a)
    const first = !hasProfiles
    signIn(profile.id)
    if (first && hasLegacyData()) migrateLegacyInto(profile.id)
    // Personalise settings inside the new namespace.
    const s = loadSettings()
    saveSettings({
      ...s,
      modules: { ...s.modules, work: wantsWork },
      quickList: { ...s.quickList, position: a.needs.includes('plan') ? 'right' : 'off' },
      weekStart: a.days.includes(0) && !a.days.includes(1) ? 0 : s.weekStart,
    })
    const w = loadWork()
    saveWork({ ...w, settings: { ...w.settings, startTime: a.startTime, workingDays: a.days } })
    if (a.sample && !(first && hasLegacyData())) {
      const { tasks, habits } = generateSample(s.categories || DEFAULT_CATEGORIES)
      saveTasks(tasks); saveHabits(habits)
    }
    markOnboarded()
    window.location.reload()
  }

  return (
    <Card step={step} total={TOTAL}>
      {step === 0 && (
        <>
          <h1 className="h-display text-2xl">What do you want to get better at?</h1>
          <p className="text-muted mt-1">Tap everything that fits. You can change all of this later.</p>
          <div className="grid sm:grid-cols-2 gap-2 mt-5">
            {NEEDS.map((n) => { const Icon = NEED_ICON[n.id]; const on = a.needs.includes(n.id); return (
              <button key={n.id} type="button" onClick={() => toggle('needs', n.id)}
                className={cx('flex items-start gap-3 rounded-2xl border p-3 text-left transition', on ? 'border-ink bg-page' : 'border-line hover:border-faint')}>
                <span className={cx('h-9 w-9 rounded-full flex items-center justify-center shrink-0', on ? 'bg-ink text-page' : 'bg-lav text-lav-fg')}>{on ? <Check size={16} /> : <Icon size={16} />}</span>
                <span><span className="block font-bold text-sm">{n.label}</span><span className="block text-xs text-muted">{n.hint}</span></span>
              </button>
            ) })}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="h-display text-2xl">When do you usually work?</h1>
          <p className="text-muted mt-1">This sets your time plan and available hours.</p>
          <div className="flex flex-wrap gap-4 mt-5">
            <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Start</span><TimeField value={a.startTime} onChange={(v) => v && set({ startTime: v })} allowClear={false} className="w-32" /></label>
            <label className="block"><span className="block text-xs font-semibold text-muted mb-1">End</span><TimeField value={a.endTime} onChange={(v) => v && set({ endTime: v })} allowClear={false} className="w-32" /></label>
          </div>
          <p className="text-xs font-semibold text-muted mt-5 mb-1.5">Working days</p>
          <div className="flex gap-1.5">{DAYS.map(([l, d]) => (
            <button key={d} type="button" onClick={() => toggle('days', d)} className={cx('h-10 w-11 rounded-full text-sm font-bold transition', a.days.includes(d) ? 'bg-ink text-page' : 'bg-page text-faint hover:text-ink')}>{l}</button>
          ))}</div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="h-display text-2xl">About you</h1>
          <p className="text-muted mt-1">Only your name is needed. The rest helps the app talk to you properly.</p>
          <div className="grid gap-4 mt-5">
            <Field label="Name" required><input autoFocus className="input h-11 text-base" placeholder="How should we greet you?" value={a.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Email" hint="optional · used only for calendar hand-offs and your reports"><input type="email" className="input h-11" placeholder="you@example.com" value={a.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Occupation" hint="optional">
              <div className="flex flex-wrap gap-1.5">{OCCUPATIONS.map((o) => (
                <button key={o} type="button" onClick={() => set({ occupation: a.occupation === o ? '' : o })} className={cx('pill border transition', a.occupation === o ? 'bg-ink text-page border-ink' : 'bg-card text-muted border-line hover:text-ink')}>{o}</button>
              ))}</div>
              {a.occupation === 'Other' && <input className="input mt-2" placeholder="What do you do?" value={a.occupationOther} onChange={(e) => set({ occupationOther: e.target.value })} />}
            </Field>
            <Field label="Why Daily Planner?" hint="optional · tap any">
              <div className="flex flex-wrap gap-1.5">{REASONS.map((r) => (
                <button key={r} type="button" onClick={() => toggle('reasons', r)} className={cx('pill border transition', a.reasons.includes(r) ? 'bg-lav text-lav-fg border-lav-fg/40' : 'bg-card text-muted border-line hover:text-ink')}>{r}</button>
              ))}</div>
            </Field>
            <Field label="4-digit PIN" hint="optional · asked when you log in on this device">
              <input inputMode="numeric" maxLength={4} className="input w-32 text-center tracking-[0.4em]" placeholder="••••" value={a.pin} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            </Field>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="h-display text-2xl">Hi {firstName(a.name)} 👋 you're set.</h1>
          <p className="text-muted mt-1">Based on your answers, here's how the app is arranged:</p>
          <ul className="mt-5 space-y-2">{summary.map((s) => <li key={s} className="flex items-center gap-2 text-sm"><span className="h-6 w-6 rounded-full bg-mint text-mint-fg flex items-center justify-center shrink-0"><Check size={13} /></span>{s}</li>)}</ul>
          <label className="mt-6 flex items-center gap-3 rounded-2xl border border-line p-3 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--lav-fg))]" checked={a.sample} onChange={(e) => set({ sample: e.target.checked })} />
            <span><span className="block text-sm font-bold">Start with sample data</span><span className="block text-xs text-muted">Six weeks of example tasks so every screen has something to show. Clear it any time in Settings.</span></span>
          </label>
        </>
      )}

      <div className="flex items-center justify-between mt-7">
        {step > 0 ? <button type="button" className="btn-ghost" onClick={back}><ArrowLeft size={15} /> Back</button>
          : <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={onLogin}>{hasProfiles ? 'Log in instead' : ''}</button>}
        <button type="button" className="btn-black h-11 px-5" disabled={!canNext} onClick={next}>
          {step === TOTAL - 1 ? <>Open my planner <Sparkles size={15} /></> : <>{step === 0 && a.needs.length === 0 ? 'Skip' : 'Continue'} <ArrowRight size={15} /></>}
        </button>
      </div>
    </Card>
  )
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted mb-1.5">{label}{required && <span className="text-coral-fg"> *</span>}{hint && <span className="text-faint font-medium"> · {hint}</span>}</span>
      {children}
    </label>
  )
}
