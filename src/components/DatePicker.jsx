import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { format } from '../lib/dateFormat'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, todayKey } from '../lib/tasks'
import { cx } from './ui'
import Popover from './Popover'

// The calendar itself. `value` is yyyy-MM-dd or null.
export function Calendar({ value, onChange, allowClear = true, onClose }) {
  const { settings, now } = usePlanner()
  const selected = value ? parseISO(value) : null
  const [month, setMonth] = useState(() => startOfMonth(selected || now))
  useEffect(() => { if (selected) setMonth(startOfMonth(selected)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const opts = { weekStartsOn: settings.weekStart }
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(month, opts), end: endOfWeek(endOfMonth(month), opts) }),
    [month, settings.weekStart], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const names = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(now, opts), i), 'EEEEE'))

  const pick = (d) => { onChange(dateKey(d)); onClose?.() }

  return (
    <div className="card shadow-lift p-3 animate-menu-in select-none" role="dialog" aria-label="Choose a date">
      <div className="flex items-center justify-between px-1 mb-2">
        <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month"
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink transition"><ChevronLeft size={15} /></button>
        <span className="h-display text-sm">{format(month, 'MMMM yyyy')}</span>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month"
          className="h-7 w-7 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink transition"><ChevronRight size={15} /></button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {names.map((n, i) => <span key={i} className="text-[10px] font-bold text-faint text-center uppercase">{n}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const isSel = selected && isSameDay(d, selected)
          const isToday = isSameDay(d, now)
          const inMonth = isSameMonth(d, month)
          return (
            <button key={dateKey(d)} type="button" onClick={() => pick(d)}
              className={cx('mx-auto h-8 w-8 rounded-full text-xs font-semibold transition',
                isSel ? 'bg-brand text-white shadow-soft' : 'hover:bg-lav hover:text-lav-fg',
                !isSel && isToday && 'text-lav-fg ring-1 ring-inset ring-lav-fg/50',
                !isSel && !isToday && (inMonth ? 'text-ink' : 'text-faint/70'))}>
              {format(d, 'd')}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-line">
        {allowClear ? (
          <button type="button" onClick={() => { onChange(null); onClose?.() }} className="text-xs font-semibold text-muted hover:text-ink px-1">Clear</button>
        ) : <span />}
        <button type="button" onClick={() => pick(now)} className="pill bg-lav text-lav-fg hover:opacity-90 transition">Today</button>
      </div>
    </div>
  )
}

// A trigger + popover calendar. `trigger({ open, toggle, label })` renders the
// anchor; the default is a bordered field with an icon.
export function DateField({ value, onChange, allowClear = true, trigger, align = 'left', placeholder = 'Pick a date', className }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)
  const label = value ? (value === todayKey() ? 'Today' : format(parseISO(value), 'EEE, MMM d')) : placeholder

  return (
    <>
      <span ref={anchorRef} className={cx('inline-block', className)}>
        {trigger ? trigger({ open, toggle, label }) : (
          <FieldButton open={open} onClick={toggle} icon={CalendarDays} empty={!value}>{label}</FieldButton>
        )}
      </span>
      <Popover open={open} onClose={close} anchorRef={anchorRef} align={align} width={292}>
        <Calendar value={value} onChange={onChange} allowClear={allowClear} onClose={close} />
      </Popover>
    </>
  )
}

// Shared bordered trigger used by the date and time fields.
export function FieldButton({ open, onClick, icon: Icon, empty, children }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('flex items-center gap-2 rounded-xl border bg-page px-3 h-10 text-sm font-semibold w-full transition',
        open ? 'border-lav-fg/60 ring-2 ring-lav-fg/20' : 'border-line hover:border-faint')}>
      <Icon size={15} className="text-faint shrink-0" />
      <span className={cx('truncate', empty && 'text-faint font-medium')}>{children}</span>
    </button>
  )
}
