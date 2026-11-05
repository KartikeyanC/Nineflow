import React, { useEffect, useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { Brain, Check, Flame, RotateCcw, StickyNote, X } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { STEPS, cardsInNotes, dueCards, streak, withAnswer } from '../lib/flashcards'
import { dateKey } from '../lib/tasks'
import { showNote } from './Notes'
import { EmptyState, ProgressBar, cx } from '../components/ui'

// Revise: today's flashcards, one at a time. Cards are `question :: answer` lines in Notes.
export default function Revise() {
  const { settings, updateSettings, setView, now } = usePlanner()
  const today = dateKey(now)
  const cards = useMemo(() => cardsInNotes(settings.notes), [settings.notes])
  const revision = settings.revision || { cards: {}, days: {} }

  // The session is fixed when it starts, so answering doesn't reshuffle what's left.
  const [queue, setQueue] = useState(() => dueCards(cards, revision, today).map((c) => c.key))
  const [done, setDone] = useState(0)
  const [shown, setShown] = useState(false)
  const [again, setAgain] = useState(() => new Set()) // forgotten this session: asked once more at the end
  const total = done + queue.length
  const byKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards])
  // A card whose note was edited or deleted mid-session is skipped.
  useEffect(() => { if (queue.length && !byKey.has(queue[0])) setQueue((q) => q.slice(1)) }, [queue, byKey])
  const card = byKey.get(queue[0])

  const restart = () => { setQueue(dueCards(cards, revision, today).map((c) => c.key)); setDone(0); setShown(false); setAgain(new Set()) }

  const answer = (knew) => {
    if (!card) return
    // A card forgotten earlier in this session was already rescheduled; its second try only practises.
    if (!again.has(card.key)) updateSettings((s) => ({ revision: withAnswer(s.revision, card.key, knew, today) }))
    setShown(false)
    if (!knew && !again.has(card.key)) {
      setAgain((a) => new Set(a).add(card.key))
      setQueue((q) => [...q.slice(1), card.key])
    } else {
      setQueue((q) => q.slice(1))
      setDone((d) => d + 1)
    }
  }

  // Space or Enter shows the answer; then 1 = Forgot, 2 = Knew it.
  useEffect(() => {
    const onKey = (e) => {
      if (!card || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || document.querySelector('[role=dialog]')) return
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true) }
      else if (shown && e.key === '1') answer(false)
      else if (shown && e.key === '2') answer(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const recs = revision.cards
  const learned = cards.filter((c) => recs[c.key]).length
  const days = streak(revision.days, today)
  const upcoming = useMemo(() => {
    const later = cards.map((c) => recs[c.key]?.due).filter((d) => d && d > today).sort()
    return later[0] ? { day: later[0], count: later.filter((d) => d === later[0]).length } : null
  }, [cards, recs, today])

  return (
    <div className="flex flex-col gap-4 animate-view-in max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h-display text-3xl max-sm:text-2xl">Revise</h1>
          <p className="text-sm text-muted mt-1">Flashcards from your notes, back again after 1, 3, 7, 21, 45 and 90 days while you remember them.</p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Brain} label="To revise" value={queue.length} hint={done ? `${done} done this session` : "Due today"} />
        <Stat icon={StickyNote} label="Cards" value={cards.length} hint={`${learned} started`} />
        <Stat icon={Flame} label="Streak" value={`${days} day${days === 1 ? '' : 's'}`} hint={revision.days[today] ? `${revision.days[today]} revised today` : 'Nothing revised yet today'} />
      </div>

      {cards.length === 0 ? (
        <div className="card p-6">
          <EmptyState icon={Brain} title="No flashcards yet"
            hint="In any note, write a question and its answer on one line with :: between them, like: First train in India? :: 1853. Each such line is a card."
            action={<button type="button" className="btn-black" onClick={() => setView('notes')}><StickyNote size={14} /> Open Notes</button>} />
        </div>
      ) : card ? (
        <section className="card p-6 max-sm:p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-xs font-semibold text-muted tnum">Card {Math.min(done + 1, total)} of {total}{again.has(card.key) ? ' · once more' : ''}</p>
            <button type="button" className="text-xs font-semibold text-muted hover:text-ink underline underline-offset-2"
              onClick={() => { setView('notes'); showNote(card.noteId) }}>Open its note</button>
          </div>
          <ProgressBar value={total ? done / total : 0} tone="bg-lav-fg" className="mb-6" />
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Question</p>
          <p className="h-display text-2xl max-sm:text-xl mt-1 whitespace-pre-wrap break-words">{card.q}</p>
          {shown ? (
            <>
              <div className="my-5 border-t border-line" />
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Answer</p>
              <p className="text-lg mt-1 whitespace-pre-wrap break-words">{card.a}</p>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost h-12 text-coral-fg" onClick={() => answer(false)}>
                  <X size={16} /> Forgot <span className="kbd ml-1 max-sm:hidden">1</span>
                </button>
                <button type="button" className="btn-black h-12" onClick={() => answer(true)}>
                  <Check size={16} /> Knew it <span className="kbd ml-1 max-sm:hidden text-ink">2</span>
                </button>
              </div>
              <p className="mt-2 text-xs text-faint text-center">{nextHint(recs[card.key], again.has(card.key))}</p>
            </>
          ) : (
            <button type="button" className="btn-black h-12 w-full mt-6" onClick={() => setShown(true)}>
              Show answer <span className="kbd ml-1 max-sm:hidden text-ink">Space</span>
            </button>
          )}
        </section>
      ) : (
        <div className="card p-6">
          <EmptyState icon={Check} title={done ? `Done: ${done} card${done === 1 ? '' : 's'} revised` : 'Nothing to revise today'}
            hint={upcoming ? `Next: ${upcoming.count} card${upcoming.count === 1 ? '' : 's'} on ${format(parseISO(upcoming.day), 'EEEE d MMMM')}.` : 'Add more question :: answer lines to your notes.'}
            action={done ? null : <button type="button" className="btn-ghost" onClick={restart}><RotateCcw size={14} /> Check again</button>} />
        </div>
      )}

      {cards.length > 0 && <CardList cards={cards} recs={recs} today={today} />}
    </div>
  )
}

