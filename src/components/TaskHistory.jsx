import React, { useState } from 'react'
import { parseISO } from 'date-fns'
import { History } from 'lucide-react'
import { format } from '../lib/dateFormat'
import { usePlanner } from '../store/PlannerContext'
import { PRIORITY_LABEL, STATUS_LABEL, fmtMinutes } from '../lib/tasks'
import { FREQ_LABEL } from '../lib/recurrence'
import { cleanColumns } from '../lib/columns'

// The task's change history (lib/taskHistory.js), newest first: what changed, from what, to what, when.

const LABEL = {
  title: 'Title', description: 'Description', status: 'Status', column: 'Board column', date: 'Date', dueDate: 'End day',
  startTime: 'Start time', durationMinutes: 'Estimate', priority: 'Priority', category: 'Category', recurrence: 'Repeat',
  tags: 'Tags', client: 'Client', billable: 'Billable', reminders: 'Reminders', steps: 'Checklist', files: 'Files',
  hold: 'Paused', dropped: 'Dropped', fields: 'Custom fields',
}

const day = (v) => format(parseISO(v), 'EEE, d MMM yyyy')

export function useHistoryText() {
  const { settings } = usePlanner()
  const cols = cleanColumns(settings.columns)
  const fields = settings.fields || []
  return (field, v) => {
    if (v === null || v === undefined || v === '') {
      return { date: 'No date (Someday)', dueDate: 'No end day', startTime: 'No time', recurrence: 'Does not repeat', hold: 'Not paused', dropped: 'Not dropped',
        reminders: 'Settings default', steps: 'No steps', files: 'None', tags: 'None', client: 'None', fields: 'None', description: 'Empty' }[field] || 'None'
    }
    switch (field) {
      case 'date': case 'dueDate': return day(v)
      case 'status': return STATUS_LABEL[v] || v
      case 'column': return cols.find((c) => c.id === v)?.name || v
      case 'priority': return PRIORITY_LABEL[v] || v
      case 'category': return settings.categories.find((c) => c.id === v)?.name || v
      case 'durationMinutes': return fmtMinutes(v)
      case 'billable': return v ? 'Yes' : 'No'
      case 'recurrence': { const [freq, until] = String(v).split('|'); return `${FREQ_LABEL[freq] || freq}${until ? ` until ${day(until)}` : ''}` }
      case 'reminders': return v === 'none' ? 'None' : String(v).split(',').map((m) => (Number(m) >= 1440 ? `${Number(m) / 1440} d` : Number(m) >= 60 ? `${Number(m) / 60} h` : `${m} min`)).join(', ') + ' before'
      case 'steps': { const [d, n] = String(v).split('/'); return `${d} of ${n} done` }
      case 'files': return `${v} ${v === 1 ? 'file' : 'files'}`
      case 'fields': {
        try { return JSON.parse(v).map(([id, val]) => `${fields.find((f) => f.id === id)?.name || 'Field'}: ${val === true ? 'Yes' : val}`).join(' · ') } catch { return String(v) }
      }
      case 'title': case 'description': case 'hold': case 'dropped': return `“${v}”`
      default: return String(v)
    }
  }
}

export default function TaskHistory({ task }) {
  const text = useHistoryText()
  const [all, setAll] = useState(false)
  const list = [...(task.history || [])].reverse()
  const shown = all ? list : list.slice(0, 8)
  return (
    <section className="mt-4 rounded-2xl bg-page border border-line p-4" aria-label="Change history">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-faint flex items-center gap-1.5"><History size={13} /> History</h3>
      {list.length === 0 ? (
        <p className="mt-2 text-xs text-faint">No changes yet. Every change to this task (end day, date, time, status and the rest) is noted here.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {shown.map((e, i) => (
            <li key={`${e.at}-${e.field}-${i}`} className="text-xs leading-relaxed">
              <span className="text-faint tnum">{format(new Date(e.at), 'd MMM yyyy, HH:mm')}</span>
              <span className="block">
                <span className="font-semibold text-ink">{LABEL[e.field] || e.field}</span>{' '}
                <span className="text-muted line-through decoration-faint/60">{text(e.field, e.from)}</span>
                <span className="text-faint" aria-label="changed to"> → </span>
                <span className="font-semibold text-ink">{text(e.field, e.to)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {list.length > 8 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-xs font-semibold text-lav-fg hover:underline">
          {all ? 'Show fewer' : `Show all ${list.length} changes`}
        </button>
      )}
    </section>
  )
}
