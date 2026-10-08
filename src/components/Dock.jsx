import React, { useEffect, useState } from 'react'
import { ListTodo, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import QuickList, { useQuickCount } from './QuickList'
import { cx } from './ui'

// Places the Quick list where settings.quickList.position says: a column on
// the right, or a bar across the top or bottom. Below 1024px every position
// becomes a bottom sheet. Each <Dock slot=…/> renders only when it matches.
export function useIsDesktop() {
  const [v, setV] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const h = (e) => setV(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return v
}

export default function Dock({ slot }) {
  const { settings, updateSettings } = usePlanner()
  const desktop = useIsDesktop()
  const count = useQuickCount()
  const ql = settings.quickList
  const setQL = (patch) => updateSettings({ quickList: { ...ql, ...patch } })
  if (ql.position === 'off') return null
  const effective = desktop ? ql.position : 'mobile'
  if (effective !== slot) return null
  const collapse = () => setQL({ collapsed: true })
  const expand = () => setQL({ collapsed: false })

  if (slot === 'right') {
    if (ql.collapsed) {
      return (
        <button type="button" onClick={expand} title="Open quick list"
          className="sticky top-4 h-[calc(100vh-2rem)] w-11 shrink-0 card flex flex-col items-center justify-center gap-3 hover:shadow-lift transition">
          <ListTodo size={16} className="text-lav-fg" />
          <span className="pill bg-lav text-lav-fg py-0 px-1.5">{count}</span>
          <span className="text-[10px] font-bold text-faint" style={{ writingMode: 'vertical-rl' }}>Quick list</span>
        </button>
      )
    }
    return (
      <aside className="sticky top-4 h-[calc(100vh-2rem)] w-[320px] shrink-0 card flex flex-col animate-view-in">
        <QuickList onCollapse={collapse} collapseIcon="chevron" />
      </aside>
    )
  }

  // top / bottom bars: stuck to their viewport edge so they stay in view.
  const top = slot === 'top'
  const wrap = cx('px-4 z-20 bg-page/90 backdrop-blur', top ? 'sticky top-0 pt-4 pb-1' : 'sticky bottom-0 pb-4 pt-1')
  if (ql.collapsed) {
    return (
      <div className={wrap}>
        <button type="button" onClick={expand}
          className="w-full card h-10 flex items-center justify-center gap-2 text-sm font-semibold text-muted hover:text-ink hover:shadow-lift transition">
          <ListTodo size={15} className="text-lav-fg" /> Quick list <span className="pill bg-lav text-lav-fg py-0">{count}</span>
        </button>
      </div>
    )
  }
  return (
    <div className={wrap}>
      <section className="card h-[36vh] min-h-[220px] flex flex-col animate-view-in">
        <QuickList layout="row" onCollapse={collapse} collapseIcon={top ? 'up' : 'down'} />
      </section>
    </div>
  )
}

// Phone: a handle above the tab bar and a bottom sheet.
export function MobileDock() {
  const { settings, updateSettings } = usePlanner()
  const desktop = useIsDesktop()
  const count = useQuickCount()
  const ql = settings.quickList
  if (desktop || ql.position === 'off') return null
  const setQL = (patch) => updateSettings({ quickList: { ...ql, ...patch } })
  if (ql.collapsed) {
    return (
      <button type="button" onClick={() => setQL({ collapsed: false })}
        className="fixed bottom-20 left-3 z-30 card h-11 px-3.5 flex items-center gap-2 shadow-lift text-sm font-semibold">
        <ListTodo size={15} className="text-lav-fg" /> List <span className="pill bg-lav text-lav-fg py-0">{count}</span>
      </button>
    )
  }
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink/25 animate-fade-in" onClick={() => setQL({ collapsed: true })} />
      <section className="absolute inset-x-2 bottom-2 h-[70vh] card flex flex-col shadow-modal animate-view-in">
        <QuickList onCollapse={() => setQL({ collapsed: true })} collapseIcon="down" showPositions={false} />
      </section>
    </div>
  )
}
