import React, { useEffect } from 'react'
import { Plus, Moon, Sun } from 'lucide-react'
import { PlannerProvider, usePlanner } from '../store/PlannerContext'
import MobileNav from '../components/MobileNav'
import Dock, { MobileDock } from '../components/Dock'
import QuickAddModal from '../components/QuickAddModal'
import TaskPanel from '../components/TaskPanel'
import Onboarding from '../components/Onboarding'
import { currentProfile } from '../lib/profiles'
import FocusMode from '../components/FocusMode'
import PipQuickList from '../components/PipQuickList'
import CalendarToast from '../components/CalendarToast'
import Board from '../views/Board'
import Week from '../views/Week'
import Month from '../views/Month'
import Settings from '../views/Settings'
import Work from '../work/Work'
import Today from './views/Today'
import Sidebar from './Sidebar'
import Notices from './Notices'
import Ritual from './Ritual'
import WelcomeBack from './WelcomeBack'

// v2 shell. Same store and views as v1 (src/App.jsx); the frame, the Today
// view and the design tokens (theme.css) are new.
const VIEWS = { dashboard: Today, board: Board, week: Week, month: Month, work: Work, settings: Settings }

// Phones: a slim glass bar (the sidebar is hidden below 640px).
function MobileBar() {
  const { settings, updateSettings } = usePlanner()
  const dark = settings.theme === 'dark'
  return (
    <div className="sm:hidden sticky top-0 z-20 flex items-center gap-2.5 px-4 h-14 bg-page/75 backdrop-blur-xl">
      <span className="relative h-8 w-8 rounded-[11px] bg-ink text-page flex items-center justify-center">
        <span className="font-serif italic text-[17px] leading-none -mt-0.5">d</span>
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-page" />
      </span>
      <span className="text-[14px] font-bold tracking-tight">Daily Planner</span>
      <button type="button" title="Toggle dark mode" onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
        className="ml-auto h-9 w-9 rounded-full inline-flex items-center justify-center text-muted bg-card shadow-soft">
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  )
}

function Shell() {
  const { view, setQuickAdd } = usePlanner()
  const View = VIEWS[view] || Today

  // Cmd/Ctrl+K opens quick add anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setQuickAdd({})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setQuickAdd])

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <MobileBar />
      <Dock slot="top" />
      <div className="flex gap-4 sm:p-4 flex-1 min-h-0">
        <Sidebar />
        {/* key forces the enter animation on every view change; bottom padding clears the phone tab bar */}
        <main className="flex-1 min-w-0 px-4 sm:px-2 lg:px-4 pt-2 sm:pt-3 pb-28 sm:pb-6">
          <div key={view} className="h-full">
            <View />
          </div>
        </main>
        <Dock slot="right" />
      </div>
      <Dock slot="bottom" />

      <MobileNav />
      <MobileDock />

      {/* Quick add on phones; the sidebar command pill covers larger screens */}
      <button type="button" onClick={() => setQuickAdd({})} title="New task"
        className="sm:hidden fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-ink text-page shadow-lift flex items-center justify-center active:scale-95 transition">
        <Plus size={22} />
      </button>

      <QuickAddModal />
      <TaskPanel />
      <FocusMode />
      <PipQuickList />
      <CalendarToast />
      <Notices />
      <Ritual />
      <WelcomeBack />
    </div>
  )
}

// No signed-in profile → onboarding / login, same as v1.
export default function App() {
  if (!currentProfile()) return <Onboarding />
  return (
    <PlannerProvider>
      <Shell />
    </PlannerProvider>
  )
}
