// The pieces shared by onboarding (components/Onboarding.jsx) and the change-profession dialog
// (components/ProfessionDialog.jsx): the profession cards, the setup options, the day preview, and
// turning the chosen day into repeating NineFlow tasks.
import React from 'react'
import {
  Calculator, Check, GraduationCap, Handshake, HeartPulse, House, Laptop, Palette, Rocket, Scale, School, Sparkles, Stethoscope,
} from 'lucide-react'
import { PROFESSIONS } from '../lib/professions'
import { scheduleOf } from '../lib/professionDay'
import { createTask } from '../lib/tasks'
import { uid } from '../lib/storage'
import { COLOR_IDS, colorOf } from '../lib/colors'
import { cx } from './ui'

const PROFESSION_ICON = {
  stethoscope: Stethoscope, 'heart-pulse': HeartPulse, scale: Scale, calculator: Calculator, rocket: Rocket, school: School,
  handshake: Handshake, house: House, palette: Palette, laptop: Laptop, 'graduation-cap': GraduationCap, sparkles: Sparkles,
}
const PROFESSION_TONE = ['coral', 'mint', 'lav', 'butter', 'peach', 'sky', 'teal', 'rose']
export const professionIcon = (p) => PROFESSION_ICON[p?.icon] || Sparkles

// The old occupation field still names who work is for (lib/workFor.js).
const OCCUPATION_OF = { 'it-employee': 'Developer', 'startup-founder': 'Founder', freelancer: 'Freelancer', student: 'Student' }
export const profilePatchFor = (prof, option) => {
  const occupation = OCCUPATION_OF[prof.id] || 'Other'
  return { profession: prof.id, professionSetup: option, occupation, occupationOther: occupation === 'Other' ? prof.label : '' }
}

const Tick = () => <span className="h-5 w-5 rounded-full bg-accent text-white flex items-center justify-center animate-pop"><Check size={12} strokeWidth={3} /></span>

/** "What do you do?": one card per profession. */
export function ProfessionGrid({ value, onPick, label = 'What do you do?' }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {PROFESSIONS.map((p, i) => {
        const Icon = professionIcon(p)
        const c = colorOf(PROFESSION_TONE[i % PROFESSION_TONE.length])
        const on = value === p.id
        return (
          <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(p.id)}
            className={cx('relative flex flex-col items-start gap-2.5 rounded-2xl border-2 p-3.5 text-left transition-all', on ? cx('border-transparent', c.bg) : 'border-line bg-card hover:border-faint hover:-translate-y-0.5')}>
            <span className={cx('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition', on ? 'bg-card ' + c.text : cx(c.bg, c.text))}><Icon size={18} /></span>
            <span className={cx('block font-bold text-sm leading-snug', on && c.text)}>{p.label}</span>
            {on && <span className="absolute top-2.5 right-2.5"><Tick /></span>}
          </button>
        )
      })}
    </div>
  )
}

/** The profession's one setup question. */
export function OptionList({ prof, value, onPick }) {
  return (
    <div role="radiogroup" aria-label={prof.setupQuestion.text} className="grid gap-2.5">
      {prof.setupQuestion.options.map((o, i) => (
        <button key={o} type="button" role="radio" aria-checked={value === i} onClick={() => onPick(i)}
          className={cx('flex items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3.5 text-left font-bold text-sm transition', value === i ? 'border-ink bg-card' : 'border-line bg-card hover:border-faint')}>
          {o}
          {value === i && <Tick />}
        </button>
      ))}
    </div>
  )
}

/** The generated day, each task with a tick to keep it. */
export function DayPreview({ dayTasks, skip, onToggle }) {
  if (!dayTasks.length) return null
  return (
    <ul className="rounded-2xl border border-line divide-y divide-line overflow-hidden">
      {dayTasks.map((t, i) => {
        const on = !skip.includes(t.key)
        return (
          <li key={t.key}>
            {t.dayOffset === 1 && (i === 0 || dayTasks[i - 1].dayOffset === 0) && <p className="px-4 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-faint bg-page">After midnight</p>}
            <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-page transition">
              <input type="checkbox" checked={on} onChange={() => onToggle(t.key)} className="h-4 w-4 shrink-0" aria-label={`Keep ${t.title}`} />
              <span className={cx('w-12 shrink-0 text-sm font-semibold tabular-nums', on ? 'text-muted' : 'text-faint')}>{t.startTime}</span>
              <span className={cx('flex-1 min-w-0 text-sm font-semibold', on ? 'text-ink' : 'text-faint line-through')}>{t.title}</span>
              <span className="hidden sm:inline shrink-0 rounded-full bg-page px-2 py-0.5 text-xs font-semibold text-muted">{t.category}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * The kept tasks as repeating NineFlow tasks, each its own series tagged with the profession, in a
 * category named the way the profession names it (added to `categories` on first use).
 */
export function makeRoutine({ professionId, tasks, categories, workingDays, today = new Date() }) {
  const cats = [...categories]
  const categoryId = (name) => {
    let c = cats.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!c) { c = { id: `p-${slugOf(name)}`, name, color: COLOR_IDS[cats.length % COLOR_IDS.length] }; cats.push(c) }
    return c.id
  }
  const routine = scheduleOf(tasks, { today, workingDays }).map((t) => createTask({
    title: t.title, date: t.date, startTime: t.startTime, durationMinutes: t.durationMinutes, category: categoryId(t.category),
    seriesId: uid(), recurrence: { freq: t.freq, until: null, skip: [] }, fields: { source: `profession:${professionId}` },
  }))
  return { routine, categories: cats }
}
