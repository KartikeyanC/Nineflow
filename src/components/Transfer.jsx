import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowLeft, AtSign, Check, Eye, EyeOff, FileDown, FileUp, Inbox, Lock, LockOpen, Send, Undo2, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { EXT, MAX_BYTES, MIN_PASSWORD, TransferError, buildBundle, makeFile, mergeWorkFor, openFile, readHead, summary, tasksForPlanner } from '../lib/transfer'
import { currentProfile, currentProfileId, isEmailProfile } from '../lib/profiles'
import { deleteHandoff, fetchHandoff, hasSession, isConfigured as supabaseReady, listHandoffs, sendHandoff } from '../lib/supabase'
import { HandoffError } from '../lib/syncErrors'
import { WORKSPACE_LIMIT, WorkspaceError, addWorkspace, listWorkspaces, reopenPlanner, sendTasksToWorkspace, switchWorkspace } from '../lib/workspaces'
import { cleanName, namesIn } from '../lib/workFor'
import { format } from '../lib/dateFormat'
import { Modal, cx } from './ui'
import { WorkForBadge, useWorkFor } from './WorkFor'

// Passing one company's / client's work to the next person's NineFlow (lib/transfer.js): as a file,
// or, between email accounts, straight to their account (a "handoff", docs/SUPABASE_SETUP.md step 5).
// A handoff carries the same locked file text; it waits for them for 14 days.

// Only email accounts can send or receive straight to an account (Google accounts keep their planner
// in their own Drive, which nobody else can write to).
export const canHandoff = () => supabaseReady() && isEmailProfile(currentProfile()) && hasSession()
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const HANDOFF_EVENT = 'nineflow:handoffs'
const handoffsChanged = () => window.dispatchEvent(new Event(HANDOFF_EVENT))

// What is waiting: sent to me, and sent by me. Checked when opened, every few minutes, and when the
// window comes back. A missing table or no connection just means nothing to show.
export function useHandoffs() {
  const [list, setList] = useState([])
  const [error, setError] = useState(null)
  const on = canHandoff()
  const refresh = useCallback(async () => {
    if (!canHandoff()) { setList([]); return }
    try { setList(await listHandoffs()); setError(null) } catch (e) { setList([]); setError(e instanceof HandoffError ? e.message : null) }
  }, [])
  useEffect(() => {
    if (!on) return undefined
    refresh()
    const t = setInterval(refresh, 5 * 60 * 1000)
    const back = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', back)
    window.addEventListener(HANDOFF_EVENT, refresh)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); window.removeEventListener(HANDOFF_EVENT, refresh) }
  }, [on, refresh])
  return { incoming: list.filter((h) => !h.mine && !h.expired), sent: list.filter((h) => h.mine), error, refresh, on }
}
const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? format(new Date(iso), 'd MMM') : '')

function save(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function PasswordField({ label, value, onChange, show, onToggle, autoFocus, onEnter }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted mb-1">{label}</span>
      <span className="relative block">
        <input type={show ? 'text' : 'password'} className="input pr-10" value={value} autoFocus={autoFocus} autoComplete="new-password" spellCheck={false}
          onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }} />
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:text-ink">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        )}
      </span>
    </label>
  )
}

