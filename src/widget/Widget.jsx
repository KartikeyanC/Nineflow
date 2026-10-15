import { applyTheme } from '../lib/themes'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Sparkles, X } from 'lucide-react'
import { format } from 'date-fns'
import { loadSettings, loadTasks, saveTasks, isOnboarded } from '../lib/storage'
import { currentProfile, firstName } from '../lib/profiles'
import { carriedLabel, checkGate, dateKey, dueLabel, fmtMinutes, isOverdue, sortByTime, withStatus } from '../lib/tasks'
import { CheckCircle, cx } from '../components/ui'
import { Wordmark } from '../components/Brand'

// The desktop app's "today" widget: a small always-on-top window in the top
// right of the screen, shown while the main window is closed. It reads and
// writes the same saved tasks as the planner (the two windows share storage
// and tell each other about changes), so ticking a task here is the same as
// ticking it there, and the planner's own sync saves it to Drive.

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

export default function Widget() {
  const [{ tasks, settings, signedIn, now }, setState, read] = useStored()
  const profile = currentProfile()
  const today = dateKey(now)

  useEffect(() => { applyTheme(document.documentElement, settings) }, [settings.theme, settings.palette])

  const { open, done } = useMemo(() => {
    const byDate = (a, b) => a.date.localeCompare(b.date)
    return {
      open: sortByTime(tasks.filter((t) => !t.hold && !t.dropped && t.status !== 'completed' && t.date && t.date <= today)).sort(byDate),
      done: tasks.filter((t) => t.status === 'completed' && t.date === today),
    }
  }, [tasks, today])
  const total = open.length + done.length
  const [held, setHeld] = useState(null) // a task whose required steps are not ticked yet

  const toggle = (id) => {
    // Start from what is saved right now, not what this window last drew.
    const fresh = loadTasks()
    const t = fresh.find((x) => x.id === id)
    // Required steps are ticked in the planner (it lists them); finishing here would skip them.
    if (t && t.status !== 'completed' && checkGate(t).blocked) { setHeld(id); return }
    setHeld(null)
    saveTasks(fresh.map((t) => (t.id === id ? withStatus(t, t.status === 'completed' ? 'todo' : 'completed') : t)))
    setState(read())
  }

  return (
    <div className="h-screen flex flex-col bg-card text-ink font-sans select-none">
      <header className="flex items-start gap-2 px-4 pt-3.5 pb-2" style={drag}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{format(now, 'EEEE, MMM d')}</p>
          <h1 className="h-display text-lg leading-tight truncate">
            {signedIn ? (firstName(profile?.name) ? `${firstName(profile.name)}'s day` : 'Today') : <Wordmark />}
          </h1>
        </div>
        {signedIn && total > 0 && (
          <span className="mt-0.5 pill bg-accent-soft text-lav-fg tnum" title={`${done.length} of ${total} done`}>{done.length}/{total}</span>
        )}
        {desktop && (
          <button type="button" onClick={() => desktop.hide()} title="Hide this list (it stays in the tray)" aria-label="Hide today's list" style={noDrag}
            className="h-7 w-7 -mr-1 rounded-full inline-flex items-center justify-center text-faint hover:bg-page hover:text-ink transition">
            <X size={15} />
          </button>
        )}
      </header>

      {signedIn && total > 0 && (
        <div className="mx-4 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${(done.length / total) * 100}%` }} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-1" style={noDrag}>
        {!signedIn ? (
          <p className="px-2 py-4 text-sm text-muted">Open NineFlow and sign in to see today's tasks here.</p>
        ) : total === 0 ? (
          <p className="px-2 py-6 text-sm text-muted inline-flex items-center gap-2"><Sparkles size={14} className="text-lav-fg" /> Nothing planned for today.</p>
        ) : (
          <>
            {open.length === 0 && <p className="px-2 py-3 text-sm font-semibold text-mint-fg inline-flex items-center gap-2"><Sparkles size={14} /> All done for today.</p>}
            <ul className="space-y-0.5">
              {open.map((t) => (
                <Row key={t.id} task={t} onToggle={() => toggle(t.id)} held={held === t.id} onOpen={() => desktop?.openApp()}
                  sub={<>
                    <span className={cx(isOverdue(t, now) && 'text-coral-fg font-semibold')}>{isOverdue(t, now) ? carriedLabel(t.date, now) : dueLabel(t, now)}</span>
                    {' · '}{fmtMinutes(t.durationMinutes)}
                    {t.status === 'working' && <span className="text-sky-fg font-semibold"> · working</span>}
                    {t.status === 'review' && <span className="text-violet-fg font-semibold"> · in review</span>}
                  </>} />
              ))}
            </ul>
            {done.length > 0 && (
              <>
                <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Done today</p>
                <ul className="space-y-0.5">
                  {done.map((t) => <Row key={t.id} task={t} done onToggle={() => toggle(t.id)} />)}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {desktop && (
        <footer className="px-3 pb-3 pt-2 border-t border-line" style={noDrag}>
          <button type="button" onClick={() => desktop.openApp()}
            className="w-full h-9 rounded-full inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-white bg-brand hover:brightness-110 active:scale-[0.98] transition">
            Open NineFlow <ExternalLink size={13} />
          </button>
        </footer>
      )}
    </div>
  )
}

function Row({ task, sub, done = false, onToggle, held = false, onOpen }) {
  return (
    <li className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-page transition">
      <CheckCircle checked={done} onToggle={onToggle} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={cx('text-[13px] font-semibold truncate', done && 'line-through text-faint')} title={task.title}>{task.title}</p>
        {held
          ? <p className="text-[10px] font-semibold text-lav-fg" role="status">Has required steps. {onOpen && <button type="button" onClick={onOpen} className="underline underline-offset-2">Open NineFlow to tick them</button>}</p>
          : sub && <p className="text-[10px] truncate text-faint">{sub}</p>}
      </div>
    </li>
  )
}
