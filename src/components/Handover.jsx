import React, { useMemo, useState } from 'react'
import { BookOpen, Check, Copy, Download, Lightbulb, Lock, NotebookPen, Plus, Printer, Send, Trash2, Users } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { FINISHED_CHOICES, NOTE_MAX, buildHandover, handoverHtml, handoverText } from '../lib/handover'
import { currentProfile } from '../lib/profiles'
import { format } from '../lib/dateFormat'
import { isNativeApp } from '../lib/platform'
import { Modal, cx } from './ui'
import { WorkForBadge, useWorkFor } from './WorkFor'
import { TransferSend } from './Transfer'

// "Hand over": one company's / client's work as a pack for whoever takes it over. What you write
// here is kept (settings.workFor: notes, people, glossary), so it can be built up over weeks and the
// pack made again on the last day. Personal tasks are never in it (lib/handover.js).

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PROMPTS = [
  'Where the files, folders and drives are',
  'Which tools and accounts the work uses (never write passwords here)',
  'Anything half-done, promised or about to be due',
  'How things are usually done here',
]

const TABS = [
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'people', label: 'People', icon: Users },
  { id: 'words', label: 'Words', icon: BookOpen },
]

export default function HandoverDialog({ name, onClose }) {
  const { allTasks, settings, updateSettings, setSelectedId, now } = usePlanner()
  const { label } = useWorkFor()
  const wf = settings.workFor || {}
  const [tab, setTab] = useState('notes')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState(wf.notes?.[name] || '')
  const [days, setDays] = useState(90)
  const [copied, setCopied] = useState(false)
  const people = wf.people?.[name] || []
  const glossary = wf.glossary?.[name] || []
  const pack = useMemo(() => buildHandover({ tasks: allTasks, name, now, finishedDays: days }), [allTasks, name, now, days])
  const meta = { from: currentProfile()?.name || '', date: format(now, 'd MMMM yyyy'), note, label: label.one, people, glossary }
  const fileBase = `Handover-${name}`.replace(/[^\w.-]+/g, '-')

  const setList = (key, list) => {
    const { [name]: _, ...rest } = wf[key] || {}
    updateSettings({ workFor: { ...wf, [key]: list.length ? { ...rest, [name]: list } : rest } })
  }
  const keepNote = () => {
    const text = note.slice(0, NOTE_MAX)
    if ((wf.notes?.[name] || '') === text) return
    const { [name]: _, ...rest } = wf.notes || {}
    updateSettings({ workFor: { ...wf, notes: text.trim() ? { ...rest, [name]: text } : rest } })
  }
  const print = () => {
    keepNote()
    const html = handoverHtml(pack, meta)
    if (isNativeApp()) { save(`${fileBase}.html`, html, 'text/html'); return }
    const frame = Object.assign(document.createElement('iframe'), { title: 'Handover' })
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(frame)
    frame.contentDocument.open(); frame.contentDocument.write(html); frame.contentDocument.close()
    setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 1000) }, 150)
  }
  const download = () => { keepNote(); save(`${fileBase}.html`, handoverHtml(pack, meta), 'text/html') }
  const copy = async () => {
    keepNote()
    try { await navigator.clipboard.writeText(handoverText(pack, meta)); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* the buttons beside it still work */ }
  }
  const close = () => { keepNote(); onClose() }
  const openTask = (id) => { close(); setSelectedId(id) }

  return (
    <Modal open onClose={close} title={sending ? `Transfer ${name} to the next person` : `Hand over ${name}`} width="max-w-2xl">
      {sending ? <TransferSend name={name} onBack={() => setSending(false)} onDone={close} /> : <>
      <p className="text-sm text-muted -mt-1">Everything the next person needs to pick up the work for <WorkForBadge name={name} className="align-middle" />. What you write here is kept, so add to it any time.</p>

      <div role="tablist" aria-label="What to write" className="mt-4 inline-flex rounded-full border border-line bg-page p-0.5">
        {TABS.map((t) => {
          const n = t.id === 'people' ? people.length : t.id === 'words' ? glossary.length : 0
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { keepNote(); setTab(t.id) }}
              className={cx('h-8 rounded-full px-3 inline-flex items-center gap-1.5 text-[13px] font-semibold transition', tab === t.id ? 'bg-card text-ink shadow-soft' : 'text-muted hover:text-ink')}>
              <t.icon size={13} aria-hidden="true" /> {t.label}{n > 0 && <span className="text-faint tnum">{n}</span>}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="mt-3">
        {tab === 'notes' && (
          <label className="block">
            <span className="sr-only">Notes for the next person</span>
            <textarea aria-label="Notes for the next person" className="input h-36 resize-y text-sm leading-relaxed" value={note} maxLength={NOTE_MAX}
              onChange={(e) => setNote(e.target.value)} onBlur={keepNote}
              placeholder={PROMPTS.map((p) => `• ${p}`).join('\n')} />
            <span className="mt-1 flex justify-between gap-3 text-xs text-muted">
              <span>Never write passwords here.</span>
              <span className="tnum shrink-0">{note.length}/{NOTE_MAX}</span>
            </span>
          </label>
        )}
        {tab === 'people' && (
          <RowsEditor rows={people} onChange={(l) => setList('people', l)} empty="Who the next person should ask, and for what."
            cols={[{ key: 'who', label: 'Name', max: 80, required: true, w: 'sm:w-[30%]' }, { key: 'role', label: 'Role or what to ask them', max: 80, w: 'sm:w-[34%]' }, { key: 'contact', label: 'How to reach them', max: 120, w: 'sm:flex-1' }]} />
        )}
        {tab === 'words' && (
          <RowsEditor rows={glossary} onChange={(l) => setList('glossary', l)} empty={`Short forms and words that mean something special at ${name}, e.g. "PR = press release".`}
            cols={[{ key: 'term', label: 'Word or short form', max: 60, required: true, w: 'sm:w-[32%]' }, { key: 'meaning', label: 'What it means here', max: 300, w: 'sm:flex-1' }]} />
        )}
      </div>

      {pack.unclear.length > 0 && (
        <div className="mt-4 rounded-2xl bg-butter/60 px-3.5 py-3 text-butter-fg">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb size={14} aria-hidden="true" /> {pack.unclear.length} task{pack.unclear.length === 1 ? '' : 's'} may be hard to follow</p>
          <p className="mt-0.5 text-xs">A few words and nothing else. Add a line in Why so the next person knows what each one is.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {pack.unclear.slice(0, 12).map((t) => (
              <li key={t.id}><button type="button" onClick={() => openTask(t.id)} className="rounded-full bg-card/80 px-2.5 py-1 text-xs font-semibold text-ink hover:bg-card">{t.title}</button></li>
            ))}
            {pack.unclear.length > 12 && <li className="px-1 py-1 text-xs">and {pack.unclear.length - 12} more</li>}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-line bg-page p-3.5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <span><b className="tnum">{pack.openCount}</b> open task{pack.openCount === 1 ? '' : 's'}</span>
          <span><b className="tnum">{pack.recurring.length}</b> regular dut{pack.recurring.length === 1 ? 'y' : 'ies'}</span>
          <span><b className="tnum">{pack.finished.length}</b> finished in the last
            <select className="ml-1 rounded-md border border-line bg-card px-1 py-0.5 text-sm font-semibold" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="How far back to list finished work">
              {FINISHED_CHOICES.map((d) => <option key={d} value={d}>{d === 365 ? 'year' : `${d} days`}</option>)}
            </select>
          </span>
        </div>
        {pack.empty ? (
          <p className="mt-3 text-sm text-muted">No tasks for {name} yet. The pack will have what you write above.</p>
        ) : (
          <div className="mt-3 max-h-56 overflow-y-auto space-y-3 pr-1">
            {pack.recurring.length > 0 && <Section title="Regular duties" items={pack.recurring.map((r) => [r.title, r.how])} />}
            {pack.groups.map((g) => <Section key={g.id} title={g.title} items={g.items.map((t) => [t.title, [t.waiting, t.date].filter(Boolean).join(' · ')])} />)}
          </div>
        )}
        {pack.privateCount > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Lock size={12} aria-hidden="true" /> {pack.privateCount} personal task{pack.privateCount === 1 ? ' is' : 's are'} left out.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy as text'}</button>
        {!isNativeApp() && <button type="button" className="btn-ghost" onClick={download}><Download size={14} /> Download page</button>}
        <button type="button" className="btn-black" onClick={print}><Printer size={14} /> {isNativeApp() ? 'Download handover' : 'Print or save as PDF'}</button>
      </div>
      <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted max-w-sm">Is the next person on NineFlow too? Give them a file that moves this work into their planner.</p>
        <button type="button" className="btn-ghost" onClick={() => { keepNote(); setSending(true) }}><Send size={14} /> Transfer to the next person</button>
      </div>
      </>}
    </Modal>
  )
}

// A small list of rows (people, or words and their meaning): edit in place, add, remove.
function RowsEditor({ rows, cols, onChange, empty }) {
  const blank = Object.fromEntries(cols.map((c) => [c.key, '']))
  const [draft, setDraft] = useState(blank)
  const req = cols.find((c) => c.required).key
  const clean = (r) => Object.fromEntries(cols.map((c) => [c.key, (r[c.key] || '').replace(/\s+/g, ' ').trim().slice(0, c.max)]))
  const add = (e) => {
    e.preventDefault()
    const r = clean(draft)
    if (!r[req]) return
    onChange([...rows, r]); setDraft(blank)
  }
  const change = (i, key, value) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  const tidy = (i) => { const r = clean(rows[i]); if (!r[req]) onChange(rows.filter((_, j) => j !== i)); else onChange(rows.map((x, j) => (j === i ? r : x))) }
  return (
    <div>
      {rows.length === 0 && <p className="mb-2 text-sm text-muted">{empty}</p>}
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            {cols.map((c) => (
              <input key={c.key} value={r[c.key] || ''} maxLength={c.max} aria-label={`${c.label}, row ${i + 1}`} placeholder={c.label}
                onChange={(e) => change(i, c.key, e.target.value)} onBlur={() => tidy(i)}
                className={cx('input h-9 py-0 text-[13px] w-full', c.w, c.required && 'font-semibold')} />
            ))}
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r[req] || 'row'}`}
              className="h-9 w-9 shrink-0 self-end sm:self-auto rounded-full inline-flex items-center justify-center text-faint hover:bg-coral/60 hover:text-coral-fg"><Trash2 size={14} /></button>
          </li>
        ))}
      </ul>
      {rows.length < 100 && (
        <form onSubmit={add} className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center">
          {cols.map((c) => (
            <input key={c.key} value={draft[c.key]} maxLength={c.max} placeholder={c.label} aria-label={`New: ${c.label}`}
              onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
              className={cx('input h-9 py-0 text-[13px] w-full', c.w)} />
          ))}
          <button type="submit" disabled={!draft[req].trim()} aria-label="Add" className="btn-black h-9 w-9 shrink-0 self-end sm:self-auto p-0 justify-center disabled:opacity-40"><Plus size={15} /></button>
        </form>
      )}
    </div>
  )
}

function Section({ title, items }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">{title} <span className="tnum">({items.length})</span></p>
      <ul className="mt-1 space-y-0.5">
        {items.slice(0, 8).map(([t, sub], i) => (
          <li key={i} className="flex items-baseline gap-2 text-[13px]">
            <span className="min-w-[40%] flex-1 truncate font-medium">{t}</span>
            {sub && <span className="min-w-0 max-w-[60%] truncate text-right text-xs text-muted">{sub}</span>}
          </li>
        ))}
        {items.length > 8 && <li className="text-xs text-faint">and {items.length - 8} more</li>}
      </ul>
    </div>
  )
}
