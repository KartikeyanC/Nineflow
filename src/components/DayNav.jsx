import React from 'react'
import { addDays, parseISO, subDays } from 'date-fns'
import { format } from '../lib/dateFormat'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { dateKey } from '../lib/tasks'
import { DateField } from './DatePicker'
import { cx } from './ui'

// Hides a button's wording (its icon and tooltip stay) when the container it sits in is narrower than
// 1200px. The Board's header is that container, so its buttons give up their text before they wrap.
export const NARROW_HIDE = '[@container_(max-width:1199px)]:hidden'

// "‹ Today ›": step the selected day back and forward, or pick any day. "Back to today" appears
// while you are on another day. The Dashboard and the Board share it (and the day it is on).
export default function DayNav({ value, onChange, backLabel = 'Back to today', compact = false, block = false }) {
  const { now } = usePlanner()
  const day = parseISO(value)
  const today = dateKey(now)
  const label = value === today ? 'Today'
    : value === dateKey(addDays(now, 1)) ? 'Tomorrow'
    : value === dateKey(subDays(now, 1)) ? 'Yesterday'
    : format(day, 'EEE, MMM d, yyyy')
  const go = (key) => key && onChange(key)

  return (
    <>
      {value !== today && (
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => go(today)} aria-label="Back to today" data-tip="Back to today">
          {compact && <CalendarCheck size={14} />}
          <span className={compact ? NARROW_HIDE : undefined}>{backLabel}</span>
        </button>
      )}
      <div className={cx('inline-flex items-center rounded-full bg-card border border-line p-1 shadow-soft', block && 'max-sm:flex max-sm:w-full max-sm:justify-between')}>
        <button type="button" aria-label="Previous day" data-tip="Previous day" onClick={() => go(dateKey(subDays(day, 1)))}
          className={cx('h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink transition', block && 'max-sm:h-10 max-sm:w-10')}><ChevronLeft size={16} /></button>
        <DateField value={value} onChange={go} allowClear={false} align="right"
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} data-tip={format(day, 'EEEE, d MMMM yyyy')}
              className={cx('px-3 h-8 rounded-full text-sm font-bold transition min-w-[84px]', block && 'max-sm:flex-1 max-sm:h-10', open ? 'bg-brand text-white' : 'hover:bg-page')}>
              {label}
            </button>
          )} />
        <button type="button" aria-label="Next day" data-tip="Next day" onClick={() => go(dateKey(addDays(day, 1)))}
          className={cx('h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:bg-page hover:text-ink transition', block && 'max-sm:h-10 max-sm:w-10')}><ChevronRight size={16} /></button>
      </div>
    </>
  )
}
