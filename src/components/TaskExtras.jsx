import React, { useId, useMemo, useState } from 'react'
import { BookmarkPlus, Check, Lock, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { uid } from '../lib/storage'
import { MAX_TEMPLATES, cleanTemplates, templateFromTask } from '../lib/views'
import { MAX_TAGS, NAG_CHOICES, REMINDER_CHOICES, allTags, cleanTag, cleanTags, effectiveReminders, reminderLabel, reminderShort } from '../lib/taskMeta'
import { cx } from './ui'
import { DateField } from './DatePicker'
import { cleanTaskFields, withValue } from '../lib/fields'
import { cleanName } from '../lib/workFor'
import { useWorkFor } from './WorkFor'

// The "Reminders" and "Tags" rows of the task panel.

const pill = (on) => cx('pill h-7 px-3 text-[12px] border transition', on ? 'bg-brand text-white border-transparent' : 'bg-card text-muted border-line hover:text-ink')

export function RemindersField({ task }) {
  const { updateTask, settings } = usePlanner()
  const [note, setNote] = useState('')
  const own = Array.isArray(task.reminders)
  const list = own ? task.reminders : []
  const def = settings.reminders?.enabled ? settings.reminders.minutes : null

  const ensurePermission = async () => {
    if (typeof Notification === 'undefined') { setNote('This browser does not support notifications.'); return false }
    let perm = Notification.permission
    if (perm === 'default') { try { perm = await Notification.requestPermission() } catch { perm = 'denied' } }
    if (perm !== 'granted') { setNote("Notifications are blocked for this site. Allow them in the browser's site settings, then try again."); return false }
    setNote('')
    return true
  }
  const toggle = async (m) => {
    if (!list.includes(m) && !(await ensurePermission())) return
    const next = list.includes(m) ? list.filter((x) => x !== m) : [...list, m].sort((a, b) => a - b)
    updateTask(task.id, { reminders: next })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reminders">
        <button type="button" aria-pressed={!own} onClick={() => { setNote(''); updateTask(task.id, { reminders: null }) }} className={pill(!own)}>
          Default{!own && (def != null && task.startTime ? ` (${reminderShort(def)})` : ' (off)')}
        </button>
        <button type="button" aria-pressed={own && list.length === 0} onClick={() => { setNote(''); updateTask(task.id, { reminders: [] }) }} className={pill(own && list.length === 0)}>None</button>
        {REMINDER_CHOICES.map((m) => (
          <button key={m} type="button" aria-pressed={list.includes(m)} onClick={() => toggle(m)} title={reminderLabel(m)} className={pill(list.includes(m))}>{reminderShort(m)}</button>
        ))}
      </div>
      {task.startTime && effectiveReminders(task, settings).length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Keep reminding">
          <span className="text-xs text-faint mr-0.5">Keep reminding</span>
          <button type="button" aria-pressed={task.nagEvery == null} onClick={() => updateTask(task.id, { nagEvery: null })} className={pill(task.nagEvery == null)}>
            Default{task.nagEvery == null && ` (${settings.reminders?.repeat ? `${settings.reminders.repeat} min` : 'once'})`}
          </button>
          <button type="button" aria-pressed={task.nagEvery === 0} onClick={() => updateTask(task.id, { nagEvery: 0 })} className={pill(task.nagEvery === 0)}>Once</button>
          {NAG_CHOICES.map((m) => (
            <button key={m} type="button" aria-pressed={task.nagEvery === m} onClick={() => updateTask(task.id, { nagEvery: m })} className={pill(task.nagEvery === m)}>{m} min</button>
          ))}
        </div>
      )}
      {own && list.length > 0 && !task.startTime && <p className="mt-1.5 text-xs text-faint">No start time, so reminders count from 09:00 on the day.</p>}
      {note && <p role="alert" className="mt-1.5 text-[12px] text-coral-fg font-semibold">{note}</p>}
      {own && list.length > 0 && !note && <p className="mt-1.5 text-xs text-faint">Notifications show while NineFlow is open.</p>}
    </div>
  )
}

