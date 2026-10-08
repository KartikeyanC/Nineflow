// Natural-language quick add. Parses tokens out of a title like
//   "Call mom tomorrow 3pm 30m #personal !high every weekday"
// and returns the cleaned title plus the fields it found.
import { addDays, format, parse, isValid, setDay } from 'date-fns'
import { dateKey } from './tasks'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec'

const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

// Next occurrence of a weekday strictly after today ("next" = at least a week out).
function weekdayDate(now, idx, next = false) {
  let d = setDay(now, idx, { weekStartsOn: 0 })
  if (d <= now || dateKey(d) === dateKey(now)) d = addDays(d, 7)
  if (next && d - now < 7 * 864e5) d = addDays(d, 7)
  return d
}

export function parseQuickAdd(input, { categories = [], now = new Date() } = {}) {
  let text = ` ${input} `
  const out = { title: '', date: undefined, startTime: undefined, durationMinutes: undefined, priority: undefined, category: undefined, recurrence: undefined, tokens: [] }
  const take = (re, type, fn) => {
    const m = text.match(re)
    if (!m) return
    const v = fn(m)
    if (v === undefined) return
    out.tokens.push({ type, raw: m[0].trim() })
    text = text.replace(m[0], ' ')
  }

  // Recurrence first, so "every monday" sets both repeat and date.
  take(/\s(every\s+day|daily)\s/i, 'repeat', () => (out.recurrence = { freq: 'daily', until: null, skip: [] }))
  take(/\s(every\s+weekday|weekdays)\s/i, 'repeat', () => (out.recurrence = { freq: 'weekdays', until: null, skip: [] }))
  take(/\s(every\s+month|monthly)\s/i, 'repeat', () => (out.recurrence = { freq: 'monthly', until: null, skip: [] }))
  take(/\s(every\s+week|weekly)\s/i, 'repeat', () => (out.recurrence = { freq: 'weekly', until: null, skip: [] }))
  take(new RegExp(`\\severy\\s+(${WEEKDAYS.join('|')})s?\\s`, 'i'), 'repeat', (m) => {
    out.recurrence = { freq: 'weekly', until: null, skip: [] }
    const idx = WEEKDAYS.indexOf(m[1].toLowerCase())
    out.date = dateKey(idx === now.getDay() ? now : weekdayDate(now, idx))
    return true
  })

  // Priority: !high / !h / !1 / p1
  take(/\s(?:!|p)(high|h|1|medium|med|m|2|low|l|3)\s/i, 'priority', (m) => {
    const v = m[1].toLowerCase()
    out.priority = ['high', 'h', '1'].includes(v) ? 'high' : ['low', 'l', '3'].includes(v) ? 'low' : 'medium'
    return true
  })

  // Category: #name (prefix match on category names)
  take(/\s#([\w-]+)\s/i, 'category', (m) => {
    const q = m[1].toLowerCase()
    const cat = categories.find((c) => c.name.toLowerCase() === q) || categories.find((c) => c.name.toLowerCase().startsWith(q))
    if (!cat) return undefined
    out.category = cat.id
    return true
  })

  // Duration: 30m, 45 min, 1h, 1.5h, 1h30m, for 2 hours
  take(/\s(?:for\s+)?(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*m(?:in(?:ute)?s?)?\s/i, 'duration', (m) => (out.durationMinutes = Number(m[1]) * 60 + Number(m[2])))
  if (out.durationMinutes === undefined) take(/\s(?:for\s+)?(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s/i, 'duration', (m) => (out.durationMinutes = Math.round(Number(m[1]) * 60)))
  if (out.durationMinutes === undefined) take(/\s(?:for\s+)?(\d+)\s*m(?:in(?:ute)?s?)?\s/i, 'duration', (m) => (out.durationMinutes = Number(m[1])))

  // Time: at 3pm, @3:30pm, 15:00, noon
  take(/\s(?:at\s+|@\s*)?noon\s/i, 'time', () => (out.startTime = '12:00'))
  if (out.startTime === undefined) take(/\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s/i, 'time', (m) => {
    let h = Number(m[1]) % 12
    if (m[3].toLowerCase() === 'pm') h += 12
    out.startTime = hhmm(h, Number(m[2] || 0))
    return true
  })
  if (out.startTime === undefined) take(/\s(?:at\s+|@\s*)([01]?\d|2[0-3]):([0-5]\d)\s/i, 'time', (m) => (out.startTime = hhmm(Number(m[1]), Number(m[2]))))
  if (out.startTime === undefined) take(/\s([01]?\d|2[0-3]):([0-5]\d)\s/, 'time', (m) => (out.startTime = hhmm(Number(m[1]), Number(m[2]))))

  // Date: today, tomorrow, day after tomorrow, in N days, next week, (next) weekday, oct 12 / 12 oct, ISO
  if (out.date === undefined) {
    take(/\s(day\s+after\s+tomorrow)\s/i, 'date', () => (out.date = dateKey(addDays(now, 2))))
    if (out.date === undefined) take(/\s(tomorrow|tmr|tmrw)\s/i, 'date', () => (out.date = dateKey(addDays(now, 1))))
    if (out.date === undefined) take(/\s(today|tonight)\s/i, 'date', () => (out.date = dateKey(now)))
    if (out.date === undefined) take(/\sin\s+(\d+)\s+days?\s/i, 'date', (m) => (out.date = dateKey(addDays(now, Number(m[1])))))
    if (out.date === undefined) take(/\snext\s+week\s/i, 'date', () => (out.date = dateKey(addDays(now, 7))))
    if (out.date === undefined) take(new RegExp(`\\s(next\\s+)?(${WEEKDAYS.join('|')}|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\s`, 'i'), 'date', (m) => {
      const idx = WEEKDAYS.findIndex((w) => w.startsWith(m[2].toLowerCase().slice(0, 3)))
      out.date = dateKey(weekdayDate(now, idx, !!m[1]))
      return true
    })
    if (out.date === undefined) take(/\s(\d{4}-\d{2}-\d{2})\s/, 'date', (m) => (out.date = m[1]))
    if (out.date === undefined) take(new RegExp(`\\s(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s`, 'i'), 'date', (m) => {
      const d = parse(`${m[1].slice(0, 3)} ${m[2]} ${now.getFullYear()}`, 'MMM d yyyy', now)
      if (!isValid(d)) return undefined
      out.date = dateKey(d < addDays(now, -30) ? addDays(d, 365) : d)
      return true
    })
    if (out.date === undefined) take(new RegExp(`\\s(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\s`, 'i'), 'date', (m) => {
      const d = parse(`${m[2].slice(0, 3)} ${m[1]} ${now.getFullYear()}`, 'MMM d yyyy', now)
      if (!isValid(d)) return undefined
      out.date = dateKey(d < addDays(now, -30) ? addDays(d, 365) : d)
      return true
    })
  }

  out.title = text.replace(/\s+/g, ' ').trim()
  return out
}

export const TOKEN_LABEL = { date: 'Date', time: 'Time', duration: 'Estimate', priority: 'Priority', category: 'Category', repeat: 'Repeat' }
export const fmtDateToken = (key, now = new Date()) => (key === dateKey(now) ? 'Today' : key === dateKey(addDays(now, 1)) ? 'Tomorrow' : format(parse(key, 'yyyy-MM-dd', now), 'EEE, MMM d'))
