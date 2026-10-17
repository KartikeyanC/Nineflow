// Chat connections: send a message (the day's report, a test) to a webhook the person pasted in
// Settings. The message goes through the site's /api/notify, which only talks to the services below
// (see api/notify.js for why). The webhook links are saved with the planner settings, so they
// follow the person to their other devices.
import { getConn } from './connections'
import { sendTelegram } from './telegram'

export const KINDS = {
  slack: { label: 'Slack', help: 'In Slack: Apps → Incoming Webhooks → Add to a channel, then copy the Webhook URL.' },
  discord: { label: 'Discord', help: 'In Discord: Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.' },
  teams: { label: 'Microsoft Teams', help: 'In Teams: the channel’s ••• menu → Workflows → “Post to a channel when a webhook request is received”, then copy its link.' },
  ntfy: { label: 'ntfy', help: 'Pick a private topic name and paste https://ntfy.sh/your-topic. Anyone who knows the topic can read it, so make it hard to guess.' },
  telegram: { label: 'Telegram', help: '' }, // set up under “Your tools”: it uses your own bot, kept on this device
  webhook: { label: 'Zapier / Make', help: 'In Zapier: a “Webhooks by Zapier → Catch Hook” trigger. In Make: a “Custom webhook”. Paste its link.' },
}

// Which service a pasted link belongs to, or null when it isn't one we can send to.
// (The server checks the same rules again; this is only so the form can say so straight away.)
export function guessKind(raw) {
  let u
  try { u = new URL(String(raw).trim()) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null
  const h = u.hostname.toLowerCase()
  const p = u.pathname
  if (h === 'hooks.slack.com' && p.startsWith('/services/')) return 'slack'
  if (['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(h) && p.startsWith('/api/webhooks/')) return 'discord'
  if (['.webhook.office.com', '.logic.azure.com', '.powerplatform.com'].some((s) => h.endsWith(s)) && p.length > 1) return 'teams'
  if (h === 'ntfy.sh' && /^\/[A-Za-z0-9_-]{1,64}\/?$/.test(p)) return 'ntfy'
  if (h === 'hooks.zapier.com' || h === 'maker.ifttt.com' || h === 'hook.integromat.com' || /^hook\.([a-z0-9]+\.)?make\.com$/.test(h)) return 'webhook'
  return null
}

// A short name to show in the list when the person didn't type one.
export const defaultName = (kind) => KINDS[kind]?.label || 'Chat'

const base = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

// Sends one message. Throws an Error with a message fit to show.
export async function sendChat(hook, title, text) {
  if (hook.kind === 'telegram') { // straight from the app, with the bot saved on this device
    const conn = getConn('telegram')
    if (!conn?.chatId) throw new Error('Telegram is not linked on this device. Connect it under Your tools.')
    return sendTelegram(conn, title, text)
  }
  const root = base()
  if (!root && typeof location !== 'undefined' && location.protocol === 'app:') throw new Error('Sending to chat needs the NineFlow site. Set VITE_API_BASE for the desktop app.')
  let res
  try {
    res = await fetch(`${root}/api/notify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: hook.kind, url: hook.url, title, text }) })
  } catch {
    throw new Error("Couldn't reach NineFlow's server. Check your connection and try again.")
  }
  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) throw new Error(data?.error || 'Could not send the message.')
}

// The webhooks to use, with the shutdown report sent to each. Resolves to { sent, failed: [{ name, message }] }.
export async function sendToAll(hooks, title, text) {
  const out = { sent: 0, failed: [] }
  await Promise.all(hooks.map(async (h) => {
    try { await sendChat(h, title, text); out.sent += 1 } catch (e) { out.failed.push({ name: h.name || defaultName(h.kind), message: e.message }) }
  }))
  return out
}
