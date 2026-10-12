import React from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import { useWork } from '../WorkContext'
import { AREAS, DAY_NAMES, SATURDAY_RULES } from '../workStore'
import { timePlan, endTime, dayLength, workMinutesPerDay, h1 } from '../workCalc'
import { Section, Table, Th, Td, TextIn, NumIn, SelectIn, RowTools, Legend } from '../ui'
import { TimeField } from '../../components/TimePicker'
import { DateField } from '../../components/DatePicker'
import { cx } from '../../components/ui'

export default function TimePlan() {
  const { work, updateSettings } = useWork()
  const s = work.settings
  const plan = timePlan(s, new Date())
  const setBlock = (id, p) => updateSettings({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const removeBlock = (id) => updateSettings({ blocks: s.blocks.filter((b) => b.id !== id) })
  const addBlock = () => updateSettings({ blocks: [...s.blocks, { id: `b${Date.now()}`, name: 'New block', area: AREAS[0], minutes: 30, what: '', output: '', fixed: true }] })
  const move = (i, dir) => { const b = [...s.blocks]; const j = i + dir; if (j < 0 || j >= b.length) return; [b[i], b[j]] = [b[j], b[i]]; updateSettings({ blocks: b }) }
  const toggleDay = (d) => updateSettings({ workingDays: s.workingDays.includes(d) ? s.workingDays.filter((x) => x !== d) : [...s.workingDays, d].sort() })
  const total = dayLength(s), work_ = workMinutesPerDay(s)

  return (
    <div className="space-y-4">
      <Section title="Daily time plan" hint="The day in order. Change the start time or any block's minutes and every start/end time recalculates. Focus blocks take their work area from the weekly plan.">
        <div className="flex flex-wrap items-end gap-6 mb-4">
          <label className="block"><span className="block text-xs font-semibold text-muted mb-1">Start time ✎</span><TimeField value={s.startTime} onChange={(v) => v && updateSettings({ startTime: v })} allowClear={false} className="w-32" /></label>
          <div><span className="block text-xs font-semibold text-muted mb-1">End time ƒ</span><p className="h-display text-xl">{endTime(s)}</p></div>
          <div><span className="block text-xs font-semibold text-muted mb-1">Day length ƒ</span><p className="h-display text-xl">{h1(total / 60)} h</p></div>
          <div><span className="block text-xs font-semibold text-muted mb-1">Working hours (no lunch) ƒ</span><p className="h-display text-xl">{h1(work_ / 60)} h</p></div>
          <div><span className="block text-xs font-semibold text-muted mb-1">Working days ✎</span>
            <div className="flex gap-1">{[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} type="button" onClick={() => toggleDay(d)} className={cx('h-8 w-9 rounded-full text-xs font-bold transition', s.workingDays.includes(d) ? 'bg-ink text-page' : 'bg-page text-faint hover:text-ink')}>{DAY_NAMES[d].slice(0, 2)}</button>
            ))}</div>
          </div>
          {s.workingDays.includes(6) && (
            <div className="animate-view-in"><span className="block text-xs font-semibold text-muted mb-1">Which Saturdays ✎</span>
              <select className="input w-full sm:w-[28rem] py-1.5" value={s.saturdayRule || 'all'} onChange={(e) => updateSettings({ saturdayRule: e.target.value })}>
                {SATURDAY_RULES.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.hint}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="mb-3"><Legend /></div>
        <Table minWidth={1100}>
          <thead><tr><Th calc>Start</Th><Th calc>End</Th><Th fill>Minutes</Th><Th fill>Block</Th><Th fill>Work area</Th><Th fill>What to do</Th><Th fill>Expected output</Th><Th /></tr></thead>
          <tbody>
            {plan.map((b, i) => (
              <tr key={b.id} className={cx(b.lunch && 'bg-page/60', b.focus && 'bg-lav/20')}>
                <Td calc className="font-semibold text-ink">{b.start}</Td>
                <Td calc className="font-semibold text-ink">{b.end}</Td>
                <Td><NumIn value={b.minutes} step={5} className="w-20" onChange={(v) => setBlock(b.id, { minutes: v })} /></Td>
                <Td><TextIn value={b.name} className="w-48" onChange={(v) => setBlock(b.id, { name: v })} /></Td>
                <Td>{b.focus ? <span className="pill bg-lav text-lav-fg py-0">{b.area || 'from weekly plan'}</span> : b.lunch || b.admin ? <span className="text-faint">—</span> : <SelectIn value={b.area} options={AREAS} className="w-44" onChange={(v) => setBlock(b.id, { area: v })} />}</Td>
                <Td><TextIn value={b.what} className="w-80" onChange={(v) => setBlock(b.id, { what: v })} /></Td>
                <Td><TextIn value={b.output} className="w-64" onChange={(v) => setBlock(b.id, { output: v })} /></Td>
                <Td><span className="inline-flex items-center gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} className="h-6 w-6 rounded-full text-faint hover:text-ink hover:bg-page" title="Move up">↑</button>
                  <button type="button" onClick={() => move(i, 1)} className="h-6 w-6 rounded-full text-faint hover:text-ink hover:bg-page" title="Move down">↓</button>
                  {!b.focus && !b.lunch && <RowTools onDelete={() => removeBlock(b.id)} />}
                </span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <button type="button" className="btn-ghost h-9 py-0" onClick={addBlock}><Plus size={14} /> Add block</button>
          {Math.abs(total - 540) > 0 && <p className="text-xs text-peach-fg inline-flex items-center gap-1"><AlertTriangle size={12} /> Day is {h1(total / 60)} h (the default is 9 h, 09:30–18:30).</p>}
        </div>
      </Section>

      <Section title="Days off" hint="Extra holidays on top of the weekly days off. These days count as no capacity.">
        <div className="flex flex-wrap items-center gap-2">
          {s.dayOffs.map((k) => <span key={k} className="pill bg-page text-muted">{k} <button type="button" onClick={() => updateSettings({ dayOffs: s.dayOffs.filter((x) => x !== k) })} className="ml-1 text-faint hover:text-coral-fg">×</button></span>)}
          <DateField value={null} placeholder="+ Add a day off" allowClear={false} onChange={(k) => k && !s.dayOffs.includes(k) && updateSettings({ dayOffs: [...s.dayOffs, k].sort() })} className="w-40" />
        </div>
      </Section>
    </div>
  )
}
