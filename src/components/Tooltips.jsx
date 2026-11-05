import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A styled label for icon-only controls: the minimized sidebar above all. Give a control
//   data-tip="Name"            what it is
//   data-tip-hint="More"       optional second line (a shortcut, or what it does)
//   data-tip-side="right"      optional: right | left | top | bottom (default: right in a sidebar, else top)
// plus an aria-label (the bubble is only for the eye). The label shows at once on hover, on keyboard
// focus, or for a moment after a tap, and replaces the browser's own title bubble: that one is slow,
// can't be styled for the theme, and a sidebar's scroll area would cut off anything drawn inside it,
// so this is drawn on top of the page instead. Mount <Tooltips /> once, near the app's root.
// Look: frosted glass in the theme's own colours (the card colour at ~70% with a blur behind it, a fine
// light edge and a soft glow), so it follows light and dark by itself.

const GAP = 12        // between the control and the bubble
const EDGE = 8        // never closer than this to the window's edge
const SHOW_DELAY = 70 // ms: sweeping the pointer down a menu should not flash every label
const LEAVE_DELAY = 60 // ms: lets the next control take over without the bubble blinking out
const TOUCH_MS = 1600 // how long a tap keeps the label up

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const words = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()
const findTip = (target) => (target instanceof Element ? target.closest('[data-tip]') : null)
const FLIP = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' }

export default function Tooltips() {
  const [tip, setTip] = useState(null) // { el, name, hint, side }
  const [pos, setPos] = useState(null) // { left, top } once the bubble has been measured
  const bubble = useRef(null)

  useEffect(() => {
    let current = null
    let showTimer = 0
    let hideTimer = 0
    let touchTimer = 0
    const clear = () => { clearTimeout(showTimer); clearTimeout(hideTimer); clearTimeout(touchTimer) }
    const hide = () => { clear(); current = null; setTip(null); setPos(null) }
    const open = (el) => {
      clear()
      const name = el.getAttribute('data-tip')
      const hint = el.getAttribute('data-tip-hint') || ''
      if (!name) return
      // A control that already says it in words (a wide sidebar's labelled items) needs no bubble.
      if (!hint && words(el.innerText) === words(name)) { current = null; setTip(null); setPos(null); return }
      current = el
      setPos(null)
      setTip({ el, name, hint, side: el.getAttribute('data-tip-side') || (el.closest('aside') ? 'right' : 'top') })
    }

    const onOver = (e) => {
      const el = findTip(e.target)
      if (!el || el === current) { clearTimeout(hideTimer); return }
      if (e.pointerType === 'touch') { open(el); touchTimer = setTimeout(hide, TOUCH_MS); return }
      clear()
      // already showing one: switch at once; otherwise wait a beat
      if (current) open(el); else showTimer = setTimeout(() => open(el), SHOW_DELAY)
    }
    const onOut = (e) => {
      const el = findTip(e.target)
      if (!el) return
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return // still inside the same control
      clearTimeout(showTimer)
      if (el === current) hideTimer = setTimeout(hide, LEAVE_DELAY)
    }
    const onFocusIn = (e) => {
      const el = findTip(e.target)
      if (el && e.target.matches?.(':focus-visible')) open(el) // keyboard users only: a mouse click is not a reason to show it
    }
    const onFocusOut = (e) => { if (findTip(e.target) === current) hide() }
    const onKey = (e) => { if (e.key === 'Escape') hide() }
    const onDown = (e) => { if (e.pointerType !== 'touch') hide() } // clicking is an answer, not a question

    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      clear()
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [])

  // If the control goes away while its label is up (the view changed), take the label down too.
  useEffect(() => {
    if (!tip) return undefined
    const id = setInterval(() => { if (!tip.el.isConnected) { setTip(null); setPos(null) } }, 400)
    return () => clearInterval(id)
  }, [tip])

  // Measure the bubble once it exists, then place it beside the control (flipping if it would leave the window).
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return
    const r = tip.el.getBoundingClientRect()
    const b = bubble.current.getBoundingClientRect()
    const room = {
      right: r.right + GAP + b.width <= window.innerWidth - EDGE,
      left: r.left - GAP - b.width >= EDGE,
      top: r.top - GAP - b.height >= EDGE,
      bottom: r.bottom + GAP + b.height <= window.innerHeight - EDGE,
    }
    const side = room[tip.side] ? tip.side : FLIP[tip.side]
    let left, top
    if (side === 'right' || side === 'left') {
      left = side === 'right' ? r.right + GAP : r.left - GAP - b.width
      top = clamp(r.top + r.height / 2 - b.height / 2, EDGE, window.innerHeight - b.height - EDGE)
    } else {
      top = side === 'top' ? r.top - GAP - b.height : r.bottom + GAP
      left = clamp(r.left + r.width / 2 - b.width / 2, EDGE, window.innerWidth - b.width - EDGE)
    }
    setPos({ left, top })
  }, [tip])

  if (!tip || typeof document === 'undefined') return null
  return createPortal(
    <div ref={bubble} data-tooltip="" aria-hidden="true"
      style={{ left: pos ? pos.left : 0, top: pos ? pos.top : 0, opacity: pos ? 1 : 0 }}
      className="pointer-events-none fixed z-[200] rounded-xl border border-white/50 dark:border-white/10 bg-card/70 text-ink px-3 py-1.5 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_10px_28px_-8px_rgb(var(--shadow)/0.32)] transition-opacity duration-150 motion-reduce:transition-none">
      <p className="text-[12px] font-semibold leading-tight whitespace-nowrap">{tip.name}</p>
      {tip.hint && <p className="mt-0.5 max-w-[16rem] text-xs leading-snug text-muted">{tip.hint}</p>}
    </div>,
    document.body,
  )
}
