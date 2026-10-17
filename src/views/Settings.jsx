import React, { useRef, useState } from 'react'
import { Plus, Trash2, Download, Upload, Sparkles, AlertTriangle, CalendarPlus, CalendarCheck, Check, Loader2, RefreshCw } from 'lucide-react'
import { downloadIcs } from '../lib/calendar'
import { THEMES, themeId } from '../lib/themes'
import { CLIMATES, detectClimate } from '../lib/climate'
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/webPush'
import { reminderSchedule } from '../lib/taskMeta'
import { inboxAddress, inboxAvailable, newInboxKey } from '../lib/emailInbox'
import { connectCalendar, disconnectCalendar, syncNow, syncedEvents, useCalendarOn, useCalendarStatus } from '../features/CalendarSync'
import { CALENDARS_SCOPE, ensureExtraToken, isConfigured } from '../lib/google'
import { currentProfile } from '../lib/profiles'
import ColumnsEditor from '../components/ColumnsEditor'
import { cleanTemplates, cleanViews, critCount } from '../lib/views'
import { listCalendars, loadRange, parseCals, setOtherCalendars, setShowEvents, useCalendarEvents, useOtherCalendarsRaw, useShowEvents } from '../lib/gcalEvents'
import { searchPlaces } from '../lib/weather'
import { exportReportToDoc, exportTasksToSheet } from '../lib/exportGoogle'
import { KINDS, defaultName, guessKind, sendChat } from '../lib/notify'
import ToolConnections from '../features/ToolConnections'
import { feedAvailable, feedUrl, newFeedToken, removeFeed, useFeedStatus } from '../lib/calFeed'
import { COUNTRIES, countryFromBrowser } from '../lib/holidays'
import { format } from 'date-fns'
import AccountSection from '../features/Account'
import InstallApp from '../features/InstallApp'
import { WorkspacesSection } from '../features/Workspaces'
import { usePlanner } from '../store/PlannerContext'
import { COLOR_IDS, colorOf } from '../lib/colors'
import { uid, validateBackup } from '../lib/storage'
import { loadWork } from '../work/workStore'
import { ConfirmDialog, Segmented, cx } from '../components/ui'
import { TimeField } from '../components/TimePicker'

