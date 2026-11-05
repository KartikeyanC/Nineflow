import React, { useState } from 'react'
import { parseISO } from 'date-fns'
import { format } from '../lib/dateFormat'
import { Check, Download, Loader2, Send } from 'lucide-react'
import { usePlanner } from '../store/PlannerContext'
import { patchConn, setConn, useConnections, wasSent } from '../lib/connections'
import { testGithub, testTodoist, testTrello } from '../lib/importers'
import { pending, sendToClockify, sendToToggl, sessionsForDay, testClockify, testToggl } from '../lib/timeSync'
import { databaseIdFrom, sendTasksToNotion, testNotion } from '../lib/notion'
import { findChat, testTelegram } from '../lib/telegram'
import { TASKS_SCOPE, ensureExtraToken, isConfigured, rememberedAccount } from '../lib/google'
import { sendTasksToGoogleTasks, testGoogleTasks } from '../lib/gtasks'
import { connectMicrosoft, microsoftAvailable, sendTasksToOutlook } from '../lib/microsoft'
import { fmtMinutes, tasksOn } from '../lib/tasks'
import ImportDialog from '../components/ImportDialog'
import { Segmented, cx } from '../components/ui'
import HowToConnect from '../components/HowToConnect'

// Settings → Connections → "Your tools": the services that need the person's own token. The token is
// checked with the service before it is saved, and is saved on this device only (lib/connections.js).
const SERVICES = [
  {
    // Signs in with Google (no token to paste): the "tasks" permission is asked for here, not at sign-in.
    id: 'gtasks', label: 'Google Tasks', blurb: 'Import your open tasks, or send a day’s tasks to your list.', google: true, fields: [],
    connect: async () => { await ensureExtraToken('tasks', TASKS_SCOPE); return { conn: {}, label: await testGoogleTasks() } },
  },
  {
    // Microsoft's own sign-in window (no token to paste). Web only, and needs the site's Azure app (lib/microsoft.js).
    id: 'microsoft', label: 'Microsoft Outlook and To Do', blurb: 'Import your To Do tasks, or send a day’s tasks to your Outlook calendar.', microsoft: true, fields: [],
    connect: connectMicrosoft,
  },
  {
    id: 'todoist', label: 'Todoist', blurb: 'Import your open tasks.',
    fields: [{ key: 'token', label: 'API token' }],
    help: 'In Todoist: Settings → Integrations → Developer → copy your API token.',
    connect: async (v) => ({ conn: { token: v.token }, label: await testTodoist(v.token) }),
  },
  {
    id: 'trello', label: 'Trello', blurb: 'Import the cards assigned to you.',
    fields: [{ key: 'key', label: 'API key' }, { key: 'token', label: 'Token' }],
    help: 'Open trello.com/app-key for your API key, then follow its “Token” link to allow read access and copy the token.',
    connect: async (v) => ({ conn: { key: v.key, token: v.token }, label: await testTrello(v) }),
  },
  {
    id: 'github', label: 'GitHub', blurb: 'Import issues and pull requests assigned to you.',
    fields: [{ key: 'token', label: 'Personal access token' }],
    help: 'In GitHub: Settings → Developer settings → Personal access tokens. Give it read access to issues (and “repo” for private ones).',
    connect: async (v) => ({ conn: { token: v.token }, label: await testGithub(v.token) }),
  },
  {
    id: 'clockify', label: 'Clockify', blurb: 'Send your finished focus time as time entries.',
    fields: [{ key: 'key', label: 'API key' }],
    help: 'In Clockify: profile picture → Preferences → Advanced → Generate API key.',
    connect: async (v) => ({ conn: { key: v.key }, label: await testClockify(v) }),
  },
  {
    id: 'toggl', label: 'Toggl Track', blurb: 'Send your finished focus time as time entries.',
    fields: [{ key: 'token', label: 'API token' }],
    help: 'In Toggl Track: Profile settings → scroll to “API token”. Toggl blocks direct web requests, so this one passes through the NineFlow server for each send. It is not stored or logged.',
    connect: async (v) => ({ conn: { token: v.token }, label: await testToggl(v) }),
  },
  {
    id: 'notion', label: 'Notion', blurb: 'Send a day’s tasks to a Notion database.',
    fields: [{ key: 'token', label: 'Integration secret' }, { key: 'db', label: 'Database link', plain: true }],
    help: 'At notion.so/profile/integrations make an internal integration and copy its secret. Then open your database, choose ••• → Connections, add the integration, and paste the database’s link here.',
    connect: async (v) => {
      const databaseId = databaseIdFrom(v.db)
      if (!databaseId) throw new Error('That doesn’t look like a Notion database link. Open the database and copy its link.')
      return { conn: { token: v.token, databaseId }, label: await testNotion({ token: v.token, databaseId }) }
    },
  },
  {
    id: 'telegram', label: 'Telegram', blurb: 'Get your report in Telegram, and add tasks by messaging your bot.',
    fields: [{ key: 'token', label: 'Bot token' }],
    help: 'In Telegram, message @BotFather, send /newbot, and copy the token it gives you. Then send your new bot any message and press “Find my chat” here.',
    connect: async (v) => ({ conn: { token: v.token }, label: await testTelegram(v) }),
  },
]

