// "Prompt to list": sends a note to /api/prompt-to-tasks (which holds the
// Anthropic key) and cleans up what comes back before the app trusts it.
//
// promptToTasks(prompt, { today, categories }) → [{ title, date, startTime, durationMinutes, priority, category }]
// Throws an Error with a message that is fine to show.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

// The web app calls its own site. The desktop app (app://) has no server, so
// it calls the deployed site named by VITE_API_BASE.
function endpoint() {
  const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
  if (base) return `${base}/api/prompt-to-tasks`
  if (typeof location !== 'undefined' && location.protocol === 'app:') return null
  return '/api/prompt-to-tasks'
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

export async function promptToTasks(prompt, { today, categories = [] } = {}) {
  const url = endpoint()
  if (!url) throw new Error('The list maker needs an internet connection to the NineFlow site. Set VITE_API_BASE for the desktop app.')
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, today, categories: categories.map((c) => ({ id: c.id, name: c.name })) }),
    })
  } catch {
    throw new Error("Couldn't reach the list maker. Check your connection and try again.")
  }
  let data = null
  try { data = await res.json() } catch { /* not JSON: handled below */ }
  if (!res.ok) throw new Error(data?.error || (res.status === 404 ? 'The list maker isn\'t available here yet.' : 'The list maker had a problem. Try again.'))
  const tasks = cleanTasks(data?.tasks, categories.map((c) => c.id))
  if (!tasks.length) throw new Error('No tasks came back. Try describing what you need to do in a bit more detail.')
  return tasks
}
