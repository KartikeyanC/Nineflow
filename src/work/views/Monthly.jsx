import React from 'react'
import { parseISO } from 'date-fns'
import { format } from '../../lib/dateFormat'
import { useWork } from '../WorkContext'
import { AREAS } from '../workStore'
import { monthlySummary, h1, pct } from '../workCalc'
import { Section, Table, Th, Td, Pill } from '../ui'
import { cx } from '../../components/ui'

export default function Monthly() {
  const { work } = useWork()
  const rows = monthlySummary(work)
  const T = work.settings.targets
  return (
    <Section title="Monthly summary" hint="Actual hours per work area by month (from work dates), tasks done and on-time % (from completed dates), posts published (from the calendar).">
      {rows.length === 0 ? <p className="text-sm text-faint">Nothing logged yet.</p> : (
        <Table minWidth={1400}>
          <thead><tr><Th>Month</Th>{AREAS.map((a) => <Th key={a} calc>{a}</Th>)}<Th calc>Total h</Th><Th calc>Tasks done</Th><Th calc>On time</Th><Th calc>Posts</Th></tr></thead>
          <tbody>{rows.map((m) => {
            const total = Object.values(m.hours).reduce((s, v) => s + v, 0)
            const onTime = pct(m.onTime, m.done)
            return (
              <tr key={m.month}>
                <Td className="font-semibold text-ink">{format(parseISO(`${m.month}-01`), 'MMM yyyy')}</Td>
                {AREAS.map((a) => <Td key={a} className={cx('text-right', m.hours[a] === 0 && 'text-faint')}>{m.hours[a] ? h1(m.hours[a]) : '—'}</Td>)}
                <Td className="text-right font-semibold">{h1(total)}</Td>
                <Td className="text-right">{m.done}</Td>
                <Td>{onTime == null ? '—' : <Pill tone={onTime >= T.onTimePct ? 'bg-mint text-mint-fg' : 'bg-coral text-coral-fg'}>{onTime}%</Pill>}</Td>
                <Td className="text-right">{m.posts}</Td>
              </tr>
            )
          })}</tbody>
        </Table>
      )}
    </Section>
  )
}
