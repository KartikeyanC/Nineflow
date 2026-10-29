import React, { useEffect, useRef, useState } from 'react'
import { format, isSameDay, isValid, parseISO } from 'date-fns'
import { Clock3, ListPlus, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { uid } from '../lib/storage'
import { COLOR_IDS, colorOf } from '../lib/colors'
import { EmptyState, cx } from '../components/ui'

const NOTE_COLORS = COLOR_IDS.filter((c) => ['butter', 'mint', 'sky', 'rose', 'lav', 'peach'].includes(c))
export const MAX_NOTES = 60
export const MAX_NOTE_LENGTH = 2000

// Quick notes that aren't tasks: a thought, a link, a list. They live in the settings (so they sync
// like everything else). A note can be turned into a task with one click.
// Search picks a note: Notes scrolls to it and flashes it once it is on screen.
let wanted = null
export function showNote(id) { wanted = id; window.dispatchEvent(new Event('nineflow:show-note')) }

export default function Notes() {
  const { settings, updateSettings, addTask, setSelectedId } = usePlanner()
  const notes = settings.notes || []
  const [focusId, setFocusId] = useState(null)
  const [flashId, setFlashId] = useState(null)
  useEffect(() => {
    const show = () => {
      if (!wanted) return
      const id = wanted
      wanted = null
      requestAnimationFrame(() => document.getElementById(`note-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
      setFlashId(id)
      setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600)
    }
    show()
    window.addEventListener('nineflow:show-note', show)
    return () => window.removeEventListener('nineflow:show-note', show)
  }, [])
  const save = (next) => updateSettings({ notes: next })
  const patch = (id, p) => save(notes.map((n) => (n.id === id ? { ...n, ...p, ...('text' in p ? { updatedAt: new Date().toISOString() } : {}) } : n)))

  const add = () => {
    if (notes.length >= MAX_NOTES) return
    const color = NOTE_COLORS[notes.length % NOTE_COLORS.length]
    const note = { id: uid(), text: '', color, pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    save([note, ...notes])
    setFocusId(note.id)
  }
  const remove = (id) => save(notes.filter((n) => n.id !== id))
  const toTask = (n) => {
    const [first, ...rest] = n.text.trim().split('\n')
    const task = addTask({ title: first.slice(0, 120) || 'Note', description: rest.join('\n').trim(), date: null })
    remove(n.id)
    setSelectedId(task.id)
  }

  const ordered = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl">Notes</h1>
          <p className="text-sm text-muted mt-1">Sticky notes for things that aren't tasks yet. Turn one into a task when it is.</p>
        </div>
        <button type="button" onClick={add} disabled={notes.length >= MAX_NOTES}
          className="btn-black h-9 py-0 px-3 inline-flex items-center gap-1.5 disabled:opacity-40">
          <Plus size={14} /> New note
        </button>
      </header>

      {ordered.length === 0 ? (
        <div className="card p-6"><EmptyState icon={StickyNote} title="No notes yet" hint="Jot down a thought, a link or a list." /></div>
      ) : (
        <div className="columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 gap-4 [&>*]:mb-4">
          {ordered.map((n) => (
            <Note key={n.id} note={n} flash={flashId === n.id} autoFocus={focusId === n.id} onFocused={() => setFocusId(null)}
              onText={(text) => patch(n.id, { text })} onColor={(color) => patch(n.id, { color })}
              onPin={() => patch(n.id, { pinned: !n.pinned })} onDelete={() => remove(n.id)} onTask={() => toTask(n)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Note({ note, flash, autoFocus, onFocused, onText, onColor, onPin, onDelete, onTask }) {
  const c = colorOf(note.color)
  const [text, setText] = useState(note.text)
  const ref = useRef(null)
  // Follow changes made elsewhere (another device) unless this note is being typed in.
  useEffect(() => { if (document.activeElement !== ref.current) setText(note.text) }, [note.text])
  useEffect(() => { if (autoFocus) { ref.current?.focus(); onFocused() } }, [autoFocus]) // eslint-disable-line react-hooks/exhaustive-deps
  // Grow with the text.
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(112, el.scrollHeight)}px` } }, [text])
  const commit = () => { const v = ref.current ? ref.current.value : text; if (v !== note.text) onText(v) }
  // Save shortly after typing stops, so nothing is lost if the window closes before the note loses focus.
  const timer = useRef(null)
  const latest = useRef(commit)
  latest.current = commit
  const typed = (v) => { setText(v); clearTimeout(timer.current); timer.current = setTimeout(() => latest.current(), 600) }
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <article id={`note-${note.id}`} className={cx('group break-inside-avoid rounded-2xl p-4 shadow-soft transition-shadow', c.bg, flash && 'ring-2 ring-brand')}>
      <NoteTime note={note} />
      <textarea ref={ref} value={text} maxLength={MAX_NOTE_LENGTH} onChange={(e) => typed(e.target.value)} onBlur={() => { clearTimeout(timer.current); commit() }}
        aria-label="Note" placeholder="Write something…"
        className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed text-ink placeholder:text-ink/40" />
      <div className="mt-2 flex items-center gap-1">
        <div className="flex items-center gap-1 flex-1" role="group" aria-label="Colour">
          {NOTE_COLORS.map((id) => (
            <button key={id} type="button" aria-label={`${colorOf(id).label} note`} aria-pressed={note.color === id}
              onClick={() => onColor(id)}
              className={cx('h-4 w-4 rounded-full', colorOf(id).dot, note.color === id ? 'ring-2 ring-ink/50 ring-offset-1 ring-offset-transparent' : 'opacity-60 hover:opacity-100')} />
          ))}
        </div>
        <button type="button" onClick={() => { commit(); onTask() }} disabled={!text.trim()} title="Turn into a task" aria-label="Turn into a task"
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink/60 hover:bg-card/60 hover:text-ink disabled:opacity-30 transition"><ListPlus size={14} /></button>
        <button type="button" onClick={onPin} title={note.pinned ? 'Unpin' : 'Pin to top'} aria-label={note.pinned ? 'Unpin' : 'Pin to top'}
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink/60 hover:bg-card/60 hover:text-ink transition">{note.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
        <button type="button" onClick={onDelete} title="Delete note" aria-label="Delete note"
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink/60 hover:bg-card/60 hover:text-coral-fg transition"><Trash2 size={14} /></button>
      </div>
    </article>
  )
}

// When the note was made, and when its text last changed (if later): "Tue 28 Oct 2026 · 10:42 AM · edited 3:15 PM".
// Notes made before this was shown may have no time; then nothing is shown.
function NoteTime({ note }) {
  const made = note.createdAt ? parseISO(note.createdAt) : null
  if (!made || !isValid(made)) return null
  const edited = note.updatedAt ? parseISO(note.updatedAt) : null
  const wasEdited = edited && isValid(edited) && note.text && edited - made > 60_000
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink/55 tnum"
      title={`Created ${format(made, 'EEEE d MMMM yyyy, h:mm a')}${wasEdited ? ` · last edited ${format(edited, 'EEEE d MMMM yyyy, h:mm a')}` : ''}`}>
      <Clock3 size={11} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">
        <time dateTime={note.createdAt}>{format(made, 'EEE d MMM yyyy · h:mm a')}</time>
        {wasEdited && <> · edited <time dateTime={note.updatedAt}>{format(edited, isSameDay(edited, made) ? 'h:mm a' : 'd MMM, h:mm a')}</time></>}
      </span>
    </p>
  )
}
