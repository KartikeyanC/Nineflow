import React, { useRef, useState } from 'react'
import { Plus, Trash2, Download, Upload, Sparkles, AlertTriangle, CalendarPlus } from 'lucide-react'
import { downloadIcs } from '../lib/calendar'
import AccountSection from '../features/Account'
import InstallApp from '../features/InstallApp'
import { usePlanner } from '../store/PlannerContext'
import { COLOR_IDS, colorOf } from '../lib/colors'
import { validateBackup } from '../lib/storage'
import { loadWork } from '../work/workStore'
import { ConfirmDialog, Segmented, cx } from '../components/ui'
import { TimeField } from '../components/TimePicker'

export default function Settings() {
  const { settings, updateSettings, addCategory, updateCategory, removeCategory, tasks, habits, importData, loadSample, clearAll } = usePlanner()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('lav')
  const [pendingImport, setPendingImport] = useState(null) // parsed backup awaiting confirm
  const [importError, setImportError] = useState(null)
  const [confirmSample, setConfirmSample] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [removeCat, setRemoveCat] = useState(null)
  const [notifyNote, setNotifyNote] = useState(null)
  // Turning reminders on asks the browser for permission (it needs a click).
  const setReminders = async (on) => {
    setNotifyNote(null)
    if (!on) { updateSettings({ reminders: { ...settings.reminders, enabled: false } }); return }
    if (typeof Notification === 'undefined') { setNotifyNote('This browser does not support notifications.'); return }
    let perm = Notification.permission
    if (perm === 'default') { try { perm = await Notification.requestPermission() } catch { perm = 'denied' } }
    if (perm !== 'granted') { setNotifyNote('Notifications are blocked for this site. Allow them in the browser\'s site settings, then try again.'); return }
    updateSettings({ reminders: { ...settings.reminders, enabled: true } })
  }
  const fileRef = useRef(null)

  const usage = (id) => tasks.filter((t) => t.category === id).length

  const submitCategory = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    addCategory(newName.trim(), newColor)
    setNewName('')
  }

  const exportData = () => {
    // One file holds everything, Work OS included (it used to need its own backup).
    const payload = { app: 'daily-planner', version: 2, exportedAt: new Date().toISOString(), tasks, settings, habits, work: loadWork() }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `daily-planner-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const pickFile = async (file) => {
    if (!file) return
    setImportError(null)
    try {
      const data = JSON.parse(await file.text())
      const err = validateBackup(data)
      if (err) setImportError(err)
      else setPendingImport(data)
    } catch {
      setImportError('That file is not valid JSON.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const canDelete = deleteText === 'DELETE'

  return (
    <div className="animate-view-in max-w-3xl">
      <header className="mb-6">
        <h1 className="h-display text-3xl">Settings</h1>
        <p className="text-sm text-muted mt-1">Make the planner yours. Everything is saved instantly in this browser.</p>
      </header>

      <div className="space-y-4">
        <AccountSection />
        <InstallApp />
        {/* Categories */}
        <section className="card p-5">
          <h2 className="h-display text-base mb-1">Categories</h2>
          <p className="text-sm text-muted mb-4">Rename, recolour or remove. A category in use warns before it goes.</p>
          <ul className="space-y-2.5">
            {settings.categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <input className="input flex-1" value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })} />
                <Swatches value={c.color} onChange={(color) => updateCategory(c.id, { color })} />
                <button type="button" onClick={() => setRemoveCat(c)} disabled={settings.categories.length <= 1} title="Remove"
                  className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted hover:text-coral-fg hover:bg-coral/60 transition disabled:opacity-30">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={submitCategory} className="flex items-center gap-3 mt-4 pt-4 border-t border-line">
            <input className="input flex-1" placeholder="New category" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Swatches value={newColor} onChange={setNewColor} />
            <button type="submit" className="btn-black h-9 py-0" disabled={!newName.trim()}><Plus size={14} /> Add</button>
          </form>
        </section>

        {/* Preferences */}
        <section className="card p-5 space-y-5">
          <Row label="Week starts on" hint="Used by the Week and Month screens.">
            <Segmented size="sm" value={settings.weekStart} onChange={(v) => updateSettings({ weekStart: v })}
              options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]} />
          </Row>
          <Row label="Working hours" hint="Your daily capacity and “Plan my day” use these. The break is subtracted from the day.">
            <div className="flex flex-wrap items-end gap-2">
              {[['start', 'Start'], ['end', 'End']].map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-faint">{label}</span>
                  <TimeField value={settings.workHours[k]} allowClear={false} className="w-28"
                    onChange={(v) => v && updateSettings({ workHours: { ...settings.workHours, [k]: v } })} />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-faint">Break (min)</span>
                <input type="number" min={0} max={240} step={15} className="input w-20 text-center py-1.5"
                  value={settings.workHours.breakMinutes}
                  onChange={(e) => updateSettings({ workHours: { ...settings.workHours, breakMinutes: Math.max(0, Math.min(240, Number(e.target.value) || 0)) } })} />
              </label>
            </div>
          </Row>
          <Row label="Reminders" hint="A browser notification before a timed task starts. Works while the planner is open in a tab.">
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                {settings.reminders.enabled && (
                  <select className="input w-auto min-w-[10rem] py-1.5" value={settings.reminders.minutes} aria-label="Minutes before"
                    onChange={(e) => updateSettings({ reminders: { ...settings.reminders, minutes: Number(e.target.value) } })}>
                    {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m ? `${m} min before` : 'At start time'}</option>)}
                  </select>
                )}
                <Segmented size="sm" value={settings.reminders.enabled ? 'on' : 'off'} onChange={(v) => setReminders(v === 'on')}
                  options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
              </div>
              {notifyNote && <p className="text-xs text-coral-fg font-medium max-w-xs text-right">{notifyNote}</p>}
            </div>
          </Row>
          <Row label="Heatmap workload" hint="How the Month screen tints each day.">
            <Segmented size="sm" value={settings.heatmapMeasure} onChange={(v) => updateSettings({ heatmapMeasure: v })}
              options={[{ value: 'hours', label: 'Hours' }, { value: 'count', label: 'Task count' }]} />
          </Row>
          <Row label="Quick list" hint="A compact to-do list for today, docked to the edge you choose. On phones it opens as a bottom sheet.">
            <Segmented size="sm" value={settings.quickList.position}
              onChange={(v) => updateSettings({ quickList: { ...settings.quickList, position: v, collapsed: false } })}
              options={[{ value: 'off', label: 'Off' }, { value: 'right', label: 'Right' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} />
          </Row>
          <Row label="Pomodoro" hint="Focus / short break / long break, in minutes, and how many focus blocks before a long break.">
            <div className="flex items-center gap-1.5">
              {[['focus', 'Focus'], ['short', 'Short'], ['long', 'Long'], ['every', 'Every']].map(([k, label]) => (
                <label key={k} className="flex flex-col items-center gap-1">
                  <input type="number" min={1} max={k === 'every' ? 12 : 180} className="input w-16 text-center py-1.5"
                    value={settings.pomodoro[k]}
                    onChange={(e) => updateSettings({ pomodoro: { ...settings.pomodoro, [k]: Math.max(1, Number(e.target.value) || 1) } })} />
                  <span className="text-[10px] font-semibold text-faint">{label}</span>
                </label>
              ))}
            </div>
          </Row>
          <Row label="Work OS tab" hint="The full workflow system: task log, social calendar, ad tracker, reports.">
            <Segmented size="sm" value={settings.modules?.work ? 'on' : 'off'} onChange={(v) => updateSettings({ modules: { ...settings.modules, work: v === 'on' } })}
              options={[{ value: 'on', label: 'Shown' }, { value: 'off', label: 'Hidden' }]} />
          </Row>
          <Row label="Appearance" hint="Dark mode is one class toggle away.">
            <Segmented size="sm" value={settings.theme} onChange={(v) => updateSettings({ theme: v })}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Row>
        </section>

        {/* Data */}
        <section className="card p-5">
          <h2 className="h-display text-base mb-1">Your data</h2>
          <p className="text-sm text-muted mb-4">{tasks.length} tasks and {habits.length} habits, saved on this device and in your Google Drive. The backup file also includes your Work OS data.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={exportData}><Download size={14} /> Export JSON</button>
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import JSON</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            <button type="button" className="btn-ghost" onClick={() => setConfirmSample(true)}><Sparkles size={14} /> Load sample data</button>
          </div>
          {importError && <p className="mt-3 text-sm text-coral-fg font-medium">{importError}</p>}
        </section>

        {/* Calendar */}
        <section className="card p-5">
          <h2 className="h-display text-base mb-1">Google Calendar</h2>
          <p className="text-sm text-muted mb-4">
            No sign-in needed. Each task has an <b className="text-ink">Add to Google Calendar</b> button that opens the event pre-filled in your own
            Google account; the .ics file imports everything at once (Google Calendar → Settings → Import &amp; export). Recurring series import with their repeat rule.
          </p>
          <Row label="Offer after adding" hint="Show a small “Add to Google Calendar” link each time you add a task.">
            <Segmented size="sm" value={settings.calendar.promptOnAdd ? 'on' : 'off'}
              onChange={(v) => updateSettings({ calendar: { ...settings.calendar, promptOnAdd: v === 'on' } })}
              options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          </Row>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" className="btn-ghost" onClick={() => downloadIcs(tasks, settings.categories)}><CalendarPlus size={14} /> Download .ics for Google Calendar</button>
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-card border border-coral-fg/30 bg-coral/40 p-5">
          <h2 className="h-display text-base text-coral-fg mb-1 inline-flex items-center gap-2"><AlertTriangle size={16} /> Danger zone</h2>
          <p className="text-sm text-muted mb-3">Clearing removes every task, session and habit log. Type <b className="text-ink">DELETE</b> to confirm.</p>
          <div className="flex gap-2">
            <input className="input max-w-[200px] bg-card" placeholder="DELETE" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} />
            <button type="button" disabled={!canDelete} onClick={() => { clearAll(); setDeleteText('') }}
              className={cx('btn-black', canDelete ? 'bg-coral-fg' : 'opacity-40')}>
              Clear all data
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog open={!!pendingImport} onClose={() => setPendingImport(null)}
        onConfirm={() => importData(pendingImport)} confirmLabel="Replace"
        title="Replace everything with this backup?"
        body={pendingImport ? `It holds ${pendingImport.tasks.length} tasks${Array.isArray(pendingImport.habits) ? ` and ${pendingImport.habits.length} habits` : ''}${pendingImport.work ? ', plus Work OS data' : ''}. Your current data will be overwritten.` : ''} />

      <ConfirmDialog open={confirmSample} onClose={() => setConfirmSample(false)}
        onConfirm={loadSample} confirmLabel="Load sample" danger={false}
        title="Load sample data?"
        body="This replaces your current tasks and habits with about six weeks of generated activity around today." />

      <ConfirmDialog open={!!removeCat} onClose={() => setRemoveCat(null)}
        onConfirm={() => removeCategory(removeCat.id)} confirmLabel="Remove"
        title={`Remove "${removeCat?.name}"?`}
        body={removeCat && usage(removeCat.id)
          ? `${usage(removeCat.id)} task${usage(removeCat.id) === 1 ? '' : 's'} use this category. They will move to "${settings.categories.find((c) => c.id !== removeCat.id)?.name}".`
          : 'No tasks use this category.'} />
    </div>
  )
}

// Local profile: edit details, switch, sign out, delete.

function Row({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Swatches({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {COLOR_IDS.map((id) => {
        const c = colorOf(id)
        return (
          <button key={id} type="button" title={c.label} onClick={() => onChange(id)}
            className={cx('h-6 w-6 rounded-full border-2 flex items-center justify-center transition', c.bg,
              value === id ? 'border-ink scale-110' : 'border-transparent hover:scale-105')}>
            <span className={cx('h-2 w-2 rounded-full', c.dot)} />
          </button>
        )
      })}
    </div>
  )
}
