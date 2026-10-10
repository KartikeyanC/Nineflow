import React from 'react'
import { LayoutDashboard, KanbanSquare, CalendarRange, CalendarDays, Settings, Briefcase } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { cx } from './ui'

const NAV = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'week', label: 'Week', icon: CalendarRange },
  { id: 'month', label: 'Month', icon: CalendarDays },
  { id: 'work', label: 'Work', icon: Briefcase },
  { id: 'settings', label: 'Settings', icon: Settings },
]

// Bottom tab bar, phones only (the sidebar takes over from 640px).
export default function MobileNav() {
  const { view, setView, settings } = usePlanner()
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-line flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {NAV.filter(({ id }) => id !== 'work' || settings.modules?.work).map(({ id, label, icon: Icon }) => {
        const active = view === id
        return (
          <button key={id} type="button" onClick={() => setView(id)}
            className={cx('flex-1 h-16 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', active ? 'text-lav-fg' : 'text-faint')}>
            <span className={cx('h-7 w-10 rounded-full inline-flex items-center justify-center', active && 'bg-lav')}><Icon size={18} /></span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}
