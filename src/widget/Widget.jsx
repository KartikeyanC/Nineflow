import { applyTheme } from '../lib/themes'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, Minus, Moon, Sparkles, Sun, X } from 'lucide-react'
import { format, setDatePrefs } from '../lib/dateFormat'
import { loadSettings, loadTasks, saveSettings, saveTasks, isOnboarded } from '../lib/storage'
import { isDark } from '../lib/themes'
import { currentProfile, firstName } from '../lib/profiles'
import { carriedLabel, checkGate, dateKey, dueLabel, fmtMinutes, isOverdue, sortByTime, withStatus } from '../lib/tasks'
import { CheckCircle, cx } from '../components/ui'
import { Wordmark } from '../components/Brand'

// The desktop app's "today" widget: a small always-on-top window in the top
// right of the screen, shown while the main window is closed. It reads and
// writes the same saved tasks as the planner (the two windows share storage
// and tell each other about changes), so ticking a task here is the same as
// ticking it there, and the planner's own sync saves it to Drive.
//
// It can be minimized to a slim bar (progress and the next task); the desktop
// app shrinks the window to fit and remembers it (desktop/main.cjs).

const desktop = typeof window !== 'undefined' ? window.nineflowDesktop?.widget : undefined
const drag = { WebkitAppRegion: 'drag' }
const noDrag = { WebkitAppRegion: 'no-drag' }

function useStored() {
  const read = useCallback(() => ({
    tasks: loadTasks(), settings: loadSettings(), signedIn: !!currentProfile() && isOnboarded(), now: new Date(),
  }), [])
  const [state, setState] = useState(read)
  useEffect(() => {
    const refresh = () => setState(read())
    const onStorage = (e) => { if (!e.key || e.key.startsWith('daily-planner:')) refresh() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    const tick = setInterval(refresh, 30_000) // a new day, or a change made while this window was asleep
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); clearInterval(tick) }
  }, [read])
  return [state, setState, read]
}

const isActive = (t) => t.status === 'working' || t.status === 'review'

