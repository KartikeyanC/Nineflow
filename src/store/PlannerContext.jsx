import React, { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_SETTINGS, isOnboarded, loadFocus, loadHabits, loadSettings, loadTasks, markOnboarded, normalizeTasks,
  onSaveStatus, saveFocus, saveHabits, saveSettings, saveTasks, syncedKeys, uid,
} from '../lib/storage'
import { emptyWork, saveWork, workKey } from '../work/workStore'
import { cleanNtpc, emptyNtpc, ntpcKey, saveNtpc } from '../exams/ntpc/store'
import { EXAMS } from '../exams'
import { DROP_KEEP_DAYS, carryForward, checkGate, createTask, dateKey, isParked, todayKey, withDate, withSessionPaused, withSessionResumed, withStatus } from '../lib/tasks'
import { generateSample } from '../lib/sample'
import { dueReminders, nagDue, reminderSchedule } from '../lib/taskMeta'
import { onPushOpenTask, pushEnabled, syncPush } from '../lib/webPush'
import { confirmInbox, emailsToTasks, fetchInbox, inboxAvailable } from '../lib/emailInbox'
import { parseQuickAdd } from '../lib/nlp'
import { forgetAllConnections } from '../lib/connections'
import { busyFor } from '../lib/gcalEvents'
import { baseOfColumn, cleanColumns, columnOf, isOriginal } from '../lib/columns'
import { currentProfileId } from '../lib/profiles'
import { applyTheme } from '../lib/themes'
import { setDatePrefs } from '../lib/dateFormat'
import { removeTasksFromWorkspace, sendTasksToWorkspace } from '../lib/workspaces'
import { ensureRecurrences } from '../lib/recurrence'
import { planDay as planDayPure } from '../lib/schedule'
import { withHistory } from '../lib/taskHistory'
import { hhmm, toMin, workEnd } from '../lib/capacity'
import { loadFocus as loadWorkFocus, saveFocus as saveWorkFocus, shows, stampFor } from '../lib/workFor'

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
  const [tasks, setTasksRaw] = useState(loadTasks)
  // Every change made through an update (setTasks(fn)) is written into the changed tasks' history
  // (lib/taskHistory.js). Replacing the whole list (undo, a backup, another tab, sign-in) is not a
  // change to note, so it goes straight in.
  const setTasks = useCallback((u) => {
    if (typeof u !== 'function') { setTasksRaw(u); return }
    setTasksRaw((prev) => withHistory(prev, u(prev)))
  }, [])
  const [settings, setSettings] = useState(loadSettings)
  // Date order and clock, set before anything below is drawn (lib/dateFormat.js).
  setDatePrefs(settings)
  const [habits, setHabits] = useState(loadHabits)
  useEffect(() => saveHabits(habits), [habits])

  // UI state that several parts of the app share.
  const [view, setViewNow] = useState('dashboard')
  // Switching pages renders at low priority, so the current page stays on
  // screen until the next one is ready instead of flashing blank.
  const setView = useCallback((v) => startTransition(() => setViewNow(v)), [])
  const [selectedId, setSelectedId] = useState(null)
  const [quickAdd, setQuickAdd] = useState(null) // null | { date?, status? }
  const [goalPlannerOpen, setGoalPlannerOpen] = useState(false) // the "plan a goal" window
  const [promptListOpen, setPromptListOpen] = useState(false) // the "prompt to list" window
  const [askOpen, setAskOpen] = useState(false) // the "ask NineFlow" window
  // The day the planner is looking at, shared by every view: the Dashboard
  // shows it, the Week calendar shows its day or week, Month shows its month.
  const [dashboardDate, setDashboardDate] = useState(todayKey)
  // The calendar (Week view) shows one day or the whole week. Phones start on a day.
  const [calendarMode, setCalendarMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'day' : 'week'))

  // Open a given day in the calendar's day view (Month tiles, busiest-day cards).
  const openDay = useCallback((key) => {
    setDashboardDate(key)
    setCalendarMode('day')
    setView('week')
  }, [setView])

  useEffect(() => saveTasks(tasks), [tasks])
  useEffect(() => {
    saveSettings(settings)
    applyTheme(document.documentElement, settings)
  }, [settings])
  // 'Match system' follows the device when it switches between light and dark.
  useEffect(() => {
    if (settings.theme !== 'system' || typeof matchMedia !== 'function') return undefined
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme(document.documentElement, settingsRef.current || settings)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [settings.theme]) // eslint-disable-line react-hooks/exhaustive-deps

  // Latest tasks for callbacks that need them without re-creating themselves.
  const tasksRef = useRef(tasks)
  const activeTasks = useMemo(() => (tasks.some(isParked) ? tasks.filter((t) => !isParked(t)) : tasks), [tasks])
  const settingsRef = useRef(null) // latest settings for timers that must not restart on every change
  tasksRef.current = tasks
  settingsRef.current = settings

  // "Work for": show only one company / client / project's tasks (null = all). Per device, like the
  // workspace. Every plan and list reads `tasks`, so they all follow it; new tasks get it too.
  const [workFocus, setWorkFocusState] = useState(loadWorkFocus)
  const workFocusRef = useRef(workFocus)
  workFocusRef.current = workFocus
  const setWorkFocus = useCallback((v) => { setWorkFocusState(v || null); saveWorkFocus(v || null) }, [])
  const archived = settings.workFor?.archived
  const shownTasks = useMemo(() => (workFocus || archived?.length ? activeTasks.filter((t) => shows(t, workFocus, settingsRef.current)) : activeTasks), [activeTasks, workFocus, archived]) // eslint-disable-line react-hooks/exhaustive-deps
  // A new task is for the one being shown, or the one set in Settings, unless it already says.
  const stamped = (fields) => {
    if (fields && fields.client !== undefined) return fields
    const client = stampFor(workFocusRef.current, settingsRef.current)
    return client ? { ...fields, client } : fields
  }

  // A write that fails (storage full, private mode) is reported here so the
  // UI can tell the user their changes are not being kept.
  const [saveError, setSaveError] = useState(false)
  useEffect(() => onSaveStatus((ok) => setSaveError(!ok)), [])

  // Undo for destructive actions: keep the task list from just before the
  // action. The toast that offers it dismisses itself after a few seconds.
  const [undo, setUndo] = useState(null) // { id, label, snapshot, onUndo? } | null
  const undoRef = useRef(undo)
  undoRef.current = undo
  const offerUndo = useCallback((label, onUndo) => setUndo({ id: Date.now(), label, snapshot: tasksRef.current, onUndo }), [])
  const undoLast = useCallback(() => {
    const u = undoRef.current
    if (!u) return
    u.onUndo?.()
    setTasks(u.snapshot)
    setUndo(null)
  }, [])
  const dismissUndo = useCallback(() => setUndo(null), [])

  // A ticking clock so "time spent" on Working tasks updates while you watch.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Bumped when another window or the cloud hands over fresh tasks, so the carry-over below runs on them too.
  const [syncTick, setSyncTick] = useState(0)

  const [onboarded, setOnboardedState] = useState(isOnboarded)
  const setOnboarded = useCallback(() => { markOnboarded(); setOnboardedState(true) }, [])

  // A preset status other than todo goes through withStatus so sessions stay right.
  // A recurrence makes the new task the head of its own series.
  // `lastAdded` drives the "Add to Google Calendar" offer after adding.
  const [lastAdded, setLastAdded] = useState(null)
  const addTask = useCallback((fields) => {
    const { status, ...rest } = fields || {}
    let task = createTask(stamped(rest))
    if (task.recurrence) task.seriesId = task.id
    // (the day picked in the dialog stays: only finishing an existing task makes today its day)
    if (status && status !== 'todo') task = { ...withStatus(task, status), column: rest.column ?? null, date: task.date, startDate: task.startDate }
    setTasks((ts) => [...ts, task])
    if (task.date) setLastAdded({ id: task.id, at: Date.now() })
    return task
  }, [])

  // Move one task (or a list of ids) to another workspace; they leave this one.
  // One Undo brings them all back.
  const moveToWorkspace = useCallback((idOrIds, workspace) => {
    const pid = currentProfileId()
    const want = new Set(Array.isArray(idOrIds) ? idOrIds : [idOrIds])
    const found = tasksRef.current.filter((t) => want.has(t.id))
    if (!pid || !found.length) return false
    const carried = found.map((task) => ({ ...(task.status === 'working' ? withStatus(task, 'todo') : task), recurrence: null, seriesId: null, interruption: null }))
    const sent = sendTasksToWorkspace(pid, workspace.id, carried)
    if (!sent) return false
    offerUndo(
      found.length === 1 ? `Moved “${found[0].title || 'Untitled'}” to ${workspace.name}` : `Moved ${found.length} tasks to ${workspace.name}`,
      () => removeTasksFromWorkspace(pid, workspace.id, sent),
    )
    setTasks((ts) => ts.filter((t) => !want.has(t.id)))
    setSelectedId(null)
    return true
  }, [offerUndo])

  // Several tasks at once (a planned goal). One undo step takes them all back.
  const addTasks = useCallback((list, undoLabel) => {
    if (!list.length) return []
    offerUndo(undoLabel || `Added ${list.length} tasks`)
    const made = list.map((fields) => { const t = createTask(stamped(fields)); if (t.recurrence) t.seriesId = t.id; return t })
    setTasks((ts) => [...ts, ...made])
    return made
  }, [offerUndo])

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
      win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Quick list · NineFlow</title></head><body></body></html>')
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
    if (pipWin && !pipWin.closed) applyTheme(pipWin.document.documentElement, settings)
  }, [pipWin, settings.theme, settings.palette])

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

  // Timebox a day's unscheduled open tasks into free slots within your
  // working hours. previewPlan only computes; applyPlan writes it (with undo);
  // planDay does both at once.
  const previewPlan = useCallback((key) => {
    const h = settings.workHours
    // A night shift is planned up to midnight; the rest belongs to the next day.
    return planDayPure(tasks, key, new Date(), { start: toMin(h.start), end: Math.min(workEnd(h), 1440), busy: busyFor(key) })
  }, [tasks, settings.workHours])
  const applyPlan = useCallback((plan) => {
    if (!plan?.patches.length) return
    offerUndo(`Planned ${plan.patches.length} task${plan.patches.length === 1 ? '' : 's'} into free slots`)
    const byId = new Map(plan.patches.map((p) => [p.id, p.startTime]))
    setTasks((ts) => ts.map((t) => (byId.has(t.id) ? { ...t, startTime: byId.get(t.id) } : t)))
  }, [offerUndo])
  const planDay = useCallback((key) => {
    const plan = previewPlan(key)
    applyPlan(plan)
    return plan
  }, [previewPlan, applyPlan])

  // Move several tasks to a date (null = Someday, which also drops the time),
  // with one undo for the lot.
  const moveTasksTo = useCallback((ids, date, label) => {
    if (!ids.length) return
    const set = new Set(ids)
    offerUndo(label || `Moved ${ids.length} task${ids.length === 1 ? '' : 's'}`)
    setTasks((ts) => ts.map((t) => (set.has(t.id) ? { ...withDate(t, date), ...(date ? {} : { startTime: null }) } : t)))
  }, [offerUndo])

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
    offerUndo('Deleted the repeating series')
    setTasks((ts) => ts.filter((t) => t.seriesId !== seriesId))
    setSelectedId(null)
  }, [offerUndo])

  // Replace everything with a backup or sample set. A full backup also
  // carries Work OS, which loads from storage when its section opens.
  // Other screens (Work OS, NTPC) reload their own copy when told their key changed.
  const announce = (key) => { try { window.dispatchEvent(new StorageEvent('storage', { key })) } catch { /* ignore */ } }

  const importData = useCallback((data) => {
    if (data.work && typeof data.work === 'object') saveWork(data.work)
    if (data.ntpc && typeof data.ntpc === 'object') { saveNtpc(cleanNtpc(data.ntpc)); announce(ntpcKey()) }
    // Every exam's progress (backups from before other exams have only data.ntpc, read above).
    for (const exam of EXAMS) {
      const d = data.exams?.[exam.id]
      if (d && typeof d === 'object') { saveNtpc(cleanNtpc(d, exam), exam); announce(ntpcKey(exam)) }
    }
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

  // Everything in this profile: tasks, habits, notes, Work OS and NTPC. Settings stay.
  const clearAll = useCallback(() => {
    setTasks([])
    setHabits([])
    setSelectedId(null)
    saveWork(emptyWork())
    for (const exam of EXAMS) saveNtpc(emptyNtpc(), exam)
    // Notes and their flashcard progress live in settings; the rest of settings stays.
    setSettings((s) => ({ ...s, notes: [], revision: { cards: {}, days: {} } }))
    forgetAllConnections() // the tokens for Todoist, Notion, Telegram and the rest go with it
    announce(workKey())
    for (const exam of EXAMS) announce(ntpcKey(exam))
  }, [])

  // Replace a task's time log (edit or delete entries), with undo when labelled.
  const setSessions = useCallback((id, sessions, label) => {
    if (label) offerUndo(label)
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, sessions } : t)))
  }, [offerUndo])

  const updateTask = useCallback((id, patch) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...('date' in patch ? withDate(t, patch.date) : t), ...patch } : t)))
  }, [])

  // ---- "Before you finish" ----
  // A task with required steps can't become Completed until they are ticked. Everything that
  // completes a task (the tick on a card, the status buttons, dragging to a Completed column,
  // finishing a focus session) goes through the three functions below. A blocked attempt is
  // held here while the Before-you-finish window (components/FinishGate.jsx) is open, and runs
  // once the steps are ticked, or when "Finish anyway" gives a reason.
  const [gateTaskId, setGateTaskId] = useState(null)
  const gateRef = useRef(null) // { id, run }
  const blockedFromFinishing = (id) => {
    const t = tasksRef.current.find((x) => x.id === id)
    return !!t && t.status !== 'completed' && checkGate(t).blocked
  }
  const holdForChecks = (id, run) => { gateRef.current = { id, run }; setGateTaskId(id) }
  const closeGate = useCallback(() => { gateRef.current = null; setGateTaskId(null) }, [])
  const finishGate = useCallback((reason = '') => {
    const g = gateRef.current
    if (!g) return
    const t = tasksRef.current.find((x) => x.id === g.id)
    const gate = t ? checkGate(t) : null
    const why = String(reason || '').trim()
    if (gate?.blocked && why.length < 3) return // the way out needs a reason
    const skipped = gate?.blocked ? { at: new Date().toISOString(), reason: why.slice(0, 200), missing: gate.missing.map((s) => s.title) } : null
    gateRef.current = null
    setGateTaskId(null)
    g.run()
    setTasks((ts) => ts.map((x) => (x.id === g.id ? { ...x, skippedChecks: skipped } : x)))
  }, [])

  // All three return false when the task was held back by its required steps.
  const setStatus = useCallback((id, status) => {
    if (!status) return false
    const run = () => setTasks((ts) => ts.map((t) => (t.id === id ? withStatus(t, status) : t)))
    if (status === 'completed' && blockedFromFinishing(id)) { holdForChecks(id, run); return false }
    run()
    return true
  }, [])

  const toggleComplete = useCallback((id) => {
    const run = () => setTasks((ts) => ts.map((t) => (t.id === id ? withStatus(t, t.status === 'completed' ? 'todo' : 'completed') : t)))
    if (blockedFromFinishing(id)) { holdForChecks(id, run); return false }
    run()
    return true
  }, [])

  // Move a task to `status` and place it before `beforeId` in the global
  // array (append when beforeId is null). Column order is the array order.
  // `target` is a column id: one of the three originals ('todo', 'working',
  // 'completed') or a custom column, which counts as the status it was made from.
  const moveTask = useCallback((id, target, beforeId = null) => {
    const cols = cleanColumns(settingsRef.current?.columns)
    const col = cols.find((c) => c.id === target)
    const status = col ? col.base : baseOfColumn(target, cols)
    const run = () => setTasks((ts) => {
      const task = ts.find((t) => t.id === id)
      if (!task) return ts
      const moved = { ...withStatus(task, status), column: col && !isOriginal(col) ? col.id : null }
      const rest = ts.filter((t) => t.id !== id)
      const at = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1
      if (at < 0) return [...rest, moved]
      return [...rest.slice(0, at), moved, ...rest.slice(at)]
    })
    if (status === 'completed' && blockedFromFinishing(id)) { holdForChecks(id, run); return false }
    run()
    return true
  }, [])

  // Reorder the tasks of one status in place; other tasks keep their slots.
  const sortStatus = useCallback((column, by) => {
    const cols = cleanColumns(settingsRef.current?.columns)
    const inColumn = (t) => columnOf(t, cols) === column
    const PRI = { high: 0, medium: 1, low: 2 }
    const cmp =
      by === 'priority'
        ? (a, b) => PRI[a.priority] - PRI[b.priority] || (a.date || '9').localeCompare(b.date || '9')
        : (a, b) => (a.date || '9').localeCompare(b.date || '9') || (a.startTime || '9').localeCompare(b.startTime || '9')
    setTasks((ts) => {
      const sorted = ts.filter(inColumn).sort(cmp)
      let i = 0
      return ts.map((t) => (inColumn(t) ? sorted[i++] : t))
    })
  }, [])

  // Unfinished tasks from past days move to today. A repeating task brings
  // only its latest missed occurrence, and only when the series has nothing
  // today; its other missed copies are dropped unless time was logged on
  // them. Previously every missed copy landed on today as a duplicate.
  const moveOverdueToToday = useCallback((column = null) => {
    const today = todayKey()
    const ts = tasksRef.current
    const cols = cleanColumns(settingsRef.current?.columns)
    const overdue = ts.filter((t) => t.date && t.date < today && t.status !== 'completed' && (!column || columnOf(t, cols) === column))
    if (!overdue.length) return 0
    const move = new Set(), drop = new Set(), bySeries = new Map()
    for (const t of overdue) {
      if (t.seriesId && t.recurrence) {
        if (!bySeries.has(t.seriesId)) bySeries.set(t.seriesId, [])
        bySeries.get(t.seriesId).push(t)
      } else move.add(t.id)
    }
    for (const [sid, list] of bySeries) {
      const hasToday = ts.some((x) => x.seriesId === sid && x.date === today)
      list.sort((a, b) => b.date.localeCompare(a.date))
      list.forEach((t, i) => {
        if (i === 0 && !hasToday) move.add(t.id)
        else if (!t.sessions.length) drop.add(t.id)
      })
    }
    offerUndo(`Moved ${move.size} to today${drop.size ? ` · cleared ${drop.size} missed repeat${drop.size === 1 ? '' : 's'}` : ''}`)
    setTasks((prev) => prev.filter((t) => !drop.has(t.id)).map((t) => (move.has(t.id) ? { ...t, date: today, startDate: t.startDate ?? t.date } : t)))
    return move.size
  }, [offerUndo])

  const clearCompleted = useCallback(() => {
    const n = tasksRef.current.filter((t) => t.status === 'completed').length
    if (!n) return
    offerUndo(`Cleared ${n} completed task${n === 1 ? '' : 's'}`)
    setTasks((ts) => ts.filter((t) => t.status !== 'completed'))
  }, [offerUndo])

  // Deleting one occurrence of a series records its date as skipped so the
  // horizon fill doesn't bring it back.
  // ---- paused and dropped (lib/tasks.js isParked; views/Paused.jsx) ----
  // Stop a task on purpose: it leaves every plan until resumed (or until `until`, when it
  // comes back by itself). A running timer is stopped first.
  const pauseTask = useCallback((id, { reason = 'Not now', until = null } = {}) => {
    const t = tasksRef.current.find((x) => x.id === id)
    if (!t) return
    offerUndo(`Paused “${t.title}”`)
    const now = new Date()
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...withStatus(x, x.status === 'working' ? 'todo' : x.status, now), hold: { reason, since: now.toISOString(), until }, dropped: null } : x)))
  }, [offerUndo])
  // Back on the plan, on `date` (today by default).
  const resumeTask = useCallback((id, date = todayKey()) => {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...withDate({ ...x, hold: null }, date), hold: null } : x)))
  }, [])
  // Let a task go: hidden everywhere, kept 30 days (Paused screen) so it can be restored.
  const dropTask = useCallback((id, reason = 'Let go') => {
    const t = tasksRef.current.find((x) => x.id === id)
    if (!t) return
    offerUndo(`Dropped “${t.title}”`)
    const now = new Date()
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...withStatus(x, x.status === 'working' ? 'todo' : x.status, now), dropped: { reason, at: now.toISOString() }, hold: null } : x)))
    setSelectedId((sel) => (sel === id ? null : sel))
  }, [offerUndo])
  const restoreTask = useCallback((id, date = todayKey()) => {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...withDate({ ...x, dropped: null }, date), dropped: null } : x)))
  }, [])

  // Several tasks at once (a whole study plan). One Undo brings them all back.
  const removeTasks = useCallback((ids, undoLabel) => {
    const want = new Set(ids)
    const found = tasksRef.current.filter((t) => want.has(t.id))
    if (!found.length) return 0
    offerUndo(undoLabel || `Deleted ${found.length} tasks`)
    setTasks((ts) => ts.filter((t) => !want.has(t.id)))
    setSelectedId((s) => (want.has(s) ? null : s))
    return found.length
  }, [offerUndo])

  // Many tasks at once (Table view's bulk bar), with one Undo. `patch` is the fields to set, with
  // `date` and `status` applied the same way single changes apply them. Completing skips tasks whose
  // required steps aren't ticked (they need "Before you finish", one at a time). Returns how many changed.
  // `patch` can also be a function of the task, for a change that depends on it (custom field values).
  const updateTasks = useCallback((ids, patch, undoLabel) => {
    const want = new Set(ids)
    const skip = patch.status === 'completed'
      ? new Set(tasksRef.current.filter((t) => want.has(t.id) && t.status !== 'completed' && checkGate(t).blocked).map((t) => t.id))
      : new Set()
    const changed = tasksRef.current.filter((t) => want.has(t.id) && !skip.has(t.id)).length
    if (!changed) return { changed: 0, skipped: skip.size }
    offerUndo(undoLabel || `Changed ${changed} tasks`)
    setTasks((ts) => ts.map((t) => {
      if (!want.has(t.id) || skip.has(t.id)) return t
      const p = typeof patch === 'function' ? patch(t) : patch
      const { date, status, ...rest } = p
      let next = 'date' in p ? withDate(t, date) : t
      if (status) next = withStatus(next, status)
      return { ...next, ...rest }
    }))
    return { changed, skipped: skip.size }
  }, [offerUndo])

  const removeTask = useCallback((id) => {
    const gone = tasksRef.current.find((x) => x.id === id)
    if (gone) offerUndo(`Deleted “${gone.title}”`)
    setTasks((ts) => {
      const t = ts.find((x) => x.id === id)
      const rest = ts.filter((x) => x.id !== id)
      if (!t?.seriesId || !t.recurrence) return rest
      return rest.map((x) =>
        x.seriesId === t.seriesId ? { ...x, recurrence: { ...x.recurrence, skip: [...(x.recurrence.skip || []), t.date] } } : x,
      )
    })
    setSelectedId((s) => (s === id ? null : s))
  }, [offerUndo])

  // `patch` is an object, or a function of the latest settings returning one (for saves that finish after an await).
  const updateSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
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

  // Unfinished work continues by itself. On each new day (and when another window or the cloud hands over
  // fresh tasks), a task left open in the last few days moves to today; its start day stays. One Undo
  // puts them all back. See carryForward in lib/tasks.js for what is, and is not, carried.
  //
  // Also daily: a paused task whose "check again" day has come returns to today's plan, and
  // a dropped task is deleted for good DROP_KEEP_DAYS after it was dropped.
  const dayNow = dateKey(now)
  useEffect(() => {
    const { moved } = carryForward(tasksRef.current, new Date())
    if (!moved) return
    offerUndo(`Carried ${moved} unfinished task${moved === 1 ? '' : 's'} to today`)
    setTasks((ts) => carryForward(ts, new Date()).tasks)
  }, [dayNow, syncTick, offerUndo])

  useEffect(() => {
    setTasks((ts) => {
      const today = todayKey()
      const cutoff = Date.now() - DROP_KEEP_DAYS * 864e5
      let changed = false
      const next = ts.flatMap((t) => {
        if (t.dropped && Date.parse(t.dropped.at) < cutoff) { changed = true; return [] }
        if (t.hold?.until && t.hold.until <= today) { changed = true; return [{ ...withDate({ ...t, hold: null }, today), hold: null }] }
        return [t]
      })
      return changed ? next : ts
    })
  }, [dayNow, syncTick])

  // Another tab saved: take its copy instead of overwriting it on our next
  // save. Browsers fire 'storage' only in the other tabs, and only when the
  // stored value actually changed, so this can't loop.
  useEffect(() => {
    const onStorage = (e) => {
      const k = syncedKeys()
      if (e.key === k.tasks) { setTasks(loadTasks()); setSyncTick((n) => n + 1) }
      else if (e.key === k.settings) setSettings(loadSettings())
      else if (e.key === k.habits) setHabits(loadHabits())
      else if (e.key === k.focus) setFocus(loadFocus())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const pomo = settings.pomodoro
  const phaseMs = useCallback((phase) => (phase === 'focus' ? pomo.focus : phase === 'short' ? pomo.short : pomo.long) * 60_000, [pomo])

  const pauseSession = useCallback((id) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? withSessionPaused(t) : t)))
  }, [])
  const resumeSession = useCallback((id) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? withSessionResumed(withStatus(t, 'working')) : t)))
  }, [])

  // Read the live focus state directly, so these callbacks never run side
  // effects inside a state updater (React may call updaters twice).
  const focusRef = useRef(focus)
  focusRef.current = focus

  // Only one timer at a time: starting focus on another task closes the
  // previous task's open session (it stays in Working, just not timed).
  const startFocus = useCallback((taskId) => {
    const prev = focusRef.current
    if (prev && prev.taskId !== taskId) pauseSession(prev.taskId)
    setFocus({ taskId, phase: 'focus', running: true, waiting: false, endsAt: Date.now() + phaseMs('focus'), remainingMs: null, completed: 0, open: true })
    resumeSession(taskId)
  }, [phaseMs, pauseSession, resumeSession])

  const pauseFocus = useCallback(() => {
    const f = focusRef.current
    if (!f || !f.running) return
    if (f.phase === 'focus') pauseSession(f.taskId)
    setFocus({ ...f, running: false, remainingMs: Math.max(0, f.endsAt - Date.now()), endsAt: null })
  }, [pauseSession])

  const resumeFocus = useCallback(() => {
    const f = focusRef.current
    if (!f || f.running) return
    if (f.phase === 'focus') resumeSession(f.taskId)
    setFocus({ ...f, running: true, waiting: false, endsAt: Date.now() + (f.remainingMs ?? phaseMs(f.phase)), remainingMs: null })
  }, [phaseMs, resumeSession])

  // Move to the next phase. Skip (no {auto}) starts it straight away. A phase
  // that ran out on its own ({auto: true}) waits for you to start the next
  // one, so a forgotten timer stops logging focus time.
  const advanceFocus = useCallback((opts) => {
    const f = focusRef.current
    if (!f) return
    const auto = opts?.auto === true
    let next, completed = f.completed
    if (f.phase === 'focus') {
      completed += 1
      next = completed % pomo.every === 0 ? 'long' : 'short'
      pauseSession(f.taskId)
    } else {
      next = 'focus'
      if (!auto) resumeSession(f.taskId)
    }
    setFocus(auto
      ? { ...f, phase: next, completed, running: false, waiting: true, endsAt: null, remainingMs: phaseMs(next) }
      : { ...f, phase: next, completed, running: true, waiting: false, endsAt: Date.now() + phaseMs(next), remainingMs: null })
  }, [phaseMs, pomo.every, pauseSession, resumeSession])

  // End the session. The check button completes the task; otherwise a task
  // still in Working goes back to To do. A task already completed elsewhere
  // is left alone (this used to set it back to To do).
  const stopFocus = useCallback((complete = false) => {
    const f = focusRef.current
    if (!f) return
    setFocus(null)
    const t = tasksRef.current.find((x) => x.id === f.taskId)
    if (!t) return
    if (complete) setStatus(f.taskId, 'completed')
    else if (t.status === 'working') setStatus(f.taskId, 'todo')
  }, [setStatus])

  // ---- Interruptions --------------------------------------------------
  // Someone hands you urgent work: log it as a task on today's plan. With
  // `startNow`, whatever you were doing is paused (its timer stops), the new
  // task's timer starts, and timed tasks still ahead today can be pushed back
  // by its length. `resume` remembers what to go back to afterwards.
  // `date` / `startTime` schedule it for another day or time; with `startNow` it is today, from now.
  const logInterruption = useCallback(({ title, by = '', minutes = 30, category, startNow = true, shift = true, date, startTime }) => {
    const at = new Date()
    const today = dateKey(at)
    const nowMin = at.getHours() * 60 + at.getMinutes()
    const f = focusRef.current
    const working = tasksRef.current.find((t) => t.status === 'working' && t.sessions.some((x) => x.end == null))
    const prev = !startNow ? null : f ? { id: f.taskId, mode: 'focus' } : working ? { id: working.id, mode: 'working' } : null
    let task = createTask({
      title, date: startNow ? today : (date || today), durationMinutes: minutes, priority: 'high',
      ...(category ? { category } : {}),
      startTime: startNow ? hhmm(Math.floor(nowMin / 5) * 5) : (startTime || null),
      interruption: { by: by.trim(), at: at.toISOString(), resume: prev?.id || null, resumeMode: prev?.mode || null, resolved: false },
    })
    if (startNow && !f) task = withStatus(task, 'working', at)
    offerUndo(`Logged “${title}” as an interruption`)
    setTasks((ts) => {
      let next = ts
      if (prev?.mode === 'working') next = next.map((t) => (t.id === prev.id ? withSessionPaused(t, at) : t))
      if (startNow && shift) {
        next = next.map((t) => {
          if (t.date !== today || t.status !== 'todo' || !t.startTime) return t
          const s = toMin(t.startTime)
          if (s < nowMin) return t
          const moved = s + minutes
          return moved > 23 * 60 + 45 ? { ...t, startTime: null } : { ...t, startTime: hhmm(moved) }
        })
      }
      return [...next, task]
    })
    if (startNow && f) startFocus(task.id)
    return task
  }, [offerUndo, startFocus])

  // Go back to what the interruption paused, and mark it handled.
  const resumeAfter = useCallback((interruptionId) => {
    const it = tasksRef.current.find((t) => t.id === interruptionId)
    const r = it?.interruption
    if (!r) return
    setTasks((ts) => ts.map((t) => (t.id === interruptionId ? { ...t, interruption: { ...r, resolved: true } } : t)))
    const back = r.resume && tasksRef.current.find((t) => t.id === r.resume && t.status !== 'completed')
    if (!back) return
    if (r.resumeMode === 'focus') startFocus(back.id)
    else resumeSession(back.id)
  }, [startFocus, resumeSession])
  const dismissResume = useCallback((interruptionId) => {
    setTasks((ts) => ts.map((t) => (t.id === interruptionId && t.interruption ? { ...t, interruption: { ...t.interruption, resolved: true } } : t)))
  }, [])

  // The focused task was completed or deleted somewhere else: end focus.
  useEffect(() => {
    if (!focus) return
    const t = tasks.find((x) => x.id === focus.taskId)
    if (!t || t.status === 'completed') setFocus(null)
  }, [tasks, focus])

  const setFocusOpen = useCallback((open) => setFocus((f) => (f ? { ...f, open } : f)), [])

  // Tick: expire phases and keep the tab title informative.
  useEffect(() => {
    if (!focus?.running) {
      if (!focus) document.title = 'NineFlow'
      else if (focus.waiting) document.title = focus.phase === 'focus' ? 'Break over · NineFlow' : 'Time for a break · NineFlow'
      return
    }
    const id = setInterval(() => {
      const left = focus.endsAt - Date.now()
      if (left <= 0) { chime(focus.phase); advanceFocus({ auto: true }) }
      else {
        const m = Math.floor(left / 60_000), s = Math.floor((left % 60_000) / 1000)
        document.title = `${m}:${String(s).padStart(2, '0')} · ${focus.phase === 'focus' ? 'Focus' : 'Break'}`
      }
    }, 1000)
    return () => clearInterval(id)
  }, [focus, advanceFocus])

  const addHabit = useCallback((name) => {
    setHabits((hs) => [...hs, { id: uid(), name, createdAt: new Date().toISOString(), done: [], rest: [] }])
  }, [])

  // A rest day: the habit is off that day, so the streak carries over it.
  const toggleHabitRest = useCallback((id, key) => {
    setHabits((hs) => hs.map((h) => {
      if (h.id !== id) return h
      const rest = h.rest || []
      return rest.includes(key)
        ? { ...h, rest: rest.filter((k) => k !== key) }
        : { ...h, rest: [...rest, key], done: h.done.filter((k) => k !== key) }
    }))
  }, [])

  const removeHabit = useCallback((id) => {
    setHabits((hs) => hs.filter((h) => h.id !== id))
  }, [])

  const toggleHabit = useCallback((id, key) => {
    setHabits((hs) =>
      hs.map((h) =>
        h.id === id
          ? { ...h, done: h.done.includes(key) ? h.done.filter((k) => k !== key) : [...h.done, key], rest: (h.rest || []).filter((k) => k !== key) }
          : h,
      ),
    )
  }, [])

  // Reminders: while the app is open, a notification before a task starts, at
  // the times the task asks for (or the Settings default). Each fires once.
  // Needs the browser's notification permission, asked for when you choose a
  // reminder; Settings → Reminders turns the default one on for every timed task.
  const remindedRef = useRef(new Set())
  // In the desktop app the app itself fires reminders (so they arrive with the window
  // closed): this page only sends it the schedule, below, and shows none of its own.
  const desktopReminders = typeof window !== 'undefined' ? window.nineflowDesktop?.reminders : null
  useEffect(() => {
    if (desktopReminders) return undefined
    const check = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      if (pushEnabled()) return // this device gets them by push instead (even with the tab open)
      for (const d of dueReminders(tasksRef.current, settingsRef.current, new Date())) {
        if (remindedRef.current.has(d.id)) continue
        remindedRef.current.add(d.id)
        if (d.silent) continue
        const t = d.task
        const title = d.minutesLeft === 0 ? `Starting now: ${t.title}` : d.minutesLeft >= 120 ? `Soon: ${t.title}` : `In ${d.minutesLeft} min: ${t.title}`
        try {
          new Notification(title, { body: `${t.startTime ? `${t.startTime} · ` : ''}${t.durationMinutes} min`, tag: d.id })
        } catch { /* some browsers only allow notifications from a service worker */ }
      }
    }
    // Constant reminder: one nudge per round, per task, while it is still to do.
    const nag = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      if (pushEnabled()) return
      for (const d of nagDue(tasksRef.current, settingsRef.current, new Date())) {
        const id = `nag@${d.task.id}@${d.task.date}@${d.round}`
        if (remindedRef.current.has(id)) continue
        remindedRef.current.add(id)
        try { new Notification(`Still to do: ${d.task.title}`, { body: `Started ${d.late} min ago`, tag: id }) } catch { /* see above */ }
      }
    }
    const tick = () => { check(); nag() }
    tick()
    const timer = setInterval(tick, 20_000)
    return () => clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: send the next 48 hours of reminders whenever tasks or settings change,
  // and every 30 minutes as that window moves on.
  useEffect(() => {
    if (!desktopReminders) return undefined
    const send = () => desktopReminders.set(reminderSchedule(tasksRef.current, settingsRef.current, new Date()))
    const soon = setTimeout(send, 800)
    const every = setInterval(send, 30 * 60_000)
    return () => { clearTimeout(soon); clearInterval(every) }
  }, [tasks, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  // Website / installed web app with "Remind me when NineFlow is closed" on: hand the
  // upcoming reminders to the server (only what changed), and refresh every 30 minutes.
  useEffect(() => {
    if (desktopReminders) return undefined
    const send = () => { if (pushEnabled()) syncPush(reminderSchedule(tasksRef.current, settingsRef.current, new Date())) }
    const soon = setTimeout(send, 1500)
    const every = setInterval(send, 30 * 60_000)
    return () => { clearTimeout(soon); clearInterval(every) }
  }, [tasks, settings]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => (desktopReminders ? undefined : onPushOpenTask((id) => setSelectedId(id))), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Email to NineFlow: collect emailed tasks when the planner opens, every 5 minutes while
  // it's on screen, and when it comes back into view. Each is confirmed (and so deleted on
  // the server) only after it has been added here.
  const inboxKey = settings.inbox?.key
  useEffect(() => {
    if (!inboxKey || !inboxAvailable()) return undefined
    let stop = false
    let running = false
    const collect = async () => {
      if (running || stop || document.visibilityState !== 'visible') return
      running = true
      try {
        const items = await fetchInbox(inboxKey)
        if (stop || !items.length) return
        const s = settingsRef.current
        const { tasks: made } = emailsToTasks(items, {
          parse: parseQuickAdd, categories: s.categories, existingIds: new Set(tasksRef.current.map((t) => t.id)), allowFrom: s.inbox?.allowFrom || [], now: new Date(),
        })
        if (made.length) addTasks(made, `Added ${made.length} task${made.length === 1 ? '' : 's'} from email`)
        await confirmInbox(inboxKey, items.map((i) => i.id))
      } catch { /* offline or not set up: try again later */ } finally { running = false }
    }
    const first = setTimeout(collect, 2500)
    const every = setInterval(collect, 5 * 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') collect() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stop = true; clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', onVisible) }
  }, [inboxKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: clicking a reminder opens its task.
  useEffect(() => (desktopReminders ? desktopReminders.onOpenTask((id) => setSelectedId(id)) : undefined), []) // eslint-disable-line react-hooks/exhaustive-deps

  const categoryById = useMemo(() => {
    const m = new Map(settings.categories.map((c) => [c.id, c]))
    return (id) => m.get(id) || settings.categories[0]
  }, [settings.categories])

  const value = useMemo(
    () => ({
      tasks: shownTasks, // without paused and dropped tasks, and only the "Work for" being shown: what every plan and list shows
      everyActiveTask: activeTasks, // the same, whoever they are for
      workFocus,
      setWorkFocus,
      allTasks: tasks, // everything, for the Paused screen, the task panel and search
      pauseTask,
      resumeTask,
      dropTask,
      restoreTask,
      settings,
      now,
      view,
      setView,
      selectedId,
      setSelectedId,
      quickAdd,
      setQuickAdd,
      goalPlannerOpen,
      setGoalPlannerOpen,
      promptListOpen,
      setPromptListOpen,
      askOpen,
      setAskOpen,
      dashboardDate,
      setDashboardDate,
      calendarMode,
      setCalendarMode,
      openDay,
      addTask,
      addTasks,
      removeTasks,
      updateTasks,
      gateTaskId,
      closeGate,
      finishGate,
      moveToWorkspace,
      updateTask,
      setSessions,
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
      previewPlan,
      applyPlan,
      moveTasksTo,
      focus,
      startFocus,
      pauseFocus,
      resumeFocus,
      advanceFocus,
      stopFocus,
      setFocusOpen,
      logInterruption,
      resumeAfter,
      dismissResume,
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
      toggleHabitRest,
      onboarded,
      setOnboarded,
      importData,
      loadSample,
      clearAll,
      saveError,
      undo,
      undoLast,
      dismissUndo,
    }),
    [
      shownTasks, workFocus, setWorkFocus, activeTasks, tasks, pauseTask, resumeTask, dropTask, restoreTask, settings, now, view, setView, selectedId, quickAdd, dashboardDate, calendarMode, openDay,
      addTask, addTasks, removeTasks, updateTasks, gateTaskId, closeGate, finishGate, moveToWorkspace, goalPlannerOpen, promptListOpen, askOpen, updateTask, setSessions, setStatus, toggleComplete, moveTask, sortStatus,
      moveOverdueToToday, clearCompleted, removeTask, setRecurrence, removeSeries, applyToUpcoming, planDay,
      previewPlan, applyPlan, moveTasksTo,
      focus, startFocus, pauseFocus, resumeFocus, advanceFocus, stopFocus, setFocusOpen,
      logInterruption, resumeAfter, dismissResume,
      lastAdded, setLastAdded, pipWin, pipError, openPip, closePip,
      updateSettings, addCategory, updateCategory, removeCategory, categoryById,
      habits, addHabit, removeHabit, toggleHabit, toggleHabitRest,
      onboarded, setOnboarded, importData, loadSample, clearAll,
      saveError, undo, undoLast, dismissUndo,
    ],
  )

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
}

export function usePlanner() {
  const ctx = useContext(PlannerContext)
  if (!ctx) throw new Error('usePlanner must be used inside PlannerProvider')
  return ctx
}