// What each button will do, so the schedule isn't a mystery.
function nextHint(rec, practising) {
  if (practising) return 'Practice round: this card is already set for tomorrow.'
  const next = STEPS[Math.min((rec?.step ?? -1) + 1, STEPS.length - 1)]
  return `Knew it: back in ${next} day${next === 1 ? '' : 's'} · Forgot: back tomorrow`
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted inline-flex items-center gap-1.5"><Icon size={13} /> {label}</p>
      <p className="h-display text-2xl tnum mt-0.5">{value}</p>
      {hint && <p className="text-xs text-faint mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

function CardList({ cards, recs, today }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="card p-5">
      <button type="button" className="w-full flex items-center justify-between text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <h2 className="h-display text-base">All cards</h2>
        <span className="text-xs font-semibold text-muted">{open ? 'Hide' : `Show ${cards.length}`}</span>
      </button>
      {open && (
        <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted">
              <tr><th className="text-left font-semibold px-3 py-2">Question</th><th className="text-left font-semibold px-3 py-2 max-sm:hidden">Answer</th><th className="text-right font-semibold px-3 py-2">Next</th></tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const r = recs[c.key]
                const due = !r || r.due <= today
                return (
                  <tr key={c.key} className="border-t border-line align-top">
                    <td className="px-3 py-2 break-words">{c.q}</td>
                    <td className="px-3 py-2 text-muted break-words max-sm:hidden">{c.a}</td>
                    <td className={cx('px-3 py-2 text-right whitespace-nowrap tnum', due ? 'text-lav-fg font-semibold' : 'text-muted')}>
                      {!r ? 'New' : due ? 'Today' : format(parseISO(r.due), 'd MMM')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
