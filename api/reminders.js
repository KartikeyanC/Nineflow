// POST /api/reminders  { subscription, add: [{ id, at, title, body, taskId }], cancel: [messageId] }
//   → { scheduled: { [id]: messageId }, failed: [id], cancelled: n }
// Times this device's upcoming reminders with QStash so they arrive while NineFlow is
// closed (see _push.js). The browser keeps the message ids and sends them back in
// `cancel` when a reminder changes or goes away.
import { cleanSubscription, env, qstashCancel, qstashPublish, readRaw, seal, send } from './_push.js'
import { clientIp, cors, limit, tooManyBody } from './_security.js'

const MAX_ADD = 60
const MAX_CANCEL = 120
const MAX_AHEAD = 7 * 864e5 // QStash's longest delay on the free plan
const str = (v, n) => String(v ?? '').slice(0, n)


export default async function handler(req, res) {
  if (!cors(req, res)) return // the site itself and the desktop app (see _security.js)
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })

  const cfg = env()
  if (!cfg.qstashToken || !cfg.secret || !cfg.vapidPublic || !cfg.vapidPrivate || !cfg.appUrl) {
    return send(res, 503, { error: "Reminders while NineFlow is closed aren't set up on this server yet." })
  }
  if (await limit(req, [{ name: 'reminders-min', key: clientIp(req), max: 20, windowSec: 60 }])) return send(res, 429, tooManyBody)

  let body
  try { body = JSON.parse((await readRaw(req, 100000)) || '{}') } catch (e) { return send(res, e.status || 400, { error: 'Bad request.' }) }

  const cancel = (Array.isArray(body.cancel) ? body.cancel : []).filter((x) => typeof x === 'string' && x.length < 200).slice(0, MAX_CANCEL)
  const add = Array.isArray(body.add) ? body.add.slice(0, MAX_ADD) : []
  const subscription = add.length ? cleanSubscription(body.subscription) : null
  if (add.length && !subscription) return send(res, 400, { error: 'This device could not be signed up for notifications.' })

  const results = await Promise.allSettled(cancel.map((id) => qstashCancel(cfg, id)))
  const cancelled = results.filter((r) => r.status === 'fulfilled' && r.value).length

  const now = Date.now()
  const destination = `${cfg.appUrl}/api/push`
  const scheduled = {}
  const failed = []
  await Promise.all(add.map(async (r) => {
    const id = str(r?.id, 200)
    const at = Number(r?.at)
    if (!id || !Number.isFinite(at) || at > now + MAX_AHEAD || at < now - 5 * 60_000) { if (id) failed.push(id); return }
    const token = seal({ s: subscription, t: str(r.title, 200), b: str(r.body, 300), id, k: str(r.taskId, 100), at }, cfg.secret)
    try {
      scheduled[id] = await qstashPublish(cfg, destination, token, Math.floor(Math.max(at, now) / 1000))
    } catch {
      failed.push(id)
    }
  }))
  return send(res, 200, { scheduled, failed, cancelled })
}
