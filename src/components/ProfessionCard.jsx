// A one-time card on Home for planners set up before professions existed: pick what you do and get a
// ready-made routine. "Not now" hides it for good; Settings → Your work does the same any time.
import React, { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { currentProfile } from '../lib/profiles'
import { professionById, professionFromOccupation } from '../lib/professions'
import { usePlanner } from '../store/PlannerContext'
import ProfessionDialog from './ProfessionDialog'

export default function ProfessionCard() {
  const { settings, updateSettings } = usePlanner()
  const [open, setOpen] = useState(false)
  const me = currentProfile()
  // Applying sets professionCardDismissed (a settings change, so this redraws); Undo clears it again.
  if (!me || me.profession || settings.professionCardDismissed) return null
  // An old occupation that maps to a real profession is offered first ("Developer" → IT employee).
  const guess = me.occupation ? professionFromOccupation(me.occupation) : ''
  const suggested = guess && guess !== 'other' ? guess : ''

  return (
    <section aria-label="Set up your routine" className="card mb-5 p-4 sm:p-5 flex items-start gap-3.5 animate-view-in">
      <span className="h-10 w-10 shrink-0 rounded-xl bg-brand text-white flex items-center justify-center"><Sparkles size={18} /></span>
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-ink">Get a ready-made day for your work</h2>
        <p className="text-sm text-muted mt-0.5">
          Tell NineFlow what you do and it sets up a timed routine that repeats on your working days
          {suggested ? <> (looks like: <b className="text-ink">{professionById(suggested).label}</b>)</> : null}. Your own tasks stay as they are.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-black h-9 py-0" onClick={() => setOpen(true)}>Set up my day</button>
          <button type="button" className="btn-ghost h-9 py-0" onClick={() => updateSettings({ professionCardDismissed: true })}>Not now</button>
        </div>
      </div>
      <button type="button" aria-label="Hide this card" className="h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center text-faint hover:text-ink hover:bg-page"
        onClick={() => updateSettings({ professionCardDismissed: true })}><X size={16} /></button>
      {open && <ProfessionDialog open onClose={() => setOpen(false)} suggested={suggested} />}
    </section>
  )
}
