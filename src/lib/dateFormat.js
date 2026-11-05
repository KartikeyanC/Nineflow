// How dates and times read on screen: day order (4 Nov / Nov 4) and clock (12 h / 24 h).
// `format` is date-fns's format with the display patterns rewritten to the chosen order and clock.
// Storage patterns (yyyy-MM-dd, HH:mm in inputs) never match a rewrite, so data is never touched.
// The planner sets the choice from settings (dateOrder, clock) before it draws (PlannerContext).
import { format as dfFormat } from 'date-fns'

const locale = () => { try { return Intl.DateTimeFormat().resolvedOptions() } catch { return {} } }
// 'auto' follows the device: US English writes Nov 4, most others 4 Nov; the clock follows its 12/24 h.
const autoOrder = () => (/^en-US$/i.test(locale().locale || '') ? 'mdy' : 'dmy')
const autoClock = () => {
  try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === false ? '24' : '12' } catch { return '24' }
}

let prefs = { order: autoOrder(), clock: autoClock() }
const cache = new Map()

export function setDatePrefs(settings) {
  const order = settings?.dateOrder === 'mdy' || settings?.dateOrder === 'dmy' ? settings.dateOrder : autoOrder()
  const clock = settings?.clock === '12' || settings?.clock === '24' ? settings.clock : autoClock()
  if (order !== prefs.order || clock !== prefs.clock) { prefs = { order, clock }; cache.clear() }
}
export const datePrefs = () => prefs

const W = '(EEEE|EEE)', M = '(MMMM|MMM)'
const TO_DMY = [
  [new RegExp(`${W}, ${M} d, yyyy`, 'g'), '$1 d $2 yyyy'],
  [new RegExp(`${M} d, yyyy`, 'g'), 'd $1 yyyy'],
  [new RegExp(`${W}, ${M} d(?!o)`, 'g'), '$1 d $2'],
  [new RegExp(`${M} d(?!o)`, 'g'), 'd $1'],
]
const TO_MDY = [
  [new RegExp(`${W},? d ${M} yyyy`, 'g'), '$1, $2 d, yyyy'],
  [new RegExp(`\\bd ${M} yyyy`, 'g'), '$1 d, yyyy'],
  [new RegExp(`${W},? d ${M}`, 'g'), '$1, $2 d'],
  [new RegExp(`\\bd ${M}`, 'g'), '$1 d'],
]
const TO_24 = [[/h:mm a/g, 'HH:mm'], [/\bh a\b/g, 'HH:00'], [/^p$/, 'HH:mm']]
const TO_12 = [[/, HH:mm$/, ', h:mm a']]

export function displayPattern(pattern) {
  const key = `${prefs.order}${prefs.clock}${pattern}`
  let out = cache.get(key)
  if (out === undefined) {
    out = pattern
    for (const [re, to] of [...(prefs.order === 'dmy' ? TO_DMY : TO_MDY), ...(prefs.clock === '24' ? TO_24 : TO_12)]) out = out.replace(re, to)
    cache.set(key, out)
  }
  return out
}

export const format = (date, pattern, options) => dfFormat(date, displayPattern(pattern), options)

// A stored 'HH:mm' time as the clock reads it: 14:30 or 2:30pm.
export function clock(hhmm) {
  if (!hhmm || prefs.clock === '24') return hhmm || ''
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h)) return hhmm
  const hour = h % 12 || 12
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 && h < 24 ? 'pm' : 'am'}`
}