export default function ToolConnections() {
  const conns = useConnections()
  // Google's own services need a Google sign-in (not an email account) and the site's Google client set up.
  const googleOk = isConfigured() && rememberedAccount()?.provider !== 'email'
  const shown = SERVICES.filter((s) => (!s.google || googleOk) && (!s.microsoft || microsoftAvailable()))
  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <p className="text-sm font-semibold">Your tools</p>
        <p className="text-xs text-muted mt-0.5">Connect with your own token. It is checked, then saved on this device only. It does not sync to your other devices or your Drive, so enter it again where you want it.</p>
      </div>
      <ul className="rounded-2xl border border-line divide-y divide-line" aria-label="Tools">
        {shown.map((s) => <li key={s.id}><Tool svc={s} conn={conns[s.id] || null} /></li>)}
      </ul>
    </div>
  )
}

function Tool({ svc, conn }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState(null) // { ok, text }
  const [importing, setImporting] = useState(false)

  const ready = svc.fields.every((f) => (values[f.key] || '').trim())
  const connect = async (e) => {
    e?.preventDefault(); setNote(null); setBusy('connect')
    try {
      const clean = Object.fromEntries(svc.fields.map((f) => [f.key, (values[f.key] || '').trim()]))
      const { conn: saved, label } = await svc.connect(clean)
      setConn(svc.id, { ...saved, label })
      setValues({}); setOpen(false)
    } catch (err) { setNote({ ok: false, text: err.message || 'Could not connect.' }) } finally { setBusy('') }
  }
  const disconnect = () => { setConn(svc.id, null); setNote(null); setOpen(false) }

  return (
    <div className="px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{svc.label} {conn && <span className="text-mint-fg font-semibold inline-flex items-center gap-1"><Check size={12} aria-hidden="true" />{conn.label}</span>}</p>
          <p className="text-xs text-muted">{svc.blurb}</p>
        </div>
        {conn
          ? <button type="button" className="btn-ghost h-8 py-0 px-3" aria-label={`Disconnect ${svc.label}`} onClick={disconnect}>Disconnect</button>
          : svc.fields.length === 0
            ? <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={!!busy} onClick={() => connect()}>{busy === 'connect' ? <><Loader2 size={13} className="animate-spin" /> Connecting…</> : svc.microsoft ? 'Connect with Microsoft' : 'Connect with Google'}</button>
            : <button type="button" className="btn-ghost h-8 py-0 px-3" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Cancel' : 'Connect'}</button>}
      </div>

      {!conn && <HowToConnect ids={svc.id} className="mt-1.5" />}
      {!conn && open && (
        <form className="mt-3 grid gap-2 max-w-md" onSubmit={connect}>
          {svc.fields.map((f) => (
            <label key={f.key} className="grid gap-1">
              <span className="text-[12px] font-semibold text-muted">{f.label}</span>
              <input className="input" type={f.plain ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={values[f.key] || ''}
                onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value })); setNote(null) }} />
            </label>
          ))}
          <p className="text-[12px] text-muted">{svc.help}</p>
          <div><button type="submit" className="btn-black" disabled={!ready || !!busy}>{busy === 'connect' ? <><Loader2 size={14} className="animate-spin" /> Checking…</> : 'Connect'}</button></div>
        </form>
      )}

      {conn && ['todoist', 'trello', 'github', 'gtasks', 'microsoft'].includes(svc.id) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className="btn-ghost h-8 py-0 px-3" onClick={async () => {
            setNote(null)
            if (svc.google) { try { await ensureExtraToken('tasks', TASKS_SCOPE) } catch (e) { setNote({ ok: false, text: e.message }); return } }
            setImporting(true)
          }}><Download size={13} /> Import from {svc.microsoft ? 'Microsoft To Do' : svc.label}…</button>
        </div>
      )}
      {conn && svc.id === 'gtasks' && <GoogleTasksSend setNote={setNote} />}
      {conn && svc.id === 'microsoft' && <OutlookSend setNote={setNote} />}
      {conn && ['clockify', 'toggl'].includes(svc.id) && <TimeSend svc={svc} conn={conn} setNote={setNote} />}
      {conn && svc.id === 'notion' && <NotionSend conn={conn} setNote={setNote} />}
      {conn && svc.id === 'telegram' && <TelegramSetup conn={conn} setNote={setNote} />}

      {note && <p role={note.ok ? 'status' : 'alert'} className={cx('mt-2 text-[13px] font-semibold', note.ok ? 'text-mint-fg' : 'text-coral-fg')}>{note.text}</p>}
      {importing && <ImportDialog service={svc.microsoft ? 'mstodo' : svc.id} onClose={() => setImporting(false)} />}
    </div>
  )
}

