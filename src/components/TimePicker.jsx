import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { fmtTime } from '../lib/tasks'
import { cx } from './ui'
import Popover from './Popover'
import { FieldButton } from './DatePicker'

// 15-minute slots across the whole day; the list scrolls to the selection
// (or 09:00) when it opens.
const SLOTS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${['00', '15', '30', '45'][i % 4]}`)
const ROW_H = 32

export function TimeList({ value, onChange, allowClear = true, onClose }) {
  const listRef = useRef(null)
  useEffect(() => {
    const idx = SLOTS.indexOf(value || '09:00')
    if (listRef.current && idx >= 0) listRef.current.scrollTop = Math.max(0, idx * ROW_H - ROW_H * 2)
  }, [value])
  const pick = (t) => { onChange(t); onClose?.() }

  return (
    <div className="card shadow-lift p-1.5 animate-menu-in select-none" role="dialog" aria-label="Choose a time">
      <div ref={listRef} className="max-h-[232px] overflow-y-auto pr-0.5">
        {SLOTS.map((t) => {
          const sel = t === value
          const onHour = t.endsWith(':00')
          return (
            <button key={t} type="button" onClick={() => pick(t)} style={{ height: ROW_H }}
              className={cx('w-full flex items-center justify-between rounded-lg px-2.5 text-xs transition',
                sel ? 'bg-ink text-page font-bold' : 'hover:bg-lav hover:text-lav-fg',
                !sel && (onHour ? 'font-bold text-ink' : 'font-medium text-muted'))}>
              <span>{t}</span>
              <span className={cx('text-[10px]', sel ? 'text-page/70' : 'text-faint')}>{fmtTime(t)}</span>
            </button>
          )
        })}
      </div>
      {allowClear && (
        <div className="mt-1.5 pt-1.5 border-t border-line flex justify-between items-center px-1">
          <button type="button" onClick={() => { onChange(null); onClose?.() }} className="text-xs font-semibold text-muted hover:text-ink">Clear</button>
          <span className="text-[10px] text-faint">15-min steps</span>
        </div>
      )}
    </div>
  )
}

export function TimeField({ value, onChange, allowClear = true, trigger, align = 'left', placeholder = 'No time', className }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)
  const label = value || placeholder

  return (
    <>
      <span ref={anchorRef} className={cx('inline-block', className)}>
        {trigger ? trigger({ open, toggle, label }) : (
          <FieldButton open={open} onClick={toggle} icon={Clock} empty={!value}>{label}</FieldButton>
        )}
      </span>
      <Popover open={open} onClose={close} anchorRef={anchorRef} align={align} width={176}>
        <TimeList value={value} onChange={onChange} allowClear={allowClear} onClose={close} />
      </Popover>
    </>
  )
}
