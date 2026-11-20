// Set or change your profession after onboarding: from the one-time card on Home and from Settings.
// Same three questions as onboarding minus the hours (it uses the hours already set), then a preview of
// what changes. Applying swaps the routine (store swapRoutine): your own tasks, past days and anything
// started stay, and Undo brings the old routine back.
import React, { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { professionById } from '../lib/professions'
import { buildDailyTasks, customiseDay, fromHHMM, isRoutineTask, shiftHours } from '../lib/professionDay'
import { currentProfile, updateProfile } from '../lib/profiles'
import { loadWork } from '../work/workStore'
import { dateKey } from '../lib/tasks'
import { usePlanner } from '../store/PlannerContext'
import { DayPreview, OptionList, ProfessionGrid, makeRoutine, profilePatchFor, professionIcon, useDayChanges } from './ProfessionKit'
import { Modal } from './ui'

/** Settings → Your work: what you do now, and a way to change it. */
export function ProfessionSettings() {
  const [open, setOpen] = useState(false)
  const [, redraw] = useState(0) // the profile lives outside React state: redraw after a change
  const me = currentProfile()
  const prof = professionById(me?.profession)
  const Icon = professionIcon(prof)
  // Its own card and heading, like every Settings section (on phones Settings folds the heading into a row).
  return (
    <section className="card p-5">
      <h2 className="h-display text-base">Your work</h2>
      <p className="text-sm text-muted mt-0.5 mb-4">What you do shapes your daily routine. Changing it swaps the routine from today; your own tasks stay.</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-page text-ink flex items-center justify-center"><Icon size={18} /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink">{prof ? prof.label : 'Not set'}</p>
          <p className="text-sm text-muted">
            {prof ? prof.setupQuestion.options[me.professionSetup] || '' : 'Pick what you do to get a ready-made routine.'}
          </p>
        </div>
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => setOpen(true)}>{prof ? 'Change' : 'Set up'}</button>
      </div>
      {open && <ProfessionDialog open onClose={() => setOpen(false)} onDone={() => redraw((n) => n + 1)} />}
    </section>
  )
}

export default function ProfessionDialog({ open, onClose, suggested, onDone }) {
  const { settings, updateSettings, swapRoutine, allTasks } = usePlanner()
  const me = currentProfile()
  const [step, setStep] = useState(0)
  const [profession, setProfession] = useState(me?.profession || suggested || '')
  const [option, setOption] = useState(me?.profession ? me.professionSetup ?? null : null)
  const [skip, setSkip] = useState([])
  const [error, setError] = useState('')
  const prof = professionById(profession)

  const { start, end } = settings.workHours
  const workingDays = loadWork().settings?.workingDays || [1, 2, 3, 4, 5]
  const changes = useDayChanges() // edits and added tasks on the preview step
  const generated = useMemo(() => (prof && option !== null ? buildDailyTasks(prof, { optionIndex: option, startMinutes: fromHHMM(start), hours: shiftHours(start, end) }) : []), [prof, option, start, end])
  const dayTasks = useMemo(() => customiseDay(generated, changes.custom, fromHHMM(start), shiftHours(start, end)), [generated, changes.custom, start, end])
  const kept = dayTasks.filter((t) => !skip.includes(t.key))
  const today = dateKey(new Date())
  const replacing = allTasks.filter((t) => isRoutineTask(t) && t.date >= today && t.status === 'todo').length

  const next = () => {
    if (step === 0 && !prof) return setError('Choose what you do to continue.')
    if (step === 1 && option === null) return setError('Choose one option to continue.')
    setError('')
    return step < 2 ? setStep(step + 1) : apply()
  }

  function apply() {
    const exam = prof.id === 'student'
    // Undo puts back the profile and settings this changes, not just the tasks.
    const before = {
      profile: { profession: me.profession, professionSetup: me.professionSetup, occupation: me.occupation, occupationOther: me.occupationOther, needs: me.needs },
      settings: { categories: settings.categories, exam: settings.exam, modules: settings.modules, professionCardDismissed: settings.professionCardDismissed },
    }
    const onUndo = () => { updateProfile(me.id, before.profile); updateSettings(before.settings); onDone?.() }
    updateProfile(me.id, { ...profilePatchFor(prof, option), ...(exam ? { needs: [...new Set([...(me.needs || []), 'exam'])] } : {}) })
    const { routine, categories } = makeRoutine({ professionId: prof.id, tasks: kept, categories: settings.categories, workingDays })
    updateSettings({
      categories, professionCardDismissed: true,
      ...(exam ? { exam: prof.examIds[option], modules: { ...settings.modules, ntpc: true } } : {}),
    })
    swapRoutine(routine, `Routine set: ${prof.label}`, onUndo)
    onDone?.()
    onClose()
  }

  const titles = [
    ['What do you do?', 'Pick the closest fit. Your routine is built around how this work runs.'],
    [prof?.setupQuestion.text || '', 'This adds the tasks that fit your kind of work.'],
    ['Your day', `Timed from your working hours, ${start}–${end}. Untick, change a time, or add your own.`],
  ]

  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-wider text-faint">Step {step + 1} of 3</p>
      <h2 className="h-display text-2xl mt-1">{titles[step][0]}</h2>
      <p className="text-sm text-muted mt-1.5">{titles[step][1]}</p>

      <div key={step} className="animate-view-in mt-5 max-h-[60vh] overflow-y-auto -mx-1 px-1 pb-1">
        {step === 0 && <ProfessionGrid value={profession} onPick={(id) => { setError(''); if (id !== profession) { setOption(null); setSkip([]); changes.reset() } setProfession(id) }} />}
        {step === 1 && prof && <OptionList prof={prof} value={option} onPick={(i) => { setError(''); if (i !== option) { setSkip([]); changes.reset() } setOption(i) }} />}
        {step === 2 && (
          <>
            <DayPreview dayTasks={dayTasks} skip={skip} onToggle={(k) => setSkip((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}
              onEdit={changes.edit} onAdd={changes.add} defaultTime={start} />
            <p className="mt-4 rounded-2xl bg-page p-3.5 text-sm text-muted">
              {kept.length ? <><b className="text-ink">{kept.length} tasks</b> repeat on your working days from today. </> : null}
              {replacing ? <>This replaces <b className="text-ink">{replacing} upcoming routine tasks</b> you haven’t started. </> : null}
              Your own tasks, past days and anything started or done stay as they are. You can undo this.
            </p>
          </>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm font-semibold text-coral-fg">{error}</p>}

      <div className="flex items-center justify-between gap-3 mt-6">
        {step > 0
          ? <button type="button" className="text-sm font-semibold text-muted hover:text-ink inline-flex items-center gap-1" onClick={() => { setError(''); setStep(step - 1) }}><ArrowLeft size={14} /> Back</button>
          : <button type="button" className="text-sm font-semibold text-muted hover:text-ink" onClick={onClose}>Cancel</button>}
        <button type="button" className="btn-black h-11 px-5" onClick={next}>
          {step === 2 ? <>Use this routine <Sparkles size={15} /></> : <>Continue <ArrowRight size={15} /></>}
        </button>
      </div>
    </Modal>
  )
}
