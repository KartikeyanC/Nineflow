import React, { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { PlannerProvider, usePlanner } from './store/PlannerContext'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import Dock, { MobileDock } from './components/Dock'
import QuickAddModal from './components/QuickAddModal'
import Tooltips from './components/Tooltips'
import GoalPlanner from './components/GoalPlanner'
import FinishGate from './components/FinishGate'
import PromptToList from './components/PromptToList'
import AskPlanner from './components/AskPlanner'
import TaskPanel from './components/TaskPanel'
import AuthGate from './features/AuthGate'
import FocusMode from './components/FocusMode'
import PipQuickList from './components/PipQuickList'
import CalendarToast from './components/CalendarToast'
import CalendarSync from './features/CalendarSync'
import TelegramInbox from './features/TelegramInbox'
import CalendarFeed from './features/CalendarFeed'
import Notices from './features/Notices'
import Ritual from './features/Ritual'
import WelcomeBack from './features/WelcomeBack'
import Interrupt, { ResumePrompt } from './features/Interrupt'
import Dashboard from './views/Dashboard'
import Board from './views/Board'
import Week from './views/Week'
import Month from './views/Month'
import Matrix from './views/Matrix'
import Someday from './views/Someday'
import Agenda from './views/Agenda'
import Notes from './views/Notes'
import Paused from './views/Paused'
import CommandPalette from './components/CommandPalette'
import Settings from './views/Settings'
import Work from './work/Work'

const VIEWS = { dashboard: Dashboard, board: Board, week: Week, month: Month, matrix: Matrix, someday: Someday, agenda: Agenda, notes: Notes, paused: Paused, work: Work, settings: Settings }

function Shell() {
  const { view, setView, setQuickAdd } = usePlanner()
  const View = VIEWS[view] || Dashboard
  const [palette, setPalette] = useState(false)

  // Cmd/Ctrl+K opens the command palette anywhere (the + button opens quick add).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((o) => !o)
      }
    }
    // Phones (no keyboard) open it from the "More" sheet in MobileNav.
    const onAsk = () => setPalette(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('nineflow:palette', onAsk)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('nineflow:palette', onAsk) }
  }, [])

  // Phone app: the Back button (src/native/androidBridge.js) closes what is open first; with nothing open it
  // goes back to Home from any other screen, and only on Home does it leave the app.
  useEffect(() => {
    const onBack = (e) => { if (view !== 'dashboard') { e.preventDefault(); setView('dashboard') } }
    window.addEventListener('nineflow:back', onBack)
    return () => window.removeEventListener('nineflow:back', onBack)
  }, [view, setView])

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
        title="New task"
        // On phones it floats just above the tab bar (4rem, plus the gesture bar's inset).
        // Phones don't show it on Settings, where there is nothing to add.
        className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-6 right-4 sm:right-6 z-30 h-14 w-14 rounded-full bg-brand text-white shadow-lift flex items-center justify-center transition hover:scale-105 active:scale-95${view === 'settings' ? ' max-sm:hidden' : ''}`}
      >
        <Plus size={24} />
      </button>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <QuickAddModal />
      <GoalPlanner />
      <FinishGate />
      <PromptToList />
      <AskPlanner />
      <TaskPanel />
      <FocusMode />
      <PipQuickList />
      <CalendarToast />
      <Notices />
      <Tooltips />
      <CalendarSync />
      <TelegramInbox />
      <CalendarFeed />
      <Ritual />
      <WelcomeBack />
      <Interrupt />
      <ResumePrompt />
    </div>
  )
}

// Signing in with Google is required; the planner then loads that
// account's data (kept in sync with its Google Drive).
export default function App() {
  return (
    <AuthGate>
      <PlannerProvider>
        <Shell />
      </PlannerProvider>
    </AuthGate>
  )
}
