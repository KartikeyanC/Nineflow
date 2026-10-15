import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSidebarRail } from '../lib/sidebarRail'

// A small handle on the sidebar's right edge: minimize it to the icon rail, or open it up
// again. It only shows where there is room to choose (1024px and wider); below that the
// sidebar is always a rail. Put it inside the (sticky, so positioned) <aside>.
export default function SidebarToggle() {
  const { min, toggle } = useSidebarRail()
  const label = min ? 'Expand sidebar' : 'Minimize sidebar'
  const Icon = min ? ChevronRight : ChevronLeft
  return (
    <button type="button" onClick={toggle} data-tip={label} aria-label={label} aria-expanded={!min}
      className="hidden lg:flex absolute top-6 -right-3 z-30 h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-muted shadow-soft transition hover:text-ink hover:scale-110 active:scale-95">
      <Icon size={14} />
    </button>
  )
}
