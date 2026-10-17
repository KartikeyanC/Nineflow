import { useEffect, useRef } from 'react'
import { usePlanner } from '../store/PlannerContext'
import { getConn, useConnections } from '../lib/connections'
import { newMessages, sendTelegram } from '../lib/telegram'
import { parseQuickAdd } from '../lib/nlp'

// Messages the person sends their Telegram bot become tasks, while NineFlow is open (about once a
// minute, and when it comes back into view). Each message is parsed like the quick-add box ("call Sam
// tomorrow 3pm 30m #work !high"), the bot answers with what it added, and only then is Telegram told
// the messages are handled. Only the one chat saved in Settings counts (lib/telegram.js).
export default function TelegramInbox() {
  const { settings, addTasks, allTasks } = usePlanner()
  const conns = useConnections()
  const on = !!(conns.telegram?.inbox && conns.telegram?.chatId && conns.telegram?.token)
  const latest = useRef({ settings, allTasks })
  latest.current = { settings, allTasks }

  useEffect(() => {
    if (!on) return undefined
    let stop = false
    let running = false
    const collect = async () => {
      if (running || stop || document.visibilityState !== 'visible') return
      running = true
      try {
        const conn = getConn('telegram')
        if (!conn?.inbox) return
        const { messages, confirm } = await newMessages(conn)
        if (stop) return
        const { settings: s, allTasks: existing } = latest.current
        const have = new Set(existing.map((t) => t.id))
        const now = new Date()
        const made = messages.map((m) => {
          const id = `tg-${m.updateId}`
          if (have.has(id)) return null
          const p = parseQuickAdd(m.text, { categories: s.categories, now })
          return {
            id,
            title: (p.title || m.text).slice(0, 200),
            description: '',
            date: p.date ?? null,
            startTime: p.date ? p.startTime ?? null : null,
            ...(p.durationMinutes ? { durationMinutes: p.durationMinutes } : {}),
            ...(p.priority ? { priority: p.priority } : {}),
            category: p.category || s.categories[0]?.id || 'work',
            tags: [...new Set(['telegram', ...(p.tags || [])])].slice(0, 6),
          }
        }).filter(Boolean)
        if (made.length) {
          addTasks(made, `Added ${made.length} task${made.length === 1 ? '' : 's'} from Telegram`)
          sendTelegram(conn, '✓ Added to NineFlow', made.map((t) => `• ${t.title}${t.date ? ` (${t.date}${t.startTime ? ` ${t.startTime}` : ''})` : ''}`).join('\n')).catch(() => { /* the tasks are in; the reply is a courtesy */ })
        }
        confirm()
      } catch { /* offline, or the bot token changed: try again later */ } finally { running = false }
    }
    const first = setTimeout(collect, 3000)
    const every = setInterval(collect, 60_000)
    const onVisible = () => { if (document.visibilityState === 'visible') collect() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { stop = true; clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', onVisible) }
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
