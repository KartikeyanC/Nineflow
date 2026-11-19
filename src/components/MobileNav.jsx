import React, { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, KanbanSquare, CalendarRange, CalendarDays, Grid2x2, Settings, Briefcase, ListTodo, Inbox, StickyNote, PauseCircle, MoreHorizontal, Search, X, Zap, GraduationCap, ChartColumn, Brain, Mic, Table2, Plus } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { cx, useDialogFocus } from './ui'
import { examById } from '../exams'
import { openInterrupt } from '../features/Interrupt'

const NAV = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'board', label: 'Board', icon: KanbanSquare },
  { id: 'week', label: 'Week', icon: CalendarRange },
  { id: 'month', label: 'Month', icon: CalendarDays },
]
// Behind the "More" tab: the bar only has room for five.
const MORE = [
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

// The command palette lives in App.jsx; phones have no Ctrl+K, so the sheet asks for it.
export const openPalette = () => window.dispatchEvent(new Event('nineflow:palette'))

// Bottom tab bar, phones only (the sidebar takes over from 640px).
export default function MobileNav() {
  const { view, setView, settings, setPromptListOpen, setQuickAdd } = usePlanner()
  const [sheet, setSheet] = useState(false)
  const sheetRef = useRef(null)
  useDialogFocus(sheetRef, sheet)
  const more = MORE.filter(({ id }) => (id !== 'work' || settings.modules?.work) && (id !== 'ntpc' || settings.modules?.ntpc))
    .map((m) => (m.id === 'ntpc' ? { ...m, label: examById(settings.exam).short } : m)) // the exam being prepared for
  const inMore = more.some((m) => m.id === view)
  const go = (id) => { setSheet(false); setView(id) }

  useEffect(() => {
    if (!sheet) return undefined
    const onKey = (e) => e.key === 'Escape' && setSheet(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  // One bead of the dock: a dark disc a little taller than the bar, so the bar's outline waves around each
  // button. The active tab opens into a white pill with its label; the rest are icon-only discs.
  const tab = (active, Icon, label, onClick, extra = {}) => (
    <span className="relative flex-none rounded-full bg-[#141414] p-[3px]">
      <button type="button" onClick={onClick} aria-label={label} {...extra}
        className={cx('h-11 min-w-[44px] rounded-full inline-flex items-center justify-center text-[13px] font-semibold transition-all duration-300 active:scale-95',
          active ? 'bg-white text-[#141414] pl-3 pr-3.5 gap-1' : 'bg-white/[0.08] text-white/65 px-0 gap-0')}>
        <Icon size={19} strokeWidth={active ? 2.4 : 1.8} className="flex-none" />
        <span className={cx('overflow-hidden text-ellipsis whitespace-nowrap transition-all duration-300 max-[374px]:hidden',
          active ? 'max-w-[56px] opacity-100' : 'max-w-0 opacity-0')}>{label}</span>
      </button>
    </span>
  )
  const nav = (id, label, icon) => (
    <React.Fragment key={id}>{tab(view === id, icon, label, () => go(id), { 'aria-current': view === id ? 'page' : undefined })}</React.Fragment>
  )

  return (
    <>
      <nav aria-label="Main" className="sm:hidden fixed inset-x-3 z-30 flex justify-center pointer-events-none"
        style={{ bottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}>
        <div className="relative pointer-events-auto flex items-center justify-between w-full max-w-[420px] drop-shadow-[0_14px_22px_rgb(0_0_0/0.28)]">
          {/* the bar the beads sit on: a touch shorter than they are, which gives the wavy edge */}
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[42px] rounded-full bg-[#141414] ring-1 ring-white/[0.06]" />
          {NAV.slice(0, 2).map(({ id, label, icon }) => nav(id, label, icon))}
          {/* New task: the bright bead in the middle */}
          <span className="relative flex-none rounded-full bg-[#141414] p-[3px]">
            <button type="button" onClick={() => { setSheet(false); setQuickAdd({}) }} aria-label="New task"
              className="h-11 w-11 rounded-full bg-brand text-white inline-flex items-center justify-center shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition active:scale-90">
              <Plus size={22} strokeWidth={2.6} />
            </button>
          </span>
          {NAV.slice(2).map(({ id, label, icon }) => nav(id, label, icon))}
          {tab(inMore || sheet, MoreHorizontal, inMore ? more.find((m) => m.id === view).label : 'More', () => setSheet((o) => !o),
            { 'aria-expanded': sheet, 'aria-haspopup': 'dialog' })}
        </div>
      </nav>

      {sheet && (
        <div className="sm:hidden fixed inset-0 z-40 bg-ink/30 animate-fade-in" onClick={() => setSheet(false)}>
          <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="More" onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card shadow-lift p-4 animate-modal-in"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="h-display text-base">More</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close"
                className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-page"><X size={16} /></button>
            </div>
            <button type="button" onClick={() => { setSheet(false); openPalette() }}
              className="w-full h-11 mb-3 rounded-full border border-line bg-page px-4 inline-flex items-center gap-2.5 text-sm text-faint">
              <Search size={16} /> Search tasks or jump anywhere…
            </button>
            <div className="grid grid-cols-3 gap-2">
              {/* "Something came up": reachable from any screen, so it no longer needs a second floating button */}
              <button type="button" onClick={() => { setSheet(false); openInterrupt() }}
                className="h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition bg-peach text-peach-fg active:scale-95">
                <Zap size={20} />
                Interruption
              </button>
              {/* Speak tasks: Prompt to list, already listening */}
              <button type="button" onClick={() => { setSheet(false); setPromptListOpen('voice') }}
                className="h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition bg-lav text-lav-fg active:scale-95">
                <Mic size={20} />
                Speak tasks
              </button>
              {more.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => go(id)} aria-current={view === id ? 'page' : undefined}
                  className={cx('h-20 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition',
                    view === id ? 'bg-lav text-lav-fg' : 'bg-page text-ink active:scale-95')}>
                  <Icon size={20} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
