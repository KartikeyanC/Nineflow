// POST /api/notify  { kind, url, title, text }  →  { ok: true }
// Sends one message to a chat webhook the person pasted in Settings (Slack, Discord, Microsoft
// Teams, ntfy, or a Zapier / Make / IFTTT webhook). It goes through the server because those
// services refuse requests made straight from a web page (CORS).
//
// The URL is the person's own and is not stored. Because a server that posts to any address
// would be an open relay, only these services' own hosts are accepted (see target()), over
// https, with no redirects followed, and nothing from the remote reply is passed back.
import { cors, clientIp, limit, tooManyBody } from './_security.js'
import { readRaw, send } from './_push.js'

const str = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n)

const hostIs = (h, ...exact) => exact.includes(h)
const hostEnds = (h, ...suffix) => suffix.some((s) => h.endsWith(s))

// The message for each service, from a title and a body.
const BUILD = {
  slack: (u, t, x) => ({ url: u, body: { text: `*${t}*\n${x}` } }),
  discord: (u, t, x) => ({ url: u, body: { content: `**${t}**\n${x}`.slice(0, 1900) } }),
  teams: (u, t, x) => ({
    url: u,
    body: {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
          body: [{ type: 'TextBlock', text: t, weight: 'Bolder', size: 'Medium', wrap: true }, { type: 'TextBlock', text: x, wrap: true }],
        },
      }],
    },
  }),
  ntfy: (u, t, x) => ({ url: 'https://ntfy.sh/', body: { topic: u.pathname.split('/').filter(Boolean)[0], title: t, message: x } }),
  webhook: (u, t, x) => ({ url: u, body: { title: t, text: x, source: 'NineFlow', at: new Date().toISOString() } }),
}

// Returns { url, body } for an allowed address, or null.
export function target(kind, rawUrl, title, text) {
  let u
  try { u = new URL(String(rawUrl)) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null
  const h = u.hostname.toLowerCase()
  const p = u.pathname
  let ok = false
  if (kind === 'slack') ok = hostIs(h, 'hooks.slack.com') && p.startsWith('/services/')
  else if (kind === 'discord') ok = hostIs(h, 'discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com') && p.startsWith('/api/webhooks/')
  else if (kind === 'teams') ok = hostEnds(h, '.webhook.office.com', '.logic.azure.com', '.powerplatform.com') && p.length > 1
  else if (kind === 'ntfy') ok = hostIs(h, 'ntfy.sh') && /^\/[A-Za-z0-9_-]{1,64}\/?$/.test(p)
  else if (kind === 'webhook') ok = hostIs(h, 'hooks.zapier.com', 'maker.ifttt.com') || /^hook\.([a-z0-9]+\.)?make\.com$/.test(h) || h === 'hook.integromat.com'
  if (!ok || !BUILD[kind]) return null
  return BUILD[kind](u, title, text)
}

export default async function handler(req, res) {
  if (!cors(req, res)) return
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })
  if (await limit(req, [
    { name: 'notify-min', key: clientIp(req), max: 12, windowSec: 60 },
    { name: 'notify-day', key: clientIp(req), max: 300, windowSec: 86400 },
  ])) return send(res, 429, tooManyBody)

  let body
  try { body = JSON.parse((await readRaw(req, 30000)) || '{}') } catch (e) { return send(res, e.status || 400, { error: 'Bad request.' }) }
  const title = str(body.title, 120) || 'NineFlow'
  const text = str(body.text, 3500)
  if (!text) return send(res, 400, { error: 'There is nothing to send.' })
  const t = target(str(body.kind, 12), body.url, title, text)
  if (!t) return send(res, 400, { error: "That address isn't one this service accepts. Check that you copied the whole webhook link." })

  let r
  try {
    r = await fetch(t.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(t.body), redirect: 'manual', signal: AbortSignal.timeout(7000) })
  } catch {
    return send(res, 502, { error: "Couldn't reach that service. Try again in a moment." })
  }
  if (r.status >= 200 && r.status < 300) return send(res, 200, { ok: true })
  const why = r.status === 404 || r.status === 410 ? 'That webhook no longer exists. Make a new one and paste it again.'
    : r.status === 401 || r.status === 403 ? 'That service refused the message. The webhook link may have been revoked.'
    : r.status === 429 ? 'That service says to slow down. Try again in a minute.'
    : 'That service rejected the message.'
  return send(res, 502, { error: why })
}
