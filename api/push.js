// POST /api/push  (called by QStash at the minute a reminder is due; see _push.js)
// Checks QStash's signature, decrypts the reminder and sends it to the device.
import webpush from 'web-push'
import { env, open, readRaw, send, verifyQstash } from './_push.js'

const LATE = 30 * 60_000 // a reminder delivered more than 30 min late (QStash retries) is dropped

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })
  const cfg = env()
  if (!cfg.secret || !cfg.vapidPublic || !cfg.vapidPrivate || !cfg.signingKeys.length) return send(res, 503, { error: 'Not set up.' })

  let raw
  try { raw = await readRaw(req, 20000) } catch { return send(res, 413, { error: 'Too large.' }) }
  if (!verifyQstash(req.headers['upstash-signature'], raw, cfg.signingKeys)) return send(res, 401, { error: 'Bad signature.' })

  let r
  try { r = open(raw.trim(), cfg.secret) } catch { return send(res, 400, { error: 'Bad reminder.' }) }
  if (Number.isFinite(r.at) && Date.now() - r.at > LATE) return send(res, 200, { skipped: 'late' })

  webpush.setVapidDetails(cfg.vapidSubject, cfg.vapidPublic, cfg.vapidPrivate)
  try {
    await webpush.sendNotification(r.s, JSON.stringify({ title: r.t, body: r.b, id: r.id, taskId: r.k }), { TTL: 1800, urgency: 'high', topic: r.id.replace(/[^A-Za-z0-9_-]/g, '').slice(-32) })
    return send(res, 200, { sent: true })
  } catch (e) {
    // 404/410: the device unsubscribed. Answer 200 so QStash doesn't retry.
    if (e.statusCode === 404 || e.statusCode === 410) return send(res, 200, { gone: true })
    return send(res, 502, { error: 'Push failed.' }) // QStash retries
  }
}
