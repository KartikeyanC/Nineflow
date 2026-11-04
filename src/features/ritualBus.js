import { useEffect, useState } from 'react'
import { dateKey } from '../lib/tasks'
import { toMin, workEnd } from '../lib/capacity'
import { storageKey } from '../lib/profiles'

// Shared state for the plan / shutdown ritual, kept apart from the UI so any
// screen can open it without importing the flow itself.
export const EVENT = 'planner:ritual'
const DONE_EVENT = 'planner:ritual-done'
const KEY = () => storageKey('ritual')

export const readState = () => { try { return JSON.parse(localStorage.getItem(KEY()) || '{}') } catch { return {} } }
export const writeState = (patch) => {
  try { localStorage.setItem(KEY(), JSON.stringify({ ...readState(), ...patch })) } catch { /* ignore */ }
  window.dispatchEvent(new Event(DONE_EVENT))
}

export const openRitual = (mode) => window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }))

// { plan, shutdown, dismissed } for today, kept in step with the flow.
export function useRitualState() {
  const [s, setS] = useState(readState)
  useEffect(() => {
    const on = () => setS(readState())
    window.addEventListener(DONE_EVENT, on)
    return () => window.removeEventListener(DONE_EVENT, on)
  }, [])
  return s
}

// Which ritual fits the time of day, if any is still due.
export function dueRitual(now, hours, state) {
  const today = dateKey(now)
  const m = now.getHours() * 60 + now.getMinutes()
  if (state.dismissed === today) return null
  const start = toMin(hours.start), end = workEnd(hours)
  if (end <= 1440) {
    if (state.shutdown !== today && m >= end - 90) return 'shutdown'
    if (state.plan !== today && m < start + 180) return 'plan'
    return null
  }
  // Night shift: after midnight it is still the shift that began the evening before.
  const t = m < start ? m + 1440 : m
  if (state.shutdown !== today && t >= end - 90 && t < end + 360) return 'shutdown'
  if (state.plan !== today && (m >= start - 180 || t < start + 180)) return 'plan'
  return null
}

