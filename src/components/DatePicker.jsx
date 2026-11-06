import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { format } from '../lib/dateFormat'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey, todayKey } from '../lib/tasks'
import { cx } from './ui'
import Popover from './Popover'

// The calendar itself. `value` is yyyy-MM-dd or null. `min`/`max` (yyyy-MM-dd) grey out the days
// outside them. `range` ({ from, to }, yyyy-MM-dd) shades the days between, for From/To pickers.
export function Calendar({ value, onChange, allowClear = true, onClose, min, max, range }) {
  const { settings, now } = usePlanner()
  const selected = value ? parseISO(value) : null
  const [month, setMonth] = useState(() => startOfMonth(selected || (min && parseISO(min) > now ? parseISO(min) : now)))
  useEffect(() => { if (selected) setMonth(startOfMonth(selected)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const opts = { weekStartsOn: settings.weekStart }
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(month, opts), end: endOfWeek(endOfMonth(month), opts) }),
    [month, settings.weekStart], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const names = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(now, opts), i), 'EEEEE'))

  const allowed = (key) => (!min || key >= min) && (!max || key <= max)
  const pick = (d) => { if (!allowed(dateKey(d))) return; onChange(dateKey(d)); onClose?.() }
  const todayOk = allowed(dateKey(now))
  // The month arrows stop at the months that hold no day you can pick.
  const prevOk = !min || dateKey(addDays(month, -1)) >= min
  const nextOk = !max || dateKey(startOfMonth(addMonths(month, 1))) <= max
  const from = range?.from || null
  const to = range?.to || null

  const arrow = 'h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink transition disabled:opacity-25 disabled:pointer-events-none'
  return (
    <div className="card shadow-lift p-3 animate-menu-in select-none" role="dialog" aria-label="Choose a date">
      <div className="flex items-center justify-between px-1 mb-2">
        <button type="button" disabled={!prevOk} onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month" className={arrow}><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => setMonth(startOfMonth(selected || now))} title="Back to the chosen month"
          className="h-display text-sm px-2 py-1 rounded-full hover:bg-page transition">{format(month, 'MMMM yyyy')}</button>
        <button type="button" disabled={!nextOk} onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month" className={arrow}><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {names.map((n, i) => <span key={i} className="h-6 text-[11px] font-bold text-faint text-center uppercase leading-6">{n}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const key = dateKey(d)
          const isSel = selected && isSameDay(d, selected)
          const isToday = isSameDay(d, now)
          const inMonth = isSameMonth(d, month)
          const ok = allowed(key)
          // From/To shading: a soft band between the two ends, rounded at each end.
          const inRange = from && to && from < to && key >= from && key <= to
          const bandStart = inRange && (key === from || d.getDay() === settings.weekStart)
          const bandEnd = inRange && (key === to || addDays(d, 1).getDay() === settings.weekStart)
          return (
            <div key={key} className={cx('h-9 flex items-center justify-center', inRange && 'bg-lav/60', bandStart && 'rounded-l-full', bandEnd && 'rounded-r-full')}>
              <button type="button" onClick={() => pick(d)} disabled={!ok} aria-label={format(d, 'EEEE d MMMM yyyy')} aria-pressed={!!isSel}
                className={cx('h-8 w-8 rounded-full text-xs font-semibold tnum transition',
                  isSel ? 'bg-brand text-white shadow-soft' : ok && 'hover:bg-lav hover:text-lav-fg',
                  !isSel && isToday && 'text-lav-fg ring-1 ring-inset ring-lav-fg/50',
                  !isSel && !isToday && (inMonth ? 'text-ink' : 'text-faint/70'),
                  !ok && 'opacity-30 line-through decoration-faint/60 cursor-not-allowed')}>
                {format(d, 'd')}
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-line">
        {allowClear ? (
          <button type="button" onClick={() => { onChange(null); onClose?.() }} className="text-xs font-semibold text-muted hover:text-ink px-1">Clear</button>
        ) : <span />}
        <button type="button" disabled={!todayOk} onClick={() => pick(now)} className="pill bg-lav text-lav-fg hover:opacity-90 transition disabled:opacity-30">Today</button>
      </div>
    </div>
  )
}

// The label a date field shows: "Today", "Fri, Nov 6", or with the year when it isn't this one.
export function dateLabel(value) {
  if (!value) return ''
  if (value === todayKey()) return 'Today'
  const d = parseISO(value)
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'EEE, MMM d' : 'EEE, MMM d, yyyy')
}

// A trigger + popover calendar. `trigger({ open, toggle, label })` renders the
// anchor; the default is a bordered field with an icon (`size="sm"` for a slim one).
export function DateField({ value, onChange, allowClear = true, trigger, align = 'left', placeholder = 'Pick a date', className, min, max, range, size, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  const toggle = () => setOpen((o) => !o)
  const label = value ? dateLabel(value) : placeholder

  return (
    <>
      <span ref={anchorRef} className={cx('inline-block', className)}>
        {trigger ? trigger({ open, toggle, label }) : (
          <FieldButton open={open} onClick={toggle} icon={CalendarDays} empty={!value} size={size} ariaLabel={ariaLabel ? `${ariaLabel}: ${label}` : undefined}>{label}</FieldButton>
        )}
      </span>
      <Popover open={open} onClose={close} anchorRef={anchorRef} align={align} width={292}>
        <Calendar value={value} onChange={onChange} allowClear={allowClear} onClose={close} min={min} max={max} range={range} />
      </Popover>
    </>
  )
}

// Shared bordered trigger used by the date and time fields.
export function FieldButton({ open, onClick, icon: Icon, empty, children, size, ariaLabel }) {
  const sm = size === 'sm'
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}
      className={cx('flex items-center rounded-xl border bg-page font-semibold w-full transition',
        sm ? 'gap-1.5 px-2.5 h-8 text-xs' : 'gap-2 px-3 h-10 text-sm',
        open ? 'border-lav-fg/60 ring-2 ring-lav-fg/20' : 'border-line hover:border-faint')}>
      <Icon size={sm ? 13 : 15} className="text-faint shrink-0" />
      <span className={cx('truncate', empty && 'text-faint font-medium')}>{children}</span>
    </button>
  )
}
