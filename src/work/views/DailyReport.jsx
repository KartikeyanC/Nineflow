import React, { useMemo, useState } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { Copy, Check } from 'lucide-react'
import { useWork } from '../WorkContext'
import { real, taskDerived, key, h1, isWorkingDay, timePlan } from '../workCalc'
import { Section, Pill, DELIVERY_TONE } from '../ui'
import { DateField } from '../../components/DatePicker'
import { currentProfile } from '../../lib/profiles'

export default function DailyReport() {
  const { work, setDayNote } = useWork()
  const [k, setK] = useState(key(new Date()))
  const d = parseISO(k)
  const note = work.dayNotes[k] || {}
  const [copied, setCopied] = useState(false)
  const tasks = real(work.tasks)
  const worked = tasks.filter((t) => t.workDate === k)
  const done = tasks.filter((t) => t.status === 'Done' && t.completedDate === k)
  const hours = worked.reduce((s, t) => s + (Number(t.actualHours) || 0), 0)
  const posts = real(work.posts).filter((p) => p.date === k && p.status === 'Published')
  const overdue = tasks.filter((t) => t.status !== 'Done' && t.dueDate && t.dueDate < k)
  const next = addDays(d, 1)
  const nextPlan = timePlan(work.settings, next).filter((b) => b.focus).map((b) => b.area).filter(Boolean)
  const nextDue = tasks.filter((t) => t.dueDate === key(next) && t.status !== 'Done')

  const summary = `${worked.length} task${worked.length === 1 ? '' : 's'} worked on, ${done.length} completed, ${h1(hours)} h logged${posts.length ? `, ${posts.length} post${posts.length === 1 ? '' : 's'} published` : ''}${overdue.length ? `, ${overdue.length} overdue` : ''}.`
  const message = useMemo(() => [
    `Daily report – ${format(d, 'EEEE, d MMM yyyy')}`,
    '',
    note.target ? `Target: ${note.target}` : null,
    `Summary: ${summary}`,
    '',
    'Worked on:',
    ...(worked.length ? worked.map((t) => `• ${t.task || t.taskType} (${t.area}) – ${t.status}${t.actualHours ? `, ${h1(t.actualHours)} h` : ''}`) : ['• —']),
    done.length ? '' : null, done.length ? 'Completed:' : null,
    ...done.map((t) => `• ${t.task || t.taskType}${taskDerived(t).delivery === 'Late' ? ' (late)' : ''}`),
    posts.length ? '' : null, posts.length ? `Published: ${posts.map((p) => `${p.platform} ${p.postType}${p.topic ? ` – ${p.topic}` : ''}`).join('; ')}` : null,
    '',
    `Blockers: ${note.blockers || 'none'}`,
    `Tomorrow: ${note.tomorrow || (nextPlan.length ? `${nextPlan.join(' + ')}${nextDue.length ? `; due: ${nextDue.map((t) => t.task || t.taskType).join(', ')}` : ''}` : '—')}`,
    currentProfile()?.name ? '' : null, currentProfile()?.name ? `— ${currentProfile().name}` : null,
  ].filter((l) => l !== null).join('\n'), [d, note, summary, worked, done, posts, nextPlan, nextDue])

  const copy = async () => { try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ } }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateField value={k} onChange={(v) => v && setK(v)} allowClear={false} className="w-44" />
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => setK(key(new Date()))}>Today</button>
        <h1 className="h-display text-2xl">{format(d, 'EEEE, d MMM')}</h1>
        {!isWorkingDay(work.settings, d) && <Pill tone="bg-page text-muted">Day off</Pill>}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Section title="Today's tasks" hint={summary}>
            {worked.length === 0 ? <p className="text-sm text-faint">No task has this work date. Set the work date in the task log.</p> : (
              <ul className="space-y-1.5">{worked.map((t) => { const x = taskDerived(t); return (
                <li key={t.id} className="text-sm flex items-center gap-2"><span className="text-faint text-xs w-12">{t.id}</span><span className="font-semibold truncate">{t.task || t.taskType}</span><span className="text-faint text-xs">{t.area}</span><span className="ml-auto text-xs text-muted">{h1(t.actualHours || 0)} h</span><Pill tone={DELIVERY_TONE[x.delivery]}>{t.status === 'Done' ? x.delivery : t.status}</Pill></li>
              ) })}</ul>
            )}
          </Section>
          <Section title="Blockers">
            <textarea className="input min-h-[72px]" placeholder="What stopped or slowed you (waiting for content, approvals, access…)" value={note.blockers || ''} onChange={(e) => setDayNote(k, { blockers: e.target.value })} />
          </Section>
          <Section title="Tomorrow's plan" hint={nextPlan.length ? `From the weekly plan: ${nextPlan.join(' + ')}.` : undefined}>
            <textarea className="input min-h-[72px]" placeholder="Leave empty to use the weekly plan and tomorrow's due tasks." value={note.tomorrow || ''} onChange={(e) => setDayNote(k, { tomorrow: e.target.value })} />
          </Section>
        </div>
        <Section title="Message for your manager" hint="Ready to paste into chat or email." right={<button type="button" className="btn-black h-9 py-0" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>}>
          <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed rounded-2xl bg-page border border-line p-4">{message}</pre>
        </Section>
      </div>
    </div>
  )
}
