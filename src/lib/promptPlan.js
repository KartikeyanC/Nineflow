// Reads one sentence (or a short note with the topics on the lines below) and
// fills in what "Plan a goal" needs. No AI and no network: it looks for the
// things people actually write.
//
//   "90 day UPSC exam plan, 6 hours a day, subjects: history, polity, geography"
//   "Maths exam on 15 Dec, 2h daily except Sundays at 7pm"
//   "IELTS prep in 8 weeks, 1.5 hours a day, Mon-Fri"
//   "Website launch by next Friday"
//
// parsePlanPrompt(text, { now }) → { fields, found }
//   fields: only what was found, named like the form in GoalPlanner
//           { name, deadline ('yyyy-MM-dd'), topicsText, minutes, days, startTime,
//             revision, restDayBefore }
//   found:  the same keys as a list
// Dates are read day-first (15/12 is 15 December). Pure, so it can be tried on its own.
import { addDays, addMonths, endOfMonth, endOfYear, format, startOfDay } from 'date-fns'
import { parseTopics } from './goalPlan.js'

const WD = '(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)'
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
const dow = (w) => DAY_INDEX[w.slice(0, 3).toLowerCase()]
const monthOf = (m) => MONTH_INDEX[m.slice(0, 3).toLowerCase()]
const key = (d) => format(d, 'yyyy-MM-dd')
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

// Finds `re` in the working text, cuts it out (so later steps don't read it twice) and returns the match.
function take(st, re) {
  const m = re.exec(st.s)
  if (!m) return null
  st.s = `${st.s.slice(0, m.index)} ${st.s.slice(m.index + m[0].length)}`
  return m
}

// Days from `a` to `b` inclusive, wrapping past Saturday (Fri–Mon works).
function weekdayRange(a, b) {
  const out = []
  for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break }
  return out
}

const listWeekdays = (text) => [...text.matchAll(new RegExp(`\\b(${WD})s?\\b`, 'gi'))].map((m) => dow(m[1]))

function makeDate(y, m, d, from) {
  const today = startOfDay(from)
  let yr = y == null ? today.getFullYear() : y < 100 ? y + 2000 : y
  let dt = new Date(yr, m, d)
  if (dt.getMonth() !== m || dt.getDate() !== d) return null
  // No year given and the date has gone: it means next year.
  if (y == null && dt < today) { yr += 1; dt = new Date(yr, m, d); if (dt.getMonth() !== m) return null }
  return dt
}

// The next given weekday after today; "next friday" skips ahead if that is under a week away.
function nextWeekday(from, idx, next) {
  const today = startOfDay(from)
  let d = addDays(today, 1)
  while (d.getDay() !== idx) d = addDays(d, 1)
  if (next && d - today < 7 * 864e5) d = addDays(d, 7)
  return d
}

const DAYQ = '(?:\\s*\\/\\s*d(?:ay)?\\b|\\s+(?:a|an|per|each|every)\\s+day\\b|\\s*daily\\b|\\s+everyday\\b)'

