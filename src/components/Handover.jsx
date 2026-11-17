import React, { useMemo, useState } from 'react'
import { Check, Copy, Download, Lock, Printer } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { FINISHED_CHOICES, NOTE_MAX, buildHandover, handoverHtml, handoverText } from '../lib/handover'
import { currentProfile } from '../lib/profiles'
import { format } from '../lib/dateFormat'
import { isNativeApp } from '../lib/platform'
import { Modal, cx } from './ui'
import { WorkForBadge, useWorkFor } from './WorkFor'

// "Hand over": one company's / client's work as a pack for whoever takes it over. Notes are
// written here and kept (settings.workFor.notes), so the pack can be built up over weeks and made
// again on the last day. Personal tasks are never in it (lib/handover.js).

function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const PROMPTS = [
  'Who to ask for what (names, roles, how to reach them)',
  'Where the files, folders and drives are',
  'Which tools and accounts the work uses (never write passwords here)',
  'Anything half-done, promised or about to be due',
]

export default function HandoverDialog({ name, onClose }) {
  const { allTasks, settings, updateSettings, now } = usePlanner()
  const { label } = useWorkFor()
  const wf = settings.workFor || {}
  const [note, setNote] = useState(wf.notes?.[name] || '')
  const [days, setDays] = useState(90)
  const [copied, setCopied] = useState(false)
  const pack = useMemo(() => buildHandover({ tasks: allTasks, name, now, finishedDays: days }), [allTasks, name, now, days])
  const meta = { from: currentProfile()?.name || '', date: format(now, 'd MMMM yyyy'), note, label: label.one === 'Work for' ? 'Work for' : label.one }
  const fileBase = `Handover-${name}`.replace(/[^\w.-]+/g, '-')

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

  return (
    <Modal open onClose={() => { keepNote(); onClose() }} title={`Hand over ${name}`} width="max-w-2xl">
      <p className="text-sm text-muted -mt-1">Everything the next person needs to pick up the work for <WorkForBadge name={name} className="align-middle" />: what's open, the regular duties, what was finished, and your notes.</p>

      <label className="block mt-4">
        <span className="block text-sm font-semibold">Notes for the next person</span>
        <textarea aria-label="Notes for the next person" className="input mt-1.5 h-36 resize-y text-sm leading-relaxed" value={note} maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)} onBlur={keepNote}
          placeholder={PROMPTS.map((p) => `• ${p}`).join('\n')} />
        <span className="mt-1 flex justify-between gap-3 text-xs text-muted">
          <span>Kept here, so you can add to it any time. Never write passwords in it.</span>
          <span className="tnum shrink-0">{note.length}/{NOTE_MAX}</span>
        </span>
      </label>

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
          <p className="mt-3 text-sm text-muted">No tasks for {name} yet. The pack will only have your notes.</p>
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
    </Modal>
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
            {sub && <span className={cx('min-w-0 max-w-[60%] truncate text-right text-xs text-muted')}>{sub}</span>}
          </li>
        ))}
        {items.length > 8 && <li className="text-xs text-faint">and {items.length - 8} more</li>}
      </ul>
    </div>
  )
}
