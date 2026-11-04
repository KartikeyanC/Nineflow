import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
import { colorOf, PRIORITY_STYLE } from '../lib/colors'
import { PRIORITY_LABEL } from '../lib/tasks'

export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function PriorityPill({ priority, className }) {
  return (
    <span className={cx('pill', PRIORITY_STYLE[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

export function CategoryTag({ category, className }) {
  if (!category) return null
  const c = colorOf(category.color)
  return (
    <span className={cx('pill', c.bg, c.text, className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', c.dot)} />
      {category.name}
    </span>
  )
}

// Black segmented-control pill. `options` = [{value, label}]
// A light gray track with the brand gradient as the active button. The track and idle
// labels read the theme variables, so they follow light / dark on their own; the gradient
// (bg-brand, see the Tailwind config) is the logo's and is the same in both themes.
export function Segmented({ value, onChange, options, size = 'md', className }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 max-sm:py-2 text-xs' : 'px-3.5 py-1.5 max-sm:py-2.5 text-sm'
  return (
    <div className={cx('inline-flex rounded-full p-1 gap-0.5 bg-ink/5 dark:bg-ink/10', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-full font-semibold transition-all whitespace-nowrap',
              pad,
              active ? 'bg-brand text-white shadow-sm' : 'text-ink/70 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Check circle that pops when it becomes checked.
export function CheckCircle({ checked, onToggle, size = 'md', className }) {
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <button
      type="button"
      aria-label={checked ? 'Mark as not done' : 'Mark as done'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle?.()
      }}
      className={cx(
        'tap-target shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
        dim,
        checked
          ? 'bg-mint-fg border-mint-fg text-white animate-pop'
          : 'border-line hover:border-mint-fg',
        className,
      )}
    >
      {checked && <Check size={size === 'sm' ? 10 : 12} strokeWidth={3.5} />}
    </button>
  )
}

export function ProgressBar({ value, className, tone = 'bg-ink' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={cx('h-1.5 w-full rounded-full bg-line overflow-hidden', className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// Focus handling for dialogs: focus moves into the dialog (unless a field in
// it already took focus), Tab cycles inside it, and focus returns to where
// it was when the dialog closes.
export function useDialogFocus(ref, active) {
  useEffect(() => {
    const node = ref.current
    if (!active || !node) return
    const prev = document.activeElement
    const focusables = () => [...node.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null)
    if (!node.contains(document.activeElement)) node.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [active, ref])
}

export function Modal({ open, onClose, children, title, width = 'max-w-lg' }) {
  const ref = useRef(null)
  useDialogFocus(ref, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  // Drawn on <body>, so it always opens at the top of the screen you're looking at, wherever the
  // page is scrolled; inside the page, a transform on a parent would place it on the page instead.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-ink/30 backdrop-blur-sm animate-fade-in max-sm:items-end max-sm:pt-0 max-sm:px-0"
      onMouseDown={onClose}
    >
      {/* Phones: a bottom sheet (rounded top, slides up, scrolls inside, clear of the gesture bar). */}
      <div
        ref={ref}
        tabIndex={-1}
        className={cx('card w-full shadow-modal animate-modal-in p-6 outline-none max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:border-0 max-sm:p-5 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:max-h-[92dvh] max-sm:overflow-y-auto max-sm:animate-sheet-in', width)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-label={title ? undefined : 'Dialog'}
      >
        <div className="sm:hidden mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 id="modal-title" className="h-display text-lg">{title}</h2>
            <IconButton onClick={onClose} label="Close">
              <X size={16} />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function IconButton({ children, onClick, label, className, active }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'h-8 w-8 inline-flex items-center justify-center rounded-full transition',
        active ? 'bg-brand text-white' : 'text-muted hover:bg-page hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Field({ label, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="block text-xs font-semibold text-muted mb-1.5">{label}</span>
      {children}
    </label>
  )
}

// Pastel pill pickers shared by quick-add and the side panel.
export function CategoryPills({ categories, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((c) => {
        const col = colorOf(c.color)
        const active = value === c.id
        return (
          <button key={c.id} type="button" onClick={() => onChange(c.id)}
            className={cx('pill border transition', col.bg, col.text,
              active ? 'border-current ring-2 ring-current/20' : 'border-transparent opacity-70 hover:opacity-100')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', col.dot)} />
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

export function PriorityPills({ value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {['high', 'medium', 'low'].map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)}
          className={cx('pill border transition', PRIORITY_STYLE[p],
            value === p ? 'border-current ring-2 ring-current/20' : 'border-transparent opacity-70 hover:opacity-100')}>
          {PRIORITY_LABEL[p]}
        </button>
      ))}
    </div>
  )
}

// Small popover menu anchored to a trigger. `items` = [{label, onSelect, danger?}]
export function Menu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx('absolute top-full mt-1 z-30 min-w-[196px] card p-1.5 shadow-lift animate-menu-in',
          align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) =>
            it === 'divider' ? (
              <div key={i} className="my-1 border-t border-line" />
            ) : (
              <button key={it.label} type="button"
                onClick={() => { setOpen(false); it.onSelect() }}
                className={cx('w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition flex items-center gap-2',
                  it.danger ? 'text-coral-fg hover:bg-coral/60' : 'text-ink hover:bg-page')}>
                {it.icon && <it.icon size={14} className="opacity-70" />}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger = true }) {
  return (
    <Modal open={open} onClose={onClose} width="max-w-sm">
      <h2 className="h-display text-lg">{title}</h2>
      {body && <p className="text-sm text-muted mt-2">{body}</p>}
      <div className="flex justify-end gap-2 mt-6">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className={danger ? 'btn-danger' : 'btn-black'} onClick={() => { onConfirm(); onClose() }}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      {Icon && (
        <div className="h-12 w-12 rounded-2xl bg-lav text-lav-fg flex items-center justify-center mb-3">
          <Icon size={22} />
        </div>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="text-sm text-muted mt-1 max-w-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
