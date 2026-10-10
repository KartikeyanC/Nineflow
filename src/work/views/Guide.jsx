import React, { useRef } from 'react'
import { Download, Upload, RotateCcw } from 'lucide-react'
import { useWork } from '../WorkContext'
import { endTime, workMinutesPerDay, h1 } from '../workCalc'
import { DAY_NAMES } from '../workStore'
import { Section, NumIn, TextIn } from '../ui'

const ROUTINE = [
  ['2 min', 'Open the Date view for today. Read the main target and the time plan.'],
  ['3 min', 'Task log: set today’s work date on the tasks you will touch; check anything Overdue.'],
  ['2 min', 'Social calendar: confirm today’s post is caption-ready and creative-ready.'],
  ['2 min', 'Ad tracker: enter yesterday’s spend, clicks and leads; look at cost per lead vs target.'],
  ['1 min', 'End of day: actual hours and status on each task, then copy the Daily report to your manager.'],
]

const EXTRAS = [
  'Hours variance per task, so you learn where estimates slip.',
  'Example rows with a badge, excluded from every total — delete them when you are ready.',
  'CSV export on the three input tables; JSON backup of the whole module below.',
  '“Live” detection for ad campaigns from their dates, plus an over-budget flag and budget-used colour.',
  'A “no time for this area” warning on the weekly plan.',
  'Day-off list and working-day switches, so capacity is right during holidays.',
  'A suggested main target for the day (highest-priority task due that day).',
  'Tomorrow’s plan pre-filled from the weekly plan and tomorrow’s due tasks when you leave it blank.',
  'Pre-start checklist to cut revision rounds.',
]

export default function Guide() {
  const { work, updateSettings, resetWork, importWork } = useWork()
  const s = work.settings, T = s.targets
  const fileRef = useRef(null)
  const setT = (k, v) => updateSettings({ targets: { ...T, [k]: v } })
  const exportJson = () => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(work, null, 2)], { type: 'application/json' })), download: 'work-os-backup.json' }); a.click() }
  const importJson = async (f) => { if (!f) return; try { const d = JSON.parse(await f.text()); if (d && Array.isArray(d.tasks) && confirm('Replace all Work OS data with this file?')) importWork(d) } catch { alert('Not a valid backup.') } }

  return (
    <div className="space-y-4">
      <Section title="How to use" hint="Enter each piece of information once; every other screen is calculated from it.">
        <ol className="space-y-2 text-sm list-decimal pl-5">
          <li><b>Set your day</b> in <i>Time plan</i>: start time, block minutes, working days. Times recalculate.</li>
          <li><b>Set your week</b> in <i>Weekly plan</i>: which area gets each focus block. Fix any “no time” warning.</li>
          <li><b>Check Standard times</b> and change hours you disagree with.</li>
          <li><b>Log work in three places only</b>: Task log (every task), Social calendar (every post), Ad tracker (every campaign).</li>
          <li><b>Read, don’t type,</b> in Date view, Dashboard, Daily report and Monthly summary.</li>
          <li>Columns with ✎ are yours to fill; ƒ are calculated. Fixed choices are drop-downs.</li>
        </ol>
      </Section>

      <Section title="10-minute daily routine">
        <ul className="space-y-1.5">{ROUTINE.map(([t, text]) => <li key={text} className="text-sm flex gap-3"><span className="w-12 shrink-0 font-bold text-lav-fg">{t}</span>{text}</li>)}</ul>
      </Section>

      <Section title="Assumptions — change any of them" hint="These are the numbers every calculation uses. Targets drive the On track / Below target / Overloaded status on the dashboard.">
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Row label="Working day" value={`${s.startTime}–${endTime(s)} with ${h1(workMinutesPerDay(s) / 60)} h of work (lunch excluded)`} where="Time plan" />
          <Row label="Working days" value={s.workingDays.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ')} where="Time plan" />
          <Row label="Available hours" value="working days in the range × daily working hours, minus days off" />
          <Row label="Completion %" value="tasks done ÷ tasks worked on in the range" />
          <Row label="On-time %" value="done by the due date ÷ all done in the range" />
          <Row label="Ad spend & leads" value="campaigns whose dates overlap the range (whole figures, not prorated)" />
          <Row label="Engagement rate" value="(likes + comments + shares) ÷ reach of published posts" />
          <Row label="Standard times" value={`${work.standardTimes.length} task types — see the Standard times tab`} />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <Target label="Completion ≥ %" value={T.completionPct} onChange={(v) => setT('completionPct', v)} />
          <Target label="On-time ≥ %" value={T.onTimePct} onChange={(v) => setT('onTimePct', v)} />
          <Target label="Capacity used ≥ % (>100 = overloaded)" value={T.capacityPct} onChange={(v) => setT('capacityPct', v)} />
          <Target label="Avg revisions ≤" value={T.avgRevisions} step={0.5} onChange={(v) => setT('avgRevisions', v)} />
          <Target label="Tasks worked on per day ≥" value={T.tasksPerDay} step={1} onChange={(v) => setT('tasksPerDay', v)} />
          <Target label="Posts per week ≥" value={T.postsPerWeek} step={1} onChange={(v) => setT('postsPerWeek', v)} />
          <Target label="Engagement ≥ %" value={T.engagementPct} step={0.5} onChange={(v) => setT('engagementPct', v)} />
          <Target label={`Cost per lead ≤ (${s.currency})`} value={T.costPerLead} onChange={(v) => setT('costPerLead', v)} />
          <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Currency symbol</span><TextIn value={s.currency} className="w-20" onChange={(v) => updateSettings({ currency: v || '$' })} /></label>
        </div>
      </Section>

      <Section title="What I added beyond the brief">
        <ul className="space-y-1 text-sm list-disc pl-5">{EXTRAS.map((e) => <li key={e}>{e}</li>)}</ul>
      </Section>

      <Section title="Backup" hint="The Work OS keeps its own data, separate from the planner's tasks.">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={exportJson}><Download size={14} /> Export JSON</button>
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import JSON</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => importJson(e.target.files?.[0])} />
          <button type="button" className="btn-ghost text-coral-fg ml-auto" onClick={() => confirm('Reset the Work OS to defaults? All tasks, posts and campaigns here will be removed.') && resetWork()}><RotateCcw size={14} /> Reset to defaults</button>
        </div>
      </Section>
    </div>
  )
}

const Row = ({ label, value, where }) => (
  <div><p className="text-xs font-semibold text-muted">{label}{where && <span className="text-faint font-medium"> · {where}</span>}</p><p>{value}</p></div>
)
const Target = ({ label, value, onChange, step = 5 }) => (
  <label className="block"><span className="block text-xs font-semibold text-muted mb-1">{label}</span><NumIn value={value} step={step} className="w-24" onChange={onChange} /></label>
)
