import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { AlertTriangle, FolderOpen, HardDrive } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { storageKey } from '../lib/profiles'
import { uid } from '../lib/storage'
import { planSync } from '../lib/notesFolder'

// Notes as files on this computer (Windows app only): the folder setting, the background sync,
// and what Settings and Notes show about it. The rules for what goes where are in lib/notesFolder.js.

// The Windows app's bridge (desktop/preload.cjs), looked up when used.
const nf = () => (typeof window !== 'undefined' ? window.nineflowDesktop?.notesFolder || null : null)
export const notesFolderAvailable = () => !!nf()

// The chosen folder and what was last in step, per workspace (notes belong to a workspace).
const KEY = () => storageKey('notes-folder')
const loadConfig = () => { try { const c = JSON.parse(localStorage.getItem(KEY()) || 'null'); return c && typeof c.folder === 'string' ? c : null } catch { return null } }
const saveConfig = (c) => { try { if (c) localStorage.setItem(KEY(), JSON.stringify(c)); else localStorage.removeItem(KEY()) } catch { /* the next sync starts fresh */ } }

// What the screens show: { folder, savedAt, error, warnings, removed: [note ids], busy }.
let status = { folder: null, savedAt: null, error: null, warnings: [], removed: [], busy: false }
const listeners = new Set()
const setStatus = (patch) => { status = { ...status, ...patch }; listeners.forEach((f) => f()) }
export const useNotesFolder = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f) }, () => status)

let runNow = () => {}
export const syncNotesFolder = () => runNow()

// Mounted once in the app: keeps the folder and the notes in step while the Windows app is open.
export function NotesFolderSync() {
  const { settings, updateSettings } = usePlanner()
  const notesRef = useRef(settings.notes || [])
  notesRef.current = settings.notes || []
  const running = useRef(false)
  const again = useRef(false)

  const run = useCallback(async () => {
    const config = loadConfig()
    if (!nf() || !config) { setStatus({ folder: null, removed: [], warnings: [], error: null }); return }
    if (running.current) { again.current = true; return }
    running.current = true
    setStatus({ folder: config.folder, busy: true })
    try {
      const scan = await nf().scan(config.folder)
      if (!scan.ok) { setStatus({ error: scan.message }); return }
      const input = notesRef.current
      const r = planSync({ notes: input, files: scan.files, pictureFiles: scan.pictures, state: config.state, makeId: uid, now: new Date().toISOString() })
      if (r.ops.length) {
        const res = await nf().apply(config.folder, r.ops)
        const failed = (res.results || []).filter((x) => !x.ok).length
        if (!res.ok || failed) { setStatus({ error: res.message || `${failed} file${failed === 1 ? '' : 's'} couldn't be saved. Is the folder read-only or open elsewhere?` }); return }
      }
      saveConfig({ ...config, state: r.state })
      if (r.notes !== input) {
        // Only the notes this round changed or added; anything typed meanwhile is kept.
        const before = new Map(input.map((n) => [n.id, n]))
        const touched = r.notes.filter((n) => before.get(n.id) !== n)
        updateSettings((s) => {
          let list = s.notes || []
          for (const n of touched) list = list.some((x) => x.id === n.id) ? list.map((x) => (x.id === n.id ? n : x)) : [n, ...list]
          return { notes: list }
        })
      }
      setStatus({ savedAt: Date.now(), error: null, warnings: r.warnings, removed: r.removedFiles })
    } catch (e) {
      setStatus({ error: e.message || 'The notes folder couldn\'t be synced.' })
    } finally {
      running.current = false
      setStatus({ busy: false })
      if (again.current) { again.current = false; setTimeout(run, 300) }
    }
  }, [updateSettings])

  useEffect(() => { runNow = run; return () => { runNow = () => {} } }, [run])

  // Watch the folder while the app is open, and sync once at the start. Re-read on every status change
  // (choosing, changing or stopping the folder) and with each workspace's settings.
  useNotesFolder()
  const folder = loadConfig()?.folder || null
  useEffect(() => {
    if (!nf() || !folder) { setStatus({ folder: null, removed: [], warnings: [], error: null }); return undefined }
    nf().watch(folder).then((r) => { if (!r.ok) setStatus({ error: r.message }) })
    const off = nf().onChanged(() => run())
    run()
    return () => { off(); nf()?.unwatch() }
  }, [folder, run])

  // A change in NineFlow reaches the folder a moment after typing stops.
  useEffect(() => {
    if (!nf() || !folder) return undefined
    const t = setTimeout(run, 1200)
    return () => clearTimeout(t)
  }, [settings.notes, folder, run])

  return null
}

// ---- actions --------------------------------------------------------------------------------------

export async function chooseNotesFolder() {
  if (!nf()) return
  const r = await nf().choose()
  if (!r.ok) return
  const old = loadConfig()
  // A different folder starts fresh: every note is written there.
  saveConfig({ folder: r.folder, state: old?.folder === r.folder ? old.state : { notes: {}, keep: [] } })
  setStatus({ folder: r.folder, error: null, warnings: [], removed: [] })
  window.dispatchEvent(new Event('nineflow:notes-folder'))
}

