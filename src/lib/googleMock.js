// Development-only stand-in for Google sign-in and Google Drive, so the
// sign-in and sync flows can be tried without a Google Cloud project.
// Turned on with VITE_GOOGLE_MOCK=1 in .env.local (dev server only; it never
// runs in a production build). The "Drive" lives in this browser's
// localStorage under `mock-drive`.

const STORE = 'mock-drive'
const ACCOUNT = { sub: 'mock-user-1', email: import.meta.env.VITE_GOOGLE_MOCK_EMAIL || 'you@example.com', name: 'Test Person', picture: '' }
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{"files":{}}') } catch { return { files: {} } } }
const save = (d) => localStorage.setItem(STORE, JSON.stringify(d))
const now = () => new Date().toISOString()
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const meta = (f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, webViewLink: `https://drive.google.com/file/d/${f.id}/view`, trashed: !!f.trashed })

function install() {
  window.google = {
    accounts: {
      oauth2: {
        // Set localStorage['mock-signin-error'] to popup_closed, popup_failed_to_open,
        // access_denied, invalid_client or drive_not_granted to simulate that failure.
        initTokenClient: ({ callback, error_callback }) => ({
          requestAccessToken: () => setTimeout(() => {
            const fail = localStorage.getItem('mock-signin-error')
            if (fail === 'popup_closed' || fail === 'popup_failed_to_open') return error_callback?.({ type: fail })
            if (fail === 'access_denied' || fail === 'invalid_client') return callback({ error: fail })
            callback({ access_token: 'mock-token', expires_in: 3600, scope: 'openid email profile https://www.googleapis.com/auth/drive.file' })
          }, 150),
        }),
        hasGrantedAllScopes: () => localStorage.getItem('mock-signin-error') !== 'drive_not_granted',
        revoke: (_t, cb) => cb?.(),
      },
    },
  }

  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    if (!url.startsWith('https://www.googleapis.com/')) return realFetch(input, init)
    const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || ''
    // Set localStorage['mock-drive-expired'] = '1' to simulate an expired token.
    if (auth !== 'Bearer mock-token' || localStorage.getItem('mock-drive-expired') === '1') return json({ error: 'unauthorized' }, 401)
    const u = new URL(url)
    const method = (init.method || 'GET').toUpperCase()
    const d = read()

    if (u.pathname === '/oauth2/v3/userinfo') return json(ACCOUNT)

    // Google Calendar (primary): events kept in localStorage['mock-calendar']
    if (u.pathname.startsWith('/calendar/v3/calendars/primary/events')) {
      const cal = (() => { try { return JSON.parse(localStorage.getItem('mock-calendar') || '{}') } catch { return {} } })()
      const put = () => localStorage.setItem('mock-calendar', JSON.stringify(cal))
      const eid = decodeURIComponent(u.pathname.split('/events')[1] || '').replace(/^\//, '')
      if (!eid && method === 'POST') {
        const ev = { ...JSON.parse(init.body), id: `mockev_${Math.random().toString(36).slice(2, 10)}` }
        cal[ev.id] = ev; put(); return json(ev)
      }
      if (!eid && method === 'GET') return json({ items: Object.values(cal) })
      if (!cal[eid]) return json({ error: 'not found' }, 404)
      if (method === 'PATCH') { cal[eid] = { ...cal[eid], ...JSON.parse(init.body) }; put(); return json(cal[eid]) }
      if (method === 'DELETE') { delete cal[eid]; put(); return new Response(null, { status: 204 }) }
    }

    // List / search
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') || ''
      const name = /name='((?:[^'\\]|\\.)*)'/.exec(q)?.[1]?.replace(/\\'/g, "'")
      const parent = /'([^']+)' in parents/.exec(q)?.[1]
      const folder = q.includes("mimeType='application/vnd.google-apps.folder'")
      const files = Object.values(d.files)
        .filter((f) => !f.trashed && (!name || f.name === name) && (!parent || f.parents?.includes(parent)) && (!folder || f.mimeType === 'application/vnd.google-apps.folder'))
        .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
      return json({ files: files.map(meta) })
    }
    // Create a folder (metadata only)
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const m = JSON.parse(init.body)
      const f = { id: `mock_${Math.random().toString(36).slice(2, 10)}`, name: m.name, mimeType: m.mimeType, parents: m.parents || [], modifiedTime: now() }
      d.files[f.id] = f; save(d)
      return json(meta(f))
    }
    // Create a file with content (multipart)
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const parts = init.body.split(/\r\n--[^\r\n]+/)
      const bodyOf = (p) => p.slice(p.indexOf('\r\n\r\n') + 4)
      const m = JSON.parse(bodyOf(parts[0].replace(/^--[^\r\n]+/, '')))
      const content = bodyOf(parts[1])
      const f = { id: `mock_${Math.random().toString(36).slice(2, 10)}`, name: m.name, mimeType: m.mimeType, parents: m.parents || [], modifiedTime: now(), content }
      d.files[f.id] = f; save(d)
      return json(meta(f))
    }
    const id = u.pathname.split('/').pop()
    const f = d.files[id]
    if (!f || f.trashed) return json({ error: 'not found' }, 404)
    // Replace content
    if (u.pathname.startsWith('/upload/drive/v3/files/') && method === 'PATCH') {
      f.content = init.body
      f.modifiedTime = now()
      save(d)
      return json(meta(f))
    }
    // Download or metadata
    if (u.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      return u.searchParams.get('alt') === 'media' ? new Response(f.content, { status: 200 }) : json(meta(f))
    }
    return json({ error: 'unsupported in mock' }, 400)
  }
  console.info('[NineFlow] Using the development stand-in for Google sign-in and Drive (VITE_GOOGLE_MOCK=1).')
}

export const mockEnabled = import.meta.env.DEV && import.meta.env.VITE_GOOGLE_MOCK === '1'
if (mockEnabled) install()
