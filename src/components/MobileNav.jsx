import React, { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, KanbanSquare, CalendarRange, CalendarDays, Grid2x2, Settings, Briefcase, ListTodo, Inbox, StickyNote, PauseCircle, MoreHorizontal, Search, X, Zap, GraduationCap, ChartColumn, Brain, Mic } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { cx, useDialogFocus } from './ui'
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
  const { view, setView, settings, setPromptListOpen } = usePlanner()
  const [sheet, setSheet] = useState(false)
  const sheetRef = useRef(null)
  useDialogFocus(sheetRef, sheet)
  const more = MORE.filter(({ id }) => (id !== 'work' || settings.modules?.work) && (id !== 'ntpc' || settings.modules?.ntpc))
  const inMore = more.some((m) => m.id === view)
  const go = (id) => { setSheet(false); setView(id) }

  useEffect(() => {
    if (!sheet) return undefined
    const onKey = (e) => e.key === 'Escape' && setSheet(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  const tab = (active, Icon, label, onClick, extra = {}) => (
    <button type="button" onClick={onClick} {...extra}
      className={cx('flex-1 h-16 flex flex-col items-center justify-center gap-1 text-xs font-semibold transition', active ? 'text-lav-fg' : 'text-faint')}>
      <span className={cx('h-7 w-10 rounded-full inline-flex items-center justify-center', active && 'bg-lav')}><Icon size={18} /></span>
      {label}
    </button>
  )

  return (
    <>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-line flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(({ id, label, icon }) => <React.Fragment key={id}>{tab(view === id, icon, label, () => go(id), { 'aria-current': view === id ? 'page' : undefined })}</React.Fragment>)}
        {tab(inMore || sheet, MoreHorizontal, inMore ? more.find((m) => m.id === view).label : 'More', () => setSheet((o) => !o),
          { 'aria-expanded': sheet, 'aria-haspopup': 'dialog' })}
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