export function TagsField({ task }) {
  const { tasks, updateTask } = usePlanner()
  const [text, setText] = useState('')
  const listId = useId()
  const tags = task.tags || []
  const suggestions = allTags(tasks).map((t) => t.tag).filter((t) => !tags.includes(t))

  const add = (raw) => {
    const incoming = String(raw).split(/[\s,]+/).map(cleanTag).filter(Boolean)
    if (!incoming.length) { setText(''); return }
    updateTask(task.id, { tags: cleanTags([...tags, ...incoming]) })
    setText('')
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span key={t} className="pill bg-lav text-lav-fg pr-1">
            #{t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => updateTask(task.id, { tags: tags.filter((x) => x !== t) })}
              className="h-4 w-4 rounded-full inline-flex items-center justify-center hover:bg-lav-fg/15 transition"><X size={10} /></button>
          </span>
        ))}
        {tags.length < MAX_TAGS && (
          <>
            <input value={text} list={listId} aria-label="Add a tag" placeholder={tags.length ? 'Add tag' : 'Add a tag, e.g. client-a'}
              onChange={(e) => { const v = e.target.value; /[\s,]$/.test(v) ? add(v) : setText(v) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } else if (e.key === 'Backspace' && !text && tags.length) updateTask(task.id, { tags: tags.slice(0, -1) }) }}
              onBlur={() => text && add(text)}
              className="bg-transparent outline-none text-sm py-1 min-w-[8rem] flex-1 placeholder:text-faint" />
            <datalist id={listId}>{suggestions.slice(0, 20).map((t) => <option key={t} value={t} />)}</datalist>
          </>
        )}
      </div>
    </div>
  )
}

