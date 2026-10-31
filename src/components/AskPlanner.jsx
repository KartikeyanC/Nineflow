import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Info, Loader2, MessageCircleQuestion, Send } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { todayKey, totalMinutes } from '../lib/tasks'
import { askPlanner } from '../lib/aiTasks'
import { Modal, cx } from './ui'

// "Ask NineFlow": questions about your own planner ("what's overdue?", "how many
// hours did I log on Design this week?"). The browser sends a compact copy of
// your tasks with each question; the answer can only use what was sent.

const SUGGESTIONS = [
  "What's overdue?",
  'What should I do first today?',
  'How much time did I log this week?',
  'What did I finish last week?',
]

export function AskPlannerButton() {
  const { setAskOpen } = usePlanner()
  return (
    <button type="button" onClick={() => setAskOpen(true)} data-tip="Ask NineFlow" data-tip-hint="Ask a question about your tasks and time" aria-label="Ask NineFlow"
      className="group h-10 w-full inline-flex items-center justify-center wide:justify-start gap-2.5 rounded-full px-1.5 wide:pr-3 bg-card shadow-soft text-ink transition duration-300 hover:-translate-y-px active:scale-[0.97]">
      <span className="h-7 w-7 rounded-full inline-flex items-center justify-center bg-sky text-sky-fg transition duration-500 group-hover:scale-110"><MessageCircleQuestion size={14} /></span>
      <span className="hidden wide:inline text-[13px] font-semibold">Ask NineFlow</span>
    </button>
  )
}

export default function AskPlanner() {
  const { askOpen: open, setAskOpen, tasks, settings, now } = usePlanner()
  const [messages, setMessages] = useState([]) // [{ role: 'user' | 'assistant', text }]
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const end = useRef(null)
  const close = () => setAskOpen(false)

  useEffect(() => { if (open) { setMessages([]); setText(''); setError(''); setBusy(false) } }, [open])
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [messages, busy])

  // Open work first, then the most recent; the server reads at most 400 lines.
  const compact = useMemo(() => {
    const catName = (id) => settings.categories.find((c) => c.id === id)?.name || ''
    return [...tasks]
      .sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || (b.date || '').localeCompare(a.date || ''))
      .slice(0, 400)
      .map((t) => ({
        id: t.id.slice(-6), title: t.title, date: t.date || '', time: t.startTime || '', min: t.durationMinutes,
        status: t.status, priority: t.priority, category: catName(t.category), spent: Math.round(totalMinutes(t, now)),
        done: t.completedAt ? t.completedAt.slice(0, 10) : '', tags: (t.tags || []).join(','), steps: t.subtasks?.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : '',
      }))
  }, [tasks, settings.categories, now])

  const ask = async (q) => {
    const question = (q ?? text).trim()
    if (!question || busy) return
    setError('')
    setText('')
    const history = messages
    setMessages((m) => [...m, { role: 'user', text: question }])
    setBusy(true)
    try {
      const answer = await askPlanner(question, { today: todayKey(), tasks: compact, history })
      setMessages((m) => [...m, { role: 'assistant', text: answer }])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} width="max-w-xl" title="Ask NineFlow">
      <div className="-mt-1">
        <div className="max-h-[48vh] min-h-[120px] overflow-y-auto space-y-2.5 pr-1" aria-live="polite">
          {messages.length === 0 && (
            <>
              <p className="text-sm text-muted">Ask about your tasks and time. It answers from your planner only: {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} in this workspace.</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="pill h-8 px-3 text-[12px] border border-line bg-card text-muted hover:text-ink hover:border-faint transition">{s}</button>
                ))}
              </div>
            </>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <p className={cx('max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap',
                m.role === 'user' ? 'bg-ink text-page' : 'bg-page border border-line text-ink')}>{m.text}</p>
            </div>
          ))}
          {busy && <p className="inline-flex items-center gap-2 text-[13px] text-muted"><Loader2 size={14} className="animate-spin" /> Looking through your tasks…</p>}
          {error && <p role="alert" className="rounded-xl bg-coral/60 text-coral-fg px-3 py-2 text-[13px] inline-flex items-start gap-2"><Info size={14} className="mt-0.5 shrink-0" /> {error}</p>}
          <div ref={end} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); ask() }} className="mt-3 flex items-center gap-2">
          <input autoFocus className="input flex-1" value={text} maxLength={600} placeholder="Ask about your tasks…" aria-label="Your question"
            onChange={(e) => setText(e.target.value)} disabled={busy} />
          <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className={cx('btn-black h-10 w-10 p-0 shrink-0', (!text.trim() || busy) && 'opacity-40')}><Send size={15} /></button>
        </form>
        <p className="mt-2 text-[11px] text-faint">Your task titles, dates and time logged are sent to Claude with each question. Nothing is stored.</p>
      </div>
    </Modal>
  )
}
