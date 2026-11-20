// Home: your profession's tools as a row of chips (lib/modules.js TOOLS). A "view" tool opens a
// screen NineFlow already has; a "checklist" tool opens a short list under the row, whose items are
// tasks for today tagged with the tool, so they also show in the day, reminders and charts.
import React, { useId, useState } from 'react'
import { ArrowUpRight, Check, ListChecks, Plus } from 'lucide-react'
import { currentProfile } from '../lib/profiles'
import { professionById } from '../lib/professions'
import { checklistItems, roomLeft, toolsFor } from '../lib/modules'
import { todayKey } from '../lib/tasks'
import { usePlanner } from '../store/PlannerContext'
import { cx } from './ui'

export default function ModuleChips() {
  const { allTasks, setView } = usePlanner()
  const [open, setOpen] = useState(null)
  const tools = toolsFor(professionById(currentProfile()?.profession))
  if (!tools.length) return null
  const today = todayKey()
  const current = tools.find((t) => t.id === open && t.kind === 'checklist')

  return (
    <section aria-label="Tools for your work" className="mb-5">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tools.map((tool) => {
          if (tool.kind === 'view') {
            return (
              <button key={tool.id} type="button" onClick={() => setView(tool.view)} title={tool.hint}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 h-9 text-sm font-semibold text-ink hover:border-faint transition">
                {tool.label} <ArrowUpRight size={14} className="text-faint" aria-hidden="true" />
              </button>
            )
          }
          const count = checklistItems(allTasks, tool.id, today).filter((t) => t.status !== 'completed').length
          const on = open === tool.id
          return (
            <button key={tool.id} type="button" onClick={() => setOpen(on ? null : tool.id)} aria-expanded={on} aria-controls={`tool-${tool.id}`} title={tool.hint}
              className={cx('shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 h-9 text-sm font-semibold transition',
                on ? 'border-transparent bg-brand text-white' : 'border-line bg-card text-ink hover:border-faint')}>
              <ListChecks size={14} className={on ? '' : 'text-faint'} aria-hidden="true" /> {tool.label}
              {count > 0 && <span className={cx('ml-0.5 min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center tabular-nums', on ? 'bg-white/25 text-white' : 'bg-page text-muted')}>{count}</span>}
            </button>
          )
        })}
      </div>
      {current && <Checklist key={current.id} tool={current} today={today} />}
    </section>
  )
}

function Checklist({ tool, today }) {
  const { allTasks, addTask, toggleComplete, setSelectedId } = usePlanner()
  const inputId = useId()
  const [text, setText] = useState('')
  const items = checklistItems(allTasks, tool.id, today)
  const room = roomLeft(tool, items)

  const add = (e) => {
    e.preventDefault()
    if (!text.trim() || room <= 0) return
    // 0 minutes: a queue of 20 patients is a list to work through, not 10 hours of planned time.
    addTask({ title: text.trim(), tags: [tool.id], date: today, durationMinutes: 0 })
    setText('')
  }

  return (
    <div id={`tool-${tool.id}`} className="card mt-2 p-4 animate-view-in">
      <h2 className="font-bold text-ink">{tool.label}</h2>
      <p className="text-sm text-muted">{tool.hint}</p>
      {items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {items.map((t) => {
            const done = t.status === 'completed'
            return (
              <li key={t.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-page transition">
                <button type="button" onClick={() => toggleComplete(t.id)} aria-pressed={done} aria-label={done ? `Mark not done: ${t.title}` : `Done: ${t.title}`}
                  className={cx('h-5 w-5 shrink-0 rounded-full border-2 inline-flex items-center justify-center transition', done ? 'bg-accent border-accent text-white' : 'border-line hover:border-faint')}>
                  {done && <Check size={12} strokeWidth={3} />}
                </button>
                <button type="button" onClick={() => setSelectedId(t.id)} className={cx('flex-1 min-w-0 text-left text-sm font-medium truncate', done ? 'text-faint line-through' : 'text-ink')}>{t.title}</button>
                {t.date && t.date < today && !done && <span className="shrink-0 text-[11px] font-semibold text-faint">from {t.date.slice(5).replace('-', '/')}</span>}
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={add} className="mt-3 flex gap-2">
        <label htmlFor={inputId} className="sr-only">Add to {tool.label}</label>
        <input id={inputId} value={text} onChange={(e) => setText(e.target.value)} disabled={room <= 0}
          placeholder={room <= 0 ? 'Three is the limit: finish one first' : `Add to ${tool.label.toLowerCase()}`}
          className="input h-10 flex-1 min-w-0" />
        <button type="submit" disabled={room <= 0 || !text.trim()} aria-label="Add" className="btn-black h-10 w-10 p-0 inline-flex items-center justify-center disabled:opacity-40"><Plus size={16} /></button>
      </form>
    </div>
  )
}
