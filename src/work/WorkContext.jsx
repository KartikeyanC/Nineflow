import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { loadWork, saveWork, newTaskRow, newPostRow, newCampaignRow, emptyWork } from './workStore'
import { key } from './workCalc'

const Ctx = createContext(null)

export function WorkProvider({ children }) {
  const [work, setWork] = useState(loadWork)
  useEffect(() => saveWork(work), [work])

  const patch = useCallback((fn) => setWork((w) => ({ ...w, ...fn(w) })), [])
  const updateSettings = useCallback((p) => patch((w) => ({ settings: { ...w.settings, ...p } })), [patch])

  // Generic table helpers: tasks | posts | campaigns | standardTimes
  const updateRow = useCallback((table, id, p) => patch((w) => ({ [table]: w[table].map((r) => (r.id === id ? { ...r, ...p } : r)) })), [patch])
  const removeRow = useCallback((table, id) => patch((w) => ({ [table]: w[table].filter((r) => r.id !== id) })), [patch])
  const addTask = useCallback(() => patch((w) => ({ tasks: [newTaskRow(w.nextTaskNo, key(new Date())), ...w.tasks], nextTaskNo: w.nextTaskNo + 1 })), [patch])
  const addPost = useCallback(() => patch((w) => ({ posts: [newPostRow(key(new Date())), ...w.posts] })), [patch])
  const addCampaign = useCallback(() => patch((w) => ({ campaigns: [newCampaignRow(key(new Date())), ...w.campaigns] })), [patch])
  const addStandard = useCallback(() => patch((w) => ({ standardTimes: [...w.standardTimes, { id: `st${Date.now()}`, area: 'Development', taskType: '', hours: 1 }] })), [patch])
  const setDayNote = useCallback((k, p) => patch((w) => ({ dayNotes: { ...w.dayNotes, [k]: { ...(w.dayNotes[k] || {}), ...p } } })), [patch])
  const resetWork = useCallback(() => setWork(emptyWork()), [])
  const importWork = useCallback((data) => setWork({ ...emptyWork(), ...data }), [])

  const value = useMemo(() => ({ work, updateSettings, updateRow, removeRow, addTask, addPost, addCampaign, addStandard, setDayNote, resetWork, importWork }),
    [work, updateSettings, updateRow, removeRow, addTask, addPost, addCampaign, addStandard, setDayNote, resetWork, importWork])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useWork = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWork outside WorkProvider')
  return v
}
