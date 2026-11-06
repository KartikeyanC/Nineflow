// "Speak tasks": turns something said out loud into separate tasks, on the device, with no AI.
//
//   "revise polity tomorrow at 7 next mock test on Sunday high priority then call mom at 6 pm"
//   → Revise polity (tomorrow 07:00) · Mock test (Sunday, high) · Call mom (today 18:00)
//
// Speech recognisers rarely add punctuation, so tasks are split where the person says
// "next", "then", "after that", "also" or "new task", as well as at full stops, commas,
// semicolons and new lines. Each piece then goes through the Quick add parser (lib/nlp.js),
// after spoken phrases are turned into its short forms ("high priority" → !high, "for half an
// hour" → 30m, "7 p.m." → 7pm, a bare "at 7" → 7am).
import { parseQuickAdd } from './nlp'
import { applyToPieces } from './voiceCommands'

const SEPARATORS = /(?:[.;\n,]+|\b(?:and then|after that|next task|new task|and also|next|then|also)\b)/i

// "7 p.m." → "7pm" before anything else, so its full stops don't split the task.
const spokenTimes = (s) => String(s || '').replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?/gi, (_, h, m, ap) => `${h}${m ? `:${m}` : ''}${ap.toLowerCase()}m`)

// Spoken phrases → the forms parseQuickAdd reads.
export function normalizeSpoken(s) {
  return ` ${spokenTimes(s)} `
    .replace(/\b(?:at\s+)?(\d{1,2})\s*o'?\s*clock\b/gi, 'at $1')
    // A bare "at 7": 7 to 11 is morning, 12 to 6 afternoon or evening ("at 6" = 6 pm). Saying am or pm wins.
    .replace(/\bat\s+(\d{1,2})(?::(\d{2}))?(?![\d:]|\s*[ap]m\b)/gi, (all, h, m) => {
      const n = Number(h)
      if (n < 1 || n > 12) return all
      return `at ${n}${m ? `:${m}` : ''}${n >= 7 && n <= 11 ? 'am' : 'pm'}`
    })
    .replace(/\b(?:high|top)\s+priority\b|\b(?:urgent|important)\b/gi, ' !high ')
    .replace(/\b(?:medium|normal)\s+priority\b/gi, ' !medium ')
    .replace(/\blow\s+priority\b/gi, ' !low ')
    .replace(/\bfor\s+half\s+an?\s+hour\b/gi, ' 30m ')
    .replace(/\bfor\s+(?:an|one)\s+hour\b/gi, ' 1h ')
    .replace(/\bfor\s+(\d+(?:\.\d+)?)\s+hours?\b/gi, ' $1h ')
    .replace(/\bfor\s+(\d+)\s+min(?:ute)?s?\b/gi, ' $1m ')
    .replace(/\b(?:in\s+)?category\s+([\w-]+)/gi, ' #$1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Words that start a piece but aren't the task ("okay I need to …").
const FILLER = /^\s*(?:and|okay|ok|um+|uh+|so|well|i need to|i have to|i must|i should|remind me to|please)\b\s*/i
const stripFiller = (p) => { let s = p; while (FILLER.test(s)) s = s.replace(FILLER, ''); return s.trim() }

// The pieces of what was said that are tasks (filler like "okay" or "um" alone is dropped), after
// spoken changes like "delete that" or "remove task 2" have taken out the pieces they name
// (lib/voiceCommands.js).
export function splitSpoken(text) {
  return applyToPieces(rawPieces(text))
}
const rawPieces = (text) => spokenTimes(text)
  .split(SEPARATORS)
  .map(stripFiller)
  .filter((p) => p.replace(/\W/g, '').length >= 2)

// For the AI: the same text with spoken changes applied, one task per line, or the text as it was
// when nothing in it is a change (so a typed note keeps its own wording).
export function applySpokenCommands(text) {
  const raw = rawPieces(text)
  const kept = applyToPieces(raw)
  return kept.length === raw.length ? text : kept.join('\n')
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// Spoken text → tasks in the same shape Prompt to list previews:
// { title, date, startTime, durationMinutes, priority, category, recurrence }.
export function spokenToTasks(text, { categories = [], now = new Date() } = {}) {
  const out = []
  for (const piece of splitSpoken(text)) {
    const p = parseQuickAdd(normalizeSpoken(piece), { categories, now })
    const title = cap(p.title.replace(/\s+/g, ' ').replace(/^(?:to|at|on)\s+/i, '').replace(/\s+(?:at|on|by)$/i, '').trim())
    if (!title) continue
    out.push({
      title: title.slice(0, 200),
      date: p.date || null,
      startTime: p.startTime || null,
      durationMinutes: p.durationMinutes || null,
      priority: p.priority || null,
      category: p.category || null,
      recurrence: p.recurrence || null,
    })
    if (out.length >= 30) break
  }
  return out
}
