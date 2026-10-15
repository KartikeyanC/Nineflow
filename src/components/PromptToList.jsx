import React, { useEffect, useState } from 'react'
import { ArrowLeft, Info, Loader2, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { usePlanner } from '../store/PlannerContext'
import { fmtMinutes, todayKey } from '../lib/tasks'
import { meetingToTasks, promptToTasks } from '../lib/aiTasks'
import { CheckCircle, Modal, Segmented, cx } from './ui'

// "Prompt to list": write what's on your mind (or paste meeting notes), Claude
// turns it into tasks, and nothing is added until the preview is confirmed.
// One Undo takes it all back.

const EXAMPLES = [
  'Launch the website on Friday: write copy, fix mobile layout, test checkout, announce on social',
  'Move house next month: book movers, pack the kitchen, change address, set up internet',
]
const MODES = [{ value: 'list', label: 'A to-do note' }, { value: 'meeting', label: 'Meeting notes' }]

export function PromptListButton() {
  const { setPromptListOpen } = usePlanner()
  return (
    <button type="button" onClick={() => setPromptListOpen(true)} data-tip="Prompt to list" data-tip-hint="Turn a note or meeting notes into tasks with AI" aria-label="Prompt to list"
      className="group h-10 w-full inline-flex items-center justify-center wide:justify-start gap-2.5 rounded-full pl-1.5 wide:pr-3 bg-card shadow-soft text-ink transition duration-300 hover:-translate-y-px active:scale-[0.97]">
      <span className="h-7 w-7 rounded-full inline-flex items-center justify-center bg-peach text-peach-fg transition duration-500 group-hover:scale-110"><Sparkles size={14} /></span>
      <span className="hidden wide:inline text-[13px] font-semibold">Prompt to list</span>
    </button>
  )
}

export default function PromptToList() {
  const { promptListOpen: open, setPromptListOpen, settings, addTasks, now, setView, setDashboardDate } = usePlanner()
  const [mode, setMode] = useState('list') // 'list' | 'meeting'
  const [text, setText] = useState('')
  const [stage, setStage] = useState('form') // 'form' | 'loading' | 'preview'
  const [items, setItems] = useState([])
  const [meeting, setMeeting] = useState(null) // { title, summary, decisions } in meeting mode
  const [saveNote, setSaveNote] = useState(true)
  const [off, setOff] = useState(() => new Set())
  const [error, setError] = useState('')
  const close = () => setPromptListOpen(false)
  const meetingMode = mode === 'meeting'

  useEffect(() => {
    if (open) { setMode('list'); setText(''); setStage('form'); setItems([]); setMeeting(null); setSaveNote(true); setOff(new Set()); setError('') }
  }, [open])

  const make = async () => {
    if (!text.trim() || stage === 'loading') return
    setError('')
    setStage('loading')
    try {
      const opts = { today: todayKey(), categories: settings.categories }
      if (meetingMode) {
        const r = await meetingToTasks(text.trim(), opts)
        setMeeting({ title: r.title, summary: r.summary, decisions: r.decisions })
        setItems(r.tasks)
      } else {
        setItems(await promptToTasks(text.trim(), opts))
        setMeeting(null)
      }
      setOff(new Set())
      setStage('preview')
    } catch (e) {
      setError(e.message)
      setStage('form')
    }
  }

  const picked = items.filter((_, i) => !off.has(i))
  const toggle = (i) => setOff((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  const writeNote = meetingMode && meeting && saveNote
  const count = picked.length + (writeNote ? 1 : 0)

  const add = () => {
    if (!count) return
    const fallback = settings.categories[0]?.id
    const list = picked.map((t) => ({
      title: t.title, date: t.date || todayKey(), startTime: t.startTime, durationMinutes: t.durationMinutes,
      priority: t.priority, category: t.category || fallback,
    }))
    if (writeNote) {
      // The summary is kept as a finished task, so it sits in the day's log.
      const when = new Date().toISOString()
      const body = [meeting.summary, meeting.decisions.length ? `Decisions:\n${meeting.decisions.map((d) => `- ${d}`).join('\n')}` : ''].filter(Boolean).join('\n\n')
      list.unshift({ title: `Meeting: ${meeting.title}`, description: body, date: todayKey(), startTime: null, durationMinutes: 5, priority: 'low', category: fallback, status: 'completed', completedAt: when })
    }
    addTasks(list, meetingMode ? `Added ${count} ${count === 1 ? 'item' : 'items'} from your meeting` : `Added ${count} ${count === 1 ? 'task' : 'tasks'} from your note`)
    close()
    const first = picked.map((t) => t.date).filter(Boolean).sort()[0]
    if (first) setDashboardDate(first)
    setView('dashboard')
  }

  return (
    <Modal open={open} onClose={close} width="max-w-xl" title={stage === 'preview' ? (meetingMode ? 'From your meeting' : 'Your list') : 'Prompt to list'}>
      {stage !== 'preview' ? (
        <form onSubmit={(e) => { e.preventDefault(); make() }}>
          <Segmented size="sm" value={mode} onChange={(m) => { setMode(m); setText(''); setError('') }} options={MODES} className="mb-3" />
          <p className="text-sm text-muted mb-3">
            {meetingMode
              ? 'Paste meeting notes or a transcript. You get a short summary, the decisions, and the action items as tasks.'
              : "Write what you need to get done, as messy as you like. Mention days or times and they'll be used."}
          </p>
          <textarea autoFocus className={cx('input resize-y leading-relaxed', meetingMode ? 'min-h-[200px]' : 'min-h-[132px]')} value={text} maxLength={meetingMode ? 12000 : 1500} disabled={stage === 'loading'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); make() } }}
            placeholder={meetingMode ? 'Ravi: we agreed to launch on the 24th. Priya will send the revised quote by Friday. I need to book the venue...' : EXAMPLES[0]}
            aria-label={meetingMode ? 'Meeting notes' : 'What do you need to do?'} />
          {!text && !meetingMode && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setText(ex)} className="pill h-7 px-3 text-[11px] border border-line bg-card text-muted hover:text-ink transition max-w-full truncate">{ex}</button>
              ))}
            </div>
          )}
          {meetingMode && text.length > 0 && <p className="mt-1 text-[11px] text-faint tnum">{text.length.toLocaleString()} of 12,000 characters</p>}
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-coral/60 text-coral-fg px-3 py-2 text-[13px] inline-flex items-start gap-2"><Info size={14} className="mt-0.5 shrink-0" /> {error}</p>
          )}
          <div className="flex items-center justify-between mt-5 gap-3">
            <span className="text-xs text-faint">{meetingMode ? 'Your notes are sent to Claude to find the tasks.' : 'Your note is sent to Claude to make the list.'} Nothing is added until you confirm.</span>
            <button type="submit" disabled={text.trim().length < (meetingMode ? 20 : 1) || stage === 'loading'} className={cx('btn-black shrink-0', (text.trim().length < (meetingMode ? 20 : 1) || stage === 'loading') && 'opacity-40')}>
              {stage === 'loading' ? <><Loader2 size={14} className="animate-spin" /> {meetingMode ? 'Reading…' : 'Making your list…'}</> : <>{meetingMode ? 'Find the tasks' : 'Make my list'} <Sparkles size={14} /></>}
            </button>
          </div>
        </form>
      ) : (
        <div>
          {meetingMode && meeting && (
            <div className="mb-4 rounded-2xl bg-page border border-line p-3.5">
              <p className="text-sm font-bold">{meeting.title}</p>
              <p className="mt-1 text-[13px] text-muted leading-relaxed whitespace-pre-line">{meeting.summary}</p>
              {meeting.decisions.length > 0 && (
                <>
                  <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Decisions</p>
                  <ul className="mt-1 space-y-0.5 text-[13px]">{meeting.decisions.map((d, i) => <li key={i} className="flex gap-2"><span className="text-faint">•</span><span>{d}</span></li>)}</ul>
                </>
              )}
              <label className="mt-3 flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={saveNote} onChange={(e) => setSaveNote(e.target.checked)} />
                Also save this summary as a finished task
              </label>
            </div>
          )}
          <p className="text-sm text-muted">
            {items.length === 0 ? 'No action items were found in these notes.' : `${items.length} ${items.length === 1 ? 'task' : 'tasks'}. Untick any you don't want.`}
          </p>
          <ul className="mt-3 max-h-[40vh] overflow-y-auto -mx-1 px-1 space-y-0.5" aria-label="Tasks from your note">
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
            <button type="button" onClick={add} disabled={!count} className={cx('btn-black', !count && 'opacity-40')}>
              Add {count} {count === 1 ? 'item' : 'items'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
