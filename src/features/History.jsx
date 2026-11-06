import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown, History, RotateCcw, Undo2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { currentProfileId, storageKey } from '../lib/profiles'
import { collect } from '../lib/cloud'
import { getSnapshot, listSnapshots, restoreSnapshot, takeSnapshot, taskDiff, tasksIn, KEEP_DAYS } from '../lib/history'
import { reopenPlanner } from '../lib/workspaces'
import { format } from '../lib/dateFormat'
import { ConfirmDialog, cx } from '../components/ui'

// Version history (lib/history.js). HistoryKeeper takes the copies; HistorySection (Settings) lists
// them, shows what changed since each, brings back deleted tasks one by one, or restores a whole copy.

const HOUR = 3600_000
const REASON = { open: 'When the planner opened', hourly: 'While you worked', 'before-restore': 'Just before a restore' }

// Mounted once in the app: a copy when the planner opens, then one an hour while things change.
export function HistoryKeeper() {
  useEffect(() => {
    const pid = currentProfileId()
    if (!pid) return undefined
    let last = 0
    const take = (reason) => takeSnapshot(pid, reason).then((m) => { if (m) last = m.at }).catch(() => { /* history is a safety net; never in the way */ })
    const first = setTimeout(() => take('open'), 4000) // after the planner has loaded and synced once
    const every = setInterval(() => { if (Date.now() - last >= HOUR) take('hourly') }, 5 * 60_000)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [])
  return null
}

// The open workspace's task list name inside a copy ('tasks' or 'ws_<id>.tasks').
const listName = (pid) => storageKey('tasks').slice(`daily-planner:${pid}:`.length)

export function HistorySection() {
  const { addTasks, updateTask } = usePlanner()
  const pid = currentProfileId()
  const [snaps, setSnaps] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // { id, diff }
  const [confirm, setConfirm] = useState(null) // snapshot to restore
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => listSnapshots(pid).then(setSnaps).catch((e) => setError(e.message)), [pid])
  useEffect(() => { load() }, [load])

  const show = async (s) => {
    if (open?.id === s.id) { setOpen(null); return }
    const snap = await getSnapshot(s.id)
    const name = listName(pid)
    setOpen({ id: s.id, diff: taskDiff(tasksIn(snap?.data)[name] || [], tasksIn(collect(pid))[name] || []) })
  }
  const saveNow = async () => {
    setBusy(true)
    try { const m = await takeSnapshot(pid, 'hourly', { force: true }); if (m) await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const restore = async (s) => {
    setBusy(true)
    try { await restoreSnapshot(pid, s.id); setConfirm(null); reopenPlanner() } catch (e) { setError(e.message); setBusy(false) }
  }
  const bringBack = (t) => {
    addTasks([t], `Brought back “${t.title}”`)
    if (t.seriesId) updateTask(t.id, { seriesId: t.seriesId }) // a repeating task rejoins its own series
    setOpen((o) => o && ({ ...o, diff: { ...o.diff, deleted: o.diff.deleted.filter((x) => x.id !== t.id) } }))
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="h-display text-base inline-flex items-center gap-2"><History size={16} /> Version history</h2>
          <p className="text-sm text-muted mt-1 max-w-prose">
            Copies of your whole planner on this device: when it opens, then every hour while you make changes. The last day is kept
            hour by hour, then one a day for {KEEP_DAYS} days. Open one to see what changed since, bring back deleted tasks, or restore it.
          </p>
        </div>
        <button type="button" className="btn-ghost h-9 py-0" disabled={busy} onClick={saveNow}>Save a copy now</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-coral-fg font-semibold">{error}</p>}
      {snaps && !snaps.length && <p className="mt-4 text-sm text-faint">No copies yet. The first is taken a few seconds after the planner opens.</p>}
      {snaps?.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {snaps.map((s) => {
            const isOpen = open?.id === s.id
            return (
              <li key={s.id}>
                <button type="button" onClick={() => show(s)} aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-page transition">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{format(new Date(s.at), 'EEE d MMM, h:mm a')}</span>
                    <span className="block text-xs text-muted">{REASON[s.reason] || 'Saved'} · {s.tasks} task{s.tasks === 1 ? '' : 's'}</span>
                  </span>
                  <ChevronDown size={16} className={cx('text-faint transition', isOpen && 'rotate-180')} />
                </button>
                {isOpen && <Changes diff={open.diff} onBringBack={bringBack} onRestore={() => setConfirm(s)} busy={busy} />}
              </li>
            )
          })}
        </ul>
      )}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} danger={false} confirmLabel="Restore"
        title={confirm ? `Restore the copy from ${format(new Date(confirm.at), 'd MMM, h:mm a')}?` : ''}
        body="Your whole planner goes back to how it was then: tasks, habits, notes, settings and every workspace. A copy of how it is now is saved first, so you can come back to it from this list. The restored planner syncs to your other devices."
        onConfirm={() => confirm && restore(confirm)} />
    </section>
  )
}

function Changes({ diff, onBringBack, onRestore, busy }) {
  const { deleted, added, changed } = diff
  const same = !deleted.length && !added.length && !changed.length
  return (
    <div className="px-4 pb-4 space-y-3">
      <p className="text-sm text-muted">
        {same ? 'Your tasks in this workspace are the same as in this copy.'
          : `Since then, in this workspace: ${[deleted.length && `${deleted.length} deleted`, added.length && `${added.length} added`, changed.length && `${changed.length} changed`].filter(Boolean).join(', ')}.`}
      </p>
      {deleted.length > 0 && (
        <ul className="rounded-xl bg-page p-2 space-y-1 max-h-60 overflow-y-auto" aria-label="Deleted since this copy">
          {deleted.slice(0, 100).map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{t.title || 'Untitled'}{t.date && <span className="text-xs text-faint"> · {t.date}</span>}</span>
              <button type="button" className="btn-ghost h-7 py-0 text-xs" onClick={() => onBringBack(t)}><Undo2 size={12} /> Bring back</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-black h-9 py-0" disabled={busy} onClick={onRestore}><RotateCcw size={14} /> Restore this whole copy</button>
    </div>
  )
}
