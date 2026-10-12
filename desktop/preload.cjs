// The only bridge between the NineFlow window and the desktop app: Google
// sign-in for src/lib/google.js. Exposed as window.nineflowDesktop.

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
  // Renewed tokens (null after a sign-out or a revoked session).
  onToken: (fn) => {
    const listener = (_e, token) => fn(token)
    ipcRenderer.on('google:token', listener)
    return () => ipcRenderer.removeListener('google:token', listener)
  },
})