// The things you saved: task templates (from a task's "Save as template") and
// Board views (from Filters → Save view). Rename or delete them here.
function LibrarySection() {
  const { settings, updateSettings } = usePlanner()
  const templates = cleanTemplates(settings.templates)
  const views = cleanViews(settings.views)
  const rename = (key, list, id, name) => { const n = name.trim().slice(0, 30); if (n) updateSettings({ [key]: list.map((x) => (x.id === id ? { ...x, name: n } : x)) }) }
  const remove = (key, list, id) => updateSettings({ [key]: list.filter((x) => x.id !== id) })
  const Item = ({ listKey, list, item, detail }) => (
    <li className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-page">
      <input defaultValue={item.name} maxLength={30} aria-label={`Name of ${item.name}`} onBlur={(e) => rename(listKey, list, item.id, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="bg-transparent outline-none text-sm font-semibold min-w-0 flex-1" />
      <span className="text-[11px] text-faint shrink-0 hidden sm:inline">{detail}</span>
      <button type="button" aria-label={`Delete ${item.name}`} onClick={() => remove(listKey, list, item.id)}
        className="h-7 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-faint hover:bg-coral/60 hover:text-coral-fg transition"><Trash2 size={13} /></button>
    </li>
  )
  return (
    <section className="card p-5">
      <h2 className="h-display text-base mb-1">Templates and saved views</h2>
      <p className="text-sm text-muted mb-4">Save a task as a template from its panel, then start new tasks from it. Save a Board filter as a view from Board → Filters.</p>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-semibold text-muted mb-1.5">Templates · {templates.length}</p>
          {templates.length === 0 ? <p className="text-sm text-faint">None yet.</p> : (
            <ul>{templates.map((t) => <Item key={t.id} listKey="templates" list={templates} item={t} detail={t.steps.length ? `${t.steps.length} steps` : 'No steps'} />)}</ul>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted mb-1.5">Saved views · {views.length}</p>
          {views.length === 0 ? <p className="text-sm text-faint">None yet.</p> : (
            <ul>{views.map((v) => <Item key={v.id} listKey="views" list={views} item={v} detail={`${critCount(v.crit, v.text)} filter${critCount(v.crit, v.text) === 1 ? '' : 's'}`} />)}</ul>
          )}
        </div>
      </div>
    </section>
  )
}

// Connect / status / disconnect for the automatic Google Calendar sync.
function CalendarConnect() {
  const st = useCalendarStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const [removeEvents, setRemoveEvents] = useState(true)
  const on = useCalendarOn()
  const showEvents = useShowEvents()
  const shown = useCalendarEvents()
  if (!isConfigured()) return null

  const connect = async () => {
    setError(null); setBusy(true)
    try { await connectCalendar() } catch (e) { setError(e.message || 'Could not connect Google Calendar.') } finally { setBusy(false) }
  }
  const disconnect = async () => {
    setBusy(true)
    await disconnectCalendar({ removeEvents })
    setBusy(false); setConfirmOff(false)
  }
  const line = {
    syncing: 'Syncing…',
    ok: `Up to date${st.last ? ` · ${format(new Date(st.last), 'p')}` : ''} · ${syncedEvents()} events`,
    idle: 'Connected. Syncing in a moment…',
    'needs-auth': 'Click Reconnect to keep syncing. Google asks again about once an hour.',
    offline: 'No connection. It will retry.',
    error: st.message || 'Could not sync.',
    off: '',
  }[st.state]

  return (
    <div className="mb-5 rounded-2xl border border-line bg-page p-4">
      <p className="text-sm font-semibold inline-flex items-center gap-2"><CalendarCheck size={15} className="text-lav-fg" /> Send my tasks to Google Calendar</p>
      <p className="text-[13px] text-muted mt-1">
        Tasks with a date become events on your primary calendar (all-day if they have no start time), and change or disappear when the task does.
        By default NineFlow only creates and edits its own events.
      </p>
      {!on ? (
        <div className="mt-3">
          <button type="button" className="btn-black" disabled={busy} onClick={connect}>
            {busy ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : <><CalendarCheck size={14} /> Connect Google Calendar</>}
          </button>
        </div>
      ) : confirmOff ? (
        <div role="alert" className="mt-3 rounded-xl bg-card border border-line p-3">
          <p className="text-[13px] font-semibold">Disconnect Google Calendar?</p>
          <label className="mt-2 flex items-start gap-2.5 text-[13px] cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" checked={removeEvents} onChange={(e) => setRemoveEvents(e.target.checked)} />
            Also remove the events NineFlow added to my calendar
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-danger h-8 py-0 px-3" disabled={busy} onClick={disconnect}>{busy ? 'Disconnecting…' : 'Disconnect'}</button>
            <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={() => setConfirmOff(false)}>Keep it</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cx('text-[13px] font-semibold', st.state === 'error' || st.state === 'needs-auth' ? 'text-peach-fg' : 'text-mint-fg')} role="status">{line}</span>
          <span className="flex-1" />
          {st.state === 'needs-auth'
            ? <button type="button" className="btn-black h-8 py-0 px-3" disabled={busy} onClick={connect}>Reconnect</button>
            : <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={st.state === 'syncing'} onClick={syncNow}><RefreshCw size={13} /> Sync now</button>}
          <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={() => setConfirmOff(true)}>Disconnect</button>
        </div>
      )}
      {on && (
        <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Show my calendar events here</p>
            <p className="text-[12px] text-muted">Meetings from your primary calendar appear in Day, Week and Today's schedule, and Plan my day avoids them. Read while NineFlow is open, never saved.{shown.state === 'error' && shown.message ? ` ${shown.message}` : ''}</p>
          </div>
          <Segmented size="sm" value={showEvents ? 'on' : 'off'} onChange={(v) => setShowEvents(v === 'on')} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
        </div>
      )}
      {on && showEvents && <OtherCalendars needsAuth={shown.otherNeedsAuth} />}
      {st.message && !on && <p className="mt-2 text-[12px] text-peach-fg font-semibold">{st.message}</p>}
      {error && <p role="alert" className="mt-2 text-[13px] text-coral-fg font-semibold">{error}</p>}
    </div>
  )
}

// Free, no-account connections: today's weather (Open-Meteo) and public holidays (Nager.Date).
// Both are switched on here and appear on the Dashboard, Week and Month.
function ConnectionsSection({ settings, updateSettings }) {
  const { tasks, now, dashboardDate } = usePlanner()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const place = settings.weather.place
  const onOff = (on, set) => (
    <Segmented size="sm" value={on ? 'on' : 'off'} onChange={(v) => set(v === 'on')} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
  )
  const search = async (e) => {
    e.preventDefault(); setError(null); setSearching(true)
    try { setResults(await searchPlaces(query)) } catch (err) { setError(err.message || 'Could not search places.') } finally { setSearching(false) }
  }
  const pick = (p) => { updateSettings({ weather: { on: true, place: p } }); setResults(null); setQuery('') }
  const country = settings.holidays.country || countryFromBrowser()

  return (
    <section className="card p-5 space-y-5">
      <div>
        <h2 className="h-display text-base mb-1">Connections</h2>
        <p className="text-sm text-muted">Free services that add context to your day. None needs an account, and only the city or country you choose is sent.</p>
      </div>

      <div className="space-y-3">
        <Row label="Weather" hint={place ? `${place.name}${place.region ? `, ${place.region}` : ''}${place.country ? `, ${place.country}` : ''}. Shown under the date on the Dashboard (Open-Meteo).` : 'Today and the week ahead under the date on the Dashboard (Open-Meteo).'}>
          {onOff(settings.weather.on && !!place, (on) => updateSettings({ weather: { ...settings.weather, on } }))}
        </Row>
        <form className="flex flex-wrap items-center gap-2" onSubmit={search}>
          <input className="input max-w-[260px]" placeholder={place ? 'Change city' : 'Search for your city'} aria-label="Search for your city" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className="btn-ghost" disabled={searching || query.trim().length < 2}>{searching ? 'Searching…' : 'Search'}</button>
        </form>
        {results && (results.length ? (
          <ul className="rounded-2xl border border-line divide-y divide-line overflow-hidden max-w-md" aria-label="Matching places">
            {results.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button type="button" className="w-full text-left px-3.5 py-2 text-sm hover:bg-page" onClick={() => pick(p)}>
                  <span className="font-semibold">{p.name}</span><span className="text-muted">{p.region ? `, ${p.region}` : ''}{p.country ? `, ${p.country}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted">No city matches that. Try another spelling.</p>)}
        {error && <p role="alert" className="text-[13px] text-coral-fg font-semibold">{error}</p>}
      </div>

      <div className="space-y-3 pt-4 border-t border-line">
        <Row label="Public holidays" hint="Marked on Week, Month and the Dashboard (Nager.Date). Not every country has data.">
          {onOff(settings.holidays.on, (on) => updateSettings({ holidays: { ...settings.holidays, on } }))}
        </Row>
        {settings.holidays.on && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Country</span>
            <select className="input w-auto max-w-[220px]" value={country} onChange={(e) => updateSettings({ holidays: { ...settings.holidays, country: e.target.value } })}>
              {!COUNTRIES.some(([c]) => c === country) && <option value={country}>{country || 'Choose a country'}</option>}
              {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      <ChatHooks settings={settings} updateSettings={updateSettings} />
      <CalendarLink settings={settings} updateSettings={updateSettings} />
      <ToolConnections />
      {isConfigured() && <GoogleExport tasks={tasks} categories={settings.categories} now={now} dayKey={dashboardDate} />}
    </section>
  )
}

// Chat webhooks (Slack, Discord, Teams, ntfy, Zapier/Make): paste a link, and the day's report can be
// sent there (from the shutdown flow, or automatically). The link works like a password for that channel.
function ChatHooks({ settings, updateSettings }) {
  const { hooks, autoReport } = settings.chat
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [testing, setTesting] = useState('') // hook id being tested
  const [result, setResult] = useState(null) // { id, ok, text }
  const kind = guessKind(url)
  const set = (patch) => updateSettings({ chat: { ...settings.chat, ...patch } })

  const add = (e) => {
    e.preventDefault(); setError(null)
    const link = url.trim()
    if (!kind) { setError("That isn't a link NineFlow can send to. It has to be a webhook link from Slack, Discord, Microsoft Teams, ntfy (ntfy.sh), Zapier or Make."); return }
    if (hooks.length >= 8) { setError('You can connect up to 8 chats. Remove one first.'); return }
    if (hooks.some((h) => h.url === link)) { setError('That link is already connected.'); return }
    set({ hooks: [...hooks, { id: uid(), kind, name: name.trim().slice(0, 40), url: link }] })
    setUrl(''); setName('')
  }
  const test = async (h) => {
    setTesting(h.id); setResult(null)
    try { await sendChat(h, 'NineFlow', 'This is a test message from NineFlow. Your day reports will arrive here.'); setResult({ id: h.id, ok: true, text: 'Sent. Check the channel.' }) }
    catch (err) { setResult({ id: h.id, ok: false, text: err.message }) }
    finally { setTesting('') }
  }

  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <p className="text-sm font-semibold">Send my report to chat</p>
        <p className="text-xs text-muted mt-0.5">Slack, Discord, Microsoft Teams, ntfy, or Zapier and Make. Paste the webhook link from the service. The link works like a password for that channel, so keep it private.</p>
      </div>

      {hooks.length > 0 && (
        <ul className="rounded-2xl border border-line divide-y divide-line overflow-hidden" aria-label="Connected chats">
          {hooks.map((h) => (
            <li key={h.id} className="px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{h.name || KINDS[h.kind].label}{h.name && <span className="text-faint font-medium"> · {KINDS[h.kind].label}</span>}</p>
                {result?.id === h.id && <p role="status" className={cx('text-[12px] font-semibold', result.ok ? 'text-mint-fg' : 'text-coral-fg')}>{result.text}</p>}
              </div>
              <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={!!testing} onClick={() => test(h)}>{testing === h.id ? 'Sending…' : 'Send a test'}</button>
              <button type="button" className="btn-ghost h-8 py-0 px-3" aria-label={`Remove ${h.name || defaultName(h.kind)}`} onClick={() => set({ hooks: hooks.filter((x) => x.id !== h.id) })}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}

      <form className="grid gap-2 max-w-xl" onSubmit={add}>
        <input className="input" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="Paste a webhook link" aria-label="Webhook link" value={url} onChange={(e) => { setUrl(e.target.value); setError(null) }} />
        {url.trim() && (kind
          ? <p className="text-[12px] font-semibold text-mint-fg">That's a {KINDS[kind].label} link.</p>
          : <p className="text-[12px] text-muted">Not recognised yet. Paste the whole link.</p>)}
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[160px] max-w-[260px]" placeholder="Name (optional)" aria-label="Name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn-black" disabled={!url.trim()}><Plus size={14} /> Connect</button>
        </div>
        {kind && <p className="text-[12px] text-muted">{KINDS[kind].help}</p>}
        {error && <p role="alert" className="text-[13px] text-coral-fg font-semibold">{error}</p>}
      </form>

      {hooks.length > 0 && (
        <Row label="Send automatically" hint="When you finish “Shut down”, the day's report goes to every chat above. Off, you send it yourself from the report step.">
          <Segmented size="sm" value={autoReport ? 'on' : 'off'} onChange={(v) => set({ autoReport: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
        </Row>
      )}
    </div>
  )
}

// The calendar subscription link: any calendar app can subscribe to it, and it stays in step with the
// planner (api/feed.js keeps an encrypted copy of the calendar file for it).
function CalendarLink({ settings, updateSettings }) {
  const token = settings.feed.token
  const status = useFeedStatus()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const available = feedAvailable()
  const url = token ? feedUrl(token) : ''

  const create = () => { setError(null); updateSettings({ feed: { token: newFeedToken() } }) }
  const stop = async (next) => {
    setBusy(true); setError(null)
    try { await removeFeed(token) } catch (e) { setError(e.message) }
    updateSettings({ feed: { token: next } }); setBusy(false)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the field is selectable */ }
  }
  const line = status.state === 'saving' ? 'Updating…'
    : status.state === 'error' ? status.message
    : status.state === 'ok' && status.at ? `Up to date · ${format(new Date(status.at), 'p')}`
    : 'Updates a moment after you open the planner.'

  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <p className="text-sm font-semibold">Calendar link for any calendar app</p>
        <p className="text-xs text-muted mt-0.5">A private link that Google Calendar, Outlook or Apple Calendar can subscribe to, so your tasks show up there and stay up to date. Unlike the .ics download, it keeps itself current.</p>
      </div>
      {!available && <p className="text-[13px] text-muted">This needs the NineFlow site. In the desktop app, set VITE_API_BASE to your site's address.</p>}
      {available && !token && <button type="button" className="btn-black" onClick={create}>Create my calendar link</button>}
      {available && token && (
        <div className="space-y-2.5 max-w-xl">
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1 min-w-[220px] text-[12px]" readOnly value={url} aria-label="Your calendar link" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-ghost" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : 'Copy'}</button>
          </div>
          <p role="status" className={cx('text-[12px] font-semibold', status.state === 'error' ? 'text-coral-fg' : 'text-mint-fg')}>{line}</p>
          <ul className="text-[12px] text-muted space-y-1 list-disc pl-4">
            <li><b className="text-ink">Google Calendar:</b> Other calendars (+) → From URL → paste the link. Google refreshes it every few hours.</li>
            <li><b className="text-ink">Outlook:</b> Add calendar → Subscribe from web → paste the link.</li>
            <li><b className="text-ink">Apple Calendar:</b> File → New Calendar Subscription → paste the link.</li>
          </ul>
          <p className="text-[12px] text-peach-fg font-semibold">Anyone with this link can see your task titles and times. Don't share it. If it gets out, make a new link.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy} onClick={() => stop(newFeedToken())}>Make a new link</button>
            <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy} onClick={() => stop('')}>Turn off</button>
          </div>
          {error && <p role="alert" className="text-[13px] text-coral-fg font-semibold">{error}</p>}
        </div>
      )}
    </div>
  )
}

// One-off copies into the person's own Google Drive (Daily Planner folder), as a Google Sheet or Google Doc.
function GoogleExport({ tasks, categories, now, dayKey }) {
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState(null) // { label, url }
  const [error, setError] = useState(null)
  const run = (kind, make) => async () => {
    setError(null); setDone(null); setBusy(kind)
    try {
      const f = await make()
      setDone({ label: f.name, url: f.webViewLink })
    } catch (e) {
      setError(e?.name === 'AuthError' || /expired|connected/i.test(e?.message || '') ? 'Sign in with Google again to export.' : (e?.message || 'Could not export.'))
    } finally { setBusy('') }
  }
  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <p className="text-sm font-semibold">Google Sheets and Docs</p>
        <p className="text-xs text-muted mt-0.5">Copies made in your own Google Drive (Daily Planner folder). They are snapshots, so they don't change when your tasks do.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={!!busy} onClick={run('sheet', () => exportTasksToSheet({ tasks, categories, now }))}>
          {busy === 'sheet' ? <><Loader2 size={14} className="animate-spin" /> Exporting…</> : <><Download size={14} /> All tasks to a Google Sheet</>}
        </button>
        <button type="button" className="btn-ghost" disabled={!!busy} onClick={run('doc', () => exportReportToDoc({ tasks, categories, dayKey, now, name: currentProfile()?.name || '' }))}>
          {busy === 'doc' ? <><Loader2 size={14} className="animate-spin" /> Exporting…</> : <><Download size={14} /> The day's report to a Google Doc</>}
        </button>
      </div>
      {done && <p role="status" className="text-[13px] font-semibold text-mint-fg">Saved “{done.label}”. {done.url && <a href={done.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Open it</a>}</p>}
      {error && <p role="alert" className="text-[13px] text-coral-fg font-semibold">{error}</p>}
    </div>
  )
}

// "Show my other calendars": work, family and shared calendars next to the primary one. Seeing the list of
// calendars is a separate Google permission, asked for here and not before.
function OtherCalendars({ needsAuth }) {
  const chosen = parseCals(useOtherCalendarsRaw())
  const [choices, setChoices] = useState(null) // every calendar except the primary, while the picker is open
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const open = async () => {
    setError(null); setBusy(true)
    try {
      const token = await ensureExtraToken('calendars', CALENDARS_SCOPE)
      const all = (await listCalendars(token)).filter((c) => !c.primary)
      setChoices(all); setPicked(new Set(chosen.map((c) => c.id)))
    } catch (e) { setError(e.message || 'Could not read your calendars.') } finally { setBusy(false) }
  }
  const save = () => {
    setOtherCalendars(choices.filter((c) => picked.has(c.id)).slice(0, 8).map((c) => ({ id: c.id, name: c.name })))
    setChoices(null)
    loadRange(format(new Date(), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd'), { force: true })
  }
  const reconnect = async () => {
    setError(null); setBusy(true)
    try { await ensureExtraToken('calendars', CALENDARS_SCOPE); loadRange(format(new Date(), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd'), { force: true }) }
    catch (e) { setError(e.message || 'Could not reconnect.') } finally { setBusy(false) }
  }

  return (
    <div className="mt-4 pt-3 border-t border-line">
      <p className="text-sm font-semibold">My other calendars</p>
      <p className="text-[12px] text-muted">Work, family or shared calendars, shown with the primary one and avoided by Plan my day. Up to 8.</p>
      {!choices && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy} onClick={open}>{busy ? 'Opening…' : chosen.length ? 'Change calendars' : 'Choose calendars'}</button>
          {chosen.length > 0 && <span className="text-[12px] font-semibold text-mint-fg">{chosen.map((c) => c.name).join(', ')}</span>}
          {chosen.length > 0 && needsAuth && <button type="button" className="btn-black h-8 py-0 px-3" disabled={busy} onClick={reconnect}>Reconnect</button>}
        </div>
      )}
      {choices && (choices.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">You have no other calendars. <button type="button" className="underline underline-offset-2" onClick={() => setChoices(null)}>Close</button></p>
      ) : (
        <div className="mt-2 space-y-2 max-w-md">
          <ul className="rounded-2xl border border-line divide-y divide-line overflow-hidden" aria-label="Your calendars">
            {choices.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 px-3.5 py-2 text-sm cursor-pointer hover:bg-page">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={picked.has(c.id)}
                    onChange={() => setPicked((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} />
                  <span className="truncate">{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" className="btn-black h-8 py-0 px-3" onClick={save}>Save</button>
            <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={() => setChoices(null)}>Cancel</button>
          </div>
        </div>
      ))}
      {error && <p role="alert" className="mt-2 text-[13px] text-coral-fg font-semibold">{error}</p>}
    </div>
  )
}

export default function Settings() {
  const { settings, updateSettings, addCategory, updateCategory, removeCategory, tasks, allTasks, habits, importData, loadSample, clearAll } = usePlanner()
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

  const usage = (id) => allTasks.filter((t) => t.category === id).length

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
        <WorkspacesSection />
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
          <Row label="Reminders" hint="A notification before a timed task starts, and optionally again until you start it.">
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
              {settings.reminders.enabled && (
                <select className="input w-auto min-w-[10rem] py-1.5" value={settings.reminders.repeat || 0} aria-label="Keep reminding"
                  onChange={(e) => updateSettings({ reminders: { ...settings.reminders, repeat: Number(e.target.value) } })}>
                  <option value={0}>Remind once</option>
                  {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{`Keep reminding every ${m} min`}</option>)}
                </select>
              )}
              {notifyNote && <p className="text-xs text-coral-fg font-medium max-w-xs text-right">{notifyNote}</p>}
            </div>
          </Row>
          <ClosedReminders />
          <EmailInbox />
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
          <Row label="Colour theme" hint="Works in light and dark. Changes the page, cards and accent colour.">
            <div className="flex flex-wrap justify-end gap-2" role="radiogroup" aria-label="Colour theme">
              {THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={themeId(settings) === t.id} onClick={() => updateSettings({ palette: t.id })}
                  className={cx('flex items-center gap-2 h-9 rounded-full border pl-1.5 pr-3 text-xs font-semibold transition', themeId(settings) === t.id ? 'border-ink text-ink' : 'border-line text-muted hover:text-ink')}>
                  <span className="h-6 w-6 rounded-full border border-line relative overflow-hidden" style={{ background: t.swatch[0] }}><i className="absolute inset-y-0 right-0 w-1/2" style={{ background: t.swatch[1] }} /></span>
                  {t.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Seasons" hint="The Month banner shows each month's season where you are: its colours and scene.">
            <select className="input w-auto min-w-[14rem] py-1.5" aria-label="Seasons" value={settings.climate || 'auto'}
              onChange={(e) => updateSettings({ climate: e.target.value })}>
              {CLIMATES.map((c) => (
                <option key={c.id} value={c.id}>{c.id === 'auto' ? `Automatic (${CLIMATES.find((x) => x.id === detectClimate()).label})` : c.label}</option>
              ))}
            </select>
          </Row>
          <Row label="Appearance" hint="Light or dark, in any colour theme.">
            <Segmented size="sm" value={settings.theme} onChange={(v) => updateSettings({ theme: v })}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Row>
        </section>

        {/* Board columns */}
        <section className="card p-5">
          <h2 className="h-display text-base mb-1">Board columns</h2>
          <ColumnsEditor />
        </section>

        {/* Templates and saved views */}
        <LibrarySection />

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
          <CalendarConnect />
          <p className="text-sm text-muted mb-4">
            Without connecting, each task has an <b className="text-ink">Add to Google Calendar</b> button that opens the event pre-filled in your own
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

        <ConnectionsSection settings={settings} updateSettings={updateSettings} />

        {/* Danger zone */}
        <section className="rounded-card border border-coral-fg/30 bg-coral/40 p-5">
          <h2 className="h-display text-base text-coral-fg mb-1 inline-flex items-center gap-2"><AlertTriangle size={16} /> Danger zone</h2>
          <p className="text-sm text-muted mb-3">Clearing removes every task, session and habit log. Type <b className="text-ink">DELETE</b> to confirm.</p>
          <div className="flex gap-2">
            <input className="input max-w-[200px] bg-card" placeholder="DELETE" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} />
            <button type="button" disabled={!canDelete} onClick={() => { clearAll(); setDeleteText('') }}
              className={canDelete ? 'btn-danger' : 'btn-black opacity-40'}>
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

// "When NineFlow is closed": the desktop app always does this from the tray; the website
// and the installed web app can turn on push for this device (src/lib/webPush.js).
function ClosedReminders() {
  const { tasks, settings } = usePlanner()
  const [on, setOn] = useState(pushEnabled)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  if (window.nineflowDesktop?.platform === 'android') {
    return (
      <Row label="When NineFlow is closed" hint="Reminders are set on this phone, so they arrive with NineFlow closed. Android may ask you to allow notifications, and “Alarms & reminders” so they arrive on the minute.">
        <span className="text-xs font-semibold text-mint-fg">Always on</span>
      </Row>
    )
  }
  if (window.nineflowDesktop) {
    return (
      <Row label="When NineFlow is closed" hint="The desktop app keeps running in the tray, so reminders still arrive. Right-click the tray icon to start NineFlow when you sign in.">
        <span className="text-xs font-semibold text-mint-fg">Always on</span>
      </Row>
    )
  }
  if (!pushSupported()) return null
  const toggle = async (next) => {
    setNote(null); setBusy(true)
    try {
      if (next) await enablePush(reminderSchedule(tasks, settings, new Date()))
      else await disablePush()
      setOn(next)
    } catch (e) {
      setNote(e.message || 'Could not turn this on.')
      if (next) await disablePush().catch(() => {})
      setOn(false)
    } finally { setBusy(false) }
  }
  return (
    <Row label="When NineFlow is closed" hint="Reminders also arrive with every NineFlow tab closed, on this device. Reminders for the next 24 hours are handed to NineFlow's server (encrypted) when your tasks change. On iPhone and iPad, add NineFlow to the Home Screen first.">
      <div className="flex flex-col items-end gap-1.5">
        <Segmented size="sm" value={on ? 'on' : 'off'} onChange={(v) => !busy && toggle(v === 'on')}
          options={[{ value: 'off', label: 'Off' }, { value: 'on', label: busy ? 'Turning on…' : 'On' }]} />
        {note && <p className="text-xs text-coral-fg font-medium max-w-xs text-right">{note}</p>}
      </div>
    </Row>
  )
}

// "Email to NineFlow": a private address; mail sent there becomes a task (src/lib/emailInbox.js).
function EmailInbox() {
  const { settings, updateSettings } = usePlanner()
  const [copied, setCopied] = useState(false)
  const inbox = settings.inbox || {}
  const [allow, setAllow] = useState((inbox.allowFrom || []).join(', '))
  if (!inboxAvailable()) return null
  const address = inboxAddress(inbox.key)
  const set = (patch) => updateSettings({ inbox: { ...inbox, ...patch } })
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* the address is selectable */ }
  }
  const saveAllow = () => set({ allowFrom: allow.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /.+@.+/.test(x)).slice(0, 10) })
  return (
    <Row label="Email to NineFlow" hint="Forward or send an email to your private address and it becomes a task. The subject is the title and is read like quick add (“tomorrow 3pm !high @admin”); without a day it goes to Someday. The email text goes in the notes.">
      {!address ? (
        <button type="button" className="btn-ghost h-9 py-0" onClick={() => set({ key: newInboxKey(), allowFrom: inbox.allowFrom || [] })}>Get my address</button>
      ) : (
        <div className="flex flex-col items-end gap-2 max-w-full">
          <div className="flex items-center gap-2 max-w-full">
            <code className="text-xs bg-page border border-line rounded-lg px-2 py-1.5 select-all break-all">{address}</code>
            <button type="button" className="btn-ghost h-8 py-0 px-3 text-xs shrink-0" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            Only from
            <input className="input w-56 py-1 text-xs" placeholder="anyone with the address" value={allow}
              onChange={(e) => setAllow(e.target.value)} onBlur={saveAllow} aria-label="Only accept email from these addresses" />
          </label>
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-muted hover:text-ink underline" onClick={() => { if (window.confirm('Get a new address? The old one stops working.')) set({ key: newInboxKey() }) }}>New address</button>
            <button type="button" className="text-muted hover:text-coral-fg underline" onClick={() => set({ key: null })}>Turn off</button>
          </div>
        </div>
      )}
    </Row>
  )
}
