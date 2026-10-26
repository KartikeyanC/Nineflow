import React, { useState } from 'react'
import { ChevronDown, ExternalLink, HelpCircle } from 'lucide-react'
import { GUIDES } from '../lib/connectGuides'
import { cx } from './ui'

// "How to connect": a folded, numbered list of steps for one connection (lib/connectGuides.js).
// With several ids (the chat services) it shows a chip per service and the chosen one's steps.
export default function HowToConnect({ ids, className }) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => GUIDES[id])
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(list[0])
  if (!list.length) return null
  const guide = GUIDES[pick] || GUIDES[list[0]]
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-lav-fg hover:underline underline-offset-2">
        <HelpCircle size={13} /> How to connect{list.length === 1 ? '' : ' each one'}
        <ChevronDown size={13} className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 rounded-2xl border border-line bg-page/60 p-3.5 max-w-xl animate-fade-in">
          {list.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Choose a service">
              {list.map((id) => (
                <button key={id} type="button" role="tab" aria-selected={id === pick} onClick={() => setPick(id)}
                  className={cx('pill h-7 px-2.5 text-[11px] border transition', id === pick ? 'bg-accent text-white border-transparent' : 'bg-card border-line text-muted hover:text-ink')}>
                  {GUIDES[id].title.replace(/ \(.*\)$/, '')}
                </button>
              ))}
            </div>
          )}
          <ol className="grid gap-2">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
                <span className="h-5 w-5 shrink-0 rounded-full bg-accent-soft text-accent text-[11px] font-bold inline-flex items-center justify-center tnum">{i + 1}</span>
                <span className="min-w-0">{rich(s)}</span>
              </li>
            ))}
          </ol>
          {guide.link && (
            <a href={guide.link.href} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-lav-fg hover:underline underline-offset-2">
              <ExternalLink size={12} /> {guide.link.label}
            </a>
          )}
          {guide.note && <p className="mt-2.5 text-[12px] text-muted">{guide.note}</p>}
        </div>
      )}
    </div>
  )
}

// "Press **Connect**" → Press <b>Connect</b>
function rich(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <b key={i} className="font-semibold text-ink">{part.slice(2, -2)}</b> : <React.Fragment key={i}>{part}</React.Fragment>)
}
