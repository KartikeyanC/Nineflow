// Custom fields: your own columns on tasks. Settings keep the definitions, each task its values:
//   settings.fields = [{ id, name, type, options }]   type: text | number | date | select | check
//   task.fields     = { [field id]: value }           only fields that have a value
// Up to MAX_FIELDS. A value that doesn't fit its field (a removed option, a wrong type) is dropped
// when read, so a deleted or changed field never breaks a task. No imports: Node tests load it.
export const MAX_FIELDS = 10
export const MAX_OPTIONS = 20
export const FIELD_TYPES = [
  { id: 'text', label: 'Text' }, { id: 'number', label: 'Number' }, { id: 'date', label: 'Date' },
  { id: 'select', label: 'Dropdown' }, { id: 'check', label: 'Tick box' },
]
const TYPE_IDS = FIELD_TYPES.map((t) => t.id)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function cleanFields(list) {
  const seen = new Set()
  return (Array.isArray(list) ? list : []).filter((f) => f && typeof f.id === 'string' && f.id && !seen.has(f.id) && seen.add(f.id)).slice(0, MAX_FIELDS).map((f) => ({
    id: f.id.slice(0, 40),
    name: str(f.name, 40) || 'Field',
    type: TYPE_IDS.includes(f.type) ? f.type : 'text',
    options: f.type === 'select' ? [...new Set((Array.isArray(f.options) ? f.options : []).map((o) => str(o, 40)).filter(Boolean))].slice(0, MAX_OPTIONS) : [],
  }))
}

// One value cleaned for its field; undefined means "no value".
export function cleanValue(field, v) {
  if (v == null || v === '') return undefined
  switch (field.type) {
    case 'number': { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined }
    case 'date': return typeof v === 'string' && DATE.test(v) ? v : undefined
    case 'select': return field.options.includes(v) ? v : undefined
    case 'check': return v === true ? true : undefined
    default: return str(String(v), 200) || undefined
  }
}

// A task's values, kept only for fields that exist and only when they fit.
export function cleanTaskFields(values, fields) {
  const out = {}
  if (!values || typeof values !== 'object') return out
  for (const f of fields) { const v = cleanValue(f, values[f.id]); if (v !== undefined) out[f.id] = v }
  return out
}

// Setting one value on a task's fields (undefined / '' clears it).
export function withValue(values, field, v) {
  const next = { ...(values || {}) }
  const c = cleanValue(field, v)
  if (c === undefined) delete next[field.id]; else next[field.id] = c
  return next
}

// For sorting: empty values last, numbers as numbers, dropdowns in the order of their options.
const LAST = String.fromCharCode(0xffff) // sorts after any text
export const sortKeyOf = (field, v) => {
  if (v === undefined) return field.type === 'number' || field.type === 'select' ? Infinity : LAST
  if (field.type === 'select') return field.options.indexOf(v)
  return field.type === 'check' ? 0 : field.type === 'number' ? v : String(v).toLowerCase()
}

export const newFieldId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
