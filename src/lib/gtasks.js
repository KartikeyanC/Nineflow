// Google Tasks, with the "tasks" permission the person gives when they connect it (lib/google.js asks
// for it only then, never at sign-in). Two things, both on request:
//   import  the open tasks from their lists, to choose from (same window as the other importers);
//   send    a day's NineFlow tasks to their default list, once each (lib/connections.js remembers which).
// Google Tasks keeps only a due date, not a time, so tasks come in and go out as all-day.
import { getExtraToken } from './google'
import { markSent, wasSent } from './connections'
import { cleanTag } from './taskMeta'

const API = 'https://tasks.googleapis.com/tasks/v1'

async function call(path, init = {}) {
  const token = getExtraToken('tasks')
  if (!token) throw new Error('Google asks you to connect Google Tasks again about once an hour. Press the button again.')
  let r
  try { r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }) }
  catch { throw new Error("Couldn't reach Google Tasks. Check your connection and try again.") }
  if (r.status === 401 || r.status === 403) throw new Error('Google Tasks access expired or was not allowed. Press the button again to reconnect.')
  if (r.status === 429) throw new Error('Google says to slow down. Try again in a minute.')
  if (!r.ok) throw new Error(`Google Tasks returned an error (${r.status}).`)
  return r.json()
}

export async function testGoogleTasks() {
  const d = await call('/users/@me/lists?maxResults=1')
  return d.items?.[0]?.title ? `your lists (${d.items[0].title}…)` : 'your Google Tasks'
}

// Open tasks from every list: [{ id, title, description, date, startTime, priority, tags, url }]
export async function googleTaskCandidates() {
  const lists = (await call('/users/@me/lists?maxResults=20')).items || []
  const out = []
  for (const list of lists) {
    const d = await call(`/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=false&showHidden=false&maxResults=100`)
    for (const t of d.items || []) {
      if (!t.title || t.status === 'completed' || t.deleted) continue
      out.push({
        id: `gtasks-${t.id}`,
        title: t.title.slice(0, 200),
        description: [t.notes, `From Google Tasks (${list.title})`].filter(Boolean).join('\n\n').slice(0, 4000),
        date: t.due ? String(t.due).slice(0, 10) : null, // Google sends midnight UTC of the chosen day
        startTime: null,
        priority: 'medium',
        tags: [...new Set(['google-tasks', cleanTag(list.title)].filter(Boolean))].slice(0, 6),
        url: t.webViewLink || '',
      })
      if (out.length >= 300) return out
    }
  }
  return out
}

// Creates a task in the default list for each of `tasks` not sent before. Resolves to { sent, skipped, error }.
export async function sendTasksToGoogleTasks(tasks) {
  const todo = tasks.filter((t) => !wasSent('gtasks', t.id))
  const done = []
  let error = null
  for (const t of todo) {
    try {
      await call('/lists/@default/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: (t.title || 'Untitled').slice(0, 1000), ...(t.description ? { notes: t.description.slice(0, 7000) } : {}), ...(t.date ? { due: `${t.date}T00:00:00.000Z` } : {}) }),
      })
      done.push(t.id)
    } catch (e) { error = e; break }
  }
  if (done.length) markSent('gtasks', done)
  return { sent: done.length, skipped: tasks.length - todo.length, error }
}
