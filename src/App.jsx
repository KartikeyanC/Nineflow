import React, { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
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
import { GuestBar } from './features/Guest'
import { HistoryKeeper } from './features/History'
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
import Table from './views/Table'
import Notes from './views/Notes'
import Charts from './views/Charts'
import Revise from './views/Revise'
import Paused from './views/Paused'
import CommandPalette from './components/CommandPalette'
import Shortcuts from './components/Shortcuts'
import { NotesFolderSync } from './features/NotesFolder'
import Settings from './views/Settings'
import Work from './work/Work'
import Ntpc from './views/Ntpc'
import { WorkForBar } from './components/WorkFor'

const VIEWS = { dashboard: Dashboard, board: Board, week: Week, month: Month, matrix: Matrix, someday: Someday, agenda: Agenda, table: Table, notes: Notes, revise: Revise, charts: Charts, paused: Paused, work: Work, ntpc: Ntpc, settings: Settings }

function Shell() {
  const { view, setView, setQuickAdd } = usePlanner()
  const View = VIEWS[view] || Dashboard
  const [palette, setPalette] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  // Phones: the floating search button steps aside while you scroll down, so it never sits on what
  // you are reading, and comes back when you scroll up or reach the top.
  const [searchAway, setSearchAway] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 8) return
      setSearchAway(y > last && y > 80)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => setSearchAway(false), [view])

  // Cmd/Ctrl+K opens the command palette anywhere (the + button opens quick add).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((o) => !o)
        return
      }
      // Single keys only when nothing is being typed and no dialog is open.
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const el = e.target
      if (el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [aria-modal="true"]')) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setQuickAdd({}) }
      else if (e.key === '?') { e.preventDefault(); setShortcuts(true) }
    }
    // Phones (no keyboard) open it from the "More" sheet in MobileNav.
    const onAsk = () => setPalette(true)
    const onShortcuts = () => setShortcuts(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('nineflow:palette', onAsk)
    window.addEventListener('nineflow:shortcuts', onShortcuts)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('nineflow:palette', onAsk)
      window.removeEventListener('nineflow:shortcuts', onShortcuts)
    }
  }, [setQuickAdd])

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
          <GuestBar />
          <WorkForBar />
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
        title="New task (N)"
        // On phones it floats just above the tab bar (4rem, plus the gesture bar's inset).
        // Phones don't show it on Settings, where there is nothing to add.
        className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-6 right-4 sm:right-6 z-30 h-14 w-14 rounded-full bg-brand text-white shadow-lift flex items-center justify-center transition hover:scale-105 active:scale-95${view === 'settings' ? ' max-sm:hidden' : ''}`}
      >
        <Plus size={24} />
      </button>
      {/* Phones have no Ctrl+K: search sits just above the + button on every screen */}
      <button
        type="button"
        onClick={() => setPalette(true)}
        aria-label="Search tasks and notes"
        tabIndex={searchAway ? -1 : undefined}
        className={`sm:hidden fixed bottom-[calc(9.25rem+env(safe-area-inset-bottom))] right-[1.375rem] z-30 h-11 w-11 rounded-full bg-card text-ink border border-line shadow-lift flex items-center justify-center active:scale-95 transition duration-200${searchAway ? ' translate-x-20 opacity-0 pointer-events-none' : ''}`}
      >
        <Search size={18} />
      </button>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Shortcuts open={shortcuts} onClose={() => setShortcuts(false)} />
      <NotesFolderSync />
      <HistoryKeeper />
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
