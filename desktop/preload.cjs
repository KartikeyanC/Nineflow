// The only bridge between the NineFlow windows and the desktop app: Google
// sign-in for src/lib/google.js, reminders, and the buttons of the "today" list window.
// Exposed as window.nineflowDesktop.

const { contextBridge, ipcRenderer } = require('electron')

const start = ipcRenderer.sendSync('google:cached')

contextBridge.exposeInMainWorld('nineflowDesktop', {
  platform: process.platform,
  googleConfigured: start.configured,
  // A valid Google access token when the app opened already signed in.
  initialToken: start.token,
  // { ok, token: { access_token, expires_in, scope } } or { ok: false, code, message }
  getToken: (opts) => ipcRenderer.invoke('google:get-token', opts),
  signOut: () => ipcRenderer.invoke('google:sign-out'),
  // The "today" list window (src/widget): open the planner, or hide the list.
  widget: {
    openApp: () => ipcRenderer.send('widget:open-app'),
    hide: () => ipcRenderer.send('widget:hide'),
  },
  // Reminders fired by the app itself, so they arrive with the window closed:
  // the planner sends the upcoming schedule, and a click on one opens its task.
  reminders: {
    set: (list) => ipcRenderer.send('reminders:set', list),
    onOpenTask: (fn) => {
      const listener = (_e, id) => fn(id)
      ipcRenderer.on('reminders:open-task', listener)
      return () => ipcRenderer.removeListener('reminders:open-task', listener)
    },
  },
  // Renewed tokens (null after a sign-out or a revoked session).
  onToken: (fn) => {
    const listener = (_e, token) => fn(token)
    ipcRenderer.on('google:token', listener)
    return () => ipcRenderer.removeListener('google:token', listener)
  },
})
