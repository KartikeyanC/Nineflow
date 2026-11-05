import React, { useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { format } from '../../lib/dateFormat'
import { Plus, Download } from 'lucide-react'
import { usePlanner } from '../../store/PlannerContext'
import { useWork } from '../WorkContext'
import { AREAS, PRIORITIES, TASK_STATUSES } from '../workStore'
import { taskDerived, h1, key } from '../workCalc'
import { Section, Table, Th, Td, TextIn, NumIn, SelectIn, DateIn, RowTools, Legend, Pill, DELIVERY_TONE } from '../ui'
import { cx } from '../../components/ui'

export function toCsv(rows, cols) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))].join('\n')
}
export function download(name, text) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name })
  a.click()
}

export default function TaskLog() {
  const { work, updateRow, removeRow, addTask, addFromPlanner } = useWork()
  const { tasks: plannerTasks } = usePlanner()
  // Planner tasks from the last two weeks and the next one, for linking.
  const linkable = useMemo(() => {
    const from = key(new Date(Date.now() - 14 * 864e5)), to = key(new Date(Date.now() + 7 * 864e5))
    return plannerTasks.filter((t) => t.date && t.date >= from && t.date <= to).sort((a, b) => b.date.localeCompare(a.date))
  }, [plannerTasks])
  const linkedIds = new Set(work.tasks.map((t) => t.plannerTaskId).filter(Boolean))
  const label = (p) => `${p.title} · ${format(parseISO(p.date), 'EEE d MMM')}`
  const [filter, setFilter] = useState('open')
  const today = new Date()
  const typesFor = (area) => work.standardTimes.filter((s) => s.area === area).map((s) => s.taskType)
  const stdHours = (area, type) => work.standardTimes.find((s) => s.area === area && s.taskType === type)?.hours ?? 0

  const set = (t, p) => {
    const next = { ...t, ...p }
    if ('area' in p && !typesFor(next.area).includes(next.taskType)) next.taskType = ''
    if ('taskType' in p || 'area' in p) {
      next.standardHours = stdHours(next.area, next.taskType)
      if (!t.plannedHours || t.plannedHours === t.standardHours) next.plannedHours = next.standardHours
    }
    if (p.status === 'Done' && !next.completedDate) next.completedDate = key(today)
    if (p.status && p.status !== 'Done') next.completedDate = null
    updateRow('tasks', t.id, next)
  }

  const rows = work.tasks.filter((t) => filter === 'all' || t.example || (filter === 'open' ? t.status !== 'Done' : t.status === 'Done'))
  const cols = [
    ['ID', (t) => t.id], ['Request date', (t) => t.requestDate], ['Work area', (t) => t.area], ['Task type', (t) => t.taskType], ['Task', (t) => t.task], ['Project', (t) => t.project],
    ['Requested by', (t) => t.requestedBy], ['Priority', (t) => t.priority], ['Due date', (t) => t.dueDate], ['Standard hours', (t) => t.standardHours], ['Planned hours', (t) => t.plannedHours],
    ['Work date', (t) => t.workDate], ['Actual hours', (t) => t.actualHours], ['Status', (t) => t.status], ['Revision rounds', (t) => t.revisions], ['Completed date', (t) => t.completedDate],
    ['Hours variance', (t) => taskDerived(t).variance], ['Delivery result', (t) => taskDerived(t).delivery], ['Days late', (t) => taskDerived(t).daysLate],
  ].map(([label, get]) => ({ label, get }))

  return (
    <Section title="Task log" hint="One line per task. Standard hours fill in from the task type; planned hours start equal to standard and you can change them. Link a row to a planner task and its actual hours come from your focus sessions."
      right={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-page p-0.5 gap-0.5">
            {[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFilter(v)} className={cx('rounded-full px-3 py-1 text-xs font-semibold transition', filter === v ? 'bg-brand text-white' : 'text-muted hover:text-ink')}>{l}</button>
            ))}
          </div>
          <button type="button" className="btn-ghost h-9 py-0" onClick={() => download('task-log.csv', toCsv(work.tasks.filter((t) => !t.example), cols))}><Download size={14} /> CSV</button>
          <select className="input w-auto h-9 py-0" value="" aria-label="Add a row from a planner task"
            onChange={(e) => { const p = plannerTasks.find((t) => t.id === e.target.value); if (p) addFromPlanner(p) }}>
            <option value="">Add from planner…</option>
            {linkable.filter((p) => !linkedIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
          </select>
          <button type="button" className="btn-black h-9 py-0" onClick={addTask}><Plus size={14} /> New task</button>
        </div>
      }>
      <div className="mb-3"><Legend /></div>
      <Table minWidth={2620}>
        <thead><tr>
          <Th calc>ID</Th><Th fill>Request date</Th><Th fill>Work area</Th><Th fill>Task type</Th><Th fill>Task</Th><Th fill>Planner task</Th><Th fill>Project / product</Th><Th fill>Requested by</Th><Th fill>Priority</Th><Th fill>Due date</Th>
          <Th calc>Standard h</Th><Th fill>Planned h</Th><Th fill>Work date</Th><Th fill>Actual h</Th><Th fill>Status</Th><Th fill>Revisions</Th><Th fill>Completed</Th>
          <Th calc>Variance</Th><Th calc>Delivery</Th><Th calc>Days late</Th><Th />
        </tr></thead>
        <tbody>
          {rows.map((t) => {
            const d = taskDerived(t, today)
            return (
              <tr key={t.id} className={cx('hover:bg-page/60', t.example && 'bg-butter/20')}>
                <Td calc className="font-semibold text-ink">{t.id}</Td>
                <Td><DateIn value={t.requestDate} onChange={(v) => set(t, { requestDate: v })} /></Td>
                <Td><SelectIn value={t.area} options={AREAS} onChange={(v) => set(t, { area: v })} /></Td>
                <Td><SelectIn value={t.taskType} options={typesFor(t.area)} allowEmpty className="w-44" onChange={(v) => set(t, { taskType: v })} /></Td>
                <Td><TextIn value={t.task} className="w-52" placeholder="What exactly" onChange={(v) => set(t, { task: v })} /></Td>
                <Td>
                  <select className="rounded-lg border border-line bg-card px-2 py-1 text-sm w-48" value={t.plannerTaskId || ''} aria-label="Linked planner task"
                    onChange={(e) => set(t, { plannerTaskId: e.target.value || null })}>
                    <option value="">Not linked</option>
                    {t.plannerTaskId && !linkable.some((p) => p.id === t.plannerTaskId) && (
                      <option value={t.plannerTaskId}>{plannerTasks.find((p) => p.id === t.plannerTaskId)?.title || 'Removed from planner'}</option>
                    )}
                    {linkable.filter((p) => p.id === t.plannerTaskId || !linkedIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
                  </select>
                </Td>
                <Td><TextIn value={t.project} className="w-36" onChange={(v) => set(t, { project: v })} /></Td>
                <Td><TextIn value={t.requestedBy} className="w-32" onChange={(v) => set(t, { requestedBy: v })} /></Td>
                <Td><SelectIn value={t.priority} options={PRIORITIES} className="w-24" onChange={(v) => set(t, { priority: v })} /></Td>
                <Td><DateIn value={t.dueDate} onChange={(v) => set(t, { dueDate: v })} /></Td>
                <Td calc className="text-right">{h1(t.standardHours || 0)}</Td>
                <Td><NumIn value={t.plannedHours} onChange={(v) => set(t, { plannedHours: v })} /></Td>
                <Td><DateIn value={t.workDate} onChange={(v) => set(t, { workDate: v })} /></Td>
                <Td>{t.linked
                  ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums" title="From the planner's focus sessions">{h1(t.actualHours)} <span className="pill bg-sky text-sky-fg py-0 text-[10px]">planner</span></span>
                  : <NumIn value={t.actualHours} onChange={(v) => set(t, { actualHours: v })} />}</Td>
                <Td><SelectIn value={t.status} options={TASK_STATUSES} className="w-32" onChange={(v) => set(t, { status: v })} /></Td>
                <Td><NumIn value={t.revisions} step={1} className="w-16" onChange={(v) => set(t, { revisions: v })} /></Td>
                <Td><DateIn value={t.completedDate} onChange={(v) => set(t, { completedDate: v })} /></Td>
                <Td calc className={cx('text-right font-semibold', d.variance > 0 ? 'text-coral-fg' : d.variance < 0 ? 'text-mint-fg' : '')}>{d.variance > 0 ? '+' : ''}{h1(d.variance)}</Td>
                <Td calc><Pill tone={DELIVERY_TONE[d.delivery]}>{d.delivery}</Pill></Td>
                <Td calc className={cx('text-right', d.daysLate > 0 && 'text-coral-fg font-semibold')}>{d.daysLate || '—'}</Td>
                <Td><RowTools example={t.example} onDelete={() => removeRow('tasks', t.id)} /></Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Section>
  )
}
