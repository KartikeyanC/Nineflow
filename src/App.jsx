import React, { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { PlannerProvider, usePlanner } from './store/PlannerContext'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import Dock, { MobileDock } from './components/Dock'
import QuickAddModal from './components/QuickAddModal'
import TaskPanel from './components/TaskPanel'
import Onboarding from './components/Onboarding'
import { currentProfile } from './lib/profiles'
import FocusMode from './components/FocusMode'
import PipQuickList from './components/PipQuickList'
import CalendarToast from './components/CalendarToast'
import Dashboard from './views/Dashboard'
import Board from './views/Board'
import Week from './views/Week'
import Month from './views/Month'
import Settings from './views/Settings'
import Work from './work/Work'

const VIEWS = { dashboard: Dashboard, board: Board, week: Week, month: Month, work: Work, settings: Settings }

function Shell() {
  const { view, setQuickAdd } = usePlanner()
  const View = VIEWS[view] || Dashboard

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
    <div className="min-h-screen flex flex-col">
      <Dock slot="top" />
      <div className="flex gap-3 sm:gap-4 p-3 sm:p-4 flex-1 min-h-0">
        <Sidebar />
        {/* Bottom padding keeps content clear of the phone tab bar */}
        <main className="flex-1 min-w-0 py-1 sm:py-2 sm:pr-1 pb-24 sm:pb-2">
          {/* key forces the enter animation on every view change */}
          <div key={view} className="h-full">
            <View />
          </div>
        </main>
        <Dock slot="right" />
      </div>
      <Dock slot="bottom" />

      <MobileNav />
      <MobileDock />

      {/* Floating quick add; lifted above the tab bar on phones */}
      <button
        type="button"
        onClick={() => setQuickAdd({})}
        title="New task (Ctrl+K)"
        className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-30 h-14 w-14 rounded-full bg-ink text-page shadow-lift flex items-center justify-center transition hover:scale-105 active:scale-95"
      >
        <Plus size={24} />
      </button>

      <QuickAddModal />
      <TaskPanel />
      <FocusMode />
      <PipQuickList />
      <CalendarToast />
    </div>
  )
}

// No signed-in profile → onboarding / login. Everything else loads inside
// that profile's storage namespace.
export default function App() {
  if (!currentProfile()) return <Onboarding />
  return (
    <PlannerProvider>
      <Shell />
    </PlannerProvider>
  )
}
