import React from 'react'
import { Plus } from 'lucide-react'
import { useWork } from '../WorkContext'
import { AREAS } from '../workStore'
import { Section, Table, Th, Td, TextIn, NumIn, SelectIn, RowTools, Legend } from '../ui'

export default function Standards() {
  const { work, updateRow, removeRow, addStandard } = useWork()
  const rows = [...work.standardTimes].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || a.taskType.localeCompare(b.taskType))
  return (
    <Section title="Standard times" hint="Normal hours for each task type. The task log uses these as the standard and the starting planned hours. Change them as you learn your real speed."
      right={<button type="button" className="btn-black h-9 py-0" onClick={addStandard}><Plus size={14} /> Add task type</button>}>
      <div className="mb-3"><Legend /></div>
      <Table minWidth={560}>
        <thead><tr><Th fill>Work area</Th><Th fill>Task type</Th><Th fill>Normal hours</Th><Th /></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="hover:bg-page/60">
              <Td><SelectIn value={s.area} options={AREAS} className="w-48" onChange={(v) => updateRow('standardTimes', s.id, { area: v })} /></Td>
              <Td><TextIn value={s.taskType} className="w-72" placeholder="e.g. Landing page design" onChange={(v) => updateRow('standardTimes', s.id, { taskType: v })} /></Td>
              <Td><NumIn value={s.hours} step={0.25} onChange={(v) => updateRow('standardTimes', s.id, { hours: v })} /></Td>
              <Td><RowTools onDelete={() => removeRow('standardTimes', s.id)} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Section>
  )
}
