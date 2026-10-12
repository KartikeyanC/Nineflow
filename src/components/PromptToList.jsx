import React, { useEffect, useState } from 'react'
import { ArrowLeft, Info, Loader2, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { usePlanner } from '../store/PlannerContext'
import { fmtMinutes, todayKey } from '../lib/tasks'
import { promptToTasks } from '../lib/aiTasks'
import { CheckCircle, Modal, cx } from './ui'

// "Prompt to list": write what's on your mind, Claude turns it into tasks, and
// nothing is added until the preview is confirmed. One Undo takes it all back.

const EXAMPLES = [
  'Launch the website on Friday: write copy, fix mobile layout, test checkout, announce on social',
  'Move house next month: book movers, pack the kitchen, change address, set up internet',
]

export function PromptListButton() {
  const { setPromptListOpen } = usePlanner()
  return (
    <button type="button" onClick={() => setPromptListOpen(true)} title="Turn a note into a to-do list with AI"
      className="group mt-2 h-10 w-full inline-flex items-center justify-center lg:justify-start gap-2.5 rounded-full pl-1.5 lg:pr-3 bg-card shadow-soft text-ink transition duration-300 hover:-translate-y-px active:scale-[0.97]">
      <span className="h-7 w-7 rounded-full inline-flex items-center justify-center bg-peach text-peach-fg transition duration-500 group-hover:scale-110"><Sparkles size={14} /></span>
      <span className="hidden lg:inline text-[13px] font-semibold">Prompt to list</span>
    </button>
  )
}

export default function PromptToList() {
  const { promptListOpen: open, setPromptListOpen, settings, addTasks, now, setView, setDashboardDate } = usePlanner()
  const [text, setText] = useState('')
  const [stage, setStage] = useState('form') // 'form' | 'loading' | 'preview'
  const [items, setItems] = useState([])
  const [off, setOff] = useState(() => new Set())
  const [error, setError] = useState('')
  const close = () => setPromptListOpen(false)

  useEffect(() => {
    if (open) { setText(''); setStage('form'); setItems([]); setOff(new Set()); setError('') }
  }, [open])

  const make = async () => {
    if (!text.trim() || stage === 'loading') return
    setError('')
    setStage('loading')
    try {
      const list = await promptToTasks(text.trim(), { today: todayKey(), categories: settings.categories })
      setItems(list)
      setOff(new Set())
      setStage('preview')
    } catch (e) {
      setError(e.message)
      setStage('form')
    }
  }

  const picked = items.filter((_, i) => !off.has(i))
  const toggle = (i) => setOff((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const add = () => {
    if (!picked.length) return
    const fallback = settings.categories[0]?.id
    addTasks(picked.map((t) => ({
      title: t.title, date: t.date || todayKey(), startTime: t.startTime, durationMinutes: t.durationMinutes,
      priority: t.priority, category: t.category || fallback,
    })), `Added ${picked.length} ${picked.length === 1 ? 'task' : 'tasks'} from your note`)
    close()
    const first = picked.map((t) => t.date).filter(Boolean).sort()[0]
    if (first) setDashboardDate(first)
    setView('dashboard')
  }

  return (
    <Modal open={open} onClose={close} width="max-w-xl" title={stage === 'preview' ? 'Your list' : 'Prompt to list'}>
      {stage !== 'preview' ? (
        <form onSubmit={(e) => { e.preventDefault(); make() }}>
          <p className="text-sm text-muted -mt-1 mb-3">Write what you need to get done, as messy as you like. Mention days or times and they'll be used.</p>
          <textarea autoFocus className="input min-h-[132px] resize-y leading-relaxed" value={text} maxLength={1500} disabled={stage === 'loading'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); make() } }}
            placeholder={EXAMPLES[0]} aria-label="What do you need to do?" />
          {!text && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setText(ex)} className="pill h-7 px-3 text-[11px] border border-line bg-card text-muted hover:text-ink transition max-w-full truncate">{ex}</button>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-coral/60 text-coral-fg px-3 py-2 text-[13px] inline-flex items-start gap-2"><Info size={14} className="mt-0.5 shrink-0" /> {error}</p>
          )}
          <div className="flex items-center justify-between mt-5">
            <span className="text-xs text-faint">Your note is sent to Claude to make the list. Nothing is added until you confirm.</span>
            <button type="submit" disabled={!text.trim() || stage === 'loading'} className={cx('btn-black shrink-0', (!text.trim() || stage === 'loading') && 'opacity-40')}>
              {stage === 'loading' ? <><Loader2 size={14} className="animate-spin" /> Making your list…</> : <>Make my list <Sparkles size={14} /></>}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p className="text-sm text-muted">{items.length} {items.length === 1 ? 'task' : 'tasks'}. Untick any you don't want.</p>
          <ul className="mt-3 max-h-[46vh] overflow-y-auto -mx-1 px-1 space-y-0.5" aria-label="Tasks from your note">
            {items.map((t, i) => {
              const on = !off.has(i)
              const cat = settings.categories.find((c) => c.id === t.category)
              return (
                <li key={i} className={cx('flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-page', !on && 'opacity-45')}>
                  <CheckCircle checked={on} onToggle={() => toggle(i)} size="sm" />
                  <span className="w-[4.5rem] shrink-0 text-[12px] font-semibold tnum text-muted">{t.date ? format(parseISO(t.date), 'EEE d MMM') : 'Today'}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-[13px] font-semibold truncate', !on && 'line-through')} title={t.title}>{t.title}</span>
                    <span className="block text-[10px] font-semibold text-faint">{[cat?.name, t.priority === 'high' && 'High priority'].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-faint tnum">{t.startTime ? `${t.startTime} · ` : ''}{fmtMinutes(t.durationMinutes)}</span>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-between mt-6">
            <button type="button" onClick={() => setStage('form')} className="btn-ghost"><ArrowLeft size={14} /> Change</button>
            <button type="button" onClick={add} disabled={!picked.length} className={cx('btn-black', !picked.length && 'opacity-40')}>
              Add {picked.length} {picked.length === 1 ? 'task' : 'tasks'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
