import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, X, Layers } from 'lucide-react'
import { currentProfileId } from '../lib/profiles'
import {
  MAIN, NAME_MAX, WORKSPACE_LIMIT, WorkspaceError, addWorkspace, currentWorkspaceId, listWorkspaces,
  onWorkspacesChange, removeWorkspace, renameWorkspace, switchWorkspace,
} from '../lib/workspaces'
import { colorOf } from '../lib/colors'
import { cx, useDialogFocus } from '../components/ui'

// Up to six separate planners under one sign-in. Switching reloads the page:
// the planner reads its data once on load, so a reload is what guarantees
// nothing from the old workspace is left on screen.

// ---- state ------------------------------------------------------------------------
const snapshot = () => {
  const pid = currentProfileId()
  return pid ? `${currentWorkspaceId(pid)}|${JSON.stringify(listWorkspaces(pid))}` : ''
}

function useWorkspaces() {
  const raw = useSyncExternalStore(onWorkspacesChange, snapshot)
  const pid = currentProfileId()
  const { list, currentId } = useMemo(() => {
    if (!raw) return { list: [], currentId: MAIN }
    const i = raw.indexOf('|')
    return { currentId: raw.slice(0, i), list: JSON.parse(raw.slice(i + 1)) }
  }, [raw])
  const current = list.find((w) => w.id === currentId)

  // This workspace was deleted from another device: go back to the first one.
  useEffect(() => {
    if (pid && list.length && !current) { switchWorkspace(pid, MAIN); window.location.reload() }
  }, [pid, list, current])

  const open = (id) => { if (id === currentId) return; switchWorkspace(pid, id); window.location.reload() }
  return { pid, list, current: current || list[0], open }
}

const Tile = ({ ws, size = 28 }) => {
  const c = colorOf(ws.color)
  return (
    <span className={cx('shrink-0 rounded-full inline-flex items-center justify-center font-bold', c.bg, c.text)} style={{ width: size, height: size, fontSize: size * 0.43 }}>
      {(ws.name.trim()[0] || '?').toUpperCase()}
    </span>
  )
}

