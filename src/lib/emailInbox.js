// Email to NineFlow: forward or send an email to this planner's private address and it
// becomes a task (see api/_inbox.js and docs/EMAIL.md).
//
// The address is <VITE_INBOX_ADDRESS local part>+<key>@<its domain>. The key lives in
// the workspace's settings (settings.inbox.key), so every device signed in to this
// planner collects the same inbox, and a new key makes the old address stop working.

const BASE = import.meta.env.VITE_INBOX_ADDRESS || '' // e.g. abc123@inbound.postmarkapp.com
const apiUrl = (path) => `${(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')}${path}`

export const inboxAvailable = () => /^[^@\s+]+@[^@\s]+$/.test(BASE)

export function newInboxKey() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(26))
  return Array.from(bytes, (b) => abc[b % 36]).join('')
}

export function inboxAddress(key) {
  if (!inboxAvailable() || !key) return null
  const [local, domain] = BASE.split('@')
  return `${local}+${key}@${domain}`
}

async function post(body) {
  const r = await fetch(apiUrl('/api/inbox'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'The email inbox is unavailable.')
  return data
}
export const fetchInbox = (key) => post({ key }).then((d) => (Array.isArray(d.items) ? d.items : []))
export const confirmInbox = (key, ids) => post({ key, done: ids })

const emailOf = (s) => String(s || '').toLowerCase().match(/[^\s<>"]+@[^\s<>"]+/)?.[0] || ''
// "Fwd: Re: Call the bank" → "Call the bank"
export const cleanSubject = (s) => String(s || '').replace(/^\s*((re|fwd?|aw|wg|tr)\s*:\s*)+/i, '').trim()

// Emails → new task fields. `parse` is the quick-add parser (lib/nlp.js), so a subject
// like "Call the bank tomorrow 3pm !high #admin" fills in the day, time, priority and tag.
// Without a day in the subject the task goes to Someday. Each task's id comes from its
// email, so the same email is never added twice. Returns { tasks, skipped }.
export function emailsToTasks(items, { parse, categories = [], existingIds = new Set(), allowFrom = [], now = new Date() }) {
  const allowed = allowFrom.map(emailOf).filter(Boolean)
  const tasks = []
  const skipped = []
  for (const it of items) {
    const id = `email-${it.id}`
    if (existingIds.has(id)) { skipped.push({ id: it.id, why: 'already added' }); continue }
    if (allowed.length && !allowed.includes(emailOf(it.from))) { skipped.push({ id: it.id, why: 'sender not allowed' }); continue }
    const subject = cleanSubject(it.subject)
    const p = subject ? parse(subject, { categories, now }) : { title: '', tags: [] }
    const from = it.fromName ? `${it.fromName} <${it.from}>` : it.from
    const notes = [`From: ${from}`, it.attachments ? `(${it.attachments} attachment${it.attachments === 1 ? '' : 's'} in the email)` : '', it.text].filter(Boolean).join('\n\n')
    tasks.push({
      id,
      title: (p.title || subject || (it.text || '').split('\n')[0] || 'Email').slice(0, 200),
      description: notes.slice(0, 4000),
      askedBy: (it.fromName || it.from || '').slice(0, 80),
      date: p.date ?? null,
      startTime: p.date ? p.startTime ?? null : null,
      ...(p.durationMinutes ? { durationMinutes: p.durationMinutes } : {}),
      ...(p.priority ? { priority: p.priority } : {}),
      category: p.category || categories[0]?.id || 'work',
      tags: [...new Set(['email', ...(p.tags || [])])].slice(0, 6),
      createdAt: it.receivedAt || now.toISOString(),
    })
  }
  return { tasks, skipped }
}
