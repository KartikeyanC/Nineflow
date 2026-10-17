// Send a day's tasks to a Notion database the person shares with their own integration
// (Settings → Connections). Called straight from the app with their integration secret, which stays
// on this device (lib/connections.js). One-way: pages are created, never changed or deleted, and a
// task that was already sent is skipped.
import { markSent, wasSent } from './connections'

const API = 'https://api.notion.com/v1'
const headers = (token) => ({ Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' })

// The 32-character id in a database link (or a bare id, with or without dashes), or ''.
export const databaseIdFrom = (input) => String(input || '').replace(/-/g, '').match(/[0-9a-f]{32}/i)?.[0].toLowerCase() || ''

async function call(path, token, init) {
  let r
  try { r = await fetch(`${API}${path}`, { ...init, headers: headers(token) }) } catch { throw new Error("Couldn't reach Notion. Check your connection and try again.") }
  if (r.status === 401) throw new Error("Notion didn't accept that secret. Check that you copied all of it.")
  if (r.status === 404) throw new Error("Notion can't find that database. Open it, choose ••• → Connections, and add your integration.")
  if (r.status === 429) throw new Error('Notion says to slow down. Try again in a minute.')
  if (!r.ok) {
    let why = ''
    try { why = (await r.json()).message || '' } catch { /* no body */ }
    throw new Error(`Notion refused that${why ? `: ${why.slice(0, 140)}` : ` (${r.status})`}`)
  }
  return r.json()
}

// What the database has: the property that holds the title, and (if any) a date property.
export async function readDatabase({ token, databaseId }) {
  const db = await call(`/databases/${databaseId}`, token)
  const props = Object.entries(db.properties || {})
  const title = props.find(([, p]) => p.type === 'title')?.[0]
  if (!title) throw new Error('That Notion database has no title column.')
  const date = props.find(([, p]) => p.type === 'date')?.[0] || null
  const name = (db.title || []).map((t) => t.plain_text).join('') || 'your database'
  return { title, date, name }
}

export async function testNotion(conn) {
  const db = await readDatabase(conn)
  return db.name
}

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } }

// The properties of one page for one task.
export function pageFor(task, db, databaseId) {
  const properties = { [db.title]: { title: [{ text: { content: (task.title || 'Untitled').slice(0, 200) } }] } }
  if (db.date && task.date) {
    properties[db.date] = { date: task.startTime ? { start: `${task.date}T${task.startTime}:00`, time_zone: tz() } : { start: task.date } }
  }
  const page = { parent: { database_id: databaseId }, properties }
  if (task.description) {
    page.children = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: task.description.slice(0, 1900) } }] } }]
  }
  return page
}

// Creates a page for each task not sent before. Resolves to { sent, skipped, error }.
export async function sendTasksToNotion(conn, tasks) {
  const db = await readDatabase(conn)
  const todo = tasks.filter((t) => !wasSent('notion', t.id))
  let sent = 0
  let error = null
  const done = []
  for (const t of todo) { // one at a time: Notion allows about three requests a second
    try {
      await call('/pages', conn.token, { method: 'POST', body: JSON.stringify(pageFor(t, db, conn.databaseId)) })
      done.push(t.id); sent += 1
    } catch (e) { error = e; break }
  }
  if (done.length) markSent('notion', done)
  return { sent, skipped: tasks.length - todo.length, error }
}
