// POST /api/inbound  (Postmark's inbound webhook; see _inbox.js and docs/EMAIL.md)
// Postmark calls https://<user>:<password>@<site>/api/inbound with the parsed email.
// The part after "+" in the address (MailboxHash) is the planner's inbox key.
import crypto from 'node:crypto'
import { MAX_QUEUE, TTL_SECONDS, basicAuthOk, cleanBody, env, queueName, readJson, redis, seal, send, validKey } from './_inbox.js'

const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' })
  const cfg = env()
  if (!cfg.redisUrl || !cfg.redisToken || !cfg.webhookPassword) return send(res, 503, { error: 'Email to NineFlow is not set up on this server.' })
  if (!basicAuthOk(req.headers.authorization, cfg.webhookUser, cfg.webhookPassword)) return send(res, 401, { error: 'Unauthorized.' })

  let mail
  try { mail = await readJson(req, 3_000_000) } catch (e) { return send(res, e.status || 400, { error: 'Bad request.' }) }

  // An address without a valid key, or an unknown one, is accepted and dropped (200),
  // so Postmark doesn't retry and nobody can probe which keys exist.
  const key = String(mail.MailboxHash || '').toLowerCase()
  if (!validKey(key)) return send(res, 200, { dropped: true })

  const item = {
    id: crypto.randomUUID(),
    from: str(mail.FromFull?.Email || mail.From, 200),
    fromName: str(mail.FromFull?.Name || mail.FromName, 100),
    subject: str(mail.Subject, 200),
    text: cleanBody(mail.TextBody || mail.StrippedTextReply),
    attachments: Array.isArray(mail.Attachments) ? mail.Attachments.length : 0,
    receivedAt: new Date().toISOString(),
  }
  try {
    const q = queueName(key)
    await redis(cfg, [['RPUSH', q, seal(item, key)], ['LTRIM', q, -MAX_QUEUE, -1], ['EXPIRE', q, TTL_SECONDS]])
  } catch {
    return send(res, 502, { error: 'Could not queue the email.' }) // Postmark retries
  }
  return send(res, 200, { queued: true })
}
