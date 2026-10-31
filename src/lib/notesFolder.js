// Notes as files on this computer (Windows app only), alongside the usual Google Drive sync.
//
// Each note is a Markdown file in a folder the person picks: a short header NineFlow reads back,
// then the note's text, then a line per picture (the picture itself sits in pictures/):
//
//   ---
//   nineflow-id: k3f9x2
//   color: butter
//   pinned: false
//   created: 2026-10-31T10:42:00.000Z
//   ---
//   Electricity bill
//   Pay before Friday
//
//   ![](pictures/p8a7c1.jpg)
//
// Both sides can change. planSync() compares the notes, the files and what was last in step
// (`state`, kept on this device), and says what to write and what to change in the notes.
// It never erases anything: a file whose note was deleted goes to deleted/, a note whose
// file was deleted waits for the person to say so, and two different edits are both kept.

import { MAX_NOTE_LENGTH, MAX_NOTES } from './noteImages'

const PICTURE_LINE = /^!\[[^\]]*\]\(pictures\/([A-Za-z0-9_-]+)\.jpg\)\s*$/
const COLORS = ['butter', 'mint', 'sky', 'rose', 'lav', 'peach']

export const normalize = (s) => String(s || '').replace(/\r\n?/g, '\n')

// Short, stable fingerprint of a file's content (FNV-1a).
export function hash(s) {
  let h = 0x811c9dc5
  const t = normalize(s)
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

// "Electricity bill (k3f9x2).md": the first line, made safe for Windows, plus part of the id so two
// notes with the same first line never share a file.
export function fileNameFor(note) {
  const first = normalize(note.text).split('\n').find((l) => l.trim()) || 'Note'
  const title = first.replace(/[<>:"/\\|?*\u0000-\u001f#[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/[. ]+$/, '') || 'Note'
  return `${title} (${note.id.slice(0, 6)}).md`
}

export function noteToFile(note) {
  const pics = (note.images || []).map((im) => `![](pictures/${im.id}.jpg)`)
  const head = ['---', `nineflow-id: ${note.id}`, `color: ${note.color || 'butter'}`, `pinned: ${note.pinned ? 'true' : 'false'}`]
  if (note.createdAt) head.push(`created: ${note.createdAt}`)
  head.push('---')
  return `${head.join('\n')}\n${normalize(note.text)}${pics.length ? `\n\n${pics.join('\n')}` : ''}\n`
}

// A file back into note fields. A file without the header (one the person made) has no id.
export function parseFile(raw) {
  const t = normalize(raw)
  let meta = {}
  let body = t
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(t)
  if (m) {
    body = t.slice(m[0].length)
    for (const line of m[1].split('\n')) {
      const kv = /^([a-z-]+):\s*(.*)$/i.exec(line.trim())
      if (kv) meta[kv[1].toLowerCase()] = kv[2].trim()
    }
  }
  const lines = body.split('\n')
  const pictureIds = []
  const kept = []
  for (const line of lines) {
    const p = PICTURE_LINE.exec(line)
    if (p) pictureIds.push(p[1])
    else kept.push(line)
  }
  const text = kept.join('\n').replace(/\n+$/, '').replace(/^\n+/, '')
  const id = /^[A-Za-z0-9_-]{4,40}$/.test(meta['nineflow-id'] || '') ? meta['nineflow-id'] : null
  return {
    id,
    text,
    color: COLORS.includes(meta.color) ? meta.color : null,
    pinned: meta.pinned === 'true' ? true : meta.pinned === 'false' ? false : null,
    createdAt: /^\d{4}-\d{2}-\d{2}T/.test(meta.created || '') ? meta.created : null,
    pictureIds,
  }
}

// The text a note would have after taking a file's edit, or why it can't.
function fromFile(note, parsed) {
  if (parsed.text.length > MAX_NOTE_LENGTH) return { tooLong: true }
  const images = (note.images || []).filter((im) => parsed.pictureIds.includes(im.id)) // a deleted picture line removes the picture
  return {
    patch: {
      text: parsed.text,
      ...(parsed.color ? { color: parsed.color } : {}),
      ...(parsed.pinned != null ? { pinned: parsed.pinned } : {}),
      images,
    },
  }
}

/**
 * One round of syncing.
 *  notes:  the notes as NineFlow has them
 *  files:  [{ file, text }] from the folder
 *  pictureFiles: names in pictures/ (from the scan)
 *  state:  { notes: { [id]: { file, hash } }, keep: [ids whose deleted file the person chose to write again] }
 *  makeId: () => a new note id
 *  now:    ISO time for new and changed notes
 * Returns { ops, notes, state, removedFiles: [ids whose file was deleted outside NineFlow], warnings }.
 * `notes` is the new full list (the same array when nothing changed).
 */
export function planSync({ notes, files, pictureFiles = [], state, makeId, now }) {
  const ops = []
  const warnings = []
  const prev = state?.notes || {}
  const next = {}
  const keep = new Set(state?.keep || [])
  let list = notes
  let changed = false
  const setNote = (id, patch) => { list = list.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now } : n)); changed = true }
  const addNote = (n) => { list = [n, ...list]; changed = true }

  // Files by the note id in their header; a second file claiming the same id is treated as a new note.
  const byId = new Map()
  const loose = []
  for (const f of files) {
    const parsed = parseFile(f.text)
    const entry = { ...f, parsed, hash: hash(f.text) }
    if (parsed.id && !byId.has(parsed.id)) byId.set(parsed.id, entry)
    else loose.push(entry)
  }

  const write = (note, oldFile) => {
    const text = noteToFile(note)
    const file = fileNameFor(note)
    ops.push({ write: file, text })
    if (oldFile && oldFile !== file) ops.push({ remove: oldFile })
    next[note.id] = { file, hash: hash(text) }
  }

  const removedFiles = []
  for (const note of notes) {
    const f = byId.get(note.id)
    const s = prev[note.id]
    const want = noteToFile(note)
    if (!f) {
      // Synced before and its file is gone: deleted outside NineFlow. Ask first, unless the person chose to keep it.
      if (s && !keep.has(note.id)) { removedFiles.push(note.id); next[note.id] = s; continue }
      keep.delete(note.id) // written back once; deleting it again asks again
      write(note)
      continue
    }
    const fileChanged = !s || f.hash !== s.hash
    const noteChanged = !s || hash(want) !== s.hash
    if (!fileChanged && !noteChanged) {
      next[note.id] = s
      if (f.file !== fileNameFor(note)) write(note, f.file) // the first line changed somewhere and the name fell behind
      continue
    }
    if (normalize(want) === normalize(f.text)) { next[note.id] = { file: f.file, hash: f.hash }; continue } // already alike
    if (fileChanged && !noteChanged) {
      const r = fromFile(note, f.parsed)
      if (r.tooLong) { warnings.push(`"${f.file}" is longer than ${MAX_NOTE_LENGTH.toLocaleString()} characters, so its change wasn't brought in. Shorten it and save again.`); next[note.id] = s; continue }
      setNote(note.id, r.patch)
      next[note.id] = { file: f.file, hash: f.hash }
      continue
    }
    if (noteChanged && fileChanged && s) {
      // Changed in both places. NineFlow's version stays in the note; the file's version becomes its own note.
      if (list.length < MAX_NOTES && f.parsed.text.trim() && f.parsed.text !== note.text && f.parsed.text.length <= MAX_NOTE_LENGTH) {
        addNote({ id: makeId(), text: `${f.parsed.text}\n\n(conflict copy from the notes folder)`.slice(0, MAX_NOTE_LENGTH), color: note.color, pinned: false, createdAt: now, updatedAt: now, images: [] })
      }
    }
    if (!s && f.parsed.text !== note.text && f.parsed.text.trim()) {
      // First sync of this note and the folder already had a different version: keep that one too.
      if (list.length < MAX_NOTES && f.parsed.text.length <= MAX_NOTE_LENGTH) addNote({ id: makeId(), text: `${f.parsed.text}\n\n(conflict copy from the notes folder)`.slice(0, MAX_NOTE_LENGTH), color: note.color, pinned: false, createdAt: now, updatedAt: now, images: [] })
    }
    write(note, f.file)
  }

  // Files whose id isn't among the notes.
  const ids = new Set(notes.map((n) => n.id))
  for (const [id, f] of byId) {
    if (ids.has(id)) continue
    if (prev[id]) { ops.push({ trash: f.file }); continue } // its note was deleted in NineFlow
    loose.push(f) // from somewhere else (another computer's folder, a copy): take it in as a note
  }
  // New files the person made, or copies: each becomes a note, and its file gets NineFlow's header.
  for (const f of loose) {
    if (!f.parsed.text.trim()) continue
    if (list.length >= MAX_NOTES) { warnings.push(`"${f.file}" wasn't added: Notes holds up to ${MAX_NOTES} notes.`); continue }
    if (f.parsed.text.length > MAX_NOTE_LENGTH) { warnings.push(`"${f.file}" is longer than ${MAX_NOTE_LENGTH.toLocaleString()} characters, so it wasn't added. Shorten it and save again.`); continue }
    const id = f.parsed.id && !ids.has(f.parsed.id) && !next[f.parsed.id] ? f.parsed.id : makeId()
    const note = { id, text: f.parsed.text, color: f.parsed.color || 'butter', pinned: !!f.parsed.pinned, createdAt: f.parsed.createdAt || now, updatedAt: now, images: [] }
    addNote(note)
    write(note, f.file)
  }

  // Pictures: any that isn't in pictures/ yet (or was deleted from there) is written.
  const onDisk = new Set(pictureFiles.map((n) => n.toLowerCase()))
  const pictureOps = []
  for (const n of list) for (const im of n.images || []) {
    const name = `${im.id}.jpg`
    if (!onDisk.has(name.toLowerCase())) { pictureOps.push({ picture: name, base64: im.src.slice(im.src.indexOf(',') + 1) }); onDisk.add(name.toLowerCase()) }
  }

  // A conflict copy added above has no file yet; the next round writes it.
  return {
    ops: [...pictureOps, ...ops],
    notes: changed ? list : notes,
    state: { notes: next, keep: [...keep].filter((id) => list.some((n) => n.id === id)) },
    removedFiles,
    warnings,
  }
}