export function parsePlanPrompt(input, { now = new Date() } = {}) {
  const fields = {}
  const lines = String(input || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { fields, found: [] }
  const st = { s: lines[0] }

  // ---- topics: the lines underneath, or the list after "subjects:" / a colon ----
  let topicsRaw = null
  if (lines.length > 1) {
    topicsRaw = lines.slice(1).filter((l, i) => !(i === 0 && /^(?:subjects?|topics?|chapters?|syllabus|modules?|units?)\s*:?$/i.test(l))).join('\n')
    topicsRaw = topicsRaw.replace(/^(?:subjects?|topics?|chapters?|syllabus|modules?|units?)\s*:\s*/i, '')
  } else {
    const m = take(st, /\b(?:subjects?|topics?|chapters?|syllabus|covering|cover|including|includes?|modules?|units?)\b\s*(?:[:\-–]\s*)?(.+)$/i)
      || take(st, /(?<!\d)\s*:\s*(?!\d)(.+)$/)
    if (m) topicsRaw = m[1]
  }
  if (topicsRaw) {
    // Split on commas, semicolons or lines only: "science and technology" is one subject.
    let list = parseTopics(topicsRaw)
    list = list.map((t) => t.replace(/[.;]+$/, '').trim()).filter(Boolean)
    if (list.length) fields.topicsText = list.join('\n')
  }

  // ---- revision and the free day before ----
  if (take(st, /\b(?:no|without|skip)\s+revision\b/i)) fields.revision = false
  else if (take(st, /\b(?:with|plus|including?)\s+revision\b/i)) fields.revision = true
  if (take(st, /\b(?:no|without|skip)\s+(?:a\s+)?(?:rest|free|buffer)\s+day\b/i)) fields.restDayBefore = false

  // ---- which days of the week ----
  let days = null
  let m
  if ((m = take(st, new RegExp(`\\b(\\d)\\s+days?\\s*(?:a|per|each|\\/)\\s*week\\b`, 'i')))) {
    days = { 7: [0, 1, 2, 3, 4, 5, 6], 6: [1, 2, 3, 4, 5, 6], 5: [1, 2, 3, 4, 5], 4: [1, 2, 3, 4], 3: [1, 3, 5], 2: [6, 0], 1: [0] }[Number(m[1])] || null
  } else if ((m = take(st, new RegExp(`\\b(${WD})\\.?\\s*(?:-|–|—|to|through|thru|till|until)\\s*(${WD})\\b`, 'i')))) {
    days = weekdayRange(dow(m[1]), dow(m[2]))
  } else if (take(st, /\bweek-?days?\b/i)) days = [1, 2, 3, 4, 5]
  else if (take(st, /\bweek-?ends?\b/i)) days = [6, 0]
  else if (take(st, /\b(?:every\s*day|everyday|all\s+days|7\s+days)\b/i)) days = [0, 1, 2, 3, 4, 5, 6]
  const except = take(st, new RegExp(`\\b(?:except(?:\\s+on)?|excluding|but\\s+not|not\\s+on|skip(?:ping)?|no|off\\s+on|without)\\s+((?:(?:${WD})s?\\s*(?:,|and|&|\\/)?\\s*)+)`, 'i'))
  if (except) {
    const out = new Set(listWeekdays(except[1]))
    days = (days || [0, 1, 2, 3, 4, 5, 6]).filter((d) => !out.has(d))
  }
  // "daily" / "every day" with no other day words means all seven.
  if (!days && /\bdaily\b/i.test(st.s) && !new RegExp(DAYQ, 'i').test(st.s.replace(/\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/gi, ''))) days = [0, 1, 2, 3, 4, 5, 6]
  if (days && days.length) fields.days = [...days].sort((a, b) => ((a || 7) - (b || 7)))

  // ---- time per day ----
  let minutes = null
  if ((m = take(st, new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:h|hr|hrs|hours?)\\b(?:\\s*(?:and\\s*)?(\\d{1,2})\\s*(?:m|mins?|minutes?)\\b)?${DAYQ}`, 'i')))) {
    minutes = Math.round(Number(m[1]) * 60 + (Number(m[2]) || 0))
  } else if ((m = take(st, new RegExp(`(\\d{1,3})\\s*(?:m|mins?|minutes?)\\b${DAYQ}`, 'i')))) {
    minutes = Number(m[1])
  } else if ((m = take(st, /\b(half an hour|half hour|an hour|one hour)\b(?:\s*(?:a|per|each|every)\s*day|\s*daily)?/i))) {
    minutes = /half/i.test(m[1]) ? 30 : 60
  } else if ((m = take(st, /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(?:and\s*)?(\d{1,2})\s*(?:m|mins?|minutes?)\b)?/i))) {
    minutes = Math.round(Number(m[1]) * 60 + (Number(m[2]) || 0))
  }
  if (minutes) fields.minutes = Math.min(720, Math.max(15, minutes))

  // ---- start time ----
  const notDate = `(?!\\s*(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH}\\b)`
  if ((m = take(st, new RegExp(`(?:\\bat|@)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)${notDate}`, 'i')))
    || (m = take(st, new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b`, 'i')))
    || (m = take(st, new RegExp(`(?:\\bat|@)\\s*(\\d{1,2}):(\\d{2})()${notDate}`, 'i')))
    || (m = take(st, new RegExp(`(?:\\bat|@)\\s*(1[3-9]|2[0-3])()()${notDate}\\b`, 'i')))) {
    let h = Number(m[1])
    const min = Number(m[2]) || 0
    const ap = (m[3] || '').toLowerCase()
    if (ap.startsWith('p') && h < 12) h += 12
    if (ap.startsWith('a') && h === 12) h = 0
    if (h <= 23 && min <= 59) fields.startTime = hhmm(h, min)
  } else if (take(st, /\b(?:in the |every )?morning\b/i)) fields.startTime = '07:00'
  else if (take(st, /\b(?:in the |every )?afternoon\b/i)) fields.startTime = '14:00'
  else if (take(st, /\b(?:in the |every )?evening\b/i)) fields.startTime = '18:00'
  else if (take(st, /\b(?:at |every )?night\b/i)) fields.startTime = '20:00'

  // ---- the deadline: a date, a weekday, or "N days / weeks / months" from now ----
  const lead = '(?:\\b(?:on|by|before|until|till|due(?:\\s+on)?|deadline(?:\\s+is)?|ending(?:\\s+on)?)\\s+)?'
  let deadline = null
  if ((m = take(st, new RegExp(`\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`)))) {
    deadline = makeDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), now)
  } else if ((m = take(st, new RegExp(`${lead}(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTH})\\b(?:\\.?,?\\s*(\\d{4}))?`, 'i')))) {
    deadline = makeDate(m[3] ? Number(m[3]) : null, monthOf(m[2]), Number(m[1]), now)
  } else if ((m = take(st, new RegExp(`${lead}(${MONTH})\\b\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`, 'i')))) {
    deadline = makeDate(m[3] ? Number(m[3]) : null, monthOf(m[1]), Number(m[2]), now)
  } else if ((m = take(st, /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/))) {
    deadline = makeDate(m[3] ? Number(m[3]) : null, Number(m[2]) - 1, Number(m[1]), now)
  } else if ((m = take(st, /\b(\d{1,3})[\s-]*(day|week|month)s?\b/i))) {
    const n = Number(m[1])
    const unit = m[2].toLowerCase()
    const today = startOfDay(now)
    deadline = unit === 'month' ? addMonths(today, n) : addDays(today, unit === 'week' ? n * 7 : n)
  } else if (take(st, /\btomorrow\b/i)) {
    deadline = addDays(startOfDay(now), 1)
  } else if ((m = take(st, /\bnext\s+(week|month|year)\b/i))) {
    const today = startOfDay(now)
    deadline = m[1].toLowerCase() === 'week' ? addDays(today, 7) : m[1].toLowerCase() === 'month' ? addMonths(today, 1) : addMonths(today, 12)
  } else if ((m = take(st, /\bend\s+of\s+(?:the\s+|this\s+)?(month|year)\b/i))) {
    deadline = m[1].toLowerCase() === 'month' ? startOfDay(endOfMonth(now)) : startOfDay(endOfYear(now))
  } else if ((m = take(st, new RegExp(`\\b(?:on|by|before|until|till|this|coming|next)\\s+(${WD})\\b`, 'i')))) {
    deadline = nextWeekday(now, dow(m[1]), /next/i.test(m[0]))
  }
  if (deadline) fields.deadline = key(deadline)

  // ---- the name: what is left, minus the filler ----
  let name = st.s
    .replace(/[,;]+/g, ' ')
    .replace(/\b(?:to-?do|todo)\s+list\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const lead1 = /^(?:please\s+|pls\s+)?(?:(?:can|could|would)\s+you\s+)?(?:i\s+(?:want|need|would like)\s+(?:to\s+)?|help\s+me\s+(?:to\s+)?|let'?s\s+)?(?:make|create|build|generate|give|prepare|plan|write|set\s*up|schedule|organi[sz]e|draw\s+up)\s+(?:me\s+)?(?:an?\s+|the\s+|my\s+)?/i
  for (let i = 0; i < 3 && lead1.test(name); i += 1) name = name.replace(lead1, '')
  name = name
    .replace(/\b(?:study\s+)?(?:plan|planner|schedule|timetable|routine|roadmap|checklist|tasks?)\b/gi, ' ')
    .replace(/\b(?:i have|i've got|there is|there's|we have|which is|that is)\b/gi, ' ')
    .replace(/\b(?:in|within|for|over|of|by|on|before|until|till|at|to|with|and|from|after|the|a|an|my|me|is|are)\b(?=\s*$)/gi, ' ')
    .replace(/^(?:\s*(?:for|to|of|about|on|a|an|the|my|me|is|are|in|with)\b)+/i, ' ')
    .replace(/[-–—:.,;]+\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  name = name.replace(/\b(?:in|within|for|over|of|by|on|before|until|till|at|to|with|and|from|after)\s*$/i, '').trim()
  if (name) {
    // Capitalise a plain lowercase first word ("learn React" → "Learn React"); leave "iPhone" alone.
    if (/^[a-z]+(\s|$)/.test(name)) name = name[0].toUpperCase() + name.slice(1)
    fields.name = name.slice(0, 60)
  }

  return { fields, found: Object.keys(fields) }
}
