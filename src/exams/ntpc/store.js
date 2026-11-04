// RRB NTPC: the person's own progress, kept under one storage key per account and workspace
// ('ntpc'), so it syncs to their Google Drive or account with everything else (lib/cloud.js).
// Only what they record lives here; the syllabus itself is in syllabus.js. Reading cleans every
// field, so an older or hand-edited copy can never break the screen.
//
// { category, examDate, required: [checkpoint ids], revision: { auto, intervals, minutes },
//   dailyMinutes, taskCategory,
//   topics: { [topicId]: { checks: {concept: true…}, priority, difficulty, notes, flag, hidden,
//                         practice: [{ id, date, attempted, correct, incorrect, unanswered, minutes, level, score, mistakes }] } },
//   custom: [{ id, subject, name }],
//   ca: [{ id, date, category, headline, notes, url, revised, quiz }], caMonths: { 'yyyy-MM': { revised, quiz } } }
import { useCallback, useEffect, useState } from 'react'
import { storageKey } from '../../lib/profiles'
import { reportSave, uid } from '../../lib/storage'
import { CHECKPOINT_IDS, DEFAULT_INTERVALS, DEFAULT_REQUIRED } from './calc'
import { CA_CATEGORIES, CATEGORIES, SUBJECTS } from './syllabus'

const KEY = () => storageKey('ntpc')
export const ntpcKey = () => KEY()
const DATE = /^\d{4}-\d{2}-\d{2}$/
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v, max = 100000) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(max, Math.round(Number(v) * 10) / 10) : 0)
const oneOf = (v, list, fallback = null) => (list.includes(v) ? v : fallback)

export const PRIORITY_LEVELS = ['high', 'medium', 'low']
export const DIFFICULTIES = ['easy', 'moderate', 'hard']
export const PRACTICE_LEVELS = ['basic', 'moderate', 'advanced']
export const QUIZ_STATES = ['none', 'done']

export const emptyNtpc = () => ({
  category: null, examDate: null, required: [...DEFAULT_REQUIRED],
  revision: { auto: false, intervals: [...DEFAULT_INTERVALS], minutes: 30 },
  dailyMinutes: 240, taskCategory: null,
  topics: {}, custom: [], ca: [], caMonths: {},
})

function cleanPractice(p) {
  if (!p || typeof p !== 'object') return null
  return {
    id: str(p.id, 80) || uid(), date: DATE.test(p.date || '') ? p.date : null,
    attempted: num(p.attempted, 10000), correct: num(p.correct, 10000), incorrect: num(p.incorrect, 10000), unanswered: num(p.unanswered, 10000),
    minutes: num(p.minutes, 1440), level: oneOf(p.level, PRACTICE_LEVELS), score: str(p.score, 40), mistakes: str(p.mistakes, 2000),
  }
}

function cleanTopic(t) {
  if (!t || typeof t !== 'object') return null
  const checks = {}
  for (const c of CHECKPOINT_IDS) if (t.checks?.[c] === true) checks[c] = true
  return {
    checks, priority: oneOf(t.priority, PRIORITY_LEVELS), difficulty: oneOf(t.difficulty, DIFFICULTIES),
    notes: str(t.notes, 5000), flag: t.flag === 'revise' ? 'revise' : null, hidden: t.hidden === true,
    practice: Array.isArray(t.practice) ? t.practice.map(cleanPractice).filter(Boolean).slice(-500) : [],
  }
}

export function cleanNtpc(raw) {
  const base = emptyNtpc()
  if (!raw || typeof raw !== 'object') return base
  const subjects = SUBJECTS.map((s) => s.id)
  const topics = {}
  for (const [id, t] of Object.entries(raw.topics || {})) { const c = cleanTopic(t); if (c && typeof id === 'string' && id.length < 120) topics[id] = c }
  const intervals = Array.isArray(raw.revision?.intervals) ? raw.revision.intervals.map((d) => Math.round(Number(d))).filter((d) => d >= 1 && d <= 365).slice(0, 8) : []
  const caMonths = {}
  for (const [m, v] of Object.entries(raw.caMonths || {})) if (/^\d{4}-\d{2}$/.test(m)) caMonths[m] = { revised: v?.revised === true, quiz: v?.quiz === true }
  return {
    category: oneOf(raw.category, CATEGORIES.map((c) => c.id)),
    examDate: DATE.test(raw.examDate || '') ? raw.examDate : null,
    required: Array.isArray(raw.required) ? CHECKPOINT_IDS.filter((c) => raw.required.includes(c)) : base.required,
    revision: { auto: raw.revision?.auto === true, intervals: intervals.length ? intervals : base.revision.intervals, minutes: num(raw.revision?.minutes, 240) || 30 },
    dailyMinutes: num(raw.dailyMinutes, 1440) || 240,
    taskCategory: typeof raw.taskCategory === 'string' ? raw.taskCategory : null,
    topics,
    custom: Array.isArray(raw.custom) ? raw.custom.filter((c) => c && subjects.includes(c.subject) && str(c.name, 200).trim())
      .map((c) => ({ id: str(c.id, 120) || `${c.subject}:custom-${uid()}`, subject: c.subject, name: str(c.name, 200).trim() })).slice(0, 200) : [],
    ca: Array.isArray(raw.ca) ? raw.ca.filter((r) => r && DATE.test(r.date || '') && str(r.headline, 300).trim()).map((r) => ({
      id: str(r.id, 80) || uid(), date: r.date, category: oneOf(r.category, CA_CATEGORIES, CA_CATEGORIES[0]),
      headline: str(r.headline, 300).trim(), notes: str(r.notes, 3000),
      url: /^https?:\/\//i.test(r.url || '') ? str(r.url, 1000) : '', revised: r.revised === true, quiz: oneOf(r.quiz, QUIZ_STATES, 'none'),
    })).slice(-3000) : [],
    caMonths,
  }
}

export function loadNtpc() {
  try { return cleanNtpc(JSON.parse(localStorage.getItem(KEY()) || 'null')) } catch { return emptyNtpc() }
}
export function saveNtpc(data) {
  try { localStorage.setItem(KEY(), JSON.stringify(data)); reportSave(true, KEY()) } catch { reportSave(false, KEY()) }
}

// The module's state and a way to change it. Another device's changes (arriving through sync)
// and other tabs reload it, like Work OS does.
export function useNtpc() {
  const [data, setData] = useState(loadNtpc)
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY()) setData(loadNtpc()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const change = useCallback((fn) => setData((d) => { const next = cleanNtpc({ ...d, ...fn(d) }); saveNtpc(next); return next }), [])
  const changeTopic = useCallback((id, fn) => change((d) => {
    const cur = d.topics[id] || cleanTopic({})
    return { topics: { ...d.topics, [id]: { ...cur, ...fn(cur) } } }
  }), [change])
  return { data, change, changeTopic }
}

// Built-in topics plus the person's own, per subject; hidden ones left out unless asked for.
export function topicsOf(data, { withHidden = false } = {}) {
  return SUBJECTS.map((s) => ({
    ...s,
    topics: [...s.topics, ...data.custom.filter((c) => c.subject === s.id).map((c, i) => ({ id: c.id, subject: s.id, name: c.name, order: 1000 + i, recurring: false, custom: true }))]
      .filter((t) => withHidden || !data.topics[t.id]?.hidden),
  }))
}
