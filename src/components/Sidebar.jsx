import React, { useMemo } from 'react'
import { LayoutDashboard, KanbanSquare, CalendarRange, CalendarDays, Grid2x2, Inbox, ListTodo, StickyNote, PauseCircle, Settings, Plus, Moon, Sun, Briefcase, GraduationCap, ChartColumn, Brain, Table2 } from 'lucide-react'
import { BrandMark, Wordmark } from './Brand'
import { usePlanner } from '../store/PlannerContext'
import { isDark } from '../lib/themes'
import { examById } from '../exams'
import { GuestPill, isGuest } from '../features/Guest'
import { dateKey, dayStats } from '../lib/tasks'
import { cardsInNotes, dueCards } from '../lib/flashcards'
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
  { id: 'table', label: 'Table', icon: Table2 },
  { id: 'matrix', label: 'Matrix', icon: Grid2x2 },
  { id: 'charts', label: 'Charts', icon: ChartColumn },
  { id: 'someday', label: 'Someday', icon: Inbox },
  { id: 'paused', label: 'Paused', icon: PauseCircle },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'revise', label: 'Revise', icon: Brain },
  { id: 'work', label: 'Work OS', icon: Briefcase },
  { id: 'ntpc', label: 'RRB NTPC', icon: GraduationCap },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const { tasks, now, view, setView, setQuickAdd, settings, updateSettings } = usePlanner()
  const today = dayStats(tasks, now, now)
  const todayKey = dateKey(now)
  const cardsDue = useMemo(() => dueCards(cardsInNotes(settings.notes), settings.revision, todayKey).length, [settings.notes, settings.revision, todayKey])
  const dark = isDark(settings)
  const guest = isGuest()

  return (
    <aside className="card sticky z-20 top-4 h-[calc(100vh-2rem)] w-[72px] wide:w-[232px] shrink-0 hidden sm:flex flex-col p-3 wide:p-4 transition-[width] duration-200">
      <SidebarToggle />
      {/* Logo and workspace stay put; only what is below them scrolls */}
      <div className="flex flex-col gap-3 shrink-0 mb-3">
        <div className="flex items-center justify-center wide:justify-start gap-2.5 wide:px-2 h-10">
          <BrandMark size={32} />
          <Wordmark className="text-[17px] hidden wide:block" />
        </div>
        <WorkspaceMenu compact />
      </div>

      {/* Scrolls when the window is too short for everything (the toggle above hangs outside the edge, so it stays out of here) */}
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto gap-3 overflow-x-hidden [&>*]:shrink-0 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV.filter(({ id }) => (id !== 'work' || settings.modules?.work) && (id !== 'ntpc' || settings.modules?.ntpc)).map(({ id, label: name, icon: Icon }) => {
          const label = id === 'ntpc' ? examById(settings.exam).short : name // the exam being prepared for
          const active = view === id
          const badge = id === 'revise' && cardsDue > 0 ? cardsDue : 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-current={active ? 'page' : undefined}
              data-tip={label}
              data-tip-hint={badge ? `${badge} card${badge === 1 ? '' : 's'} to revise today` : undefined}
              aria-label={badge ? `${label}, ${badge} cards due` : label}
              className={cx(
                'flex items-center gap-3 rounded-full h-10 px-3 wide:px-3.5 text-sm font-semibold transition justify-center wide:justify-start',
                active ? 'bg-lav text-lav-fg' : 'text-muted hover:bg-page hover:text-ink',
              )}
            >
              <span className="relative shrink-0">
                <Icon size={18} />
                {badge > 0 && <i className="wide:hidden absolute -top-1 -right-1 h-2 w-2 rounded-full bg-lav-fg" aria-hidden="true" />}
              </span>
              <span className="hidden wide:inline flex-1 text-left">{label}</span>
              {badge > 0 && <span className="hidden wide:inline-flex min-w-[20px] h-5 px-1.5 rounded-full bg-lav-fg text-white text-[11px] font-bold items-center justify-center tnum" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
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
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">
            {today.done}
          </span>
        </div>
      </div>

      <div className="hidden wide:flex">{guest ? <GuestPill /> : <CloudStatusPill />}</div>
      <div className="flex wide:hidden justify-center">{guest ? <GuestPill iconOnly /> : <CloudStatusPill iconOnly />}</div>
      <button
        type="button"
        onClick={() => setQuickAdd({})}
        className="btn-black w-full h-10 wide:px-4 px-0"
        data-tip="New task"
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
