import React, { useState } from 'react'
import { ChevronDown, CheckSquare } from 'lucide-react'
import { AREAS } from '../workStore'
import { PROCESS, PRE_START_CHECKLIST } from '../process'
import { Section } from '../ui'
import { cx } from '../../components/ui'

export default function Process() {
  const [open, setOpen] = useState(AREAS[0])
  return (
    <div className="space-y-4">
      <Section title="Before any task starts" hint="If any of these is unclear, ask before you begin. It saves revision rounds later.">
        <ul className="grid sm:grid-cols-2 gap-2">{PRE_START_CHECKLIST.map((c) => <li key={c} className="text-sm flex items-start gap-2"><CheckSquare size={15} className="text-lav-fg mt-0.5 shrink-0" />{c}</li>)}</ul>
      </Section>
      <Section title="Process steps by work area" hint="The standard route from brief to delivery, and what “finished” means.">
        <div className="divide-y divide-line">
          {AREAS.map((a) => {
            const p = PROCESS[a]; const isOpen = open === a
            return (
              <div key={a}>
                <button type="button" onClick={() => setOpen(isOpen ? null : a)} className="w-full flex items-center justify-between py-3 text-left">
                  <span className="font-bold">{a}</span><ChevronDown size={16} className={cx('text-faint transition', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="pb-4 grid md:grid-cols-[1fr_280px] gap-4 animate-view-in">
                    <ol className="space-y-1.5">{p.steps.map((s, i) => <li key={i} className="text-sm flex gap-2"><span className="h-5 w-5 rounded-full bg-lav text-lav-fg text-[11px] font-bold inline-flex items-center justify-center shrink-0">{i + 1}</span>{s}</li>)}</ol>
                    <div className="rounded-2xl bg-mint/60 p-3.5"><p className="text-[11px] font-bold text-mint-fg uppercase tracking-wide">Finished means</p><p className="text-sm mt-1">{p.done}</p></div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
