import React, { useEffect, useState } from 'react'
import { Trash2, Pencil, FunctionSquare } from 'lucide-react'
import { cx } from '../components/ui'
import { DateField } from '../components/DatePicker'

// Column header with a marker: ✎ you fill in, ƒ calculated.
export function Th({ children, fill, calc, className }) {
  return (
    <th className={cx('text-left text-xs font-bold text-muted uppercase tracking-wide px-2 py-2 whitespace-nowrap bg-page sticky top-0 z-10', className)}>
      <span className="inline-flex items-center gap-1">
        {fill && <Pencil size={10} className="text-lav-fg" />}
        {calc && <FunctionSquare size={10} className="text-faint" />}
        {children}
      </span>
    </th>
  )
}

export function Legend() {
  return (
    <p className="text-xs text-muted inline-flex items-center gap-3">
      <span className="inline-flex items-center gap-1"><Pencil size={10} className="text-lav-fg" /> you fill in</span>
      <span className="inline-flex items-center gap-1"><FunctionSquare size={10} className="text-faint" /> calculated</span>
      <span className="pill bg-butter text-butter-fg py-0 text-[11px]">Example</span><span>kept out of totals</span>
    </p>
  )
}

export function Table({ children, minWidth = 900 }) {
  return (
    <div className="overflow-auto max-h-[60vh] rounded-2xl border border-line">
      <table className="text-sm border-separate border-spacing-0" style={{ minWidth }}>{children}</table>
    </div>
  )
}

export const Td = ({ children, className, calc }) => (
  <td className={cx('px-2 py-1 border-t border-line align-middle whitespace-nowrap', calc && 'text-muted', className)}>{children}</td>
)

const base = 'rounded-lg border border-line bg-card px-2 py-1 text-sm outline-none focus:border-lav-fg/60 focus:ring-2 focus:ring-lav-fg/20 transition'
export const TextIn = ({ value, onChange, className, placeholder }) => (
  <input className={cx(base, 'w-40', className)} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
)
export const NumIn = ({ value, onChange, className, step = 0.5, min = 0 }) => (
  <input type="number" step={step} min={min} className={cx(base, 'w-20 text-right', className)} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
)
export const SelectIn = ({ value, onChange, options, className, allowEmpty }) => (
  <select className={cx(base, 'w-36', className)} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
    {allowEmpty && <option value="">—</option>}
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
)
export const CheckIn = ({ value, onChange }) => (
  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--lav-fg))]" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
)
export const DateIn = ({ value, onChange }) => <DateField value={value} onChange={onChange} className="w-32" placeholder="—" />

// Delete takes two clicks: the bin turns into "Delete?" for a few seconds.
export function RowTools({ example, onDelete }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])
  return (
    <span className="inline-flex items-center gap-1">
      {example && <span className="pill bg-butter text-butter-fg py-0 text-[11px]">Example</span>}
      {armed
        ? <button type="button" onClick={onDelete} className="pill bg-coral text-coral-fg py-0 text-xs">Delete?</button>
        : <button type="button" onClick={() => setArmed(true)} title="Delete row" aria-label="Delete row" className="h-6 w-6 rounded-full inline-flex items-center justify-center text-faint hover:text-coral-fg hover:bg-coral transition"><Trash2 size={12} /></button>}
    </span>
  )
}

export function Section({ title, hint, right, children, className }) {
  return (
    <section className={cx('card p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="h-display text-lg">{title}</h2>
          {hint && <p className="text-sm text-muted mt-0.5 max-w-2xl">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export const STATUS_TONE = { 'On track': 'bg-mint text-mint-fg', 'Below target': 'bg-coral text-coral-fg', Overloaded: 'bg-peach text-peach-fg', 'n/a': 'bg-page text-faint' }
export const DELIVERY_TONE = { 'On time': 'bg-mint text-mint-fg', Late: 'bg-peach text-peach-fg', Overdue: 'bg-coral text-coral-fg', Open: 'bg-sky text-sky-fg' }
export const Pill = ({ tone, children }) => <span className={cx('pill py-0 text-xs', tone)}>{children}</span>
