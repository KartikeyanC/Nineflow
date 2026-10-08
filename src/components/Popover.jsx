import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Portal-positioned popover anchored to `anchorRef`. Closes on outside click
// and on Escape (captured, so a modal behind it stays open).
export default function Popover({ open, onClose, anchorRef, align = 'left', width = 292, children }) {
  const panelRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const place = () => {
      const r = anchorRef.current.getBoundingClientRect()
      const h = panelRef.current?.offsetHeight || 300
      let left = align === 'right' ? r.right - width : r.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      let top = r.bottom + 6
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6)
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, align, width, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
  }, [open, onClose, anchorRef])

  if (!open) return null
  return createPortal(
    <div ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 70, width }}>
      {children}
    </div>,
    document.body,
  )
}
