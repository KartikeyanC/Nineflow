import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isSameDay, isValid, parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { Brain, Clock3, ExternalLink, Image as ImageIcon, ImagePlus, LayoutGrid, Link2, List, ListPlus, Pin, PinOff, Plus, Search, StickyNote, Trash2, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { uid } from '../lib/storage'
import { COLOR_IDS, colorOf } from '../lib/colors'
import { IMAGE_BUDGET, MAX_IMAGES, MAX_NOTES, MAX_NOTE_LENGTH, imagesSize, linksIn, shrinkImage } from '../lib/noteImages'
import { EmptyState, Modal, cx } from '../components/ui'
import { NotesFolderNotice } from '../features/NotesFolder'
import { countCards } from '../lib/flashcards'
import { QUICK, SORTS, allTags, facts, findNotes, snippet, titleOf } from '../lib/noteFind'
import { storageKey } from '../lib/profiles'

const NOTE_COLORS = COLOR_IDS.filter((c) => ['butter', 'mint', 'sky', 'rose', 'lav', 'peach'].includes(c))

// Quick notes that aren't tasks: a thought, a link, a list. They live in the settings (so they sync
// like everything else). A note can be turned into a task with one click.
// Search picks a note: Notes scrolls to it and flashes it once it is on screen.
let wanted = null
export function showNote(id) { wanted = id; window.dispatchEvent(new Event('nineflow:show-note')) }

// How Notes was last arranged, per workspace: { sort, view, tags, quick, colors }.
const FIND_DEFAULT = { sort: 'edited', view: 'grid', tags: [], quick: [], colors: [] }
const loadFind = () => {
  try {
    const f = JSON.parse(localStorage.getItem(storageKey('notes-find')) || 'null') || {}
    const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : [])
    return {
      sort: SORTS.some((s) => s.id === f.sort) ? f.sort : 'edited',
      view: f.view === 'list' ? 'list' : 'grid',
      tags: arr(f.tags), quick: arr(f.quick).filter((q) => QUICK.some((x) => x.id === q)), colors: arr(f.colors),
    }
  } catch { return { ...FIND_DEFAULT } }
}
const saveFind = (f) => { try { localStorage.setItem(storageKey('notes-find'), JSON.stringify(f)) } catch { /* only a convenience */ } }