// ---- sending: shown inside the handover window ---------------------------------------------------------
export function TransferSend({ name, onBack, onDone }) {
  const { allTasks, settings, updateSettings, now } = usePlanner()
  const { label } = useWorkFor()
  const [lock, setLock] = useState(true)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [made, setMade] = useState(null) // file name once saved, or { to } once sent
  const accountOk = canHandoff()
  const [how, setHow] = useState('file') // 'file' | 'account'
  const [to, setTo] = useState('')
  const myEmail = (currentProfile()?.email || '').toLowerCase()
  const bundle = useMemo(() => buildBundle({ tasks: allTasks, settings, name, from: currentProfile()?.name || '', now }), [allTasks, settings, name, now])
  const s = summary(bundle)
  const privateCount = allTasks.filter((t) => t.client === name && t.private).length
  const archived = (settings.workFor?.archived || []).includes(name)
  const fileName = `${name.replace(/[^\w.-]+/g, '-')}${EXT}`

  const make = async () => {
    setError(null)
    if (lock && pw.length < MIN_PASSWORD) { setError(`Use a password of at least ${MIN_PASSWORD} characters.`); return }
    if (lock && pw !== pw2) { setError('The two passwords are not the same.'); return }
    const email = to.trim().toLowerCase()
    if (how === 'account' && !EMAIL.test(email)) { setError('Enter the email they sign in to NineFlow with.'); return }
    if (how === 'account' && email === myEmail) { setError('That\'s your own account. Enter the next person\'s email.'); return }
    setBusy(true)
    try {
      const text = await makeFile(bundle, lock ? pw : '')
      if (how === 'account') {
        await sendHandoff({ toEmail: email, fromName: currentProfile()?.name || '', title: name, file: text })
        handoffsChanged()
        setMade({ to: email })
      } else { save(fileName, text); setMade(fileName) }
      setPw(''); setPw2('')
    } catch (e) {
      setError(e instanceof TransferError || e instanceof HandoffError ? e.message : how === 'account' ? 'It could not be sent. Check your connection and try again.' : 'The file could not be made. Try again.')
    } finally { setBusy(false) }
  }
  const archive = () => {
    const wf = settings.workFor || {}
    updateSettings({ workFor: { ...wf, archived: [...(wf.archived || []), name], stamp: wf.stamp === name ? null : wf.stamp } })
  }

  if (made) {
    return (
      <div>
        <p className="flex items-center gap-2 text-base font-bold"><span className="h-7 w-7 rounded-full bg-mint text-mint-fg inline-flex items-center justify-center"><Check size={15} /></span> {made.to ? `Sent to ${made.to}` : `Saved ${made}`}</p>
        {made.to ? (
          <ol className="mt-3 space-y-1.5 text-sm text-muted list-decimal pl-5">
            <li>It waits in their NineFlow for 14 days. They see it at the top when they sign in.</li>
            {lock && <li><b className="text-ink">Tell them the password separately</b>, in person or on a call.</li>}
            <li>Until they take it over you can take it back in Settings → Who it's for.</li>
          </ol>
        ) : (
          <ol className="mt-3 space-y-1.5 text-sm text-muted list-decimal pl-5">
            <li>Send the file to the next person however you like: email, a shared drive, a USB stick.</li>
            {lock && <li><b className="text-ink">Tell them the password separately</b>, in person or on a call, not in the same email as the file.</li>}
            <li>They open it in NineFlow: Settings → Who it's for → Take over work from a file.</li>
          </ol>
        )}
        <div className="mt-5 rounded-2xl border border-line bg-page p-3.5">
          {archived ? (
            <p className="text-sm text-muted inline-flex items-center gap-2"><Archive size={14} /> {name} is archived: its tasks are out of your lists, all kept.</p>
          ) : (
            <>
              <p className="text-sm font-semibold">Finished with {name}?</p>
              <p className="text-xs text-muted mt-0.5">Archiving takes its tasks out of your plans and lists. Nothing is deleted, and you can bring it back in Settings.</p>
              <button type="button" className="btn-ghost mt-2.5" onClick={archive}><Archive size={14} /> Archive {name} now</button>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end"><button type="button" className="btn-black" onClick={onDone}>Done</button></div>
      </div>
    )
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="-mt-1 mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink"><ArrowLeft size={13} /> Back to the handover</button>
      <p className="text-sm text-muted">A file the next person opens in their own NineFlow. {name}'s work moves into their planner, with your notes, people and words.</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
        <div className="rounded-xl border border-line bg-page p-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-faint">Goes in</p>
          <ul className="mt-1.5 space-y-0.5">
            <li><b className="tnum">{s.open}</b> open task{s.open === 1 ? '' : 's'}</li>
            <li><b className="tnum">{s.duties}</b> regular dut{s.duties === 1 ? 'y' : 'ies'}</li>
            <li><b className="tnum">{s.finished}</b> finished in the last year</li>
            <li>Notes, <b className="tnum">{s.people}</b> {s.people === 1 ? 'person' : 'people'}, <b className="tnum">{s.words}</b> word{s.words === 1 ? '' : 's'}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-page p-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-faint">Stays with you</p>
          <ul className="mt-1.5 space-y-0.5 text-muted">
            {privateCount > 0 && <li><b className="tnum text-ink">{privateCount}</b> personal task{privateCount === 1 ? '' : 's'}</li>}
            <li>Your time logs and hourly rate</li>
            <li>Everything for other {label.many === label.one ? 'work' : label.many.toLowerCase()}</li>
          </ul>
        </div>
      </div>

      {accountOk && (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">How should it reach them?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[{ id: 'file', icon: FileDown, t: 'A file', d: 'You send it any way you like. Works with every NineFlow.' },
              { id: 'account', icon: AtSign, t: 'Their NineFlow account', d: 'It waits for them when they sign in with their email.' }].map((o) => (
              <label key={o.id} className={cx('rounded-xl border p-3 cursor-pointer transition', how === o.id ? 'border-brand bg-accent-soft' : 'border-line hover:border-faint')}>
                <input type="radio" name="how" className="sr-only" checked={how === o.id} onChange={() => { setHow(o.id); setError(null) }} />
                <span className="flex items-center gap-1.5 text-sm font-semibold"><o.icon size={14} aria-hidden="true" /> {o.t}</span>
                <span className="block text-xs text-muted mt-0.5">{o.d}</span>
              </label>
            ))}
          </div>
          {how === 'account' && (
            <label className="block mt-3">
              <span className="block text-xs font-semibold text-muted mb-1">Their email (the one they sign in to NineFlow with)</span>
              <input type="email" className="input" value={to} maxLength={254} autoComplete="off" placeholder="name@company.com" onChange={(e) => { setTo(e.target.value); setError(null) }} />
            </label>
          )}
        </fieldset>
      )}

      <div className="mt-4">
        <button type="button" role="switch" aria-checked={lock} onClick={() => { setLock(!lock); setError(null) }}
          className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className={cx('h-5 w-9 rounded-full p-0.5 transition', lock ? 'bg-brand' : 'bg-line')}><span className={cx('block h-4 w-4 rounded-full bg-white transition', lock && 'translate-x-4')} /></span>
          {lock ? <Lock size={14} /> : <LockOpen size={14} />} Lock it with a password
        </button>
        {lock ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PasswordField label="Password" value={pw} onChange={setPw} show={show} onToggle={() => setShow(!show)} autoFocus />
            <PasswordField label="The same again" value={pw2} onChange={setPw2} show={show} onEnter={make} />
            <p className="sm:col-span-2 text-xs text-muted">At least {MIN_PASSWORD} characters. Without it the file can't be opened, so tell them in person or on a call.</p>
          </div>
        ) : (
          <p role="alert" className="mt-2 rounded-xl bg-peach text-peach-fg px-3 py-2 text-xs font-semibold">Without a password, anyone who gets the file can read all of {name}'s work in it.</p>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-coral-fg">{error}</p>}
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn-black" onClick={make} disabled={busy || (!s.open && !s.duties && !s.finished && !bundle.notes && !s.people && !s.words)}>
          <Send size={14} /> {how === 'account' ? (busy ? 'Sending…' : 'Send it') : busy ? 'Making the file…' : `Make ${fileName}`}
        </button>
      </div>
    </div>
  )
}

// ---- receiving: Settings → Who it's for ---------------------------------------------------------------
export function TakeOverDialog({ onClose, handoff }) {
  const { allTasks, settings, updateSettings, importTasks } = usePlanner()
  const fileRef = useRef(null)
  const [text, setText] = useState(null)
  const [head, setHead] = useState(null)
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [bundle, setBundle] = useState(null)
  const [as, setAs] = useState('')
  const [where, setWhere] = useState('here') // 'here' | 'new'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null) // { count, workspace? }
  const pid = currentProfileId()
  const roomForWorkspace = pid && listWorkspaces(pid).length < WORKSPACE_LIMIT
  const existing = useMemo(() => namesIn(allTasks, settings), [allTasks, settings])
  // Opened from a handoff: the file is fetched from the account instead of chosen.
  useEffect(() => {
    if (!handoff) return
    let live = true
    setBusy(true)
    fetchHandoff(handoff.id).then((t) => {
      if (!live) return
      try { const h = readHead(t); setText(t); setHead(h); if (!h.locked) unlock(t, '') } catch (e) { setError(e instanceof TransferError ? e.message : 'This could not be read.') }
    }).catch((e) => live && setError(e instanceof HandoffError ? e.message : 'It could not be fetched. Check your connection and try again.'))
      .finally(() => live && setBusy(false))
    return () => { live = false }
  }, [handoff]) // eslint-disable-line react-hooks/exhaustive-deps
  // Once taken over, it no longer waits for anyone.
  const finished = () => { if (handoff) deleteHandoff(handoff.id).catch(() => {}).finally(handoffsChanged) }

  const pick = async (file) => {
    setError(null); setBundle(null); setHead(null); setText(null); setPw('')
    if (!file) return
    if (file.size > MAX_BYTES) { setError('This file is too big to be a NineFlow transfer.'); return }
    try {
      const t = await file.text()
      const h = readHead(t)
      setText(t); setHead(h)
      if (!h.locked) unlock(t, '')
    } catch (e) { setError(e instanceof TransferError ? e.message : 'This file could not be read.') }
  }
  const unlock = async (t = text, p = pw) => {
    setBusy(true); setError(null)
    try {
      const b = await openFile(t, p)
      setBundle(b); setAs(b.name); setPw('')
    } catch (e) { setError(e instanceof TransferError ? e.message : 'This file could not be opened.') } finally { setBusy(false) }
  }

  const name = cleanName(as)
  const joins = where === 'here' && existing.some((n) => n.toLowerCase() === name.toLowerCase())
  const target = (where === 'here' && existing.find((n) => n.toLowerCase() === name.toLowerCase())) || name
  const take = () => {
    if (!name) { setError('Give it a name.'); return }
    setError(null)
    if (where === 'here') {
      const list = tasksForPlanner(bundle, { as: target, categories: settings.categories, takenIds: new Set(allTasks.map((t) => t.id)) })
      importTasks(list, `Took over ${list.length} task${list.length === 1 ? '' : 's'} for ${target}`)
      updateSettings({ workFor: mergeWorkFor(settings.workFor, bundle, target) })
      setDone({ count: list.length, name: target })
      finished()
      return
    }
    // A new workspace: its own planner, with only this work in it.
    let ws
    try { ws = addWorkspace(pid, name) } catch (e) { setError(e instanceof WorkspaceError ? e.message : 'The workspace could not be made.'); return }
    const key = (n) => `daily-planner:${pid}:ws_${ws.id}.${n}`
    const list = tasksForPlanner(bundle, { as: name, categories: settings.categories })
    if (!sendTasksToWorkspace(pid, ws.id, list)) { setError('There is no room left in this browser\'s storage for the tasks.'); return }
    try {
      const s = JSON.parse(localStorage.getItem(key('settings')) || '{}')
      localStorage.setItem(key('settings'), JSON.stringify({ ...s, categories: s.categories || settings.categories, workFor: mergeWorkFor(s.workFor, bundle, name) }))
    } catch { /* the tasks are in; the notes can be added again from the file */ }
    setDone({ count: list.length, name, workspace: ws })
    finished()
  }
  const openWorkspace = () => { switchWorkspace(pid, done.workspace.id); reopenPlanner() }
  const sum = bundle ? summary(bundle) : null

  return (
    <Modal open onClose={onClose} title={handoff ? `Take over ${handoff.title}` : 'Take over work from a file'} width="max-w-xl">
      {done ? (
        <div>
          <p className="flex items-center gap-2 text-base font-bold"><span className="h-7 w-7 rounded-full bg-mint text-mint-fg inline-flex items-center justify-center"><Check size={15} /></span> {done.count} task{done.count === 1 ? '' : 's'} for {done.name} are yours now</p>
          <p className="mt-2 text-sm text-muted">Each one says who it was taken over from. The notes, people and words are in Hand over {done.name}, in Settings → Who it's for.
            {bundle?.tasks.some((t) => t.files?.length) && ' Some tasks link to Google Drive files: ask for access if one doesn\'t open.'}</p>
          <div className="mt-5 flex justify-end gap-2">
            {done.workspace ? (
              <>
                <button type="button" className="btn-ghost" onClick={onClose}>Stay here</button>
                <button type="button" className="btn-black" onClick={openWorkspace}>Open {done.workspace.name}</button>
              </>
            ) : <button type="button" className="btn-black" onClick={onClose}>Done</button>}
          </div>
        </div>
      ) : !bundle ? (
        <div>
          {handoff ? (
            <p className="text-sm text-muted"><b className="text-ink">{handoff.fromName || handoff.fromEmail}</b>{handoff.fromName ? ` (${handoff.fromEmail})` : ''} sent you the work for <b className="text-ink">{handoff.title}</b>{busy && !head ? '. Fetching it…' : '.'}</p>
          ) : (
            <>
              <p className="text-sm text-muted">Open the <b>{EXT}</b> file the person before you made. Their work for one company or client moves into your planner.</p>
              <input ref={fileRef} type="file" accept={`${EXT},application/json`} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
              <button type="button" className="btn-black mt-4" onClick={() => fileRef.current?.click()}><FileUp size={14} /> Choose the file</button>
            </>
          )}
          {head?.locked && (
            <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); unlock() }}>
              <p className="text-sm inline-flex items-center gap-1.5 font-semibold"><Lock size={14} /> This file is locked{head.madeAt ? ` (made ${format(new Date(head.madeAt), 'd MMM yyyy')})` : ''}.</p>
              <PasswordField label="Password (ask whoever sent it)" value={pw} onChange={setPw} show={show} onToggle={() => setShow(!show)} autoFocus />
              <button type="submit" className="btn-black" disabled={!pw || busy}>{busy ? 'Opening…' : 'Open it'}</button>
            </form>
          )}
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-coral-fg">{error}</p>}
        </div>
      ) : (
        <div>
          <div className="rounded-2xl border border-line bg-page p-3.5">
            <p className="flex flex-wrap items-center gap-2 text-sm"><WorkForBadge name={bundle.name} className="text-[12px]" /> <span className="text-muted">from <b className="text-ink">{bundle.from || 'someone'}</b>{bundle.madeAt ? `, ${format(new Date(bundle.madeAt), 'd MMM yyyy')}` : ''}</span></p>
            <p className="mt-2 text-sm"><b className="tnum">{sum.open}</b> open · <b className="tnum">{sum.duties}</b> regular dut{sum.duties === 1 ? 'y' : 'ies'} · <b className="tnum">{sum.finished}</b> finished · <b className="tnum">{sum.people}</b> {sum.people === 1 ? 'person' : 'people'} · <b className="tnum">{sum.words}</b> word{sum.words === 1 ? '' : 's'}</p>
            {bundle.skipped > 0 && <p className="mt-1 text-xs text-muted">{bundle.skipped} task{bundle.skipped === 1 ? ' was' : 's were'} damaged and left out.</p>}
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Where should it go?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[{ id: 'here', t: 'Into this planner', d: 'Next to your other work, under its name.' },
                { id: 'new', t: 'Into a new workspace', d: roomForWorkspace ? 'A separate planner just for it.' : `You already have ${WORKSPACE_LIMIT} workspaces.`, off: !roomForWorkspace }].map((o) => (
                <label key={o.id} className={cx('rounded-xl border p-3 cursor-pointer transition', where === o.id ? 'border-brand bg-accent-soft' : 'border-line hover:border-faint', o.off && 'opacity-50 cursor-not-allowed')}>
                  <input type="radio" name="where" className="sr-only" checked={where === o.id} disabled={o.off} onChange={() => setWhere(o.id)} />
                  <span className="block text-sm font-semibold">{o.t}</span>
                  <span className="block text-xs text-muted mt-0.5">{o.d}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block mt-4">
            <span className="block text-sm font-semibold">{where === 'new' ? 'Workspace and company name' : 'Put it under'}</span>
            <input className="input mt-1.5" value={as} maxLength={where === 'new' ? 24 : 60} onChange={(e) => setAs(e.target.value)} />
            {joins && <span className="mt-1 block text-xs text-muted">You already have {target}: these tasks join it, and its notes, people and words are added to yours.</span>}
          </label>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-coral-fg">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-black" onClick={take} disabled={!name}>Take it over</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---- over every page: work someone sent to this account ------------------------------------------------
export function HandoffInbox() {
  const { incoming } = useHandoffs()
  const [later, setLater] = useState(() => new Set())
  const [open, setOpen] = useState(null)
  const [declining, setDeclining] = useState(null)
  const show = incoming.filter((h) => !later.has(h.id))
  const decline = async (h) => { try { await deleteHandoff(h.id) } catch { /* it stays, and shows again */ } setDeclining(null); handoffsChanged() }
  if (!show.length && !open) return null
  return (
    <>
      {show.slice(0, 3).map((h) => (
        <div key={h.id} role="status" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-mint-fg/25 bg-mint/60 px-3.5 py-2.5 text-[13px]">
          <Inbox size={15} className="shrink-0 text-mint-fg" aria-hidden="true" />
          <span className="min-w-0 flex-1"><b>{h.fromName || h.fromEmail}</b> sent you the work for <WorkForBadge name={h.title} className="align-middle" /> <span className="text-muted">· waits until {when(h.expiresAt)}</span></span>
          {declining === h.id ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-xs font-semibold">Decline it? They'd have to send it again.</span>
              <button type="button" className="h-7 rounded-full bg-danger px-3 text-xs font-semibold text-white" onClick={() => decline(h)}>Decline</button>
              <button type="button" className="h-7 rounded-full px-2.5 text-xs font-semibold hover:bg-card/70" onClick={() => setDeclining(null)}>Keep it</button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <button type="button" className="btn-black h-8 py-0 text-xs" onClick={() => setOpen(h)}>Take it over</button>
              <button type="button" className="h-8 rounded-full px-2.5 text-xs font-semibold hover:bg-card/70" onClick={() => setLater(new Set(later).add(h.id))}>Not now</button>
              <button type="button" aria-label={`Decline ${h.title}`} title="Decline" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-card/70 hover:text-ink" onClick={() => setDeclining(h.id)}><X size={14} /></button>
            </span>
          )}
        </div>
      ))}
      {open && <TakeOverDialog handoff={open} onClose={() => setOpen(null)} />}
    </>
  )
}

// ---- Settings → Who it's for: what's waiting, both ways -------------------------------------------------
export function HandoffList() {
  const { incoming, sent, on, refresh } = useHandoffs()
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  if (!on || (!incoming.length && !sent.length)) return null
  const takeBack = async (h) => { setBusy(h.id); try { await deleteHandoff(h.id) } catch { /* shown again below */ } setBusy(null); refresh(); handoffsChanged() }
  return (
    <div className="mt-5 max-w-2xl space-y-3">
      {incoming.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Waiting for you</p>
          <ul className="mt-1.5 space-y-1.5">
            {incoming.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-page px-2.5 py-1.5 text-[13px]">
                <WorkForBadge name={h.title} /> <span className="text-muted">from {h.fromName || h.fromEmail}, {when(h.createdAt)}</span>
                <button type="button" className="btn-black ml-auto h-8 py-0 text-xs" onClick={() => setOpen(h)}>Take it over</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sent.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Sent by you</p>
          <ul className="mt-1.5 space-y-1.5">
            {sent.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-page px-2.5 py-1.5 text-[13px]">
                <WorkForBadge name={h.title} /> <span className="text-muted">to {h.toEmail} · {h.expired ? 'expired, not taken over' : `waiting until ${when(h.expiresAt)}`}</span>
                <button type="button" disabled={busy === h.id} className="ml-auto h-8 rounded-full px-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:bg-card hover:text-ink disabled:opacity-50" onClick={() => takeBack(h)}>
                  <Undo2 size={13} aria-hidden="true" /> {h.expired ? 'Remove' : 'Take back'}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Once they take it over it leaves this list.</p>
        </div>
      )}
      {open && <TakeOverDialog handoff={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