// "Asked by" and "Why": a line each, saved when the box is left. Asked by suggests the people already
// named on this company's tasks (or listed in its handover), so the same person is spelled one way.
export function ContextField({ task, field, placeholder, max }) {
  const { allTasks, updateTask, settings } = usePlanner()
  const [text, setText] = useState(task[field] || '')
  const listId = useId()
  const suggestions = useMemo(() => {
    if (field !== 'askedBy') return []
    const set = new Set()
    for (const t of allTasks) if (t.askedBy && (!task.client || t.client === task.client)) set.add(t.askedBy)
    for (const p of settings.workFor?.people?.[task.client] || []) set.add(p.role ? `${p.who} (${p.role})` : p.who)
    return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 30)
  }, [allTasks, settings.workFor, task.client, field])
  const save = () => {
    const v = text.replace(/\s+/g, ' ').trim().slice(0, max)
    if (v !== text) setText(v)
    if (v !== (task[field] || '')) updateTask(task.id, { [field]: v })
  }
  return (
    <>
      <input value={text} maxLength={max} placeholder={placeholder} aria-label={placeholder} list={suggestions.length ? listId : undefined}
        onChange={(e) => setText(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
        className="input h-9 py-0 w-full" />
      {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
    </>
  )
}

// The "Work for" row (called Company, Client, Project… by role): who the work is for, suggesting
// every name already in use, and whether its time is billable. A name typed in another case
// ("acme") becomes the one already on the list ("Acme"), so one company never turns into two.
export function ClientField({ task }) {
  const { updateTask } = usePlanner()
  const { label, names, active, color } = useWorkFor()
  const [text, setText] = useState(task.client || '')
  const listId = useId()
  const save = () => {
    const typed = cleanName(text)
    const client = (typed && names.find((n) => n.toLowerCase() === typed.toLowerCase())) || typed || null
    if (client !== text) setText(client || '')
    if (client !== (task.client || null)) updateTask(task.id, { client, ...(client ? {} : { billable: false }) })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="relative flex-1 min-w-[8rem]">
        {task.client && <span className={cx('pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-[3px]', color(task.client).dot)} aria-hidden="true" />}
        <input value={text} list={listId} aria-label={label.one} placeholder={label.none}
          onChange={(e) => setText(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
          className={cx('input h-9 py-0 w-full', task.client && 'pl-7')} />
      </span>
      <datalist id={listId}>{active.map((c) => <option key={c} value={c} />)}</datalist>
      <button type="button" role="switch" aria-checked={!!task.billable} onClick={() => updateTask(task.id, { billable: !task.billable })}
        className={pill(task.billable)}>
        {task.billable && <Check size={12} />} Billable
      </button>
      <button type="button" role="switch" aria-checked={!!task.private} onClick={() => updateTask(task.id, { private: !task.private })}
        title="Personal tasks are never put in a handover" className={pill(task.private)}>
        <Lock size={11} aria-hidden="true" /> Personal
      </button>
    </div>
  )
}

// "Save as template": keeps this task's title, notes, length, priority, category,
// tags, reminders and checklist so a new task can start from it.
export function SaveAsTemplate({ task }) {
  const { settings, updateSettings } = usePlanner()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saved, setSaved] = useState('')
  const list = cleanTemplates(settings.templates)

  const save = () => {
    const n = name.trim()
    if (!n) return
    updateSettings({ templates: [...list, templateFromTask(task, n, uid())] })
    setSaved(n); setOpen(false); setName('')
    setTimeout(() => setSaved(''), 3500)
  }
  if (saved) return <p role="status" className="text-[12px] font-semibold text-mint-fg inline-flex items-center gap-1.5"><Check size={13} /> Saved as template “{saved}”. Find it in New task.</p>
  if (list.length >= MAX_TEMPLATES) return <p className="text-[12px] text-faint">You have {MAX_TEMPLATES} templates. Delete one in Settings to save another.</p>
  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setName(task.title.slice(0, 30)) }}
        className="text-[12px] font-semibold text-muted hover:text-ink inline-flex items-center gap-1.5 transition">
        <BookmarkPlus size={13} /> Save as template
      </button>
    )
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex items-center gap-2">
      <input autoFocus value={name} maxLength={30} aria-label="Template name" placeholder="Template name" onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }} className="input h-8 py-0 flex-1 min-w-0 text-[13px]" />
      <button type="submit" disabled={!name.trim()} className={cx('btn-black h-8 py-0 px-3', !name.trim() && 'opacity-40')}>Save</button>
      <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:bg-page hover:text-ink"><X size={14} /></button>
    </form>
  )
}

// One input per custom field (Settings → Custom fields), for the task panel's rows.
export function FieldInput({ task, field }) {
  const { updateTask } = usePlanner()
  const value = cleanTaskFields(task.fields, [field])[field.id]
  const set = (v) => updateTask(task.id, { fields: withValue(task.fields, field, v) })
  const box = 'input h-9 py-0 w-full'
  if (field.type === 'check') {
    return (
      <button type="button" role="switch" aria-checked={!!value} aria-label={field.name} onClick={() => set(!value || undefined)} className={pill(!!value)}>
        {value && <Check size={12} />} {value ? 'Yes' : 'No'}
      </button>
    )
  }
  if (field.type === 'select') {
    return (
      <select className={box} aria-label={field.name} value={value || ''} onChange={(e) => set(e.target.value)}>
        <option value="">—</option>{field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (field.type === 'date') return <DateField size="sm" className="w-full" ariaLabel={field.name} placeholder="—" value={value || null} onChange={(v) => set(v || '')} />
  // Text and numbers save when you leave the box (or press Enter), not on every key.
  return (
    <input key={`${task.id}:${value ?? ''}`} type={field.type === 'number' ? 'number' : 'text'} step="any" inputMode={field.type === 'number' ? 'decimal' : undefined}
      className={box} aria-label={field.name} defaultValue={value ?? ''} placeholder="—"
      onBlur={(e) => e.target.value !== String(value ?? '') && set(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
  )
}
