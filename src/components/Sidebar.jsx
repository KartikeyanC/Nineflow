import React from 'react'
import { LayoutDashboard, KanbanSquare, CalendarRange, CalendarDays, Grid2x2, Inbox, ListTodo, StickyNote, PauseCircle, Settings, Plus, Moon, Sun, Briefcase } from 'lucide-react'
import { BrandMark, Wordmark } from './Brand'
import { usePlanner } from '../store/PlannerContext'
import { dayStats } from '../lib/tasks'
import { cx, ProgressBar } from './ui'
import { InterruptButton } from '../features/Interrupt'
import { CloudStatusPill } from '../features/CloudStatus'
import { WorkspaceMenu } from '../features/Workspaces'
import { PlanGoalButton } from './GoalPlanner'
import { PromptListButton } from './PromptToList'
import { AskPlannerButton } from './AskPlanner'
import SidebarToggle from './SidebarToggle'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'week', label: 'Week', icon: CalendarRange },
  { id: 'month', label: 'Month', icon: CalendarDays },
  { id: 'agenda', label: 'Agenda', icon: ListTodo },
  { id: 'matrix', label: 'Matrix', icon: Grid2x2 },
  { id: 'someday', label: 'Someday', icon: Inbox },
  { id: 'paused', label: 'Paused', icon: PauseCircle },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'work', label: 'Work OS', icon: Briefcase },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const { tasks, now, view, setView, setQuickAdd, settings, updateSettings } = usePlanner()
  const today = dayStats(tasks, now, now)
  const dark = settings.theme === 'dark'

  return (
    <aside className="card sticky z-20 top-4 h-[calc(100vh-2rem)] w-[72px] wide:w-[232px] shrink-0 hidden sm:flex flex-col p-3 wide:p-4 transition-[width] duration-200">
      <SidebarToggle />
      {/* Logo and workspace stay put; only what is below them scrolls */}
      <div className="flex flex-col gap-3 shrink-0 mb-3">
        <div className="flex items-center gap-2.5 px-1 wide:px-2 h-10">
          <BrandMark size={32} />
          <Wordmark className="text-[17px] hidden wide:block" />
        </div>
        <WorkspaceMenu compact />
      </div>

      {/* Scrolls when the window is too short for everything (the toggle above hangs outside the edge, so it stays out of here) */}
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto gap-3 overflow-x-hidden [&>*]:shrink-0 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV.filter(({ id }) => id !== 'work' || settings.modules?.work).map(({ id, label, icon: Icon }) => {
          const active = view === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              data-tip={label}
              aria-label={label}
              className={cx(
                'flex items-center gap-3 rounded-full h-10 px-3 wide:px-3.5 text-sm font-semibold transition justify-center wide:justify-start',
                active ? 'bg-lav text-lav-fg' : 'text-muted hover:bg-page hover:text-ink',
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden wide:inline">{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Today mini card */}
      <div className="mt-auto rounded-2xl bg-page border border-line p-3 hidden wide:block">
        <p className="text-xs font-semibold text-muted">Today</p>
        <p className="text-sm font-bold mt-0.5">
          {today.done} of {today.total} tasks done
        </p>
        <ProgressBar value={today.progress} className="mt-2.5" />
      </div>
      <div className="mt-auto wide:hidden flex justify-center" role="img" aria-label={`Today: ${today.done} of ${today.total} tasks done`} data-tip="Today" data-tip-hint={`${today.done} of ${today.total} tasks done`}>
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

      <div className="hidden wide:flex"><CloudStatusPill /></div>
      <div className="flex wide:hidden justify-center"><CloudStatusPill iconOnly /></div>
      <button
        type="button"
        onClick={() => setQuickAdd({})}
        className="btn-black w-full h-10 wide:px-4 px-0"
        data-tip="New task"
        data-tip-hint="Ctrl+K"
        aria-label="New task"
      >
        <Plus size={16} />
        <span className="hidden wide:inline">New task</span>
      </button>
      <InterruptButton />
      <PlanGoalButton />
      <PromptListButton />
      <AskPlannerButton />

      <button
        type="button"
        onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
        className="h-9 rounded-full flex items-center justify-center wide:justify-start gap-2.5 px-3 text-xs font-semibold text-muted hover:bg-page hover:text-ink transition"
        data-tip={dark ? 'Light mode' : 'Dark mode'}
        aria-label="Toggle dark mode"
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
        <span className="hidden wide:inline">{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
      </div>
    </aside>
  )
}
