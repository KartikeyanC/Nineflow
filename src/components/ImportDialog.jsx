import React, { useEffect, useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { Check, Loader2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { getConn } from '../lib/connections'
import { IMPORTERS } from '../lib/importers'
import { Modal, cx } from './ui'

// "Import from Todoist / Trello / GitHub": lists what the other tool has for the person, they tick
// what to bring in, and those become tasks here. Nothing is changed in the other tool. Tasks already
// imported show as "Already added" (the id is fixed, see lib/importers.js).
export default function ImportDialog({ service, onClose }) {
  const { allTasks, settings, addTasks } = usePlanner()
  const src = IMPORTERS[service]
  const [state, setState] = useState({ status: 'loading', items: [], error: '' })
  const [picked, setPicked] = useState(new Set())
  const have = useMemo(() => new Set(allTasks.map((t) => t.id)), [allTasks])

  useEffect(() => {
    let live = true
    src.load(getConn(service) || {})
      .then((items) => {
        if (!live) return
        setState({ status: 'ready', items, error: '' })
        setPicked(new Set(items.filter((i) => !have.has(i.id)).map((i) => i.id)))
      })
      .catch((e) => live && setState({ status: 'error', items: [], error: e.message || `Could not load from ${src.label}.` }))
    return () => { live = false }
  }, [service]) // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = state.items.filter((i) => !have.has(i.id))
  const chosen = fresh.filter((i) => picked.has(i.id))
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const importNow = () => {
    if (!chosen.length) return
    const category = settings.categories[0]?.id || 'work'
    addTasks(chosen.map((c) => ({
      id: c.id, title: c.title, description: c.description, date: c.date, startTime: c.date ? c.startTime : null,
      ...(c.durationMinutes ? { durationMinutes: c.durationMinutes } : {}), priority: c.priority, category, tags: c.tags,
    })), `Imported ${chosen.length} task${chosen.length === 1 ? '' : 's'} from ${src.label}`)
    onClose()
  }
  const when = (c) => (c.date ? `${format(parseISO(c.date), 'EEE d MMM')}${c.startTime ? ` · ${c.startTime}` : ''}` : 'No date')

  return (
    <Modal open onClose={onClose} width="max-w-lg" title={`Import from ${src.label}`}>
      {state.status === 'loading' && <p className="text-sm text-muted inline-flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" /> Loading your {src.what}…</p>}
      {state.status === 'error' && <p role="alert" className="text-sm font-semibold text-coral-fg">{state.error}</p>}
      {state.status === 'ready' && (state.items.length === 0 ? (
        <p className="text-sm text-muted">{src.label} has no {src.what} for you right now.</p>
      ) : (
        <>
          <p className="text-sm text-muted -mt-1">Your {src.what}. Tick the ones to bring in as NineFlow tasks. Nothing changes in {src.label}.</p>
          <div className="mt-3 flex items-center justify-between text-[12px] font-semibold">
            <span className="text-muted tnum">{chosen.length} of {fresh.length} selected</span>
            <span className="flex gap-3">
              <button type="button" className="text-lav-fg underline underline-offset-2" onClick={() => setPicked(new Set(fresh.map((i) => i.id)))}>All</button>
              <button type="button" className="text-lav-fg underline underline-offset-2" onClick={() => setPicked(new Set())}>None</button>
            </span>
          </div>
          <ul className="mt-2 max-h-[46vh] overflow-y-auto rounded-2xl border border-line divide-y divide-line" aria-label={`${src.label} items`}>
            {state.items.map((c) => {
              const added = have.has(c.id)
              const on = picked.has(c.id)
              return (
                <li key={c.id}>
                  <button type="button" role="checkbox" aria-checked={added ? true : on} disabled={added} onClick={() => toggle(c.id)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-page transition disabled:opacity-60 disabled:hover:bg-transparent">
                    <span className={cx('mt-0.5 shrink-0 h-5 w-5 rounded-md border-2 flex items-center justify-center', added || on ? 'bg-accent border-accent text-white' : 'border-line bg-card')}>
                      {(added || on) && <Check size={12} strokeWidth={3.5} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{c.title}</span>
                      <span className="block text-[11px] text-faint font-medium">{added ? 'Already added' : when(c)}{!added && c.priority === 'high' ? ' · High' : ''}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-black disabled:opacity-40" disabled={!chosen.length} onClick={importNow}>
              Import {chosen.length || ''} task{chosen.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      ))}
    </Modal>
  )
}
