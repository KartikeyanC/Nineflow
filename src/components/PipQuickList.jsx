import React from 'react'
import { createPortal } from 'react-dom'
import { usePlanner } from '../store/PlannerContext'
import QuickList from './QuickList'

// Renders the Quick list into the pop-out window (Document PiP or popup).
// React events still bubble through the portal, so the list stays live.
export default function PipQuickList() {
  const { pipWin } = usePlanner()
  if (!pipWin || pipWin.closed) return null
  return createPortal(
    <div className="h-screen w-screen bg-page text-ink font-sans flex flex-col overflow-hidden">
      <QuickList inPip showPositions={false} />
    </div>,
    pipWin.document.body,
  )
}
