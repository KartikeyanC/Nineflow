import React, { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useWork } from '../WorkContext'
import { usePlanner } from '../../store/PlannerContext'
import { DAY_NAMES } from '../workStore'
import { timePlan, isWorkingDay, weekStrip, real, taskDerived, campaignDerived, key, h1 } from '../workCalc'
import { Section, Pill, DELIVERY_TONE } from '../ui'
import { DateField } from '../../components/DatePicker'
import { cx } from '../../components/ui'

export default function DateView() {
  const { work, setDayNote } = useWork()
  const [k, setK] = useState(key(new Date()))
  const d = parseISO(k)
  const s = work.settings
  const working = isWorkingDay(s, d)
  const plan = timePlan(s, d)
  const tasks = real(work.tasks)
  const workedOn = tasks.filter((t) => t.workDate === k)
  const due = tasks.filter((t) => t.dueDate === k)
  const posts = real(work.posts).filter((p) => p.date === k)
  const camps = real(work.campaigns).filter((c) => c.startDate <= k && (!c.endDate || c.endDate >= k) && c.status !== 'Planned')
  const note = work.dayNotes[k] || {}
  const suggestion = [...due].sort((a, b) => ['High', 'Medium', 'Low'].indexOf(a.priority) - ['High', 'Medium', 'Low'].indexOf(b.priority))[0]
  const { settings: { weekStart } } = usePlanner()
  const strip = weekStrip(work, d, weekStart)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateField value={k} onChange={(v) => v && setK(v)} allowClear={false} className="w-44" />
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => setK(key(new Date()))}>Today</button>
        <h1 className="h-display text-2xl ml-2">{DAY_NAMES[d.getDay()]}, {format(d, 'd MMM yyyy')}</h1>
        <Pill tone={working ? 'bg-mint text-mint-fg' : 'bg-page text-muted'}>{working ? 'Working day' : 'Day off'}</Pill>
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-2">
        {strip.map((w) => (
          <button key={w.key} type="button" onClick={() => setK(w.key)}
            className={cx('rounded-2xl p-2 text-left border transition', w.key === k ? 'bg-ink text-page border-ink' : w.working ? 'card hover:-translate-y-0.5' : 'bg-page border-dashed border-line text-faint')}>
            <p className="text-[10px] font-bold uppercase">{format(w.date, 'EEE')}</p>
            <p className="h-display text-lg leading-tight">{format(w.date, 'd')}</p>
            <p className={cx('text-[10px] mt-1', w.key === k ? 'text-page/70' : 'text-muted')}>{w.due ? `${w.due} due · ` : ''}{w.worked ? `${h1(w.hours)} h` : w.working ? '—' : 'off'}{w.posts ? ` · ${w.posts} post${w.posts > 1 ? 's' : ''}` : ''}</p>
          </button>
        ))}
      </div>

      <Section title="Main target" hint="One sentence: what must be true by the end of this day.">
        <input className="input" placeholder={suggestion ? `Suggestion: finish “${suggestion.task}” (${suggestion.priority}, due today)` : 'e.g. Deliver the landing page design for review'}
          value={note.target || ''} onChange={(e) => setDayNote(k, { target: e.target.value })} />
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Time plan" hint={working ? undefined : 'Day off — shown for reference only.'}>
          <ul className="divide-y divide-line">
            {plan.map((b) => (
              <li key={b.id} className={cx('flex items-start gap-3 py-2', b.lunch && 'opacity-60')}>
                <span className="w-24 shrink-0 text-xs font-bold tabular-nums">{b.start}–{b.end}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{b.name} <span className="text-faint font-medium">· {b.minutes} min</span>{b.area && <span className="ml-2 pill bg-lav text-lav-fg py-0 text-[10px]">{b.area}</span>}</p>
                  {b.what && <p className="text-xs text-muted">{b.what}</p>}
                  {b.output && <p className="text-[11px] text-mint-fg">→ {b.output}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="space-y-4">
          <Section title={`Tasks worked on · ${workedOn.length}`}>
            <TaskList rows={workedOn} empty="Nothing logged for this date yet." />
          </Section>
          <Section title={`Tasks due · ${due.length}`}>
            <TaskList rows={due} empty="Nothing due." />
          </Section>
          <Section title={`Social media posts · ${posts.length}`}>
            {posts.length === 0 ? <p className="text-sm text-faint">No posts planned.</p> : (
              <ul className="space-y-1.5">{posts.map((p) => (
                <li key={p.id} className="text-sm flex items-center gap-2"><span className="pill bg-sky text-sky-fg py-0 text-[10px]">{p.platform}</span><span className="font-semibold">{p.topic || p.postType}</span><span className="text-faint text-xs">{p.postType} · {p.status}{p.captionReady && p.creativeReady ? ' · ready' : ''}</span></li>
              ))}</ul>
            )}
          </Section>
          <Section title={`Active ad campaigns · ${camps.length}`}>
            {camps.length === 0 ? <p className="text-sm text-faint">No campaigns running.</p> : (
              <ul className="space-y-1.5">{camps.map((c) => { const x = campaignDerived(c, d); return (
                <li key={c.id} className="text-sm flex items-center gap-2"><span className="pill bg-peach text-peach-fg py-0 text-[10px]">{c.platform}</span><span className="font-semibold">{c.campaign}</span><span className="text-faint text-xs">{x.budgetUsedPct ?? 0}% of budget · {x.daysLeft != null ? `${Math.max(0, x.daysLeft)} days left` : ''}</span></li>
              ) })}</ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function TaskList({ rows, empty }) {
  if (rows.length === 0) return <p className="text-sm text-faint">{empty}</p>
  return (
    <ul className="space-y-1.5">
      {rows.map((t) => { const d = taskDerived(t); return (
        <li key={t.id} className="text-sm flex items-center gap-2">
          <span className="text-faint text-xs w-12">{t.id}</span>
          <span className="font-semibold truncate">{t.task || t.taskType || 'Untitled'}</span>
          <span className="text-faint text-xs">{t.area}</span>
          <span className="ml-auto text-xs text-muted">{t.actualHours ? `${h1(t.actualHours)} h` : `${h1(t.plannedHours)} h plan`}</span>
          <Pill tone={DELIVERY_TONE[d.delivery]}>{t.status === 'Done' ? d.delivery : t.status}</Pill>
        </li>
      ) })}
    </ul>
  )
}
