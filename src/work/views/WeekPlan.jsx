import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useWork } from '../WorkContext'
import { AREAS, DAY_NAMES } from '../workStore'
import { weeklyAreaHours, h1 } from '../workCalc'
import { Section, Table, Th, Td, SelectIn, Legend } from '../ui'
import { cx } from '../../components/ui'

export default function WeekPlan() {
  const { work, updateSettings } = useWork()
  const s = work.settings
  const focusBlocks = s.blocks.filter((b) => b.focus)
  const hours = weeklyAreaHours(s)
  const empty = AREAS.filter((a) => hours[a] === 0)
  const total = Object.values(hours).reduce((x, y) => x + y, 0)
  const set = (day, idx, area) => {
    const cur = [...(s.weeklyPlan[day] || [null, null])]; cur[idx] = area
    updateSettings({ weeklyPlan: { ...s.weeklyPlan, [day]: cur } })
  }
  return (
    <div className="space-y-4">
      <Section title="Weekly plan" hint="Which work area gets each focus block on each working day. Fixed daily slots (social handling, ad check, tomorrow's post) are added to the area totals automatically.">
        <div className="mb-3"><Legend /></div>
        <Table minWidth={520}>
          <thead><tr><Th>Day</Th>{focusBlocks.map((b) => <Th key={b.id} fill>{b.name} · {h1(b.minutes / 60)} h</Th>)}</tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 0].filter((d) => s.workingDays.includes(d)).map((d) => (
              <tr key={d}>
                <Td className="font-semibold text-ink">{DAY_NAMES[d]}</Td>
                {focusBlocks.map((b, i) => <Td key={b.id}><SelectIn value={(s.weeklyPlan[d] || [])[i] || ''} options={AREAS} allowEmpty className="w-52" onChange={(v) => set(d, i, v || null)} /></Td>)}
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section title="Hours per work area this week" hint={`${h1(total)} h of planned work across ${s.workingDays.length} working days.`}>
        {empty.length > 0 && (
          <p className="mb-3 rounded-xl bg-coral text-coral-fg text-sm font-semibold px-3 py-2 inline-flex items-center gap-2"><AlertTriangle size={14} /> No time this week for: {empty.join(', ')}.</p>
        )}
        <ul className="space-y-2">
          {AREAS.map((a) => (
            <li key={a} className="flex items-center gap-3 text-sm">
              <span className="w-48 font-semibold truncate">{a}</span>
              <div className="flex-1 h-2.5 rounded-full bg-page overflow-hidden"><div className={cx('h-full rounded-full', hours[a] ? 'bg-lav-fg' : 'bg-coral-fg')} style={{ width: `${total ? (hours[a] / total) * 100 : 0}%` }} /></div>
              <span className={cx('w-16 text-right font-semibold', hours[a] === 0 && 'text-coral-fg')}>{h1(hours[a])} h</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