export default function Notes() {
  const { settings, updateSettings, addTask, setSelectedId, setView } = usePlanner()
  const notes = settings.notes || []
  const [focusId, setFocusId] = useState(null)
  const [flashId, setFlashId] = useState(null)
  // Finding notes: search text (not remembered), and sort, view, tags and filters (remembered).
  const [query, setQuery] = useState('')
  const [find, setFindState] = useState(loadFind)
  const setFind = (patch) => setFindState((f) => { const next = { ...f, ...patch }; saveFind(next); return next })
  const [keep, setKeep] = useState(() => new Set()) // notes made or opened here stay visible whatever the filters
  const [openId, setOpenId] = useState(null) // the list view opens a note in a window
  useEffect(() => {
    const show = () => {
      if (!wanted) return
      const id = wanted
      wanted = null
      setKeep((k) => new Set(k).add(id))
      setFindState((f) => ({ ...f, view: 'grid' }))
      requestAnimationFrame(() => document.getElementById(`note-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
      setFlashId(id)
      setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600)
    }
    show()
    window.addEventListener('nineflow:show-note', show)
    return () => window.removeEventListener('nineflow:show-note', show)
  }, [])
  const save = (next) => updateSettings({ notes: next })
  const patch = (id, p) => save(notes.map((n) => (n.id === id ? { ...n, ...p, ...('text' in p || 'images' in p ? { updatedAt: new Date().toISOString() } : {}) } : n)))
  // Shrinks and adds pictures to a note; says why when one can't be added.
  const addImages = async (id, files) => {
    const note = notes.find((n) => n.id === id)
    const before = note?.images || []
    const added = []
    let used = imagesSize(notes)
    try {
      for (const file of files) {
        if (before.length + added.length >= MAX_IMAGES) throw new Error(`A note holds up to ${MAX_IMAGES} pictures.`)
        const im = await shrinkImage(file)
        if (used + im.src.length > IMAGE_BUDGET) throw new Error('Notes are full of pictures. Remove some from other notes to add more.')
        used += im.src.length
        added.push({ id: uid(), ...im })
      }
    } finally {
      // Saved once, from the latest notes, so anything typed while pictures were shrinking is kept.
      if (added.length) updateSettings((s) => ({ notes: (s.notes || []).map((n) => (n.id === id ? { ...n, images: [...(n.images || []), ...added], updatedAt: new Date().toISOString() } : n)) }))
    }
  }

  const add = () => {
    if (notes.length >= MAX_NOTES) return
    const color = NOTE_COLORS[notes.length % NOTE_COLORS.length]
    const note = { id: uid(), text: '', color, pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    save([note, ...notes])
    setKeep((k) => new Set(k).add(note.id))
    if (find.view === 'list') setOpenId(note.id)
    else setFocusId(note.id)
  }
  const remove = (id) => save(notes.filter((n) => n.id !== id))
  const toTask = (n) => {
    const [first, ...rest] = n.text.trim().split('\n')
    const task = addTask({ title: first.slice(0, 120) || 'Note', description: rest.join('\n').trim(), date: null })
    // Tasks have no pictures, so a note with pictures stays in Notes.
    if (!n.images?.length) remove(n.id)
    setSelectedId(task.id)
  }

  const found = useMemo(() => findNotes(notes, { ...find, query }, keep), [notes, find, query, keep])
  const filtering = !!(query.trim() || find.tags.length || find.quick.length || find.colors.length)
  const clearFilters = () => { setQuery(''); setFind({ tags: [], quick: [], colors: [] }) }
  const noteProps = (n) => ({
    note: n, flash: flashId === n.id,
    onText: (text) => patch(n.id, { text }), onColor: (color) => patch(n.id, { color }),
    onAddImages: (files) => addImages(n.id, files), onRemoveImage: (imgId) => patch(n.id, { images: (n.images || []).filter((im) => im.id !== imgId) }),
    onPin: () => patch(n.id, { pinned: !n.pinned }), onDelete: () => { remove(n.id); setOpenId(null) }, onTask: () => { toTask(n); setOpenId(null) },
  })
  const opened = notes.find((n) => n.id === openId)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl">Notes</h1>
          <p className="text-sm text-muted mt-1">Sticky notes for things that aren't tasks yet: words, links and pictures. Turn one into a task when it is.</p>
          <p className="text-xs text-faint mt-1">Flashcards: write <code className="kbd">question :: answer</code> on a line and it's revised in <button type="button" className="underline underline-offset-2 font-semibold text-muted hover:text-ink" onClick={() => setView('revise')}>Revise</button>.</p>
        </div>
        <button type="button" onClick={add} disabled={notes.length >= MAX_NOTES}
          className="btn-black h-9 py-0 px-3 inline-flex items-center gap-1.5 disabled:opacity-40">
          <Plus size={14} /> New note
        </button>
      </header>

      <NotesFolderNotice />

      {notes.length === 0 ? (
        <div className="card p-6"><EmptyState icon={StickyNote} title="No notes yet" hint="Jot down a thought, a link or a list. Add #tags like #gk or #maths to find notes later." /></div>
      ) : (
        <>
          <NotesFinder notes={notes} query={query} setQuery={setQuery} find={find} setFind={setFind} count={found.count} filtering={filtering} onClear={clearFilters} />
          {found.count === 0 ? (
            <div className="card p-6">
              <EmptyState icon={Search} title="No notes match" hint="Try fewer words, or turn off a tag or filter."
                action={<button type="button" className="btn-ghost" onClick={clearFilters}>Show all notes</button>} />
            </div>
          ) : found.groups.map((g) => (
            <section key={g.key} aria-label={g.label || 'Notes'}>
              {g.label && (
                <h2 className="flex items-baseline gap-2 text-sm font-bold text-ink mb-2">
                  {g.key === 'pinned' && <Pin size={13} className="self-center text-muted" aria-hidden="true" />}{g.label}
                  <span className="text-xs font-semibold text-faint tnum">{g.notes.length} note{g.notes.length === 1 ? '' : 's'}</span>
                </h2>
              )}
              {find.view === 'list' ? (
                <ul className="card divide-y divide-line overflow-hidden">
                  {g.notes.map((n) => <NoteRow key={n.id} note={n} query={query} onOpen={() => setOpenId(n.id)} onTag={(t) => setFind({ tags: find.tags.includes(t) ? find.tags : [...find.tags, t] })} />)}
                </ul>
              ) : (
                <div className="columns-1 sm:columns-2 xl:columns-3 2xl:columns-4 gap-4 [&>*]:mb-4">
                  {g.notes.map((n) => <Note key={n.id} {...noteProps(n)} autoFocus={focusId === n.id} onFocused={() => setFocusId(null)} />)}
                </div>
              )}
            </section>
          ))}
        </>
      )}

      {/* The list view opens a note here to read or edit it. */}
      <Modal open={!!opened} onClose={() => setOpenId(null)} width="max-w-lg">
        {opened && <Note {...noteProps(opened)} autoFocus={!opened.text} onFocused={() => {}} />}
      </Modal>
    </div>
  )
}

function Note({ note, flash, autoFocus, onFocused, onText, onColor, onPin, onDelete, onTask, onAddImages, onRemoveImage }) {
  const c = colorOf(note.color)
  const [text, setText] = useState(note.text)
  const ref = useRef(null)
  const images = note.images || []
  const links = useMemo(() => linksIn(text), [text])
  const cardCount = useMemo(() => countCards(text), [text])
  const fileRef = useRef(null)
  const [imgError, setImgError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [viewing, setViewing] = useState(null)
  const take = async (files) => {
    const pics = [...files].filter((f) => /^image\//.test(f.type))
    if (!pics.length) return
    setImgError(null)
    setAdding(true)
    try { await onAddImages(pics) } catch (e) { setImgError(e.message) } finally { setAdding(false) }
  }
  // A picture pasted into the note is added to it; pasted text stays text.
  const onPaste = (e) => {
    const pics = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type))
    if (pics.length) { e.preventDefault(); take(pics) }
  }
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
    <article id={`note-${note.id}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragOver(false); take(e.dataTransfer.files) } }}
      className={cx('group break-inside-avoid rounded-2xl p-4 shadow-soft transition-shadow', c.bg, flash && 'ring-2 ring-brand', dragOver && 'ring-2 ring-lav-fg')}>
      <NoteTime note={note} />
      {images.length > 0 && (
        <div className={cx('mb-2 grid gap-1.5', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {images.map((im, i) => (
            <div key={im.id} className={cx('relative group/img', images.length === 3 && i === 0 && 'col-span-2')}>
              <button type="button" onClick={() => setViewing(im)} aria-label="Open picture"
                className="block w-full overflow-hidden rounded-xl bg-card/60 ring-1 ring-ink/10">
                <img src={im.src} alt="" width={im.w || undefined} height={im.h || undefined} className={cx('w-full object-cover', images.length === 1 ? 'max-h-64' : 'h-28')} />
              </button>
              <button type="button" onClick={() => onRemoveImage(im.id)} aria-label="Remove picture" title="Remove picture"
                className="tap-target absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-ink/60 text-white inline-flex items-center justify-center opacity-0 group-hover/img:opacity-100 focus:opacity-100 max-sm:opacity-100 transition">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea ref={ref} value={text} maxLength={MAX_NOTE_LENGTH} onChange={(e) => typed(e.target.value)} onBlur={() => { clearTimeout(timer.current); commit() }}
        onPaste={onPaste} aria-label="Note" placeholder="Write something, or paste a picture…"
        className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed text-ink placeholder:text-ink/40" />
      {links.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1" aria-label="Links in this note">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" title={l.href}
                className="flex items-center gap-2 rounded-xl bg-card/70 hover:bg-card px-2.5 py-1.5 text-xs text-ink ring-1 ring-ink/10 transition min-w-0">
                <Link2 size={13} className="shrink-0 text-ink/60" aria-hidden="true" />
                <span className="font-semibold shrink-0">{l.host}</span>
                <span className="truncate text-ink/60">{l.path}</span>
                <ExternalLink size={12} className="shrink-0 ml-auto text-ink/50" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {cardCount > 0 && <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-ink/60"><Brain size={12} aria-hidden="true" /> {cardCount} flashcard{cardCount === 1 ? '' : 's'}</p>}
      {(adding || imgError) && <p role={imgError ? 'alert' : 'status'} className={cx('mt-1.5 text-xs font-semibold', imgError ? 'text-coral-fg' : 'text-ink/60')}>{imgError || 'Adding picture…'}</p>}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = '' }} />
      <div className="mt-2 flex items-center gap-1">
        <div className="flex items-center gap-1 flex-1" role="group" aria-label="Colour">
          {NOTE_COLORS.map((id) => (
            <button key={id} type="button" aria-label={`${colorOf(id).label} note`} aria-pressed={note.color === id}
              onClick={() => onColor(id)}
              className={cx('h-4 w-4 rounded-full', colorOf(id).dot, note.color === id ? 'ring-2 ring-ink/50 ring-offset-1 ring-offset-transparent' : 'opacity-60 hover:opacity-100')} />
          ))}
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={images.length >= MAX_IMAGES || adding}
          title={images.length >= MAX_IMAGES ? `Up to ${MAX_IMAGES} pictures in a note` : 'Add a picture (or paste or drop one)'} aria-label="Add a picture"
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink/60 hover:bg-card/60 hover:text-ink disabled:opacity-30 transition"><ImagePlus size={14} /></button>
        <button type="button" onClick={() => { commit(); onTask() }} disabled={!text.trim()} title="Turn into a task" aria-label="Turn into a task"
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink/60 hover:bg-card/60 hover:text-ink disabled:opacity-30 transition"><ListPlus size={14} /></button>
        <button type="button" onClick={onPin} title={note.pinned ? 'Unpin' : 'Pin to top'} aria-label={note.pinned ? 'Unpin' : 'Pin to top'}
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink/60 hover:bg-card/60 hover:text-ink transition">{note.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
        <button type="button" onClick={onDelete} title="Delete note" aria-label="Delete note"
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-ink/60 hover:bg-card/60 hover:text-coral-fg transition"><Trash2 size={14} /></button>
      </div>
      <Modal open={!!viewing} onClose={() => setViewing(null)} width="max-w-3xl">
        {viewing && (
          <div className="flex flex-col gap-3">
            <img src={viewing.src} alt="" className="w-full max-h-[70vh] object-contain rounded-xl bg-page" />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => { onRemoveImage(viewing.id); setViewing(null) }}><Trash2 size={14} /> Remove picture</button>
              <button type="button" className="btn-black" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>
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
    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink/55 tnum"
      title={`Created ${format(made, 'EEEE d MMMM yyyy, h:mm a')}${wasEdited ? ` · last edited ${format(edited, 'EEEE d MMMM yyyy, h:mm a')}` : ''}`}>
      <Clock3 size={11} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">
        <time dateTime={note.createdAt}>{format(made, 'EEE d MMM yyyy · h:mm a')}</time>
        {wasEdited && <> · edited <time dateTime={note.updatedAt}>{format(edited, isSameDay(edited, made) ? 'h:mm a' : 'd MMM, h:mm a')}</time></>}
      </span>
    </p>
  )
}

// Above the notes: search, sort, grid or list, then tags, quick filters and colours as chips.
function NotesFinder({ notes, query, setQuery, find, setFind, count, filtering, onClear }) {
  const tags = useMemo(() => allTags(notes), [notes])
  const ref = useRef(null)
  // "/" jumps to the search box, as on many sites.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || document.querySelector('[role=dialog]')) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const toggle = (key, value) => setFind({ [key]: find[key].includes(value) ? find[key].filter((x) => x !== value) : [...find[key], value] })
  const chip = (on) => cx('pill border transition cursor-pointer', on ? 'bg-lav text-lav-fg border-lav-fg' : 'bg-card text-muted border-line hover:text-ink')
  const usedColors = NOTE_COLORS.filter((c) => notes.some((n) => n.color === c))
  return (
    <div className="card p-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden="true" />
          <input ref={ref} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…  ( / )"
            aria-label="Search notes" className="input h-9 py-0 pl-9 pr-8" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full inline-flex items-center justify-center text-faint hover:text-ink"><X size={13} /></button>}
        </label>
        <select className="input h-9 py-0 w-auto" value={find.sort} onChange={(e) => setFind({ sort: e.target.value })} aria-label="Sort notes">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div role="group" aria-label="View" className="inline-flex rounded-full p-1 gap-0.5 bg-ink/5 dark:bg-ink/10">
          {[['grid', LayoutGrid, 'Grid'], ['list', List, 'List']].map(([id, Icon, label]) => (
            <button key={id} type="button" aria-pressed={find.view === id} onClick={() => setFind({ view: id })} title={`${label} view`}
              className={cx('rounded-full px-2.5 h-7 inline-flex items-center gap-1.5 text-xs font-semibold transition', find.view === id ? 'bg-brand text-white shadow-sm' : 'text-ink/70 hover:text-ink')}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
        {tags.map(({ tag, count: n }) => (
          <button key={tag} type="button" aria-pressed={find.tags.includes(tag)} onClick={() => toggle('tags', tag)} className={chip(find.tags.includes(tag))}>
            #{tag} <span className="tnum opacity-70">{n}</span>
          </button>
        ))}
        {tags.length > 0 && <span className="w-px h-4 bg-line mx-1" aria-hidden="true" />}
        {QUICK.map((q) => (
          <button key={q.id} type="button" aria-pressed={find.quick.includes(q.id)} onClick={() => toggle('quick', q.id)} className={chip(find.quick.includes(q.id))}>{q.label}</button>
        ))}
        {usedColors.length > 1 && <span className="w-px h-4 bg-line mx-1" aria-hidden="true" />}
        {usedColors.length > 1 && usedColors.map((c) => (
          <button key={c} type="button" aria-pressed={find.colors.includes(c)} onClick={() => toggle('colors', c)} aria-label={`${colorOf(c).label} notes`} title={`${colorOf(c).label} notes`}
            className={cx('h-5 w-5 rounded-full transition', colorOf(c).dot, find.colors.includes(c) ? 'ring-2 ring-offset-2 ring-offset-card ring-ink/60' : 'opacity-50 hover:opacity-100')} />
        ))}
        {filtering && (
          <span className="ml-auto inline-flex items-center gap-2 text-xs text-muted">
            <span className="tnum">{count} of {notes.length}</span>
            <button type="button" onClick={onClear} className="font-semibold underline underline-offset-2 hover:text-ink">Clear</button>
          </span>
        )}
      </div>
      {tags.length === 0 && <p className="text-xs text-faint">Tip: write #tags like #gk or #maths in a note and they appear here to filter by.</p>}
    </div>
  )
}

// The search words shown in a highlight.
function Marked({ text, query }) {
  const ws = query.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!ws.length) return text
  const parts = String(text).split(new RegExp(`(${ws.join('|')})`, 'gi'))
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-butter text-ink rounded px-0.5">{p}</mark> : p))
}

// List view: one line per note to scan many at once.
function NoteRow({ note, query, onOpen, onTag }) {
  const f = useMemo(() => facts(note), [note])
  const c = colorOf(note.color)
  const when = note.updatedAt || note.createdAt
  const d = when ? parseISO(when) : null
  return (
    <li className="flex items-start gap-3 px-4 py-3 hover:bg-page transition">
      <span className={cx('mt-1.5 h-2.5 w-2.5 rounded-full shrink-0', c.dot)} aria-hidden="true" />
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
        <span className="flex items-center gap-1.5">
          {note.pinned && <Pin size={12} className="shrink-0 text-muted" aria-label="Pinned" />}
          <span className="font-semibold text-sm truncate"><Marked text={titleOf(note)} query={query} /></span>
        </span>
        <span className="block text-xs text-muted truncate mt-0.5"><Marked text={snippet(note.text, query) || ' '} query={query} /></span>
      </button>
      <span className="hidden sm:flex flex-wrap justify-end gap-1 max-w-[40%]">
        {f.tags.slice(0, 3).map((t) => <button key={t} type="button" onClick={() => onTag(t)} className="pill bg-page text-muted hover:text-ink border border-line">#{t}</button>)}
      </span>
      <span className="flex items-center gap-1.5 text-faint shrink-0 mt-0.5">
        {f.pictures > 0 && <ImageIcon size={13} aria-label={`${f.pictures} picture${f.pictures === 1 ? '' : 's'}`} />}
        {f.links > 0 && <Link2 size={13} aria-label={`${f.links} link${f.links === 1 ? '' : 's'}`} />}
        {f.cards > 0 && <Brain size={13} aria-label={`${f.cards} flashcard${f.cards === 1 ? '' : 's'}`} />}
        {d && isValid(d) && <time dateTime={when} className="text-xs font-semibold tnum ml-1">{format(d, 'd MMM')}</time>}
      </span>
    </li>
  )
}
