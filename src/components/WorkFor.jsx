import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, Check, ChevronsUpDown, Handshake, Pencil, Plus, Trash2, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { currentProfile } from '../lib/profiles'
import { COLOR_IDS, colorOf } from '../lib/colors'
import { LABELS, LABEL_CHOICES, NONE, autoLabelId, cleanName, colorFor, labelOf, namesIn } from '../lib/workFor'
import { cx, useDialogFocus } from './ui'
import HandoverDialog from './Handover'

// "Work for": which company / client / project a task is for (lib/workFor.js).

// What it is called here, and every name in use (from all tasks, whatever is being shown).
export function useWorkFor() {
  const { allTasks, settings } = usePlanner()
  const label = labelOf(settings, currentProfile()?.occupation)
  const names = useMemo(() => namesIn(allTasks, settings), [allTasks, settings])
  return { label, names, color: (name) => colorOf(colorFor(settings, name)) }
}

// A small square-cornered badge (categories are round pills, so the two never look alike).
export function WorkForBadge({ name, className }) {
  const { settings } = usePlanner()
  if (!name) return null
  const c = colorOf(colorFor(settings, name))
  return (
    <span title={name} className={cx('inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-none', c.bg, c.text, className)}>
      <span className={cx('h-2 w-2 shrink-0 rounded-[3px]', c.dot)} aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  )
}

const Dot = ({ name, none, settings, size = 10 }) => (
  none
    ? <span className="shrink-0 rounded-[3px] border border-dashed border-faint" style={{ width: size, height: size }} aria-hidden="true" />
    : <span className={cx('shrink-0 rounded-[3px]', colorOf(colorFor(settings, name)).dot)} style={{ width: size, height: size }} aria-hidden="true" />
)

