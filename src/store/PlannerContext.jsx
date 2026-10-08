import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_SETTINGS, isOnboarded, loadFocus, loadHabits, loadSettings, loadTasks, markOnboarded, normalizeTasks,
  saveFocus, saveHabits, saveSettings, saveTasks, uid,
} from '../lib/storage'
import { createTask, dateKey, todayKey, withSessionPaused, withSessionResumed, withStatus } from '../lib/tasks'
import { generateSample } from '../lib/sample'
import { ensureRecurrences } from '../lib/recurrence'
import { planDay as planDayPure } from '../lib/schedule'

const PlannerContext = createContext(null)

// Two short tones; higher pair when a focus block ends, lower when a break ends.
function chime(phase) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const notes = phase === 'focus' ? [880, 1174] : [660, 523]
    notes.forEach((hz, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = hz
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.32)
    })
  } catch { /* no audio available */ }
}

export function PlannerProvider({ children }) {
  const [tasks, setTasks] = useState(loadTasks)
  const [settings, setSettings] = useState(loadSettings)
  const [habits, setHabits] = useState(loadHabits)
  useEffect(() => saveHabits(habits), [habits])

  // UI state that several parts of the app share.
  const [view, setView] = useState('dashboard')
  const [selectedId, setSelectedId] = useState(null)
  const [quickAdd, setQuickAdd] = useState(null) // null | { date?, status? }
  const [dashboardDate, setDashboardDate] = useState(todayKey)

  // Open a given day on the Dashboard (Month tiles, busiest-day cards).
  const openDay = useCallback((key) => {
    setDashboardDate(key)
    setView('dashboard')
  }, [])

  useEffect(() => saveTasks(tasks), [tasks])
  useEffect(() => {
    saveSettings(settings)
    document.documentElement.classList.toggle('dark', settings.theme === 'dark')
  }, [settings])

  // A ticking clock so "time spent" on Working tasks updates while you watch.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const [onboarded, setOnboardedState] = useState(isOnboarded)
  const setOnboarded = useCallback(() => { markOnboarded(); setOnboardedState(true) }, [])

  // A preset status other than todo goes through withStatus so sessions stay right.
  // A recurrence makes the new task the head of its own series.
  // `lastAdded` drives the "Add to Google Calendar" offer after adding.
  const [lastAdded, setLastAdded] = useState(null)
  const addTask = useCallback((fields) => {
    const { status, ...rest } = fields || {}
    let task = createTask(rest)
    if (task.recurrence) task.seriesId = task.id
    if (status && status !== 'todo') task = withStatus(task, status)
    setTasks((ts) => [...ts, task])
    if (task.date) setLastAdded({ id: task.id, at: Date.now() })
    return task
  }, [])

  // ---- Pop-out quick list (Document Picture-in-Picture, popup fallback) ----
  const [pipWin, setPipWin] = useState(null)
  const [pipError, setPipError] = useState(null)

  // Dress a fresh window with the app's styles and start rendering into it.
  const adoptWindow = useCallback((win) => {
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) win.document.head.appendChild(node.cloneNode(true))
    win.document.documentElement.className = document.documentElement.className
    win.document.body.style.margin = '0'
    win.addEventListener('pagehide', () => setPipWin(null))
    setPipWin(win)
  }, [])

  const openPip = useCallback(async () => {
    if (pipWin && !pipWin.closed) { pipWin.focus?.(); return }
    let win = null
    try {
      if (window.documentPictureInPicture?.requestWindow) {
        win = await window.documentPictureInPicture.requestWindow({ width: 340, height: 520 })
      }
    } catch { win = null }
    if (!win) {
      win = window.open('', 'daily-planner-quick-list', 'popup=yes,width=340,height=520')
      if (!win) {
        setPipError('Your browser blocked the pop-out. Allow pop-ups for this site and try again.')
        setTimeout(() => setPipError(null), 6000)
        return
      }
      win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Quick list · Daily Planner</title></head><body></body></html>')
      win.document.close()
    }
    adoptWindow(win)
  }, [pipWin, adoptWindow])

  // Dev-only hook so the pop-out rendering can be exercised without a real window.
  useEffect(() => {
    if (import.meta.env.DEV) window.__planner = { adoptWindow }
  }, [adoptWindow])
  const closePip = useCallback(() => { try { pipWin?.close() } catch { /* already gone */ } setPipWin(null) }, [pipWin])
  // Keep the pop-out's theme in step with the app.
  useEffect(() => {
    if (pipWin && !pipWin.closed) pipWin.document.documentElement.classList.toggle('dark', settings.theme === 'dark')
  }, [pipWin, settings.theme])

  // Keep every series materialized for the rolling horizon. Adding instances
  // re-runs this once more, which then finds nothing to add.
  const todayStr = dateKey(now)
  useEffect(() => {
    const extra = ensureRecurrences(tasks, now)
    if (extra.length) setTasks((ts) => [...ts, ...extra])
  }, [tasks, todayStr]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set, change or remove the repeat rule for a task's whole series.
  // Future open occurrences are dropped and regenerated under the new rule.
  const setRecurrence = useCallback((id, recurrence) => {
    setTasks((ts) => {
      const t = ts.find((x) => x.id === id)
      if (!t) return ts
      const sid = t.seriesId || t.id
      const inSeries = (x) => x.id === id || x.seriesId === sid
      const kept = ts.filter((x) => !(inSeries(x) && x.id !== id && x.date > t.date && x.status === 'todo'))
      if (!recurrence) return kept.map((x) => (inSeries(x) ? { ...x, recurrence: null, seriesId: null } : x))
      const rec = { freq: recurrence.freq, until: recurrence.until ?? null, skip: t.recurrence?.skip ?? [] }
      return kept.map((x) => (inSeries(x) ? { ...x, recurrence: rec, seriesId: sid } : x))
    })
  }, [])

  // Timebox a day's unscheduled open tasks into free slots. Returns the plan.
  const planDay = useCallback((key) => {
    const plan = planDayPure(tasks, key, new Date())
    if (plan.patches.length) {
      const byId = new Map(plan.patches.map((p) => [p.id, p.startTime]))
      setTasks((ts) => ts.map((t) => (byId.has(t.id) ? { ...t, startTime: byId.get(t.id) } : t)))
    }
    return plan
  }, [tasks])

  // Copy an occurrence's editable details onto the series' future open occurrences.
  const applyToUpcoming = useCallback((id) => {
    setTasks((ts) => {
      const t = ts.find((x) => x.id === id)
      if (!t?.seriesId) return ts
      const { title, description, startTime, durationMinutes, category, priority } = t
      return ts.map((x) =>
        x.seriesId === t.seriesId && x.id !== id && x.date > t.date && x.status === 'todo'
          ? { ...x, title, description, startTime, durationMinutes, category, priority }
          : x,
      )
    })
  }, [])

  const removeSeries = useCallback((seriesId) => {
    setTasks((ts) => ts.filter((t) => t.seriesId !== seriesId))
    setSelectedId(null)
  }, [])

  // Replace everything with a backup or sample set.
  const importData = useCallback((data) => {
    setTasks(normalizeTasks(data.tasks || []))
    if (data.settings) setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...data.settings }))
    if (Array.isArray(data.habits)) setHabits(data.habits)
    setSelectedId(null)
  }, [])

  const loadSample = useCallback(() => {
    const { tasks: t, habits: h } = generateSample(settings.categories)
    setTasks(t)
    setHabits(h)
    setSelectedId(null)
  }, [settings.categories])

  const clearAll = useCallback(() => {
    setTasks([])
    setHabits([])
    setSelectedId(null)
  }, [])

  const updateTask = useCallback((id, patch) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const setStatus = useCallback((id, status) => {
    if (!status) return
    setTasks((ts) => ts.map((t) => (t.id === id ? withStatus(t, status) : t)))
  }, [])

  const toggleComplete = useCallback((id) => {
    setTasks((ts) =>
      ts.map((t) =>
        t.id === id ? withStatus(t, t.status === 'completed' ? 'todo' : 'completed') : t,
      ),
    )
  }, [])

  // Move a task to `status` and place it before `beforeId` in the global
  // array (append when beforeId is null). Column order is the array order.
  const moveTask = useCallback((id, status, beforeId = null) => {
    setTasks((ts) => {
      const task = ts.find((t) => t.id === id)
      if (!task) return ts
      const moved = withStatus(task, status)
      const rest = ts.filter((t) => t.id !== id)
      const at = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1
      if (at < 0) return [...rest, moved]
      return [...rest.slice(0, at), moved, ...rest.slice(at)]
    })
  }, [])

  // Reorder the tasks of one status in place; other tasks keep their slots.
  const sortStatus = useCallback((status, by) => {
    const PRI = { high: 0, medium: 1, low: 2 }
    const cmp =
      by === 'priority'
        ? (a, b) => PRI[a.priority] - PRI[b.priority] || (a.date || '9').localeCompare(b.date || '9')
        : (a, b) => (a.date || '9').localeCompare(b.date || '9') || (a.startTime || '9').localeCompare(b.startTime || '9')
    setTasks((ts) => {
      const sorted = ts.filter((t) => t.status === status).sort(cmp)
      let i = 0
      return ts.map((t) => (t.status === status ? sorted[i++] : t))
    })
  }, [])

  const moveOverdueToToday = useCallback((status = null) => {
    const today = todayKey()
    setTasks((ts) =>
      ts.map((t) =>
        t.date && t.date < today && t.status !== 'completed' && (!status || t.status === status)
          ? { ...t, date: today }
          : t,
      ),
    )
  }, [])

  const clearCompleted = useCallback(() => {
    setTasks((ts) => ts.filter((t) => t.status !== 'completed'))
  }, [])

  // Deleting one occurrence of a series records its date as skipped so the
  // horizon fill doesn't bring it back.
  const removeTask = useCallback((id) => {
    setTasks((ts) => {
      const t = ts.find((x) => x.id === id)
      const rest = ts.filter((x) => x.id !== id)
      if (!t?.seriesId || !t.recurrence) return rest
      return rest.map((x) =>
        x.seriesId === t.seriesId ? { ...x, recurrence: { ...x.recurrence, skip: [...(x.recurrence.skip || []), t.date] } } : x,
      )
    })
    setSelectedId((s) => (s === id ? null : s))
  }, [])

  const updateSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const addCategory = useCallback((name, color) => {
    setSettings((s) => ({
      ...s,
      categories: [...s.categories, { id: uid(), name, color }],
    }))
  }, [])

  const updateCategory = useCallback((id, patch) => {
    setSettings((s) => ({
      ...s,
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }, [])

  // Tasks in a removed category fall back to the first remaining one.
  const removeCategory = useCallback((id) => {
    setSettings((s) => {
      if (s.categories.length <= 1) return s
      const next = s.categories.filter((c) => c.id !== id)
      setTasks((ts) => ts.map((t) => (t.category === id ? { ...t, category: next[0].id } : t)))
      return { ...s, categories: next }
    })
  }, [])

  // ---- Pomodoro focus mode -------------------------------------------
  // The task stays in Working for the whole pomodoro session. Only the
  // session log opens and closes, so breaks and pauses are never counted
  // as focus time. Status changes only at start (Working) and end (To Do
  // or Completed). Declared after setStatus, which the callbacks depend on.
  const [focus, setFocus] = useState(loadFocus)
  useEffect(() => saveFocus(focus), [focus])
  const pomo = settings.pomodoro
  const phaseMs = useCallback((phase) => (phase === 'focus' ? pomo.focus : phase === 'short' ? pomo.short : pomo.long) * 60_000, [pomo])

  const pauseSession = useCallback((id) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? withSessionPaused(t) : t)))
  }, [])
  const resumeSession = useCallback((id) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? withSessionResumed(withStatus(t, 'working')) : t)))
  }, [])

  const startFocus = useCallback((taskId) => {
    setFocus({ taskId, phase: 'focus', running: true, endsAt: Date.now() + phaseMs('focus'), remainingMs: null, completed: 0, open: true })
    resumeSession(taskId)
  }, [phaseMs, resumeSession])

  const pauseFocus = useCallback(() => {
    setFocus((f) => {
      if (!f || !f.running) return f
      if (f.phase === 'focus') pauseSession(f.taskId)
      return { ...f, running: false, remainingMs: Math.max(0, f.endsAt - Date.now()), endsAt: null }
    })
  }, [pauseSession])

  const resumeFocus = useCallback(() => {
    setFocus((f) => {
      if (!f || f.running) return f
      if (f.phase === 'focus') resumeSession(f.taskId)
      return { ...f, running: true, endsAt: Date.now() + (f.remainingMs ?? phaseMs(f.phase)), remainingMs: null }
    })
  }, [phaseMs, resumeSession])

  // Move to the next phase (called on expiry or Skip).
  const advanceFocus = useCallback(() => {
    setFocus((f) => {
      if (!f) return f
      let next, completed = f.completed
      if (f.phase === 'focus') {
        completed += 1
        next = completed % pomo.every === 0 ? 'long' : 'short'
        pauseSession(f.taskId)
      } else {
        next = 'focus'
        resumeSession(f.taskId)
      }
      return { ...f, phase: next, completed, running: true, endsAt: Date.now() + phaseMs(next), remainingMs: null }
    })
  }, [phaseMs, pomo.every, pauseSession, resumeSession])

  // Ending the session leaves Working (closing any open session); ✓ completes.
  const stopFocus = useCallback((complete = false) => {
    setFocus((f) => {
      if (f) setStatus(f.taskId, complete ? 'completed' : 'todo')
      return null
    })
  }, [setStatus])

  const setFocusOpen = useCallback((open) => setFocus((f) => (f ? { ...f, open } : f)), [])

  // Tick: expire phases and keep the tab title informative.
  useEffect(() => {
    if (!focus?.running) {
      if (!focus) document.title = 'Daily Planner'
      return
    }
    const id = setInterval(() => {
      const left = focus.endsAt - Date.now()
      if (left <= 0) { chime(focus.phase); advanceFocus() }
      else {
        const m = Math.floor(left / 60_000), s = Math.floor((left % 60_000) / 1000)
        document.title = `${m}:${String(s).padStart(2, '0')} · ${focus.phase === 'focus' ? 'Focus' : 'Break'}`
      }
    }, 1000)
    return () => clearInterval(id)
  }, [focus, advanceFocus])

  const addHabit = useCallback((name) => {
    setHabits((hs) => [...hs, { id: uid(), name, createdAt: new Date().toISOString(), done: [] }])
  }, [])

  const removeHabit = useCallback((id) => {
    setHabits((hs) => hs.filter((h) => h.id !== id))
  }, [])

  const toggleHabit = useCallback((id, key) => {
    setHabits((hs) =>
      hs.map((h) =>
        h.id === id ? { ...h, done: h.done.includes(key) ? h.done.filter((k) => k !== key) : [...h.done, key] } : h,
      ),
    )
  }, [])

  const categoryById = useMemo(() => {
    const m = new Map(settings.categories.map((c) => [c.id, c]))
    return (id) => m.get(id) || settings.categories[0]
  }, [settings.categories])

  const value = useMemo(
    () => ({
      tasks,
      settings,
      now,
      view,
      setView,
      selectedId,
      setSelectedId,
      quickAdd,
      setQuickAdd,
      dashboardDate,
      setDashboardDate,
      openDay,
      addTask,
      updateTask,
      setStatus,
      toggleComplete,
      moveTask,
      sortStatus,
      moveOverdueToToday,
      clearCompleted,
      removeTask,
      setRecurrence,
      removeSeries,
      applyToUpcoming,
      planDay,
      focus,
      startFocus,
      pauseFocus,
      resumeFocus,
      advanceFocus,
      stopFocus,
      setFocusOpen,
      lastAdded,
      setLastAdded,
      pipWin,
      pipError,
      openPip,
      closePip,
      updateSettings,
      addCategory,
      updateCategory,
      removeCategory,
      categoryById,
      habits,
      addHabit,
      removeHabit,
      toggleHabit,
      onboarded,
      setOnboarded,
      importData,
      loadSample,
      clearAll,
    }),
    [
      tasks, settings, now, view, selectedId, quickAdd, dashboardDate, openDay,
      addTask, updateTask, setStatus, toggleComplete, moveTask, sortStatus,
      moveOverdueToToday, clearCompleted, removeTask, setRecurrence, removeSeries, applyToUpcoming, planDay,
      focus, startFocus, pauseFocus, resumeFocus, advanceFocus, stopFocus, setFocusOpen,
      lastAdded, setLastAdded, pipWin, pipError, openPip, closePip,
      updateSettings, addCategory, updateCategory, removeCategory, categoryById,
      habits, addHabit, removeHabit, toggleHabit,
      onboarded, setOnboarded, importData, loadSample, clearAll,
    ],
  )

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
}

export function usePlanner() {
  const ctx = useContext(PlannerContext)
  if (!ctx) throw new Error('usePlanner must be used inside PlannerProvider')
  return ctx
}
