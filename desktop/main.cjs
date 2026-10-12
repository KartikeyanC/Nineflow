// NineFlow desktop app (Electron). The window shows the same web app, built
// by Vite into dist/, served from inside the app at app://nineflow/ so it
// opens instantly and works offline. Google sign-in goes through the system
// browser (google-auth.cjs); links to other sites open in the browser too.
//
// Closing the window doesn't quit: the app hides to the system tray and a
// small always-on-top "today" list (widget.html) opens in the top right of
// the screen, so the day's tasks stay in view and can be ticked off. The
// tray menu opens the planner again, hides the list, or quits.

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, protocol, screen, shell, session } = require('electron')
const fs = require('node:fs')
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

let win = null // the planner
let widget = null // the "today" list
let tray = null
let quitting = false

// ---- small preferences kept next to the app's data ----------------------------------
const prefsFile = () => path.join(app.getPath('userData'), 'desktop-prefs.json')
const readPrefs = () => {
  try { return { widgetOnClose: true, widgetBounds: null, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) } } catch { return { widgetOnClose: true, widgetBounds: null } }
}
const writePrefs = (patch) => { try { fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...patch })) } catch { /* ignore */ } }

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
      backgroundThrottling: false, // reminders and Drive sync keep running while the window is hidden
    },
  })
  win.once('ready-to-show', () => win.show())
  win.on('show', hideWidget)
  // Closing hides the planner and brings up the today list. The tray menu (or
  // File > Exit) really quits. Without a tray there's no way back, so it closes normally.
  win.on('close', (e) => {
    if (quitting || !tray || !readPrefs().widgetOnClose) return
    e.preventDefault()
    win.hide()
    showWidget()
  })

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
  win.on('closed', () => { win = null; if (widget) widget.destroy() })
}

// ---- the "today" list ----------------------------------------------------------------
const WIDGET = { width: 340, height: 480, margin: 16 }

// Where it opens: where the user last left it if that is still on a screen,
// otherwise the top right of the main display.
function widgetBounds() {
  const saved = readPrefs().widgetBounds
  const onScreen = (b) => screen.getAllDisplays().some(({ workArea: a }) => b.x >= a.x - 20 && b.y >= a.y - 20 && b.x < a.x + a.width - 60 && b.y < a.y + a.height - 60)
  if (saved && Number.isFinite(saved.x) && onScreen(saved)) return saved
  const a = screen.getPrimaryDisplay().workArea
  return { x: a.x + a.width - WIDGET.width - WIDGET.margin, y: a.y + WIDGET.margin, width: WIDGET.width, height: WIDGET.height }
}

function createWidget() {
  widget = new BrowserWindow({
    ...widgetBounds(),
    minWidth: 280,
    minHeight: 220,
    title: 'NineFlow \u00b7 Today',
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  widget.setAlwaysOnTop(true, 'floating')
  widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  widget.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  widget.webContents.on('will-navigate', (e) => e.preventDefault())
  let timer = null
  const remember = () => { clearTimeout(timer); timer = setTimeout(() => { if (widget && !widget.isDestroyed()) writePrefs({ widgetBounds: widget.getBounds() }) }, 400) }
  widget.on('moved', remember)
  widget.on('resized', remember)
  widget.once('ready-to-show', () => { if (!win || !win.isVisible()) widget.showInactive() })
  widget.loadURL(`${ORIGIN}/widget.html`)
  widget.on('closed', () => { widget = null })
}

function showWidget() {
  if (!widget) createWidget()
  else widget.showInactive()
}
function hideWidget() {
  if (widget && !widget.isDestroyed()) widget.hide()
}

// Bring the planner back (making a new window if it was closed for real).
function showMain() {
  if (!win) { createWindow(); return }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (isMac) app.focus({ steal: true })
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(DIST, 'icons', 'favicon-48.png'))
    tray = new Tray(icon.resize({ width: isMac ? 18 : 16, height: isMac ? 18 : 16 }))
  } catch { tray = null; return }
  tray.setToolTip('NineFlow')
  const refresh = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open NineFlow', click: showMain },
    { label: widget && widget.isVisible() ? "Hide today's list" : "Show today's list", click: () => (widget && widget.isVisible() ? hideWidget() : showWidget()) },
    { type: 'separator' },
    { label: "Show today's list when I close NineFlow", type: 'checkbox', checked: readPrefs().widgetOnClose, click: (item) => writePrefs({ widgetOnClose: item.checked }) },
    { type: 'separator' },
    { label: 'Quit NineFlow', click: () => app.quit() },
  ]))
  refresh()
  tray.on('click', showMain)
  tray.on('right-click', refresh) // so "Hide / Show" matches what is on screen
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

// ---- the today list's buttons (see preload.cjs) --------------------------------------
ipcMain.on('widget:open-app', showMain)
ipcMain.on('widget:hide', hideWidget)

app.on('second-instance', showMain)
app.on('before-quit', () => { quitting = true })

app.whenReady().then(async () => {
  serveApp()
  allowGoogleApis()
  buildMenu()
  await auth.init()
  createTray()
  createWindow()
  app.on('activate', showMain)
})

app.on('window-all-closed', () => { if (!isMac) app.quit() })
