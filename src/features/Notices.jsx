import React, { useEffect, useState } from 'react'
import { RotateCcw, X, AlertTriangle, Download } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { CloudBanner } from './CloudStatus'

const UNDO_SECONDS = 10

// Undo toast for destructive actions, and a banner when saving fails.
export default function Notices() {
  return (
    <>
      <SaveErrorBanner />
      <CloudBanner />
      <UndoToast />
    </>
  )
}

function UndoToast() {
  const { undo, undoLast, dismissUndo } = usePlanner()
  const [left, setLeft] = useState(UNDO_SECONDS)

  // Count down from the moment this action happened; a newer action restarts it.
  useEffect(() => {
    if (!undo) return
    setLeft(UNDO_SECONDS)
    const started = Date.now()
    const id = setInterval(() => {
      const s = UNDO_SECONDS - Math.floor((Date.now() - started) / 1000)
      if (s <= 0) dismissUndo()
      else setLeft(s)
    }, 250)
    return () => clearInterval(id)
  }, [undo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/Cmd+Z undoes while the toast is showing (not while typing).
  useEffect(() => {
    if (!undo) return
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      e.preventDefault()
      undoLast()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, undoLast])

  if (!undo) return null
  return (
    <div role="status" aria-live="polite"
      className="fixed z-40 top-16 inset-x-3 sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-[108px] lg:left-[284px] animate-modal-in">
      <div className="flex items-center gap-3 rounded-full bg-ink text-page pl-4 pr-1.5 h-12 shadow-lift max-w-full sm:max-w-md">
        <p className="text-[13px] font-semibold truncate min-w-0 flex-1">{undo.label}</p>
        <button type="button" onClick={undoLast}
          className="group shrink-0 inline-flex items-center gap-2 h-9 rounded-full bg-page/15 hover:bg-page/25 pl-3 pr-3.5 text-[13px] font-semibold transition">
          <RotateCcw size={14} className="transition duration-500 group-hover:-rotate-45" /> Undo
          <span className="text-page/50 text-[11px] tnum w-5 text-right">{left}s</span>
        </button>
        <button type="button" onClick={dismissUndo} aria-label="Dismiss"
          className="shrink-0 h-9 w-9 rounded-full inline-flex items-center justify-center text-page/60 hover:text-page hover:bg-page/10 transition">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

function SaveErrorBanner() {
  const { saveError, setView } = usePlanner()
  if (!saveError) return null
  return (
    <div role="alert"
      className="fixed z-50 top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(640px,calc(100vw-2rem))] animate-modal-in">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[22px] bg-coral text-coral-fg ring-1 ring-coral-fg/25 shadow-lift px-4 py-3">
        <AlertTriangle size={17} className="shrink-0" />
        <p className="text-[13px] font-semibold flex-1 min-w-[200px]">
          Changes aren't being saved. This browser's storage is full or blocked, so anything new is lost when the page reloads.
        </p>
        <button type="button" onClick={() => setView('settings')}
          className="inline-flex items-center gap-1.5 h-8 rounded-full bg-card text-ink px-3 text-[12px] font-semibold shadow-soft">
          <Download size={13} /> Export a backup
        </button>
      </div>
    </div>
  )
}
