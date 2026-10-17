// Bring tasks in from Todoist, Trello and GitHub, with the person's own token (lib/connections.js).
// One-way and on request: nothing is written back, and nothing is fetched until they press Import.
// Each source returns the same shape, "candidates", which the import window lists and turns into tasks:
//   { id: 'todoist-…', title, description, date: 'yyyy-MM-dd' | null, startTime: 'HH:mm' | null,
//     durationMinutes?, priority, tags: [], url }
// The id is fixed, so importing again skips what is already in the planner.
import { format } from 'date-fns'
import { cleanTag } from './taskMeta'
import { googleTaskCandidates } from './gtasks'
import { msTodoCandidates } from './microsoft'

const clip = (s, n) => String(s ?? '').slice(0, n)
const tagsOf = (source, names) => [...new Set([source, ...(names || []).map(cleanTag).filter(Boolean)])].slice(0, 6)

async function getJson(service, url, headers = {}) {
  let r
  try { r = await fetch(url, { headers }) } catch { throw new Error(`Couldn't reach ${service}. Check your connection and try again.`) }
  if (r.status === 401 || r.status === 403) throw new Error(`${service} didn't accept that token. Check that you copied all of it.`)
  if (r.status === 429) throw new Error(`${service} says to slow down. Try again in a minute.`)
  if (!r.ok) throw new Error(`${service} returned an error (${r.status}).`)
  return r.json()
}

// An ISO moment (with a zone, or without: then it is already local) → local { date, startTime }.
export function localParts(iso) {
  if (!iso) return { date: null, startTime: null }
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: null, startTime: null }
  if (!hasZone && /T/.test(iso)) return { date: iso.slice(0, 10), startTime: iso.slice(11, 16) }
  return { date: format(d, 'yyyy-MM-dd'), startTime: format(d, 'HH:mm') }
}

// ---- Todoist (API v1) -------------------------------------------------------------------------
export async function todoistTasks(token) {
  const out = []
  let cursor = ''
  for (let page = 0; page < 5; page += 1) {
    const q = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) })
    const d = await getJson('Todoist', `https://api.todoist.com/api/v1/tasks?${q}`, { Authorization: `Bearer ${token}` })
    out.push(...(Array.isArray(d) ? d : d.results || []))
    cursor = d.next_cursor || d.nextCursor || ''
    if (!cursor) break
  }
  return out.filter((t) => t && !t.checked && !t.is_deleted && t.content).map((t) => {
    const due = t.due || null
    const when = due?.datetime ? localParts(due.datetime) : { date: due?.date ? String(due.date).slice(0, 10) : null, startTime: null }
    const mins = t.duration?.unit === 'minute' ? Number(t.duration.amount) : 0
    return {
      id: `todoist-${t.id}`,
      title: clip(t.content, 200),
      description: clip([t.description, `From Todoist: https://app.todoist.com/app/task/${t.id}`].filter(Boolean).join('\n\n'), 4000),
      ...when,
      ...(mins > 0 && mins <= 24 * 60 ? { durationMinutes: mins } : {}),
      priority: Number(t.priority) >= 4 ? 'high' : 'medium', // Todoist's p1 (4 in the API) is the only one called urgent
      tags: tagsOf('todoist', t.labels),
      url: `https://app.todoist.com/app/task/${t.id}`,
    }
  })
}
export async function testTodoist(token) {
  await getJson('Todoist', 'https://api.todoist.com/api/v1/tasks?limit=1', { Authorization: `Bearer ${token}` })
  return 'your Todoist account'
}

// ---- Trello: open cards assigned to the person --------------------------------------------------
const trelloAuth = ({ key, token }) => `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`
export async function trelloCards(conn) {
  const list = await getJson('Trello', `https://api.trello.com/1/members/me/cards?filter=open&fields=name,desc,due,dueComplete,labels,shortUrl&${trelloAuth(conn)}`)
  return (Array.isArray(list) ? list : []).filter((c) => c && !c.dueComplete && c.name).map((c) => {
    const when = localParts(c.due)
    return {
      id: `trello-${c.id}`,
      title: clip(c.name, 200),
      description: clip([c.desc, c.shortUrl ? `From Trello: ${c.shortUrl}` : ''].filter(Boolean).join('\n\n'), 4000),
      ...when,
      priority: 'medium',
      tags: tagsOf('trello', (c.labels || []).map((l) => l.name || l.color)),
      url: c.shortUrl || '',
    }
  })
}
export async function testTrello(conn) {
  const me = await getJson('Trello', `https://api.trello.com/1/members/me?fields=fullName&${trelloAuth(conn)}`)
  return me.fullName || 'your Trello account'
}

// ---- GitHub: open issues and pull requests assigned to the person -------------------------------
const ghHeaders = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' })
export async function githubIssues(token) {
  const list = await getJson('GitHub', 'https://api.github.com/issues?filter=assigned&state=open&per_page=100', ghHeaders(token))
  return (Array.isArray(list) ? list : []).map((i) => {
    const repo = i.repository?.full_name || String(i.repository_url || '').split('/repos/')[1] || ''
    const when = i.milestone?.due_on ? localParts(i.milestone.due_on) : { date: null, startTime: null }
    return {
      id: `github-${i.id}`,
      title: clip(i.title, 200),
      description: clip([`${repo ? `${repo}#${i.number}` : `#${i.number}`}: ${i.html_url}`, i.body].filter(Boolean).join('\n\n'), 4000),
      date: when.date, startTime: null,
      priority: 'medium',
      tags: tagsOf('github', [...(i.pull_request ? ['pr'] : []), ...(i.labels || []).map((l) => (typeof l === 'string' ? l : l.name))]),
      url: i.html_url,
    }
  })
}
export async function testGithub(token) {
  const me = await getJson('GitHub', 'https://api.github.com/user', ghHeaders(token))
  return me.login ? `@${me.login}` : 'your GitHub account'
}

export const IMPORTERS = {
  todoist: { label: 'Todoist', load: (c) => todoistTasks(c.token), what: 'open tasks' },
  trello: { label: 'Trello', load: (c) => trelloCards(c), what: 'open cards assigned to you' },
  github: { label: 'GitHub', load: (c) => githubIssues(c.token), what: 'issues and pull requests assigned to you' },
  gtasks: { label: 'Google Tasks', load: () => googleTaskCandidates(), what: 'open tasks' },
  mstodo: { label: 'Microsoft To Do', load: () => msTodoCandidates(), what: 'open tasks' },
}
