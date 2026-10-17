// Where the app is running, for the few places that behave differently.
//   web      the website or the installed web app
//   desktop  the Electron app (its address is app://)
//   android  the phone app (Capacitor; src/native/androidBridge.js)
// The desktop and phone apps have no NineFlow site of their own, so features that call the site's /api
// (the AI helpers, the calendar link, chat webhooks, Toggl) need VITE_API_BASE there.
export const isNativeApp = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

// True when there is no site to send /api requests to.
export const hasNoSite = () => {
  if (import.meta.env.VITE_API_BASE) return false
  return typeof location !== 'undefined' && (location.protocol === 'app:' || isNativeApp())
}