// The list in the switch: All, each name with how many tasks, and "No company".
function FocusList({ onPick, onHandover }) {
  const { allTasks, everyActiveTask, settings, workFocus, setWorkFocus, setView } = usePlanner()
  const { label, names } = useWorkFor()
  const counts = useMemo(() => {
    const m = new Map()
    for (const t of everyActiveTask) if (t.status !== 'completed') m.set(t.client || NONE, (m.get(t.client || NONE) || 0) + 1)
    return m
  }, [everyActiveTask])
  const pick = (v) => { setWorkFocus(v); onPick?.() }
  const unset = allTasks.some((t) => !t.client)
  const Row = ({ value, children, count }) => {
    const on = (workFocus || null) === value
    return (
      <li>
        <button type="button" onClick={() => pick(value)} aria-current={on ? 'true' : undefined}
          className={cx('flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] font-semibold transition', on ? 'bg-accent-soft text-lav-fg' : 'hover:bg-subtle')}>
          {children}
          {count > 0 && <span className="ml-auto text-[11px] font-semibold text-faint tnum" title={`${count} open`}>{count}</span>}
          {on && <Check size={14} className={cx('shrink-0 text-lav-fg', !count && 'ml-auto')} aria-hidden="true" />}
        </button>
      </li>
    )
  }
  return (
    <div>
      <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-faint">Show tasks for</p>
      <ul className="space-y-0.5 max-h-[50vh] overflow-y-auto">
        <Row value={null}><Briefcase size={13} className="shrink-0 text-faint" aria-hidden="true" /><span className="flex-1">All {label.many === label.one ? '' : label.many.toLowerCase()}</span></Row>
        {names.map((n) => (
          <Row key={n} value={n} count={counts.get(n) || 0}><Dot name={n} settings={settings} /><span className="flex-1 min-w-0 truncate">{n}</span></Row>
        ))}
        {unset && <Row value={NONE} count={counts.get(NONE) || 0}><Dot none /><span className="flex-1 text-muted">{label.none}</span></Row>}
      </ul>
      <div className="mt-2 pt-2 border-t border-line">
        {workFocus && workFocus !== NONE && (
          <button type="button" onClick={() => { onPick?.(); onHandover?.(workFocus) }}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-[12px] font-semibold text-ink hover:bg-subtle transition">
            <Handshake size={13} aria-hidden="true" /> <span className="min-w-0 truncate">Hand over {workFocus}…</span>
          </button>
        )}
        <button type="button" onClick={() => { setView('settings'); onPick?.(); requestAnimationFrame(() => document.getElementById('work-for-settings')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-[12px] font-semibold text-muted hover:bg-subtle hover:text-ink transition">
          <Pencil size={12} aria-hidden="true" /> Names, colours and new tasks
        </button>
      </div>
    </div>
  )
}

// The switch, under the workspace one. Only there once something has a name.
export function WorkForSwitch({ compact = false, className }) {
  const { settings, workFocus } = usePlanner()
  const { label, names } = useWorkFor()
  const [open, setOpen] = useState(false)
  const [handover, setHandover] = useState(null)
  const root = useRef(null)
  const panel = useRef(null)
  useDialogFocus(panel, open)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!root.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  if (!names.length && !workFocus) return null
  const text = !workFocus ? `All ${label.many === label.one ? '' : label.many.toLowerCase()}`.trim() : workFocus === NONE ? label.none : workFocus
  return (
    <div ref={root} className={cx('relative', className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open}
        data-tip={label.one} data-tip-hint={text} aria-label={`${label.one}: ${text}`}
        className={cx('flex w-full items-center gap-2.5 rounded-full h-9 px-2.5 border transition',
          workFocus ? 'border-lav-fg/40 bg-accent-soft' : 'border-line bg-page hover:border-faint',
          compact ? 'justify-center wide:justify-start' : 'justify-start')}>
        {workFocus ? <Dot name={workFocus} none={workFocus === NONE} settings={settings} size={12} /> : <Briefcase size={14} className="shrink-0 text-faint" aria-hidden="true" />}
        <span className={cx('min-w-0 flex-1 truncate text-left text-[12px] font-semibold', workFocus && 'text-lav-fg', compact && 'hidden wide:block')}>{text}</span>
        <ChevronsUpDown size={13} className={cx('shrink-0 text-faint', compact && 'hidden wide:block')} />
      </button>
      {open && <div className="sm:hidden fixed inset-0 z-40 bg-ink/30 animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />}
      {open && (
        <div ref={panel} tabIndex={-1} role="dialog" aria-label={`Show tasks for one ${label.one.toLowerCase()}`}
          className="fixed inset-x-4 top-16 z-50 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[260px] rounded-2xl bg-card p-2.5 shadow-lift ring-hair animate-modal-in outline-none">
          <FocusList onPick={() => setOpen(false)} onHandover={setHandover} />
        </div>
      )}
      {handover && <HandoverDialog name={handover} onClose={() => setHandover(null)} />}
    </div>
  )
}

// Over every page while only one is shown, so a short list never looks like lost tasks.
export function WorkForBar() {
  const { workFocus, setWorkFocus, settings, everyActiveTask, tasks } = usePlanner()
  const { label } = useWorkFor()
  if (!workFocus) return null
  const hidden = everyActiveTask.length - tasks.length
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-lav-fg/25 bg-accent-soft px-3.5 py-2 text-[13px]">
      <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-lav-fg">
        <Dot name={workFocus} none={workFocus === NONE} settings={settings} size={11} />
        <span className="truncate">Showing only {workFocus === NONE ? `tasks with ${label.none.toLowerCase()}` : workFocus}</span>
      </span>
      {hidden > 0 && <span className="text-muted tnum">{hidden} other task{hidden === 1 ? '' : 's'} hidden</span>}
      <button type="button" onClick={() => setWorkFocus(null)} className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 h-7 font-semibold text-ink hover:bg-card/70 transition">
        <X size={13} aria-hidden="true" /> Show all
      </button>
    </div>
  )
}

// Settings: what it is called, the names (colour, rename, remove), and what new tasks get.
export function WorkForSettings() {
  const { allTasks, settings, updateSettings, updateTasks, workFocus, setWorkFocus } = usePlanner()
  const { label, names } = useWorkFor()
  const wf = settings.workFor || { label: 'auto', colors: {}, stamp: null, notes: {} }
  const save = (patch) => updateSettings({ workFor: { ...wf, ...patch } })
  const [editing, setEditing] = useState(null)
  const [handover, setHandover] = useState(null)
  const [text, setText] = useState('')
  const [adding, setAdding] = useState('')
  const [error, setError] = useState(null)
  const occupation = currentProfile()?.occupation
  const used = useMemo(() => {
    const m = new Map()
    for (const t of allTasks) if (t.client) m.set(t.client, (m.get(t.client) || 0) + 1)
    return m
  }, [allTasks])
  const exists = (n, except) => names.some((x) => x !== except && x.toLowerCase() === n.toLowerCase())

  const add = (e) => {
    e.preventDefault()
    const n = cleanName(adding)
    if (!n) return
    if (exists(n)) { setError(`${n} is already on the list.`); return }
    save({ colors: { ...wf.colors, [n]: colorFor(settings, n) } })
    setAdding(''); setError(null)
  }
  // Renaming changes every task that has it, and carries its colour, hourly rate and invoice details.
  const rename = (from) => {
    const to = cleanName(text)
    if (!to || to === from) { setEditing(null); return }
    if (exists(to, from)) { setError(`${to} is already on the list.`); return }
    const ids = allTasks.filter((t) => t.client === from).map((t) => t.id)
    if (ids.length) updateTasks(ids, { client: to }, `Renamed ${from} to ${to}`)
    const { [from]: color, ...colors } = wf.colors
    const { [from]: note, ...notes } = wf.notes || {}
    const billing = settings.billing
    const clients = billing?.clients?.[from] ? (({ [from]: b, ...rest }) => ({ ...rest, [to]: b }))(billing.clients) : null
    updateSettings({
      workFor: { ...wf, colors: { ...colors, [to]: color || colorFor(settings, from) }, notes: note ? { ...notes, [to]: note } : notes, stamp: wf.stamp === from ? to : wf.stamp },
      ...(clients ? { billing: { ...billing, clients } } : {}),
    })
    if (workFocus === from) setWorkFocus(to)
    setEditing(null); setError(null)
  }
  const remove = (n) => {
    const { [n]: _, ...colors } = wf.colors
    const { [n]: __, ...notes } = wf.notes || {}
    save({ colors, notes, stamp: wf.stamp === n ? null : wf.stamp })
    if (workFocus === n) setWorkFocus(null)
  }

  return (
    <section id="work-for-settings" className="card p-5 scroll-mt-4">
      <div className="flex items-center gap-3 mb-4">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-accent-soft text-lav-fg inline-flex items-center justify-center max-sm:hidden"><Briefcase size={18} /></span>
        <div className="min-w-0">
          <h2 className="h-display text-base">Who it's for</h2>
          <p className="text-sm text-muted">Put a company, client or project on each task, so you always know whose work it was, even months later.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <label className="block">
          <span className="text-sm font-semibold">Call it</span>
          <select className="input mt-1.5" value={wf.label} onChange={(e) => save({ label: e.target.value })}>
            <option value="auto">{LABELS[autoLabelId(occupation)].one} (from what you do)</option>
            {LABEL_CHOICES.map((id) => <option key={id} value={id}>{LABELS[id].one}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">New tasks get</span>
          <select className="input mt-1.5" value={wf.stamp || ''} onChange={(e) => save({ stamp: e.target.value || null })}>
            <option value="">Nothing ({label.none.toLowerCase()})</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted">While you show only one, new tasks get that one instead.</span>
        </label>
      </div>

      <p className="mt-5 mb-2 text-sm font-semibold">{label.many === label.one ? 'Names' : label.many}</p>
      {names.length === 0 && <p className="text-sm text-muted mb-2">None yet. Add one below, or type one in a task's {label.one} box.</p>}
      <ul className="space-y-1.5 max-w-2xl">
        {names.map((n) => (
          <li key={n} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-page px-2.5 py-1.5">
            {editing === n ? (
              <>
                <input autoFocus value={text} maxLength={60} aria-label={`New name for ${n}`} onChange={(e) => { setText(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename(n) } else if (e.key === 'Escape') { e.stopPropagation(); setEditing(null) } }}
                  className="input h-8 py-0 flex-1 min-w-[8rem] text-[13px]" />
                <button type="button" onClick={() => rename(n)} aria-label="Save name" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-mint-fg hover:bg-card"><Check size={15} /></button>
                <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:bg-card hover:text-ink"><X size={15} /></button>
              </>
            ) : (
              <>
                <WorkForBadge name={n} className="text-[12px]" />
                <span className="text-xs text-faint tnum">{used.get(n) ? `${used.get(n)} task${used.get(n) === 1 ? '' : 's'}` : 'no tasks yet'}</span>
                <span className="ml-auto flex items-center gap-0.5" role="group" aria-label={`Colour for ${n}`}>
                  {COLOR_IDS.map((id) => (
                    <button key={id} type="button" title={colorOf(id).label} aria-label={`${colorOf(id).label}`} aria-pressed={colorFor(settings, n) === id}
                      onClick={() => save({ colors: { ...wf.colors, [n]: id } })}
                      className={cx('h-5 w-5 rounded-md border-2 transition', colorOf(id).bg, colorFor(settings, n) === id ? 'border-ink' : 'border-transparent hover:scale-110')}>
                      <span className={cx('block m-auto h-1.5 w-1.5 rounded-[2px]', colorOf(id).dot)} />
                    </button>
                  ))}
                </span>
                <button type="button" onClick={() => setHandover(n)} aria-label={`Hand over ${n}`} title="Make a handover for the next person"
                  className="h-8 rounded-full px-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:bg-card hover:text-ink"><Handshake size={13} aria-hidden="true" /><span className="max-sm:hidden">Hand over</span></button>
                <button type="button" onClick={() => { setEditing(n); setText(n); setError(null) }} aria-label={`Rename ${n}`} title="Rename everywhere"
                  className="h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:bg-card hover:text-ink"><Pencil size={13} /></button>
                <button type="button" onClick={() => remove(n)} disabled={used.get(n) > 0 || !!wf.notes?.[n]} aria-label={`Remove ${n}`}
                  title={used.get(n) ? `${used.get(n)} task${used.get(n) === 1 ? ' still has' : 's still have'} it. Rename it, or change those tasks first.` : wf.notes?.[n] ? 'It has handover notes. Clear them first.' : 'Remove from the list'}
                  className="h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:bg-coral/60 hover:text-coral-fg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-faint"><Trash2 size={13} /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex items-center gap-2 max-w-md">
        <input className="input h-9 py-0 flex-1" maxLength={60} placeholder={`Add a ${label.one === 'Work for' ? 'name' : label.one.toLowerCase()}`} value={adding} onChange={(e) => { setAdding(e.target.value); setError(null) }} />
        <button type="submit" className="btn-black h-9 py-0" disabled={!adding.trim()}><Plus size={14} /> Add</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-coral-fg">{error}</p>}
      {handover && <HandoverDialog name={handover} onClose={() => setHandover(null)} />}
    </section>
  )
}