export default function Widget() {
  const [{ tasks, settings, signedIn, now }, setState, read] = useStored()
  setDatePrefs(settings)
  const profile = currentProfile()
  const today = dateKey(now)
  const [collapsed, setCollapsedState] = useState(() => { try { return !!desktop?.isCollapsed?.() } catch { return false } })
  const setCollapsed = (on) => { setCollapsedState(on); desktop?.collapse?.(on) }

  const dark = isDark(settings)
  useEffect(() => {
    applyTheme(document.documentElement, settings)
    desktop?.setDark?.(dark) // the window's own background, seen for a moment while it resizes
  }, [settings.theme, settings.palette, dark])
  // Dark / light here is the planner's own setting, so the two always match (the
  // planner picks the change up from storage, and syncs it like any other setting).
  const toggleTheme = () => {
    const s = loadSettings()
    saveSettings({ ...s, theme: isDark(s) ? 'light' : 'dark' })
    setState(read())
  }

  const { open, done, groups } = useMemo(() => {
    const byDate = (a, b) => a.date.localeCompare(b.date)
    const open = sortByTime(tasks.filter((t) => !t.hold && !t.dropped && t.status !== 'completed' && t.date && t.date <= today)).sort(byDate)
    const now_ = open.filter(isActive)
    const carried = open.filter((t) => !isActive(t) && isOverdue(t, now))
    const rest = open.filter((t) => !isActive(t) && !isOverdue(t, now))
    return {
      open,
      done: tasks.filter((t) => t.status === 'completed' && t.date === today),
      groups: [
        { id: 'now', label: 'In progress', tasks: now_ },
        { id: 'carried', label: 'Carried over', tasks: carried },
        { id: 'today', label: 'Today', tasks: rest },
      ].filter((g) => g.tasks.length),
    }
  }, [tasks, today, now])
  const total = open.length + done.length
  const left = open.reduce((m, t) => m + (Number(t.durationMinutes) || 0), 0)
  const next = groups[0]?.tasks[0]
  const [held, setHeld] = useState(null) // a task whose checklist steps are not ticked yet

  const toggle = (id) => {
    // Start from what is saved right now, not what this window last drew.
    const fresh = loadTasks()
    const t = fresh.find((x) => x.id === id)
    // Checklist steps are ticked in the planner (it lists them); finishing here would skip them.
    if (t && t.status !== 'completed' && checkGate(t).blocked) { setHeld(id); return }
    setHeld(null)
    saveTasks(fresh.map((t) => (t.id === id ? withStatus(t, t.status === 'completed' ? 'todo' : 'completed') : t)))
    setState(read())
  }

  const title = signedIn ? (firstName(profile?.name) ? `${firstName(profile.name)}'s day` : 'Today') : <Wordmark />
  const ring = signedIn && total > 0 ? <Ring done={done.length} total={total} /> : null
  const windowButtons = (
    <div className="flex items-center gap-0.5 shrink-0 -mr-1" style={noDrag}>
      <IconButton onClick={toggleTheme} label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </IconButton>
      <IconButton onClick={() => setCollapsed(!collapsed)} label={collapsed ? "Expand today's list" : "Minimize today's list"}
        title={collapsed ? 'Expand' : 'Minimize to a bar'}>
        {collapsed ? <ChevronDown size={15} /> : <Minus size={15} />}
      </IconButton>
      {desktop && (
        <IconButton onClick={() => desktop.hide()} label="Hide today's list" title="Hide (it stays in the tray)"><X size={15} /></IconButton>
      )}
    </div>
  )

  // ---- minimized: one slim bar ----
  if (collapsed) {
    return (
      <div className="h-screen flex items-center gap-3 px-3 bg-card text-ink font-sans select-none" style={drag}>
        {ring || <span className="h-9 w-9 shrink-0 rounded-full bg-accent-soft inline-flex items-center justify-center"><Sparkles size={15} className="text-lav-fg" /></span>}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight truncate">{title}</p>
          <p className="text-[11.5px] leading-tight truncate text-muted mt-0.5">
            {!signedIn ? 'Open NineFlow to sign in'
              : next ? <><span className="text-faint font-semibold">Next · </span>{next.title}</>
                : total ? 'All done for today' : 'Nothing planned today'}
          </p>
        </div>
        {windowButtons}
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-card text-ink font-sans select-none">
      <header className="flex items-center gap-3 px-4 pt-4 pb-3" style={drag}>
        {ring}
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-faint">{format(now, 'EEEE d MMM')}</p>
          <h1 className="h-display text-[17px] leading-tight truncate">{title}</h1>
        </div>
        {windowButtons}
      </header>

      {signedIn && total > 0 && (
        <div className="mx-4 mb-1 flex items-center gap-1.5 text-[11.5px] text-muted" style={drag}>
          <Stat>{open.length} open</Stat>
          {left > 0 && <Stat>{fmtMinutes(left)} planned</Stat>}
          {done.length > 0 && <Stat tone="text-mint-fg">{done.length} done</Stat>}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-1 pb-2 border-t border-line mt-2" style={noDrag}>
        {!signedIn ? (
          <Empty>Open NineFlow and sign in to see today's tasks here.</Empty>
        ) : total === 0 ? (
          <Empty icon>Nothing planned for today.</Empty>
        ) : (
          <>
            {open.length === 0 && <Empty icon tone="text-mint-fg">All done for today.</Empty>}
            {groups.map((g) => (
              <section key={g.id} className="pt-2">
                <Heading tone={g.id === 'carried' ? 'text-coral-fg' : g.id === 'now' ? 'text-sky-fg' : 'text-faint'} count={g.tasks.length}>{g.label}</Heading>
                <ul>
                  {g.tasks.map((t) => (
                    <Row key={t.id} task={t} onToggle={() => toggle(t.id)} held={held === t.id} onOpen={desktop ? () => desktop.openApp() : null}
                      status={t.status === 'working' ? ['Working', 'bg-sky text-sky-fg'] : t.status === 'review' ? ['In review', 'bg-violet text-violet-fg'] : null}
                      sub={<>
                        <span className={cx(isOverdue(t, now) && 'text-coral-fg font-semibold')}>
                          {isOverdue(t, now) ? carriedLabel(t.date, now) : (dueLabel(t, now) || '').replace(/^Today ?/, '') || 'Any time'}
                        </span>
                        <span className="text-line" aria-hidden="true"> • </span>
                        {fmtMinutes(t.durationMinutes)}
                      </>} />
                  ))}
                </ul>
              </section>
            ))}
            {done.length > 0 && (
              <section className="pt-2">
                <Heading count={done.length}>Done today</Heading>
                <ul>{done.map((t) => <Row key={t.id} task={t} done onToggle={() => toggle(t.id)} />)}</ul>
              </section>
            )}
          </>
        )}
      </div>

      {desktop && (
        <footer className="px-3 py-2.5 border-t border-line" style={noDrag}>
          <button type="button" onClick={() => desktop.openApp()}
            className="w-full h-9 rounded-xl inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-white bg-brand hover:brightness-110 active:scale-[0.98] transition">
            Open NineFlow <ExternalLink size={13} />
          </button>
        </footer>
      )}
    </div>
  )
}

// How much of today is done, as a ring with the count inside.
function Ring({ done, total }) {
  const r = 15
  const c = 2 * Math.PI * r
  const pct = total ? done / total : 0
  return (
    <span className="relative h-10 w-10 shrink-0" title={`${done} of ${total} done`} role="img" aria-label={`${done} of ${total} done`}>
      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-line" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
          className={cx('transition-[stroke-dashoffset] duration-500', pct >= 1 ? 'stroke-mint-fg' : 'stroke-accent')}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ opacity: done ? 1 : 0 }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10.5px] font-bold tnum">{done}/{total}</span>
    </span>
  )
}

function IconButton({ onClick, label, title, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title}
      className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-faint hover:bg-subtle hover:text-ink transition">
      {children}
    </button>
  )
}

const Stat = ({ children, tone }) => (
  <span className={cx('rounded-md bg-subtle px-1.5 py-0.5 font-semibold tnum', tone)}>{children}</span>
)

const Heading = ({ children, count, tone = 'text-faint' }) => (
  <p className={cx('flex items-center gap-1.5 px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em]', tone)}>
    {children}<span className="text-faint font-semibold tnum">{count}</span>
  </p>
)

const Empty = ({ children, icon, tone = 'text-muted' }) => (
  <p className={cx('px-2 py-5 text-sm inline-flex items-center gap-2', tone)}>
    {icon && <Sparkles size={14} className="text-lav-fg" />}{children}
  </p>
)

function Row({ task, sub, status, done = false, onToggle, held = false, onOpen }) {
  return (
    <li className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-subtle transition-colors">
      <CheckCircle checked={done} onToggle={onToggle} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={cx('text-[13px] font-semibold leading-snug truncate', done && 'line-through text-faint')} title={task.title}>{task.title}</p>
        {held
          ? <p className="text-[11px] font-semibold text-lav-fg" role="status">Has unticked steps. {onOpen && <button type="button" onClick={onOpen} className="underline underline-offset-2">Open NineFlow to tick them</button>}</p>
          : sub && <p className="text-[11px] leading-snug truncate text-faint mt-0.5">{sub}</p>}
      </div>
      {status && !done && <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold', status[1])}>{status[0]}</span>}
    </li>
  )
}
