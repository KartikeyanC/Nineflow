import React from 'react'
import { Sunrise, CalendarRange, CalendarDays, KanbanSquare, Settings, Plus, Moon, Sun, Briefcase } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dayStats } from '../lib/tasks'
import { currentProfile, initials } from '../lib/profiles'
import { colorOf } from '../lib/colors'
import { cx } from '../components/ui'
import { InterruptButton } from '../features/Interrupt'
import { CloudStatusPill } from '../features/CloudStatus'
import { WorkspaceMenu } from '../features/Workspaces'
import { PlanGoalButton } from '../components/GoalPlanner'
import { PromptListButton } from '../components/PromptToList'
import { BrandMark, Wordmark } from '../components/Brand'

// Floating "island" sidebar: icons only between 640px and 1024px, full
// labels from 1024px. Phones use MobileNav instead.
export const NAV = [
  { id: 'dashboard', label: 'Today', icon: Sunrise, group: 'plan' },
  { id: 'board', label: 'Board', icon: KanbanSquare, group: 'plan' },
  { id: 'week', label: 'Week', icon: CalendarRange, group: 'plan' },
  { id: 'month', label: 'Month', icon: CalendarDays, group: 'plan' },
  { id: 'work', label: 'Work OS', icon: Briefcase, group: 'workspace' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'workspace' },
]

export default function Sidebar() {
  const { tasks, now, view, setView, setQuickAdd, settings, updateSettings } = usePlanner()
  const today = dayStats(tasks, now, now)
  const dark = settings.theme === 'dark'
  const profile = currentProfile()
  const avatar = colorOf(profile?.color)
  const items = NAV.filter(({ id }) => id !== 'work' || settings.modules?.work)

  return (
    <aside className="hidden sm:flex sticky z-20 top-4 h-[calc(100dvh-2rem)] w-[76px] lg:w-[252px] shrink-0 flex-col rounded-[28px] bg-card/75 backdrop-blur-xl shadow-soft p-3 lg:p-3.5 transition-[width] duration-500 ease-spring">
      {/* Brand */}
      <div className="flex items-center gap-3 h-11 px-1.5 lg:px-2">
        <BrandMark size={36} />
        <div className="hidden lg:block min-w-0">
          <p className="text-[15px] leading-tight"><Wordmark /></p>
          <p className="text-[11px] text-faint leading-tight">Plan better. Flow forward.</p>
        </div>
      </div>
      <WorkspaceMenu compact className="mt-3" />

      {/* Command pill: opens quick add */}
      <button type="button" onClick={() => setQuickAdd({})} title="New task (Ctrl+K)"
        className="group mt-4 h-11 rounded-full bg-ink text-page inline-flex items-center justify-center lg:justify-start gap-2.5 pl-1.5 lg:pr-3 transition duration-300 hover:-translate-y-px active:scale-[0.97] shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_8px_20px_-8px_rgb(var(--shadow)/0.5)]">
        <span className="h-8 w-8 rounded-full bg-page/15 inline-flex items-center justify-center transition duration-500 group-hover:rotate-90 group-hover:scale-105">
          <Plus size={16} />
        </span>
        <span className="hidden lg:inline text-[13px] font-semibold">New task</span>
        <span className="hidden lg:inline-flex ml-auto text-[10px] font-semibold text-page/50 tracking-wide">CTRL K</span>
      </button>
      <InterruptButton />
      <PlanGoalButton />
      <PromptListButton />

      <nav className="mt-5 flex flex-col gap-1">
        {items.map((item, i) => {
          const first = i === 0 || items[i - 1].group !== item.group
          return (
            <React.Fragment key={item.id}>
              {first && (
                <p className={cx('hidden lg:block px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint', i > 0 && 'pt-4')}>
                  {item.group === 'plan' ? 'Plan' : 'Workspace'}
                </p>
              )}
              {first && i > 0 && <div className="lg:hidden my-2 mx-3 h-px bg-line" />}
              <NavItem item={item} active={view === item.id} onClick={() => setView(item.id)}
                badge={item.id === 'dashboard' && today.total - today.done > 0 ? today.total - today.done : null} />
            </React.Fragment>
          )
        })}
      </nav>

      <div className="flex-1" />

      {/* Today progress, double-bezel */}
      <div className="hidden lg:block bezel !rounded-[22px] !p-1">
        <div className="core !rounded-[18px] p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Today</span>
            <span className="text-[12px] font-semibold text-muted tnum">{Math.round(today.progress * 100)}%</span>
          </div>
          <p className="mt-1 text-[15px] font-bold tracking-tight tnum">{today.done} <span className="text-faint font-medium">of {today.total} done</span></p>
          <div className="mt-2.5 flex gap-[3px]">
            {Array.from({ length: Math.max(today.total, 1) }, (_, i) => (
              <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-500',
                i < today.done ? 'bg-mint-fg' : i < today.done + today.working ? 'bg-sky-fg' : 'bg-line')} />
            ))}
          </div>
        </div>
      </div>
      <div className="lg:hidden flex justify-center" title={`${today.done} of ${today.total} done`}>
        <ProgressRing value={today.progress} label={today.done} />
      </div>

      <div className="mt-2 hidden lg:flex"><CloudStatusPill /></div>
      <div className="mt-2 flex lg:hidden justify-center"><CloudStatusPill iconOnly /></div>

      {/* Profile + theme */}
      <div className="mt-3 flex flex-col lg:flex-row items-center gap-2 lg:gap-2.5 px-0.5 lg:px-1">
        <button type="button" onClick={() => setView('settings')} title="Profile and settings"
          className="flex items-center gap-2.5 min-w-0 lg:flex-1 rounded-full lg:pr-2 transition hover:opacity-80">
          <span className={cx('h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ring-2 ring-card', avatar.bg, avatar.text)}>
            {initials(profile?.name || '')}
          </span>
          <span className="hidden lg:block text-[13px] font-semibold truncate">{profile?.name}</span>
        </button>
        <button type="button" onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })} title="Toggle dark mode"
          className="h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center text-muted bg-subtle ring-hair hover:text-ink transition duration-500 hover:rotate-12">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </aside>
  )
}

function NavItem({ item: { label, icon: Icon }, active, onClick, badge }) {
  return (
    <button type="button" onClick={onClick} title={label}
      className={cx('group relative flex items-center gap-3 h-10 px-3 rounded-full text-[13px] font-semibold transition duration-300 justify-center lg:justify-start',
        active ? 'bg-ink text-page shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_6px_14px_-6px_rgb(var(--shadow)/0.45)]' : 'text-muted hover:bg-subtle hover:text-ink')}>
      <Icon size={17} className={cx('shrink-0 transition duration-300', !active && 'group-hover:scale-110')} />
      <span className="hidden lg:inline">{label}</span>
      {badge != null && (
        <span className={cx('hidden lg:inline-flex ml-auto min-w-[22px] h-5 px-1.5 items-center justify-center rounded-full text-[10px] font-bold tnum',
          active ? 'bg-accent text-white' : 'bg-accent-soft text-accent')}>{badge}</span>
      )}
    </button>
  )
}

export function ProgressRing({ value, label, size = 36, stroke = 'rgb(var(--mint-fg))' }) {
  const r = 13, c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ height: size, width: size }}>
      <svg viewBox="0 0 32 32" className="h-full w-full -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="3" />
        <circle cx="16" cy="16" r={r} fill="none" stroke={stroke} strokeWidth="3"
          strokeDasharray={`${value * c} ${c}`} strokeLinecap="round" className="transition-all duration-700 ease-spring" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tnum">{label}</span>
    </div>
  )
}
