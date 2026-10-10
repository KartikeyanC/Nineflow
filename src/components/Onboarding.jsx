import React, { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, ArrowRight, ArrowLeft, Check, LogIn, UserPlus, Lock, ListChecks, Timer, BarChart3, Briefcase, Flame, Send,
  ShieldCheck, WifiOff, Clock3, CalendarDays, KeyRound, ChevronDown,
} from 'lucide-react'
import { NEEDS, OCCUPATIONS, REASONS, AVATAR_COLORS, listProfiles, createProfile, signIn, migrateLegacyInto, hasLegacyData, initials, firstName } from '../lib/profiles'
import { loadSettings, saveSettings, saveTasks, saveHabits, markOnboarded, DEFAULT_CATEGORIES } from '../lib/storage'
import { loadWork, saveWork, SATURDAY_RULES } from '../work/workStore'
import { generateSample } from '../lib/sample'
import { colorOf, cssVar } from '../lib/colors'
import { cx } from './ui'
import { TimeField } from './TimePicker'

const NEED_STYLE = {
  plan: { icon: ListChecks, tone: 'lav' }, focus: { icon: Timer, tone: 'sky' }, hours: { icon: BarChart3, tone: 'mint' },
  habits: { icon: Flame, tone: 'peach' }, work: { icon: Briefcase, tone: 'coral' }, report: { icon: Send, tone: 'butter' },
}
const DAYS = [['Mo', 1], ['Tu', 2], ['We', 3], ['Th', 4], ['Fr', 5], ['Sa', 6], ['Su', 0]]
const PRESETS = [['9 – 5', '09:00', '17:00'], ['9:30 – 6:30', '09:30', '18:30'], ['10 – 7', '10:00', '19:00']]
const STEP_LABEL = ['Your goals', 'Your rhythm', 'About you', 'All set']
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

// First launch: a brand panel beside a step card. Sign-up is four light
// steps (only the name is required); returning users pick a profile.
export default function Onboarding() {
  const profiles = listProfiles()
  const [screen, setScreen] = useState(profiles.length ? 'login' : 'welcome')
  return (
    <div className="min-h-screen bg-page lg:grid lg:grid-cols-[420px_1fr]">
      <Poster />
      <main className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl">
          {screen === 'welcome' && <Welcome onStart={() => setScreen('signup')} onLogin={() => setScreen('login')} hasProfiles={profiles.length > 0} />}
          {screen === 'login' && <Login profiles={profiles} onSignup={() => setScreen('signup')} onBack={() => setScreen('welcome')} />}
          {screen === 'signup' && <Signup onLogin={() => setScreen('login')} onBack={() => setScreen('welcome')} hasProfiles={profiles.length > 0} />}
        </div>
      </main>
    </div>
  )
}

// Left brand panel (desktop); a slim header on smaller screens.
function Poster() {
  return (
    <>
      <aside className="hidden lg:flex m-4 mr-0 rounded-card p-8 flex-col justify-between text-white sticky top-4 h-[calc(100vh-2rem)]"
        style={{ background: `linear-gradient(160deg, ${cssVar('--sky-fg', 0.9)} 0%, ${cssVar('--lav-fg', 0.95)} 100%)` }}>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold"><Sparkles size={13} /> Daily Planner</div>
          <h1 className="mt-8 text-[44px] leading-[1.05] font-black tracking-tight">Plan the day.<br />Focus.<br />See where the time went.</h1>
          <p className="mt-4 text-white/80 max-w-xs">A planner, a focus timer and a work log in one place — and it never leaves your device.</p>
        </div>
        <ul className="space-y-3">
          {[[ListChecks, 'Board, week and month views'], [Timer, 'Pomodoro that logs real focus time'], [BarChart3, 'Daily insights, habits and reports']].map(([Icon, t]) => (
            <li key={t} className="flex items-center gap-3 text-sm font-semibold"><span className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center"><Icon size={17} /></span>{t}</li>
          ))}
          <li className="pt-3 flex items-center gap-4 text-[11px] text-white/70 font-semibold"><span className="inline-flex items-center gap-1"><WifiOff size={12} /> Works offline</span><span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> No account on any server</span></li>
        </ul>
      </aside>
      <div className="lg:hidden flex items-center gap-2 px-5 pt-5 -mb-2">
        <span className="h-8 w-8 rounded-xl bg-ink text-page flex items-center justify-center"><Sparkles size={15} /></span>
        <span className="h-display text-base">Daily Planner</span>
      </div>
    </>
  )
}