export function stopNotesFolder() {
  saveConfig(null)
  setStatus({ folder: null, savedAt: null, error: null, warnings: [], removed: [] })
  window.dispatchEvent(new Event('nineflow:notes-folder'))
}

export const openNotesFolder = () => { const c = loadConfig(); if (nf() && c) nf().open(c.folder) }

// Files deleted outside NineFlow: write them back...
export function keepRemovedNotes(ids) {
  const c = loadConfig()
  if (!c) return
  saveConfig({ ...c, state: { ...c.state, keep: [...new Set([...(c.state?.keep || []), ...ids])] } })
  setStatus({ removed: [] })
  runNow()
}

// ...or delete those notes too (done by the caller, which has the notes).
export function forgetRemovedNotes(ids) {
  const c = loadConfig()
  if (c?.state?.notes) {
    const notes = { ...c.state.notes }
    for (const id of ids) delete notes[id]
    saveConfig({ ...c, state: { ...c.state, notes } })
  }
  setStatus({ removed: [] })
}

// ---- what the screens show -----------------------------------------------------------------------

// Settings → Notes on this computer.
export function NotesFolderSettings() {
  const s = useNotesFolder()
  if (!nf()) return null
  return (
    <section className="card p-5">
      <h2 className="h-display text-base mb-1">Notes on this computer</h2>
      <p className="text-sm text-muted mb-4">
        Also save your notes as files in a folder on this computer: one Markdown (.md) file per note, with its pictures beside it.
        Edit them in any app, like Notepad or Obsidian, and the changes come back into NineFlow. Your notes still sync to Google Drive and your phone as usual.
      </p>
      {s.folder ? (
        <>
          <div className="rounded-2xl bg-page border border-line p-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <HardDrive size={16} className="text-sky-fg shrink-0" />
            <p className="text-sm font-semibold flex-1 min-w-[180px] break-all">{s.folder}</p>
            <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={openNotesFolder}><FolderOpen size={13} /> Open folder</button>
            <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={chooseNotesFolder}>Change folder</button>
          </div>
          <p className="mt-2 text-xs text-muted" role="status">
            {s.error ? <span className="text-coral-fg font-semibold">{s.error}</span>
              : s.busy ? 'Saving notes to the folder…'
              : s.savedAt ? `In step with the folder · checked ${formatDistanceToNowStrict(s.savedAt)} ago` : 'Starting…'}
          </p>
          {s.warnings.map((w) => <p key={w} className="mt-1 text-xs text-peach-fg font-semibold">{w}</p>)}
          <NotesFolderNotice className="mt-3" />
          <button type="button" className="mt-4 text-xs font-semibold text-muted hover:text-ink underline underline-offset-2" onClick={stopNotesFolder}>
            Stop saving notes as files
          </button>
          <p className="text-xs text-faint mt-1">The files already in the folder stay there. A note deleted in NineFlow moves its file to the folder's "deleted" folder; nothing is erased.</p>
        </>
      ) : (
        <button type="button" className="btn-black" onClick={chooseNotesFolder}><FolderOpen size={14} /> Choose a folder</button>
      )}
    </section>
  )
}

// Shown on Notes (and in Settings) when note files were deleted outside NineFlow.
export function NotesFolderNotice({ className = '' }) {
  const s = useNotesFolder()
  const { settings, updateSettings } = usePlanner()
  if (!nf() || !s.removed.length) return null
  const notes = settings.notes || []
  const names = s.removed.map((id) => notes.find((n) => n.id === id)).filter(Boolean)
  if (!names.length) return null
  const first = (n) => (n.text.trim().split('\n')[0] || 'Note').slice(0, 40)
  const removeNotes = () => {
    forgetRemovedNotes(s.removed)
    updateSettings((st) => ({ notes: (st.notes || []).filter((n) => !s.removed.includes(n.id)) }))
  }
  return (
    <div role="alert" className={`rounded-2xl bg-peach text-peach-fg p-3.5 text-sm ${className}`}>
      <p className="font-semibold inline-flex items-start gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />
        {names.length === 1 ? `The file for "${first(names[0])}" was deleted from your notes folder.` : `The files for ${names.length} notes were deleted from your notes folder.`}
      </p>
      <p className="mt-1 text-ink">Delete {names.length === 1 ? 'that note' : 'those notes'} in NineFlow too, or keep {names.length === 1 ? 'it' : 'them'} and save the file{names.length === 1 ? '' : 's'} again?</p>
      <div className="flex flex-wrap gap-2 mt-2.5">
        <button type="button" className="btn-black h-8 py-0" onClick={() => keepRemovedNotes(s.removed)}>Keep and save again</button>
        <button type="button" className="btn-ghost h-8 py-0 text-coral-fg" onClick={removeNotes}>Delete in NineFlow too</button>
      </div>
    </div>
  )
}
