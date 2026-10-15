#!/usr/bin/env node
// NineFlow MCP server: lets Claude (Claude Desktop, Claude Code…) read and edit your
// NineFlow planner. It runs on your computer, talks to Claude over stdio, and reads
// and writes the planner file in your own Google Drive. See mcp/README.md.
//
//   node server.mjs          run the server (Claude starts it for you)
//   node server.mjs login    sign in to Google once, in your browser
//   node server.mjs logout   forget the sign-in

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createDriveStore } from './drive.mjs'
import * as P from './planner.mjs'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const VERSION = '0.1.0'

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e?.message || String(e) }] })
const run = (fn) => async (args) => { try { return ok(await fn(args || {})) } catch (e) { return fail(e) } }

const date = z.string().describe('A day as YYYY-MM-DD')
const workspace = z.string().optional().describe('Workspace id or name; default: the main one ("My planner")')

// Find a task by id (or a unique id prefix).
function findTask(tasks, id) {
  const exact = tasks.findIndex((t) => t.id === id)
  if (exact >= 0) return exact
  const hits = tasks.map((t, i) => [t, i]).filter(([t]) => typeof id === 'string' && id.length >= 6 && t.id.startsWith(id))
  if (hits.length === 1) return hits[0][1]
  throw new Error(`No task with id "${id}". Use list_tasks to find it.`)
}