// ---- the list: switch, rename, delete, add ----------------------------------------------
function WorkspaceList({ onClose }) {
  const { pid, list, current, open } = useWorkspaces()
  const [editing, setEditing] = useState(null) // workspace id being renamed
  const [confirm, setConfirm] = useState(null) // workspace id awaiting delete confirmation
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const full = list.length >= WORKSPACE_LIMIT

  const run = (fn) => { try { fn(); setError(null); return true } catch (e) { if (e instanceof WorkspaceError) { setError(e.message); return false } throw e } }
  const startRename = (w) => { setEditing(w.id); setConfirm(null); setAdding(false); setText(w.name); setError(null) }
  const saveRename = (w) => { if (text.trim() === w.name || run(() => renameWorkspace(pid, w.id, text))) { setEditing(null); setError(null) } }
  const create = () => {
    let made
    if (run(() => { made = addWorkspace(pid, text) })) { switchWorkspace(pid, made.id); window.location.reload() }
  }
  const remove = (w) => { if (run(() => removeWorkspace(pid, w.id))) { setConfirm(null); if (w.id === current?.id) window.location.reload() } }

  return (
    <div>
      <div className="flex items-baseline justify-between px-1 pb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Workspaces</p>
        <p className="text-xs font-semibold text-faint tnum">{list.length} of {WORKSPACE_LIMIT}</p>
      </div>

      <ul className="space-y-1">
        {list.map((w) => {
          const isCurrent = w.id === current?.id
          if (confirm === w.id) {
            return (
              <li key={w.id} role="alert" className="rounded-xl bg-coral/70 text-coral-fg p-3 text-[13px]">
                <p className="font-semibold">Delete “{w.name}”?</p>
                <p className="mt-0.5 text-[12px]">Its tasks, habits, settings and work log are removed from every device. This can't be undone.</p>
                <div className="mt-2.5 flex gap-2">
                  <button type="button" onClick={() => remove(w)} className="h-8 rounded-full bg-danger text-white px-3 text-[12px] font-semibold">Delete</button>
                  <button type="button" onClick={() => setConfirm(null)} className="h-8 rounded-full px-3 text-[12px] font-semibold hover:bg-card/60">Keep it</button>
                </div>
              </li>
            )
          }
          if (editing === w.id) {
            return (
              <li key={w.id} className="flex items-center gap-2 rounded-xl p-1.5">
                <Tile ws={w} />
                <input autoFocus value={text} maxLength={NAME_MAX} aria-label={`Name for ${w.name}`}
                  onChange={(e) => { setText(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveRename(w) } else if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); setError(null) } }}
                  className="input h-8 py-0 flex-1 min-w-0 text-[13px]" />
                <button type="button" onClick={() => saveRename(w)} aria-label="Save name" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-mint-fg hover:bg-page"><Check size={15} /></button>
                <button type="button" onClick={() => { setEditing(null); setError(null) }} aria-label="Cancel" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:bg-page hover:text-ink"><X size={15} /></button>
              </li>
            )
          }
          return (
            <li key={w.id} className={cx('group flex items-center gap-1 rounded-xl', isCurrent && 'bg-accent-soft')}>
              <button type="button" onClick={() => { if (isCurrent) onClose?.(); else open(w.id) }} aria-current={isCurrent ? 'true' : undefined}
                className={cx('flex flex-1 min-w-0 items-center gap-2.5 rounded-xl p-1.5 text-left transition', !isCurrent && 'hover:bg-subtle')}>
                <Tile ws={w} />
                <span className={cx('flex-1 min-w-0 truncate text-[13px] font-semibold', isCurrent && 'text-lav-fg')}>{w.name}</span>
                {isCurrent && <Check size={15} className="shrink-0 text-lav-fg" aria-label="Current workspace" />}
              </button>
              <button type="button" onClick={() => startRename(w)} aria-label={`Rename ${w.name}`}
                className="h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-faint opacity-60 hover:opacity-100 hover:bg-page hover:text-ink focus-visible:opacity-100 transition"><Pencil size={13} /></button>
              {w.id !== MAIN && (
                <button type="button" onClick={() => { setConfirm(w.id); setEditing(null); setAdding(false); setError(null) }} aria-label={`Delete ${w.name}`}
                  className="h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-faint opacity-60 hover:opacity-100 hover:bg-coral/60 hover:text-coral-fg focus-visible:opacity-100 transition"><Trash2 size={13} /></button>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-2 pt-2 border-t border-line">
        {adding ? (
          <form onSubmit={(e) => { e.preventDefault(); create() }} className="flex items-center gap-2 p-1.5">
            <input autoFocus value={text} maxLength={NAME_MAX} placeholder="Workspace name" aria-label="New workspace name"
              onChange={(e) => { setText(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setError(null) } }}
              className="input h-8 py-0 flex-1 min-w-0 text-[13px]" />
            <button type="submit" disabled={!text.trim()} className="h-8 rounded-full px-3 text-[12px] font-semibold text-white bg-brand disabled:opacity-45">Add</button>
            <button type="button" onClick={() => { setAdding(false); setError(null) }} aria-label="Cancel" className="h-8 w-8 rounded-full inline-flex items-center justify-center text-faint hover:bg-page hover:text-ink"><X size={15} /></button>
          </form>
        ) : full ? (
          <p className="px-2 py-1.5 text-[12px] text-faint">All {WORKSPACE_LIMIT} workspaces are in use. Delete one to add another.</p>
        ) : (
          <button type="button" onClick={() => { setAdding(true); setEditing(null); setConfirm(null); setText(''); setError(null) }}
            className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-[13px] font-semibold text-muted hover:bg-subtle hover:text-ink transition">
            <span className="h-7 w-7 rounded-full border border-dashed border-line inline-flex items-center justify-center"><Plus size={14} /></span>
            New workspace
          </button>
        )}
        {error && <p role="alert" className="px-2 pt-1.5 text-[12px] text-coral-fg font-semibold">{error}</p>}
      </div>
    </div>
  )
}

// ---- the sidebar switcher -----------------------------------------------------------------
export function WorkspaceMenu({ compact = false, className }) {
  const { current } = useWorkspaces()
  const [open, setOpen] = useState(false)
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

  if (!current) return null
  return (
    <div ref={root} className={cx('relative', className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open} data-tip="Workspace" data-tip-hint={current.name} aria-label={`Workspace: ${current.name}`}
        className={cx('flex w-full items-center gap-2.5 rounded-full h-10 px-1.5 border border-line bg-page transition hover:border-faint',
          compact ? 'justify-center wide:justify-start' : 'justify-start')}>
        <Tile ws={current} size={28} />
        <span className={cx('min-w-0 flex-1 truncate text-left text-[13px] font-semibold', compact && 'hidden wide:block')}>{current.name}</span>
        <ChevronsUpDown size={14} className={cx('shrink-0 mr-1.5 text-faint', compact && 'hidden wide:block')} />
      </button>
      {/* Phones: dim the page behind the list, like the other sheets; a tap on it closes the list. */}
      {open && <div className="sm:hidden fixed inset-0 z-40 bg-ink/30 animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />}
      {open && (
        <div ref={panel} tabIndex={-1} role="dialog" aria-label="Workspaces"
          className="fixed inset-x-4 top-16 z-50 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[280px] rounded-2xl bg-card p-2.5 shadow-lift ring-hair animate-modal-in outline-none">
          <WorkspaceList onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

// ---- Settings section (also the way to switch on phones in the original design) -------------
export function WorkspacesSection() {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-accent-soft text-lav-fg inline-flex items-center justify-center max-sm:hidden"><Layers size={18} /></span>
        <div className="min-w-0">
          <h2 className="h-display text-base">Workspaces</h2>
          <p className="text-sm text-muted">Up to {WORKSPACE_LIMIT} separate planners under this one login, each with its own tasks, habits and settings.</p>
        </div>
      </div>
      <div className="max-w-md rounded-2xl border border-line bg-page p-2.5">
        <WorkspaceList />
      </div>
    </section>
  )
}
