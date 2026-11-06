// Spoken (or typed) changes to a list of tasks: "delete the last one", "remove task 2",
// "delete call mom", "delete 2 and 3", "delete all", "bring back task 2", "undo".
//
// Used in two places:
//   - while dictating in Speak tasks: "call mom next buy milk next delete that" drops "buy milk"
//     (applySpokenCommands), so a slip can be taken back without touching the screen;
//   - on the preview list, where a said or typed change unticks or brings back rows (parseCommand +
//     resolveTargets).
// Words like "cancel" or "remove" also start real tasks ("cancel the gym membership"), so a piece
// that names no task on the list is left as a task.

const REMOVE = /^(?:please\s+)?(?:delete|remove|cancel|erase|drop|untick|uncheck|scratch|strike|cut|clear|forget|skip|take\s+out|get\s+rid\s+of|cross\s+out)\b\s*/i
const RESTORE = /^(?:please\s+)?(?:bring\s+back|restore|add\s+back|put\s+back|re-?tick|tick|check|keep|undelete|undo)\b\s*/i

const WORD_NUMBERS = {
  one: 1, won: 1, first: 1, two: 2, to: 2, too: 2, second: 2, three: 3, tree: 3, third: 3, four: 4, for: 4, fourth: 4,
  five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, ate: 8, eighth: 8, nine: 9, ninth: 9, ten: 10, tenth: 10,
  eleven: 11, eleventh: 11, twelve: 12, twelfth: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, twentieth: 20,
}
// "to", "too", "for" and "ate" sound like numbers but are ordinary words, so they only count right
// after "task", "row", "number" and the like ("delete task to" = task 2).
const LOOSE = new Set(['to', 'too', 'for', 'ate', 'won', 'tree'])
const NOUN = '(?:tasks?|rows?|items?|lines?|ones?|entr(?:y|ies)|numbers?|no\\.?|#)'

const toNumber = (w, afterNoun) => {
  const s = String(w).toLowerCase().replace(/\.$/, '')
  const d = s.match(/^(\d{1,2})(?:st|nd|rd|th)?$/)
  if (d) return Number(d[1])
  if (LOOSE.has(s) && !afterNoun) return null
  return WORD_NUMBERS[s] ?? null
}

/**
 * One spoken change → { type: 'remove'|'restore', target } or null when it isn't a change.
 * target: { kind: 'last' } | { kind: 'all' } | { kind: 'undo' } | { kind: 'index', list: [1-based] } | { kind: 'match', words }
 */
export function parseCommand(text) {
  let s = String(text || '').trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
  if (!s) return null
  let type = null
  if (REMOVE.test(s)) { type = 'remove'; s = s.replace(REMOVE, '') }
  else if (RESTORE.test(s)) {
    const undo = /^(?:please\s+)?undo\b/i.test(s)
    type = 'restore'; s = s.replace(RESTORE, '')
    if (undo && !s.trim()) return { type, target: { kind: 'undo' } }
  } else return null

  s = s.replace(/\b(?:from|off|on|in)\s+(?:the\s+)?(?:my\s+)?(?:list|preview)\b/gi, '').replace(/\b(?:please|for me|now)\b/gi, '').trim()
  s = s.replace(/^(?:the|a|an|my|this|that)\s+(?=\S)/i, (m) => (/^(?:this|that)\s/i.test(m) ? m : ''))

  // Nothing or just "it", "that", "the row" → the last one said or shown.
  if (!s || new RegExp(`^(?:it|that|this|that one|this one|tasks?|rows?|items?|lines?|entry)$`, 'i').test(s)) return { type, target: { kind: 'last' } }
  if (new RegExp(`^(?:the\\s+)?(?:last|previous|latest|final|bottom)(?:\\s+${NOUN})?(?:\\s+(?:one|task|row))?$|^(?:that|this)\\s+${NOUN}$`, 'i').test(s)) return { type, target: { kind: 'last' } }
  if (new RegExp(`^(?:all|everything|every\\s+${NOUN}|all\\s+(?:the\\s+|of\\s+(?:the\\s+|them\\s*)?)?${NOUN}?|them\\s+all|all\\s+of\\s+them)$`, 'i').test(s)) return { type, target: { kind: 'all' } }

  // Numbers: "task 2", "the second one", "2 and 3", "rows 1, 4 and 5", "number to".
  const words = s.replace(/,/g, ' , ').split(/\s+/).filter(Boolean)
  const list = []
  let afterNoun = false
  let onlyNumbers = true
  for (const w of words) {
    const lw = w.toLowerCase()
    // "one" is a number ("delete one", "task one") unless it follows one ("the second one").
    if (lw === 'one' && list.length && !afterNoun) continue
    if (lw !== 'one' && new RegExp(`^${NOUN}$`, 'i').test(lw)) { afterNoun = true; continue }
    if (/^(?:and|,|&|plus|also|the)$/.test(lw)) continue
    const n = toNumber(lw, afterNoun || list.length > 0)
    if (n) { list.push(n); continue }
    onlyNumbers = false; break
  }
  if (onlyNumbers && list.length) return { type, target: { kind: 'index', list: [...new Set(list)] } }

  // Otherwise the words of a task's title: "delete call mom".
  const match = s.replace(new RegExp(`\\s+${NOUN}$`, 'i'), '').replace(/^(?:the\s+)?(?:task|row|item|one)\s+(?:called|named|about|for|to)?\s*/i, '').trim()
  return match ? { type, target: { kind: 'match', words: match } } : null
}

