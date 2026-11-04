// "Prompt to list": sends a note to /api/prompt-to-tasks (which holds the
// Anthropic key) and cleans up what comes back before the app trusts it.
//
// promptToTasks(prompt, { today, categories }) → [{ title, date, startTime, durationMinutes, priority, category }]
// Throws an Error with a message that is fine to show.

import { hasNoSite } from './platform'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

// The web app calls its own site. The desktop and phone apps have no server, so
// they call the deployed site named by VITE_API_BASE.
function endpoint(name) {
  const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
  if (base) return `${base}/api/${name}`
  if (hasNoSite()) return null
  return `/api/${name}`
}

// The first AI request on a device asks before any task text leaves it.
const CONSENT_KEY = 'nineflow:ai-consent'
function aiConsent() {
  try { if (localStorage.getItem(CONSENT_KEY) === 'yes') return true } catch { /* storage blocked: ask each time */ }
  const ok = window.confirm('The AI helper sends the text you give it (and, for Ask NineFlow, your task list) to Claude, an AI service by Anthropic, to work out an answer. OK to send?')
  if (ok) { try { localStorage.setItem(CONSENT_KEY, 'yes') } catch { /* ignore */ } }
  return ok
}

// POST to one of the AI endpoints; throws an Error with a message fit to show.
export async function callApi(name, body) {
  const url = endpoint(name)
  if (!url) throw new Error("The AI helpers aren't available in this app yet. You can use them on the NineFlow website.")
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('The AI helper needs the internet. Connect and try again; everything else works offline.')
  if (!aiConsent()) throw new Error('Nothing was sent.')
  let res
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error("Couldn't reach the AI helper. Check your connection and try again.")
  }
  let data = null
  try { data = await res.json() } catch { /* not JSON: handled below */ }
  if (!res.ok) throw new Error(data?.error || (res.status === 404 ? "The AI helper isn't available here yet." : 'The AI helper had a problem. Try again.'))
  return data
}

export function cleanTasks(list, categoryIds) {
  if (!Array.isArray(list)) return []
  return list
    .map((t) => {
      const title = String(t?.title || '').replace(/\s+/g, ' ').trim().slice(0, 120)
      if (!title) return null
      const dur = Math.round(Number(t.durationMinutes))
      return {
        title,
        date: DATE.test(t.date) ? t.date : null,
        startTime: TIME.test(t.startTime) ? t.startTime : null,
        durationMinutes: Number.isFinite(dur) ? Math.min(480, Math.max(5, dur)) : 30,
        priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
        category: categoryIds.includes(t.category) ? t.category : null,
      }
    })
    .filter(Boolean)
    .slice(0, 25)
}

const cats = (categories) => categories.map((c) => ({ id: c.id, name: c.name }))

export async function promptToTasks(prompt, { today, categories = [] } = {}) {
  const data = await callApi('prompt-to-tasks', { prompt, today, categories: cats(categories) })
  const tasks = cleanTasks(data?.tasks, categories.map((c) => c.id))
  if (!tasks.length) throw new Error('No tasks came back. Try describing what you need to do in a bit more detail.')
  return tasks
}

// One new task's category, priority, length and steps from its title.
export async function autofillTask(title, { today, categories = [] } = {}) {
  const d = await callApi('autofill', { title, today, categories: cats(categories) })
  const dur = Math.round(Number(d?.durationMinutes))
  return {
    category: categories.some((c) => c.id === d?.category) ? d.category : null,
    priority: ['high', 'medium', 'low'].includes(d?.priority) ? d.priority : null,
    durationMinutes: Number.isFinite(dur) ? Math.min(480, Math.max(5, dur)) : null,
    steps: (Array.isArray(d?.steps) ? d.steps : []).map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 6),
  }
}

// Meeting notes → { title, summary, decisions, tasks }.
export async function meetingToTasks(notes, { today, categories = [] } = {}) {
  const d = await callApi('meeting-notes', { notes, today, categories: cats(categories) })
  return {
    title: String(d?.title || 'Meeting').slice(0, 80),
    summary: String(d?.summary || '').slice(0, 1500),
    decisions: (Array.isArray(d?.decisions) ? d.decisions : []).map((x) => String(x).slice(0, 240)).slice(0, 8),
    tasks: cleanTasks(d?.tasks, categories.map((c) => c.id)),
  }
}

// A question about the planner. `tasks` is sent in a compact form and `history`
// is the conversation so far ([{ role: 'user' | 'assistant', text }]).
export async function askPlanner(question, { today, tasks, history = [] }) {
  const d = await callApi('ask', { question, today, tasks, history })
  const text = String(d?.text || '').trim()
  if (!text) throw new Error("The AI helper didn't answer. Try rewording.")
  return text
}
