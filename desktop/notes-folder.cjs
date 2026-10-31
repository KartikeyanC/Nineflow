// Notes as files on this computer: the reading and writing half of src/lib/notesFolder.js.
//
// The planner decides what each file should say; this module only touches the disk, and only
// inside a folder the person picked in the system's own folder dialog (kept in desktop-prefs.json).
// Every file name is checked to be a plain name in that folder, so nothing can be written elsewhere.
//
//   <folder>/<note>.md          one note each (a short header with its id, then the text)
//   <folder>/pictures/<id>.jpg  the note's pictures
//   <folder>/deleted/           where files go when their note is deleted in NineFlow (never erased)

const { dialog, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const MAX_FILE_BYTES = 256 * 1024 // a note file bigger than this isn't read (a note holds 2,000 characters)
const MAX_FILES = 500

module.exports = function notesFolder({ readPrefs, writePrefs }) {
  const allowed = () => (readPrefs().noteFolders || []).filter((f) => typeof f === 'string')
  const isAllowed = (folder) => typeof folder === 'string' && allowed().some((f) => path.resolve(f) === path.resolve(folder))
  const fail = (message) => ({ ok: false, message })

  // A plain file name of the given kind, or null: no folders, no "..", no characters Windows refuses.
  const safeName = (name, ext) => {
    if (typeof name !== 'string' || name.length > 120 || !name.toLowerCase().endsWith(ext)) return null
    if (name !== path.basename(name) || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /^\.|[. ]$/.test(name)) return null
    return name
  }
  const inside = (folder, ...parts) => {
    const p = path.resolve(folder, ...parts)
    return p.startsWith(path.resolve(folder) + path.sep) ? p : null
  }

  async function choose(win) {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for your notes', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    const folder = r.filePaths[0]
    writePrefs({ noteFolders: [...new Set([...allowed(), folder])].slice(-5) })
    return { ok: true, folder }
  }

  // Every note file in the folder: { file, text, mtime }.
  function scan(folder) {
    if (!isAllowed(folder)) return fail('That folder was not chosen in NineFlow.')
    let names
    try { names = fs.readdirSync(folder) } catch { return fail('The notes folder can\'t be opened. It may have been moved or renamed.') }
    const files = []
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.md') || files.length >= MAX_FILES) continue
      const p = inside(folder, name)
      try {
        const st = p && fs.statSync(p)
        if (!st || !st.isFile() || st.size > MAX_FILE_BYTES) continue
        files.push({ file: name, text: fs.readFileSync(p, 'utf8'), mtime: st.mtimeMs })
      } catch { /* a file being saved right now: the next scan reads it */ }
    }
    let pictures = []
    try { pictures = fs.readdirSync(path.join(folder, 'pictures')).filter((n) => /\.jpg$/i.test(n)) } catch { /* none yet */ }
    return { ok: true, files, pictures }
  }

  // ops: { write: name, text } | { picture: name, base64 } | { trash: name } | { remove: name }
  function apply(folder, ops) {
    if (!isAllowed(folder)) return fail('That folder was not chosen in NineFlow.')
    const results = []
    for (const op of Array.isArray(ops) ? ops : []) {
      try {
        if (op.write) {
          const name = safeName(op.write, '.md')
          if (!name || typeof op.text !== 'string') throw new Error('bad name')
          const p = inside(folder, name)
          // Written beside it first, then swapped in, so an editor never reads half a file.
          fs.writeFileSync(`${p}.nineflow-tmp`, op.text, 'utf8')
          fs.renameSync(`${p}.nineflow-tmp`, p)
        } else if (op.picture) {
          const name = safeName(op.picture, '.jpg')
          if (!name || typeof op.base64 !== 'string') throw new Error('bad name')
          fs.mkdirSync(path.join(folder, 'pictures'), { recursive: true })
          const p = inside(folder, 'pictures', name)
          if (!fs.existsSync(p)) fs.writeFileSync(p, Buffer.from(op.base64, 'base64'))
        } else if (op.trash || op.remove) {
          // A deleted note's file is moved to deleted/, never erased. `remove` is for a file that was
          // renamed to a new name, whose content now lives in the new file.
          const name = safeName(op.trash || op.remove, '.md')
          const p = name && inside(folder, name)
          if (!p || !fs.existsSync(p)) { results.push({ ok: true }); continue }
          fs.mkdirSync(path.join(folder, 'deleted'), { recursive: true })
          const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')
          const to = op.trash ? inside(folder, 'deleted', `${name.slice(0, -3)} (deleted ${stamp}).md`) : null
          if (to) fs.renameSync(p, to)
          else fs.rmSync(p)
        }
        results.push({ ok: true })
      } catch (e) {
        results.push({ ok: false, message: e.message })
      }
    }
    return { ok: true, results }
  }

  // Tells the window when anything in the folder changes (debounced: editors save in several steps).
  const watchers = new Map() // webContents id -> { watcher, folder }
  function watch(sender, folder) {
    unwatch(sender)
    if (!isAllowed(folder)) return fail('That folder was not chosen in NineFlow.')
    let timer = null
    try {
      const watcher = fs.watch(folder, { persistent: false }, (_type, name) => {
        if (name && (name.endsWith('.nineflow-tmp') || !name.toLowerCase().endsWith('.md'))) return
        clearTimeout(timer)
        timer = setTimeout(() => { if (!sender.isDestroyed()) sender.send('notes-folder:changed') }, 700)
      })
      watcher.on('error', () => unwatch(sender))
      watchers.set(sender.id, { watcher, folder })
      sender.once('destroyed', () => unwatch(sender))
      return { ok: true }
    } catch {
      return fail('The notes folder can\'t be watched for changes.')
    }
  }
  function unwatch(sender) {
    const w = watchers.get(sender.id)
    if (w) { try { w.watcher.close() } catch { /* already closed */ } watchers.delete(sender.id) }
  }

  const open = (folder) => (isAllowed(folder) ? shell.openPath(folder).then((err) => (err ? fail(err) : { ok: true })) : fail('That folder was not chosen in NineFlow.'))

  return { choose, scan, apply, watch, unwatch, open }
}
