// NineFlow desktop app (Electron). The window shows the same web app, built
// by Vite into dist/, served from inside the app at app://nineflow/ so it
// opens instantly and works offline. Google sign-in goes through the system
// browser (google-auth.cjs); links to other sites open in the browser too.

const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell, session } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const auth = require('./google-auth.cjs')

const ORIGIN = 'app://nineflow'
const DIST = path.join(__dirname, '..', 'dist')
const isMac = process.platform === 'darwin'

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

if (!app.requestSingleInstanceLock()) app.quit()

let win = null

// app://nineflow/<path> → dist/<path>; unknown paths get the app itself.
function serveApp() {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url)
    let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 })
    if (pathname === '/' || !path.extname(file)) file = path.join(DIST, 'index.html')
    const res = await net.fetch(pathToFileURL(file).toString()).catch(() => null)
    return res && res.ok ? res : net.fetch(pathToFileURL(path.join(DIST, 'index.html')).toString())
  })
}

// Google's APIs answer browser pages with CORS headers for web origins; add
// the same for this app's origin so Drive and profile requests are allowed.
function allowGoogleApis() {
  const filter = { urls: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*'] }
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, done) => {
    const headers = { ...details.responseHeaders }
    for (const k of Object.keys(headers)) if (/^access-control-allow-(origin|credentials)$/i.test(k)) delete headers[k]
    headers['Access-Control-Allow-Origin'] = [ORIGIN]
    done({ responseHeaders: headers })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 560,
    title: 'NineFlow',
    backgroundColor: '#FAF7F0',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })
  win.once('ready-to-show', () => win.show())

  // New windows: the app's own pages (privacy) open in a small window; any
  // other site opens in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${ORIGIN}/`)) return { action: 'allow', overrideBrowserWindowOptions: { width: 760, height: 820, autoHideMenuBar: true, parent: win } }
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url) }
  })

  win.loadURL(`${ORIGIN}/index.html`)
  win.on('closed', () => { win = null })
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]), { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- Google sign-in bridge (see preload.cjs) -------------------------------------
auth.setPush((token) => win?.webContents.send('google:token', token))
ipcMain.on('google:cached', (e) => { e.returnValue = { configured: auth.configured(), token: auth.cached() } })
ipcMain.handle('google:get-token', async (_e, opts) => {
  try {
    const t = await auth.getToken(opts)
    if (opts?.interactive !== false && win) { if (win.isMinimized()) win.restore(); win.focus(); if (isMac) app.focus({ steal: true }) }
    return { ok: true, token: t }
  } catch (e) {
    return { ok: false, code: e.code || 'unknown', message: e.message }
  }
})
ipcMain.handle('google:sign-out', () => auth.signOut())

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })

app.whenReady().then(async () => {
  serveApp()
  allowGoogleApis()
  buildMenu()
  await auth.init()
  createWindow()
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})

app.on('window-all-closed', () => { if (!isMac) app.quit() })
