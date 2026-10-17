// Telegram, with the person's own bot (made with @BotFather; its token stays on this device, see
// lib/connections.js). Two uses: the day's report can be sent to their chat, and messages they send
// the bot become tasks while NineFlow is open. Calls go straight to api.telegram.org as form posts
// (Telegram's answers are readable from a web page that way; JSON posts are blocked by the browser).
//
// Only messages from the one chat saved in Settings are ever read as tasks, so someone who finds the
// bot's name can't add to the planner.
import { patchConn } from './connections'

async function call(token, method, params = {}) {
  let r
  try {
    r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
    })
  } catch { throw new Error("Couldn't reach Telegram. Check your connection and try again.") }
  let data = null
  try { data = await r.json() } catch { /* handled below */ }
  if (r.status === 401 || r.status === 404) throw new Error("Telegram didn't accept that bot token. Check that you copied all of it.")
  if (!data?.ok) throw new Error(data?.description ? `Telegram: ${String(data.description).slice(0, 140)}` : `Telegram returned an error (${r.status}).`)
  return data.result
}

export async function testTelegram({ token }) {
  const me = await call(token, 'getMe')
  return me.username ? `@${me.username}` : 'your bot'
}

// The chat that last wrote to the bot: { id, name, next }. They send the bot any message first. `next` is
// the offset just past everything already sent, so that message (and any older ones) never becomes a task.
export async function findChat(token) {
  const updates = await call(token, 'getUpdates', { limit: '20', allowed_updates: JSON.stringify(['message']) })
  const m = [...updates].reverse().find((u) => u.message?.chat && u.message.chat.type === 'private')?.message
  if (!m) throw new Error('Send your bot a message in Telegram first (any text), then press this again.')
  const c = m.chat
  return { id: String(c.id), name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || 'your chat', next: updates[updates.length - 1].update_id + 1 }
}

export async function sendTelegram({ token, chatId }, title, text) {
  await call(token, 'sendMessage', { chat_id: chatId, text: `${title}\n\n${text}`.slice(0, 4000), disable_web_page_preview: 'true' })
}

// New text messages from the saved chat since the last check. Telegram forgets an update once a later
// offset is asked for, so the offset is saved only after the caller has turned the messages into tasks
// (see `confirm`). Resolves to { messages: [{ updateId, text }], confirm() }.
export async function newMessages(conn) {
  const params = { limit: '20', timeout: '0', allowed_updates: JSON.stringify(['message']) }
  if (conn.offset) params.offset = String(conn.offset)
  const updates = await call(conn.token, 'getUpdates', params)
  const messages = updates
    .filter((u) => u.message?.text && String(u.message.chat?.id) === String(conn.chatId) && !u.message.text.startsWith('/'))
    .map((u) => ({ updateId: u.update_id, text: String(u.message.text).slice(0, 500) }))
  const last = updates.length ? updates[updates.length - 1].update_id : 0
  return { messages, confirm: () => { if (last) patchConn('telegram', { offset: last + 1 }) } }
}