export function createServer({ store, now = () => new Date() }) {
  const server = new McpServer({ name: 'nineflow', version: VERSION }, {
    instructions: "NineFlow is the user's day planner. Tasks have a day (date, or null for Someday), an optional start time, a length, a status (todo, working, review, completed), a priority and a category. Use get_overview first to learn today's date, the categories and the workspaces. Dates are YYYY-MM-DD in the user's local time.",
  })
  const edit = (ws, fn) => store.update((bundle) => fn(bundle, P.resolveWorkspace(bundle, ws)))

  server.registerTool('get_overview', {
    title: 'Planner overview',
    description: "Today's date, how today is going, overdue and Someday counts, categories, habits and workspaces. Call this first.",
    inputSchema: { workspace },
    annotations: { readOnlyHint: true },
  }, run(async ({ workspace: ws }) => {
    const { bundle } = await store.read()
    return P.overview(bundle, P.resolveWorkspace(bundle, ws), now())
  }))

  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'Tasks matching the filters, sorted by day and start time. By default only open (not completed) tasks. Someday tasks (no day) are included only without a date filter, or with include_someday.',
    inputSchema: {
      date: date.optional().describe('Only this day'),
      from: date.optional().describe('From this day (inclusive)'),
      to: date.optional().describe('Up to this day (inclusive)'),
      status: z.enum(['open', 'done', 'overdue', 'all']).optional().describe('open (default), done, overdue (open and before today) or all'),
      query: z.string().optional().describe('Text to look for in the title, description or tags'),
      category: z.string().optional().describe('Category name or id'),
      tag: z.string().optional(),
      include_someday: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional().describe('Default 100'),
      workspace,
    },
    annotations: { readOnlyHint: true },
  }, run(async (a) => {
    const { bundle } = await store.read()
    const ws = P.resolveWorkspace(bundle, a.workspace)
    const cats = P.categories(bundle, ws)
    const category = a.category ? P.resolveCategory(bundle, ws, a.category) : undefined
    const all = P.filterTasks(P.getTasks(bundle, ws), { ...a, category }, now())
    const limit = a.limit || 100
    return { count: all.length, ...(all.length > limit ? { showing: limit } : {}), tasks: all.slice(0, limit).map((t) => P.view(t, cats)) }
  }))

  server.registerTool('get_task', {
    title: 'Get a task',
    description: 'One task in full, by id.',
    inputSchema: { id: z.string(), workspace },
    annotations: { readOnlyHint: true },
  }, run(async ({ id, workspace: ws }) => {
    const { bundle } = await store.read()
    const w = P.resolveWorkspace(bundle, ws)
    const tasks = P.getTasks(bundle, w)
    return P.view(tasks[findTask(tasks, id)], P.categories(bundle, w))
  }))

  const taskFields = {
    date: z.string().nullable().optional().describe('YYYY-MM-DD, or null for Someday (no day yet). Default for new tasks: today'),
    start_time: z.string().nullable().optional().describe('HH:MM (24-hour), or null for no set time'),
    duration_minutes: z.number().int().min(5).max(720).optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    category: z.string().optional().describe('Category name or id (see get_overview)'),
    tags: z.array(z.string()).max(6).optional(),
    description: z.string().max(4000).optional(),
  }
  const checkFields = (a) => {
    if (a.date != null && !P.isDate(a.date)) throw new Error(`"${a.date}" is not a day. Use YYYY-MM-DD.`)
    if (a.start_time != null && !P.isTime(a.start_time)) throw new Error(`"${a.start_time}" is not a time. Use HH:MM, 24-hour.`)
  }

  server.registerTool('add_task', {
    title: 'Add a task',
    description: 'Create a task. Without a date it goes on today; date null puts it in Someday.',
    inputSchema: {
      title: z.string().min(1).max(200),
      ...taskFields,
      steps: z.array(z.string().min(1).max(200)).max(30).optional().describe('Checklist steps'),
      workspace,
    },
  }, run(async (a) => {
    checkFields(a)
    return edit(a.workspace, (bundle, ws) => {
      const at = now()
      const task = P.createTask({
        title: a.title.trim(),
        description: a.description || '',
        date: a.date === undefined ? P.dateKey(at) : a.date,
        startTime: a.start_time ?? null,
        durationMinutes: a.duration_minutes ?? 30,
        priority: a.priority || 'medium',
        category: P.resolveCategory(bundle, ws, a.category),
        tags: P.cleanTags(a.tags),
        subtasks: (a.steps || []).map((title) => ({ id: P.uid(), title: title.trim(), done: false, required: false })),
      }, at)
      P.setTasks(bundle, ws, [...P.getTasks(bundle, ws), task])
      return { changed: true, result: { added: P.view(task, P.categories(bundle, ws)) } }
    })
  }))

  server.registerTool('update_task', {
    title: 'Change a task',
    description: 'Change any of a task\'s fields. Only the fields given change. Use complete_task to finish one.',
    inputSchema: {
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      ...taskFields,
      status: z.enum(['todo', 'working', 'review']).optional().describe('todo, working (timer running) or review (waiting on someone)'),
      workspace,
    },
  }, run(async (a) => {
    checkFields(a)
    return edit(a.workspace, (bundle, ws) => {
      const tasks = P.getTasks(bundle, ws)
      const i = findTask(tasks, a.id)
      const at = now()
      let t = { ...tasks[i] }
      if (a.title !== undefined) t.title = a.title.trim()
      if (a.description !== undefined) t.description = a.description
      if (a.date !== undefined) t = P.withDate(t, a.date, at)
      if (a.date === null) t.startTime = null // Someday has no time
      if (a.start_time !== undefined) t.startTime = a.start_time
      if (a.duration_minutes !== undefined) t.durationMinutes = a.duration_minutes
      if (a.priority !== undefined) t.priority = a.priority
      if (a.category !== undefined) t.category = P.resolveCategory(bundle, ws, a.category)
      if (a.tags !== undefined) t.tags = P.cleanTags(a.tags)
      if (a.status !== undefined) t = P.withStatus(t, a.status, at)
      const next = [...tasks]; next[i] = t
      P.setTasks(bundle, ws, next)
      return { changed: true, result: { updated: P.view(t, P.categories(bundle, ws)) } }
    })
  }))

  server.registerTool('complete_task', {
    title: 'Finish a task',
    description: 'Mark a task done (or not done again with done: false). Required checklist steps must be ticked first, unless force is true.',
    inputSchema: { id: z.string(), done: z.boolean().optional().describe('Default true'), force: z.boolean().optional().describe('Finish even if required steps are not ticked'), workspace },
  }, run(async (a) => edit(a.workspace, (bundle, ws) => {
    const tasks = P.getTasks(bundle, ws)
    const i = findTask(tasks, a.id)
    const at = now()
    const done = a.done !== false
    let t = tasks[i]
    if (done) {
      const missing = P.missingRequired(t)
      if (missing.length && !a.force) throw new Error(`"${t.title}" has required steps that aren't ticked: ${missing.join(', ')}. Tick them in NineFlow, or finish with force: true.`)
      t = P.withStatus(t, 'completed', at)
      if (missing.length) t = { ...t, skippedChecks: { at: at.toISOString(), reason: 'Finished from Claude', missing } }
    } else t = P.withStatus(t, 'todo', at)
    const next = [...tasks]; next[i] = t
    P.setTasks(bundle, ws, next)
    return { changed: true, result: { [done ? 'completed' : 'reopened']: P.view(t, P.categories(bundle, ws)) } }
  })))

  server.registerTool('delete_task', {
    title: 'Delete a task',
    description: 'Delete a task for good. Prefer complete_task for finished work.',
    inputSchema: { id: z.string(), workspace },
    annotations: { destructiveHint: true },
  }, run(async (a) => edit(a.workspace, (bundle, ws) => {
    const tasks = P.getTasks(bundle, ws)
    const i = findTask(tasks, a.id)
    P.setTasks(bundle, ws, tasks.filter((_, k) => k !== i))
    return { changed: true, result: { deleted: { id: tasks[i].id, title: tasks[i].title } } }
  })))

  server.registerTool('check_habit', {
    title: 'Tick a habit',
    description: 'Mark a habit done for a day (default today), or undo with done: false.',
    inputSchema: { habit: z.string().describe('Habit id or name (see get_overview)'), date: date.optional(), done: z.boolean().optional(), workspace },
  }, run(async (a) => {
    if (a.date && !P.isDate(a.date)) throw new Error(`"${a.date}" is not a day. Use YYYY-MM-DD.`)
    return edit(a.workspace, (bundle, ws) => {
      const habits = P.getHabits(bundle, ws)
      const v = a.habit.toLowerCase()
      const i = habits.findIndex((h) => h.id === a.habit || String(h.name).toLowerCase() === v)
      if (i < 0) throw new Error(`No habit "${a.habit}". Habits: ${habits.map((h) => h.name).join(', ') || 'none yet'}.`)
      const day = a.date || P.dateKey(now())
      const h = habits[i]
      const set = new Set(h.done || [])
      if (a.done === false) set.delete(day); else set.add(day)
      const next = [...habits]; next[i] = { ...h, done: [...set].sort(), rest: (h.rest || []).filter((k) => k !== day) }
      P.setHabits(bundle, ws, next)
      return { changed: true, result: { habit: h.name, day, done: a.done !== false } }
    })
  }))

  server.registerTool('add_note', {
    title: 'Add a sticky note',
    description: "A note on NineFlow's Notes screen, for things that aren't tasks yet.",
    inputSchema: { text: z.string().min(1).max(2000), workspace },
  }, run(async (a) => edit(a.workspace, (bundle, ws) => {
    const s = P.getSettings(bundle, ws)
    const notes = Array.isArray(s.notes) ? s.notes : []
    if (notes.length >= 60) throw new Error('Notes are full (60). Delete some in NineFlow first.')
    const iso = now().toISOString()
    const note = { id: P.uid(), text: a.text, color: 'butter', pinned: false, createdAt: iso, updatedAt: iso }
    P.setSettings(bundle, ws, { ...s, notes: [note, ...notes] })
    return { changed: true, result: { added_note: note.id } }
  })))

  return server
}

async function main() {
  const cmd = process.argv[2]
  const google = await import('./google.mjs')
  if (cmd === 'login') {
    const { email } = await google.login()
    console.error(`Signed in${email ? ` as ${email}` : ''}. Claude can now use NineFlow.`)
    return
  }
  if (cmd === 'logout') { await google.logout(); console.error('Signed out.'); return }
  const store = createDriveStore({ getToken: google.getToken })
  await createServer({ store }).connect(new StdioServerTransport())
  console.error(`NineFlow MCP server ${VERSION} running${google.signedInAs() ? ` (Google: ${google.signedInAs()})` : ' (not signed in: run "npm run login")'}.`)
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href } catch { return false } })()
if (isMain) main().catch((e) => { console.error(e.message || e); process.exit(1) })
