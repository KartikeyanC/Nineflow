import React, { useState } from 'react'
import { WorkProvider } from './WorkContext'
import DateView from './views/DateView'
import TimePlan from './views/TimePlan'
import WeekPlan from './views/WeekPlan'
import TaskLog from './views/TaskLog'
import Standards from './views/Standards'
import WorkDashboard from './views/WorkDashboard'
import DailyReport from './views/DailyReport'
import Monthly from './views/Monthly'
import Social from './views/Social'
import Ads from './views/Ads'
import Process from './views/Process'
import Guide from './views/Guide'
import { cx } from '../components/ui'
import { storageKey } from '../lib/profiles'

// The four used every day come first; the rest open under "More tools".
const CORE = ['date', 'tasks', 'report', 'dashboard']
const TABS = [
  ['date', 'Date view', DateView], ['time', 'Time plan', TimePlan], ['week', 'Weekly plan', WeekPlan], ['tasks', 'Task log', TaskLog],
  ['standards', 'Standard times', Standards], ['dashboard', 'Dashboard', WorkDashboard], ['report', 'Daily report', DailyReport],
  ['monthly', 'Monthly', Monthly], ['social', 'Social media', Social], ['ads', 'Ad campaigns', Ads], ['process', 'Process', Process], ['guide', 'Guide', Guide],
]
// Work OS: a solo creative/dev employee's complete daily workflow system.
export default function Work() {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(storageKey('work-tab')) || 'date' } catch { return 'date' } })
  const pick = (t) => { setTab(t); try { localStorage.setItem(storageKey('work-tab'), t) } catch { /* ignore */ } }
  const View = TABS.find(([id]) => id === tab)?.[2] || DateView
  const [more, setMore] = useState(() => !CORE.includes(tab))
  const shown = TABS.filter(([id]) => more || CORE.includes(id) || id === tab)
  return (
    <WorkProvider>
      <div className="animate-view-in">
        <header className="mb-4">
          <h1 className="h-display text-3xl">Work OS</h1>
          <p className="text-sm text-muted mt-1">Your whole workflow — plan the day, log the work, read the numbers.</p>
        </header>
        <nav className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 mb-4">
          {shown.map(([id, label]) => (
            <button key={id} type="button" onClick={() => pick(id)}
              className={cx('shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition', tab === id ? 'bg-brand text-white' : 'bg-card border border-line text-muted hover:text-ink')}>{label}</button>
          ))}
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold text-muted hover:text-ink transition">
            {more ? 'Fewer tools' : `More tools (${TABS.length - CORE.length})`}
          </button>
        </nav>
        <div key={tab} className="animate-view-in"><View /></div>
      </div>
    </WorkProvider>
  )
}