function Frame({ children, step, kicker, title, lead }) {
  return (
    <div className="card p-6 sm:p-8 animate-modal-in">
      {step != null && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-faint">
            <span>Step {step + 1} of {STEP_LABEL.length} · {STEP_LABEL[step]}</span>
            <span>{Math.round(((step + 1) / STEP_LABEL.length) * 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${((step + 1) / STEP_LABEL.length) * 100}%` }} /></div>
        </div>
      )}
      {kicker && <p className="text-xs font-bold uppercase tracking-wider text-lav-fg mb-2">{kicker}</p>}
      {title && <h1 className="h-display text-[26px] sm:text-3xl leading-tight">{title}</h1>}
      {lead && <p className="text-muted mt-2">{lead}</p>}
      {children}
    </div>
  )
}

function Welcome({ onStart, onLogin, hasProfiles }) {
  return (
    <Frame kicker="Welcome" title="Let's set up your planner." lead="Three quick questions, then you're in. Nothing to remember — no password, no email verification.">
      <div className="grid grid-cols-3 gap-3 mt-6">
        {[['Plan', ListChecks, 'lav'], ['Focus', Timer, 'sky'], ['Review', BarChart3, 'mint']].map(([t, Icon, tone]) => { const c = colorOf(tone); return (
          <div key={t} className={cx('rounded-2xl p-4 text-center', c.bg)}><Icon size={22} className={cx('mx-auto', c.text)} /><p className={cx('text-sm font-bold mt-2', c.text)}>{t}</p></div>
        ) })}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mt-7">
        <button type="button" className="btn-black h-12 flex-1 text-base" onClick={onStart} autoFocus><UserPlus size={18} /> Create my profile</button>
        <button type="button" className="btn-ghost h-12 flex-1 text-base" onClick={onLogin}><LogIn size={18} /> {hasProfiles ? 'Log in' : 'I have a profile'}</button>
      </div>
    </Frame>
  )
}

function Login({ profiles, onSignup, onBack }) {
  const [picked, setPicked] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const go = (p) => { signIn(p.id); window.location.reload() }
  const submit = (e) => { e.preventDefault(); if (picked.pin && pin !== picked.pin) { setError(true); setPin(''); return } go(picked) }
  if (profiles.length === 0) return <Welcome onStart={onSignup} onLogin={() => {}} hasProfiles={false} />
  return (
    <Frame kicker="Welcome back" title={profiles.length === 1 ? `Hi ${firstName(profiles[0].name)}.` : 'Who\'s planning today?'} lead={profiles.length === 1 ? 'Tap your profile to continue.' : 'Choose your profile to continue.'}>
      <div className="grid gap-2 mt-6">
        {profiles.map((p) => {
          const c = colorOf(p.color)
          const active = picked?.id === p.id
          return (
            <button key={p.id} type="button" onClick={() => { if (p.pin) { setPicked(p); setPin(''); setError(false) } else go(p) }}
              className={cx('group flex items-center gap-4 rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift', active ? 'border-ink bg-page' : 'border-line')}>
              <span className={cx('h-14 w-14 rounded-2xl flex items-center justify-center font-black text-xl', c.bg, c.text)}>{initials(p.name)}</span>
              <span className="min-w-0 flex-1"><span className="block font-bold text-lg truncate">{p.name}</span><span className="block text-sm text-muted truncate">{[p.occupation === 'Other' ? p.occupationOther : p.occupation, p.email].filter(Boolean).join(' · ') || 'Local profile'}</span></span>
              <span className={cx('h-9 w-9 rounded-full flex items-center justify-center transition', active ? 'bg-ink text-page' : 'bg-page text-faint group-hover:text-ink')}>{p.pin ? <Lock size={15} /> : <ArrowRight size={16} />}</span>
            </button>
          )
        })}
      </div>
      {picked?.pin && (
        <form onSubmit={submit} className="mt-5 rounded-2xl bg-page p-4 animate-view-in">
          <label className="block text-xs font-bold text-muted mb-2"><KeyRound size={12} className="inline mr-1" />Enter your 4-digit PIN</label>
          <div className="flex items-center gap-2">
            <input autoFocus inputMode="numeric" maxLength={4} className={cx('input h-12 w-40 text-center tracking-[0.5em] text-xl font-bold bg-card', error && 'border-coral-fg ring-2 ring-coral-fg/20')} value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(false) }} />
            <button type="submit" className="btn-black h-12 px-5" disabled={pin.length < 4}>Log in <ArrowRight size={15} /></button>
          </div>
          {error && <p className="text-xs text-coral-fg font-semibold mt-2">That PIN doesn't match. Try again.</p>}
        </form>
      )}
      <div className="flex items-center justify-between mt-7">
        <button type="button" className="text-sm font-semibold text-muted hover:text-ink inline-flex items-center gap-1" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <button type="button" className="text-sm font-semibold text-lav-fg hover:underline inline-flex items-center gap-1" onClick={onSignup}><UserPlus size={14} /> New profile</button>
      </div>
    </Frame>
  )
}

function Signup({ onLogin, onBack, hasProfiles }) {
  const [step, setStep] = useState(0)
  const [a, setA] = useState({ needs: [], startTime: '09:30', endTime: '18:30', days: [1, 2, 3, 4, 5], saturdayRule: 'all', name: '', email: '', occupation: '', occupationOther: '', reasons: [], pin: '', showPin: false, sample: false })
  const set = (p) => setA((x) => ({ ...x, ...p }))
  const toggle = (k, v) => setA((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))
  const TOTAL = STEP_LABEL.length
  const canNext = step === 2 ? a.name.trim().length > 0 : true
  const optional = step === 0 || step === 1
  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : finish())
  const back = () => (step === 0 ? onBack() : setStep(step - 1))

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && canNext && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); next() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const wantsWork = a.needs.includes('work') || a.needs.includes('report') || ['Marketer', 'Content creator'].includes(a.occupation)
  const dayHours = Math.max(0, (toMin(a.endTime) - toMin(a.startTime) - 60) / 60)
  const avatarColor = AVATAR_COLORS[listProfiles().length % AVATAR_COLORS.length]
  const summary = useMemo(() => [
    a.needs.includes('plan') && ['Quick list docked on the right', ListChecks, 'lav'],
    a.needs.includes('focus') && ['Pomodoro focus mode on every task', Timer, 'sky'],
    a.needs.includes('hours') && ['Estimate vs actual on finished tasks', BarChart3, 'mint'],
    a.needs.includes('habits') && ['Habit tracker on the dashboard', Flame, 'peach'],
    wantsWork && ['Work OS: task log, social calendar, ad tracker, reports', Briefcase, 'coral'],
    [`${a.startTime}–${a.endTime}, ${a.days.length} days a week (${dayHours.toFixed(1).replace('.0', '')} h/day after lunch)${a.days.includes(6) && a.saturdayRule !== 'all' ? ` · ${SATURDAY_RULES.find((r) => r.id === a.saturdayRule)?.label}` : ''}`, Clock3, 'butter'],
  ].filter(Boolean), [a, wantsWork, dayHours])

  function finish() {
    const profile = createProfile(a)
    const first = !hasProfiles
    signIn(profile.id)
    if (first && hasLegacyData()) migrateLegacyInto(profile.id)
    const s = loadSettings()
    saveSettings({ ...s, modules: { ...s.modules, work: wantsWork }, quickList: { ...s.quickList, position: a.needs.includes('plan') ? 'right' : 'off' }, weekStart: a.days.includes(0) && !a.days.includes(1) ? 0 : s.weekStart, workHours: { start: a.startTime, end: a.endTime, breakMinutes: 60 } })
    const w = loadWork()
    saveWork({ ...w, settings: { ...w.settings, startTime: a.startTime, workingDays: a.days, saturdayRule: a.saturdayRule } })
    if (a.sample && !(first && hasLegacyData())) { const { tasks, habits } = generateSample(s.categories || DEFAULT_CATEGORIES); saveTasks(tasks); saveHabits(habits) }
    markOnboarded()
    window.location.reload()
  }

  const titles = [
    ['What do you want to get better at?', 'Tap everything that fits — this arranges the app for you. Change it any time.'],
    ['When do you usually work?', 'Sets your time plan and how many hours a day count as capacity.'],
    ['Tell us a little about you.', 'Just a name is enough. The rest only makes the app talk to you properly.'],
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
                  {on && <span className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-ink text-page flex items-center justify-center animate-pop"><Check size={12} strokeWidth={3} /></span>}
                </button>
              ) })}
            </div>
            <p className="text-xs text-faint mt-3">{a.needs.length ? `${a.needs.length} selected` : 'Nothing selected yet — that’s fine, you can skip.'}</p>
          </>
        )}

        {step === 1 && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(([l, s, e]) => <button key={l} type="button" onClick={() => set({ startTime: s, endTime: e })} className={cx('pill border transition', a.startTime === s && a.endTime === e ? 'bg-ink text-page border-ink' : 'bg-card text-muted border-line hover:text-ink')}>{l}</button>)}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Start</span><TimeField value={a.startTime} onChange={(v) => v && set({ startTime: v })} allowClear={false} className="w-32" /></label>
              <span className="text-faint pb-3">→</span>
              <label className="block"><span className="block text-xs font-semibold text-muted mb-1">End</span><TimeField value={a.endTime} onChange={(v) => v && set({ endTime: v })} allowClear={false} className="w-32" /></label>
              <p className="pb-2.5 text-sm text-muted"><b className="text-ink">{dayHours.toFixed(1).replace('.0', '')} h</b> of work a day, with an hour for lunch</p>
            </div>
            {/* Day bar */}
            <div className="mt-5 rounded-2xl bg-page p-4">
              <div className="relative h-3 rounded-full bg-line overflow-hidden">
                <div className="absolute inset-y-0 rounded-full bg-lav-fg/80" style={{ left: `${(toMin(a.startTime) / 1440) * 100}%`, width: `${Math.max(0, (toMin(a.endTime) - toMin(a.startTime)) / 1440) * 100}%` }} />
              </div>
              <div className="flex justify-between text-[10px] font-bold text-faint mt-1.5"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
            </div>
            <p className="text-xs font-semibold text-muted mt-5 mb-2 inline-flex items-center gap-1"><CalendarDays size={12} /> Working days</p>
            <div className="flex gap-1.5">{DAYS.map(([l, d]) => (
              <button key={d} type="button" onClick={() => toggle('days', d)} aria-pressed={a.days.includes(d)} className={cx('h-11 w-12 rounded-full text-sm font-bold transition', a.days.includes(d) ? 'bg-ink text-page' : 'bg-page text-faint hover:text-ink')}>{l}</button>
            ))}</div>
            {a.days.includes(6) && (
              <div className="mt-4 rounded-2xl bg-page p-3.5 animate-view-in">
                <p className="text-xs font-bold text-muted mb-2">Which Saturdays do you work?</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {SATURDAY_RULES.map((r) => (
                    <button key={r.id} type="button" onClick={() => set({ saturdayRule: r.id })} aria-pressed={a.saturdayRule === r.id}
                      className={cx('rounded-xl border-2 px-3 py-2 text-left transition', a.saturdayRule === r.id ? 'border-ink bg-card' : 'border-transparent bg-card/60 hover:bg-card')}>
                      <span className="block text-sm font-semibold">{r.label}</span><span className="block text-[11px] text-muted">{r.hint}</span>
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
              <span className={cx('h-16 w-16 rounded-2xl flex items-center justify-center font-black text-2xl transition', colorOf(avatarColor).bg, colorOf(avatarColor).text)}>{a.name.trim() ? initials(a.name) : '?'}</span>
              <div className="flex-1">
                <label className="block text-xs font-bold text-muted mb-1">Your name <span className="text-coral-fg">*</span></label>
                <input autoFocus className="input h-12 text-lg font-semibold" placeholder="e.g. Asha" value={a.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
            </div>
            <label className="block">
              <span className="block text-xs font-bold text-muted mb-1">Email <span className="text-faint font-medium">· optional</span></span>
              <input type="email" className="input h-11" placeholder="you@example.com" value={a.email} onChange={(e) => set({ email: e.target.value })} />
            </label>
            <div>
              <span className="block text-xs font-bold text-muted mb-1.5">What do you do? <span className="text-faint font-medium">· optional</span></span>
              <div className="flex flex-wrap gap-1.5">{OCCUPATIONS.map((o) => (
                <button key={o} type="button" onClick={() => set({ occupation: a.occupation === o ? '' : o })} className={cx('pill border transition', a.occupation === o ? 'bg-ink text-page border-ink' : 'bg-card text-muted border-line hover:text-ink')}>{o}</button>
              ))}</div>
              {a.occupation === 'Other' && <input className="input mt-2 animate-view-in" placeholder="Tell us in a word or two" value={a.occupationOther} onChange={(e) => set({ occupationOther: e.target.value })} />}
            </div>
            <div>
              <span className="block text-xs font-bold text-muted mb-1.5">Why Daily Planner? <span className="text-faint font-medium">· optional, tap any</span></span>
              <div className="flex flex-wrap gap-1.5">{REASONS.map((r) => (
                <button key={r} type="button" onClick={() => toggle('reasons', r)} className={cx('pill border transition', a.reasons.includes(r) ? 'bg-lav text-lav-fg border-lav-fg/40' : 'bg-card text-muted border-line hover:text-ink')}>{a.reasons.includes(r) && <Check size={11} />}{r}</button>
              ))}</div>
            </div>
            <div className="rounded-2xl bg-page p-3.5">
              <button type="button" onClick={() => set({ showPin: !a.showPin })} className="w-full flex items-center justify-between text-sm font-semibold">
                <span className="inline-flex items-center gap-2"><KeyRound size={15} className="text-lav-fg" /> Add a 4-digit PIN <span className="text-faint font-medium">· optional</span></span>
                <ChevronDown size={16} className={cx('text-faint transition', a.showPin && 'rotate-180')} />
              </button>
              {a.showPin && (
                <div className="mt-3 flex items-center gap-3 animate-view-in">
                  <input inputMode="numeric" maxLength={4} className="input h-11 w-36 text-center tracking-[0.5em] text-lg font-bold bg-card" placeholder="••••" value={a.pin} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  <p className="text-xs text-muted">Asked when you log in on this device. Handy if others use this computer.</p>
                </div>
              )}
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
            <label className="mt-5 flex items-center gap-3 rounded-2xl border-2 border-line p-3.5 cursor-pointer hover:border-faint transition">
              <span className={cx('h-6 w-11 rounded-full p-0.5 transition', a.sample ? 'bg-ink' : 'bg-line')} onClick={(e) => { e.preventDefault(); set({ sample: !a.sample }) }}><span className={cx('block h-5 w-5 rounded-full bg-card transition', a.sample && 'translate-x-5')} /></span>
              <span><span className="block text-sm font-bold">Start with sample data</span><span className="block text-xs text-muted">Six weeks of example tasks so every screen has something to show. Clear it in Settings whenever you like.</span></span>
            </label>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mt-8">
        <button type="button" className="text-sm font-semibold text-muted hover:text-ink inline-flex items-center gap-1" onClick={back}><ArrowLeft size={14} /> Back</button>
        <div className="flex items-center gap-3">
          {optional && <button type="button" className="text-sm font-semibold text-faint hover:text-ink" onClick={() => setStep(step + 1)}>Skip</button>}
          {step === 0 && hasProfiles && <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={onLogin}>Log in instead</button>}
          <button type="button" className="btn-black h-12 px-6 text-base" disabled={!canNext} onClick={next}>
            {step === TOTAL - 1 ? <>Open my planner <Sparkles size={16} /></> : <>Continue <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </Frame>
  )
}