const dayLabel = (key) => format(parseISO(key), 'EEE d MMM')

function TimeSend({ svc, conn, setNote }) {
  const { tasks, dashboardDate } = usePlanner()
  const [busy, setBusy] = useState(false)
  const all = sessionsForDay(tasks, dashboardDate)
  const { list, minutes } = pending(svc.id, all)
  const send = async () => {
    setNote(null); setBusy(true)
    try {
      const r = await (svc.id === 'clockify' ? sendToClockify(conn, list) : sendToToggl(conn, list))
      const text = `Sent ${r.sent} time entr${r.sent === 1 ? 'y' : 'ies'} to ${svc.label}.`
      setNote(r.error ? { ok: false, text: `${r.sent ? `${text} ` : ''}${r.error.message}` } : { ok: true, text })
    } catch (e) { setNote({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy || !list.length} onClick={send}>
        {busy ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send {dayLabel(dashboardDate)}’s time</>}
      </button>
      <span className="text-[12px] text-muted tnum">{list.length ? `${list.length} session${list.length === 1 ? '' : 's'} · ${fmtMinutes(minutes)} not sent yet` : all.length ? 'All of this day is already sent.' : 'No finished focus sessions on this day.'}</span>
    </div>
  )
}

function OutlookSend({ setNote }) {
  const { tasks, dashboardDate } = usePlanner()
  const [busy, setBusy] = useState(false)
  const day = tasksOn(tasks, dashboardDate)
  const fresh = day.filter((t) => !wasSent('outlook', t.id))
  const send = async () => {
    setNote(null); setBusy(true)
    try {
      const r = await sendTasksToOutlook(day)
      const text = `Added ${r.sent} event${r.sent === 1 ? '' : 's'} to your Outlook calendar${r.skipped ? ` (${r.skipped} already there)` : ''}.`
      setNote(r.error ? { ok: false, text: `${r.sent ? `${text} ` : ''}${r.error.message}` } : { ok: true, text })
    } catch (e) { setNote({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy || !fresh.length} onClick={send}>
        {busy ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send {dayLabel(dashboardDate)}’s tasks to Outlook</>}
      </button>
      <span className="text-[12px] text-muted tnum">{fresh.length ? `${fresh.length} task${fresh.length === 1 ? '' : 's'} not sent yet (a one-time copy; later edits aren’t sent)` : day.length ? 'All of this day is already sent.' : 'No tasks on this day.'}</span>
    </div>
  )
}

function GoogleTasksSend({ setNote }) {
  const { tasks, dashboardDate } = usePlanner()
  const [busy, setBusy] = useState(false)
  const day = tasksOn(tasks, dashboardDate)
  const fresh = day.filter((t) => !wasSent('gtasks', t.id))
  const send = async () => {
    setNote(null); setBusy(true)
    try {
      await ensureExtraToken('tasks', TASKS_SCOPE)
      const r = await sendTasksToGoogleTasks(day)
      const text = `Added ${r.sent} task${r.sent === 1 ? '' : 's'} to your Google Tasks list${r.skipped ? ` (${r.skipped} already there)` : ''}.`
      setNote(r.error ? { ok: false, text: `${r.sent ? `${text} ` : ''}${r.error.message}` } : { ok: true, text })
    } catch (e) { setNote({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy || !fresh.length} onClick={send}>
        {busy ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send {dayLabel(dashboardDate)}’s tasks</>}
      </button>
      <span className="text-[12px] text-muted tnum">{fresh.length ? `${fresh.length} task${fresh.length === 1 ? '' : 's'} not sent yet (as all-day tasks: Google Tasks keeps no times)` : day.length ? 'All of this day is already sent.' : 'No tasks on this day.'}</span>
    </div>
  )
}

function NotionSend({ conn, setNote }) {
  const { tasks, dashboardDate } = usePlanner()
  const [busy, setBusy] = useState(false)
  const day = tasksOn(tasks, dashboardDate)
  const fresh = day.filter((t) => !wasSent('notion', t.id))
  const send = async () => {
    setNote(null); setBusy(true)
    try {
      const r = await sendTasksToNotion(conn, day)
      const text = `Added ${r.sent} task${r.sent === 1 ? '' : 's'} to “${conn.label}”${r.skipped ? ` (${r.skipped} already there)` : ''}.`
      setNote(r.error ? { ok: false, text: `${r.sent ? `${text} ` : ''}${r.error.message}` } : { ok: true, text })
    } catch (e) { setNote({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy || !fresh.length} onClick={send}>
        {busy ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Send size={13} /> Send {dayLabel(dashboardDate)}’s tasks</>}
      </button>
      <span className="text-[12px] text-muted tnum">{fresh.length ? `${fresh.length} task${fresh.length === 1 ? '' : 's'} not sent yet` : day.length ? 'All of this day is already sent.' : 'No tasks on this day.'}</span>
    </div>
  )
}

function TelegramSetup({ conn, setNote }) {
  const [busy, setBusy] = useState(false)
  const find = async () => {
    setNote(null); setBusy(true)
    try {
      const chat = await findChat(conn.token)
      patchConn('telegram', { chatId: chat.id, chatName: chat.name, offset: chat.next })
      setNote({ ok: true, text: `Linked to ${chat.name}.` })
    } catch (e) { setNote({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="mt-2.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost h-8 py-0 px-3" disabled={busy} onClick={find}>{busy ? 'Looking…' : conn.chatId ? 'Find my chat again' : 'Find my chat'}</button>
        <span className="text-[12px] text-muted">{conn.chatId ? `Linked to ${conn.chatName || 'your chat'}. The report can be sent there.` : 'Send your bot a message first, then press this.'}</span>
      </div>
      {conn.chatId && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-muted max-w-sm">Messages you send the bot become tasks (“call Sam tomorrow 3pm 30m #work”), checked about once a minute while NineFlow is open.</p>
          <Segmented size="sm" value={conn.inbox ? 'on' : 'off'} onChange={(v) => patchConn('telegram', { inbox: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
        </div>
      )}
    </div>
  )
}
