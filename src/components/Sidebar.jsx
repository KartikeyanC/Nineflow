import React from 'react'
import { LayoutDashboard, KanbanSquare, CalendarRange, CalendarDays, Settings, Plus, Moon, Sun, Briefcase } from 'lucide-react'
import { BrandMark, Wordmark } from './Brand'
import { usePlanner } from '../store/PlannerContext'
import { dayStats } from '../lib/tasks'
import { cx, ProgressBar } from './ui'
import { InterruptButton } from '../features/Interrupt'
import { CloudStatusPill } from '../features/CloudStatus'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'week', label: 'Week', icon: CalendarRange },
  { id: 'month', label: 'Month', icon: CalendarDays },
  { id: 'work', label: 'Work OS', icon: Briefcase },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const { tasks, now, view, setView, setQuickAdd, settings, updateSettings } = usePlanner()
  const today = dayStats(tasks, now, now)
  const dark = settings.theme === 'dark'

  return (
    <aside className="card sticky top-4 h-[calc(100vh-2rem)] w-[72px] lg:w-[232px] shrink-0 hidden sm:flex flex-col p-3 lg:p-4 transition-[width] duration-200">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-1 lg:px-2 h-10 mb-4">
        <BrandMark size={32} />
        <Wordmark className="text-[17px] hidden lg:block" />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV.filter(({ id }) => id !== 'work' || settings.modules?.work).map(({ id, label, icon: Icon }) => {
          const active = view === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              title={label}
              className={cx(
                'flex items-center gap-3 rounded-full h-10 px-3 lg:px-3.5 text-sm font-semibold transition justify-center lg:justify-start',
                active ? 'bg-lav text-lav-fg' : 'text-muted hover:bg-page hover:text-ink',
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex-1" />

      {/* Today mini card */}
      <div className="rounded-2xl bg-page border border-line p-3 hidden lg:block">
        <p className="text-xs font-semibold text-muted">Today</p>
        <p className="text-sm font-bold mt-0.5">
          {today.done} of {today.total} tasks done
        </p>
        <ProgressBar value={today.progress} className="mt-2.5" />
      </div>
      <div className="lg:hidden flex justify-center" title={`${today.done} of ${today.total} done`}>
        <div className="relative h-9 w-9">
          <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(var(--line))" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none" stroke="rgb(var(--ink))" strokeWidth="3"
              strokeDasharray={`${today.progress * 94.2} 94.2`} strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
            {today.done}
          </span>
        </div>
      </div>

      <div className="mt-2 hidden lg:flex"><CloudStatusPill /></div>
      <div className="mt-2 flex lg:hidden justify-center"><CloudStatusPill iconOnly /></div>
      <button
        type="button"
        onClick={() => setQuickAdd({})}
        className="btn-black mt-3 w-full h-10 lg:px-4 px-0"
        title="New task (Ctrl+K)"
      >
        <Plus size={16} />
        <span className="hidden lg:inline">New task</span>
      </button>
      <InterruptButton />

      <button
        type="button"
        onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
        className="mt-2 h-9 rounded-full flex items-center justify-center lg:justify-start gap-2.5 px-3 text-xs font-semibold text-muted hover:bg-page hover:text-ink transition"
        title="Toggle dark mode"
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
        <span className="hidden lg:inline">{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    </aside>
  )
}