const tokens = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w))
const STOP = new Set(['the', 'a', 'an', 'to', 'at', 'on', 'in', 'of', 'and', 'my', 'for', 'task', 'tomorrow', 'today', 'pm', 'am'])

// The row whose title best matches the spoken words (at least half the words must match).
function bestMatch(words, titles, among) {
  const want = tokens(words)
  if (!want.length) return -1
  let best = -1
  let score = 0
  for (const i of among) {
    const have = new Set(tokens(titles[i]))
    const hit = want.filter((w) => have.has(w) || [...have].some((h) => h.length > 3 && w.length > 3 && (h.startsWith(w) || w.startsWith(h)))).length
    const s = hit / want.length
    if (hit && s >= 0.5 && s > score) { best = i; score = s }
  }
  return best
}

/**
 * Which rows a command means (0-based). `titles` are the rows' titles; `isOn(i)` says whether a
 * row is still on the list ("delete the last one" means the last row still ticked, "bring back
 * the last one" the last unticked one); `history` is the 0-based rows removed so far, newest last.
 */
export function resolveTargets(cmd, titles, { isOn = () => true, history = [] } = {}) {
  if (!cmd) return []
  const among = titles.map((_, i) => i).filter((i) => (cmd.type === 'remove' ? isOn(i) : !isOn(i)))
  const t = cmd.target
  if (t.kind === 'all') return among
  if (t.kind === 'undo') { const last = [...history].reverse().find((i) => !isOn(i)); return last == null ? [] : [last] }
  if (t.kind === 'last') {
    if (cmd.type === 'restore') { const last = [...history].reverse().find((i) => !isOn(i)); if (last != null) return [last] }
    return among.length ? [among[among.length - 1]] : []
  }
  if (t.kind === 'index') return t.list.map((n) => n - 1).filter((i) => i >= 0 && i < titles.length)
  const i = bestMatch(t.words, titles, among)
  return i < 0 ? [] : [i]
}

/**
 * Dictated text with spoken changes applied: each change takes out a piece said before it.
 * `pieces` are the parts of the text (from splitSpoken). Returns the pieces still wanted; a piece
 * that reads like a change but names nothing ("cancel the gym membership") stays a task.
 */
export function applyToPieces(pieces) {
  const kept = [] // { text, on }
  const history = []
  for (const piece of pieces) {
    const cmd = parseCommand(piece)
    if (cmd) {
      const titles = kept.map((k) => k.text)
      const hits = resolveTargets(cmd, titles, { isOn: (i) => kept[i].on, history })
      if (hits.length) {
        for (const i of hits) { kept[i].on = cmd.type === 'restore'; if (cmd.type === 'remove') history.push(i) }
        continue
      }
      // A change that refers to nothing, like "delete the last one" before any task, is dropped;
      // one that could be a task in its own right is kept as a task.
      if (cmd.target.kind !== 'match') continue
    }
    kept.push({ text: piece, on: true })
  }
  return kept.filter((k) => k.on).map((k) => k.text)
}

/** Short description of rows for the status line: "“Call mom”" or "3 tasks". */
export function describeRows(indices, titles) {
  if (indices.length === 1) return `“${titles[indices[0]]}”`
  return `${indices.length} tasks`
}
