import React from 'react'
import { ListChecks, Timer, BarChart3, Sparkles } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { Modal, cx } from './ui'

const TILES = [
  { icon: ListChecks, tone: 'bg-lav text-lav-fg', title: 'Plan', text: 'Board, week and month views for every task.' },
  { icon: Timer, tone: 'bg-sky text-sky-fg', title: 'Focus', text: 'Move a task to Working and the timer runs.' },
  { icon: BarChart3, tone: 'bg-mint text-mint-fg', title: 'Review', text: 'Daily stats, insights and habit streaks.' },
]

// Shown once, on first launch.
export default function WelcomeModal() {
  const { onboarded, setOnboarded, loadSample } = usePlanner()
  if (onboarded) return null
  const start = (withSample) => {
    if (withSample) loadSample()
    setOnboarded()
  }
  return (
    <Modal open onClose={() => start(false)} width="max-w-lg">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-ink text-page flex items-center justify-center mb-3"><Sparkles size={22} /></div>
        <h2 className="h-display text-2xl">Welcome to Daily Planner</h2>
        <p className="text-sm text-muted mt-1">Offline, private, and all yours. Nothing leaves this browser.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-6">
        {TILES.map(({ icon: Icon, tone, title, text }) => (
          <div key={title} className="rounded-2xl border border-line p-3.5 text-center">
            <div className={cx('mx-auto h-10 w-10 rounded-full flex items-center justify-center', tone)}><Icon size={18} /></div>
            <p className="font-bold text-sm mt-2.5">{title}</p>
            <p className="text-[11px] text-muted mt-1 leading-snug">{text}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-center mt-6">
        <button type="button" className="btn-ghost" onClick={() => start(false)}>Start empty</button>
        <button type="button" className="btn-black" onClick={() => start(true)}>Load sample data</button>
      </div>
    </Modal>
  )
}
