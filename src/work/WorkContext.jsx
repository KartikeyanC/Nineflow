import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePlanner } from '../store/PlannerContext'
import { totalMinutes } from '../lib/tasks'
import { loadWork, saveWork, workKey, newTaskRow, newPostRow, newCampaignRow, emptyWork } from './workStore'
import { key } from './workCalc'

const Ctx = createContext(null)

export function WorkProvider({ children }) {
  const [work, setWork] = useState(loadWork)
  useEffect(() => saveWork(work), [work])

  // A task-log row linked to a planner task takes its actual hours from that
  // task's focus sessions, so time tracked once is never typed twice.
  const { tasks: plannerTasks, now } = usePlanner()
  const view = useMemo(() => {
    const byId = new Map(plannerTasks.map((t) => [t.id, t]))
    return {
      ...work,
      tasks: work.tasks.map((r) => {
        const p = r.plannerTaskId && byId.get(r.plannerTaskId)
        return p ? { ...r, actualHours: Math.round(totalMinutes(p, now) / 6) / 10, linked: true } : r
      }),
    }
  }, [work, plannerTasks, now])
  // Another tab saved Work OS: take its copy instead of overwriting it.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === workKey()) setWork(loadWork()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const patch = useCallback((fn) => setWork((w) => ({ ...w, ...fn(w) })), [])
  const updateSettings = useCallback((p) => patch((w) => ({ settings: { ...w.settings, ...p } })), [patch])

  // Generic table helpers: tasks | posts | campaigns | standardTimes
  const updateRow = useCallback((table, id, p) => patch((w) => ({ [table]: w[table].map((r) => {
    if (r.id !== id) return r
    const { linked, ...rest } = { ...r, ...p } // `linked` is derived, never stored
    return rest
  }) })), [patch])
  const removeRow = useCallback((table, id) => patch((w) => ({ [table]: w[table].filter((r) => r.id !== id) })), [patch])
  const addTask = useCallback(() => patch((w) => ({ tasks: [newTaskRow(w.nextTaskNo, key(new Date())), ...w.tasks], nextTaskNo: w.nextTaskNo + 1 })), [patch])
  const addPost = useCallback(() => patch((w) => ({ posts: [newPostRow(key(new Date())), ...w.posts] })), [patch])
  const addCampaign = useCallback(() => patch((w) => ({ campaigns: [newCampaignRow(key(new Date())), ...w.campaigns] })), [patch])
  const addStandard = useCallback(() => patch((w) => ({ standardTimes: [...w.standardTimes, { id: `st${Date.now()}`, area: 'Development', taskType: '', hours: 1 }] })), [patch])
  const setDayNote = useCallback((k, p) => patch((w) => ({ dayNotes: { ...w.dayNotes, [k]: { ...(w.dayNotes[k] || {}), ...p } } })), [patch])
  const resetWork = useCallback(() => setWork(emptyWork()), [])
  const importWork = useCallback((data) => setWork({ ...emptyWork(), ...data }), [])
  // New row from a planner task, linked to it.
  const addFromPlanner = useCallback((p) => patch((w) => {
    const status = p.status === 'completed' ? 'Done' : p.status === 'working' ? 'In progress' : 'Not started'
    const row = {
      ...newTaskRow(w.nextTaskNo, key(new Date())),
      task: p.title, plannerTaskId: p.id, dueDate: p.date || key(new Date()), workDate: p.date,
      plannedHours: Math.round((p.durationMinutes || 0) / 6) / 10, status,
      completedDate: p.completedAt ? key(new Date(p.completedAt)) : null,
    }
    return { tasks: [row, ...w.tasks], nextTaskNo: w.nextTaskNo + 1 }
  }), [patch])

  const value = useMemo(() => ({ work: view, updateSettings, updateRow, removeRow, addTask, addPost, addCampaign, addStandard, setDayNote, resetWork, importWork, addFromPlanner }),
    [view, updateSettings, updateRow, removeRow, addTask, addPost, addCampaign, addStandard, setDayNote, resetWork, importWork, addFromPlanner])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useWork = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWork outside WorkProvider')
  return v
}
