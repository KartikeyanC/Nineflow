// "Attach from Google Drive": Google's own file picker, so a task can link to a Doc, Sheet or file that
// already lives in the person's Drive. They choose the files in Google's window; NineFlow gets only
// the ones they pick (the drive.file permission it already has), and keeps just a name and a link on
// the task. Nothing is copied or uploaded.
//
// Needs two values from the site's Google Cloud project, set in .env.local like the client id:
//   VITE_GOOGLE_API_KEY  an API key with the Picker API on, limited to this site's address
//   VITE_GOOGLE_APP_ID   the project number (Cloud console → project settings)
// Without them the button doesn't appear. Web only: the desktop app's address (app://) can't be allowed.
import { CLIENT_ID, getToken, isDesktop, rememberedAccount, requestToken } from './google'

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || ''
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || ''

export const pickerAvailable = () => !!(CLIENT_ID && API_KEY && APP_ID) && !isDesktop && typeof location !== 'undefined' && location.protocol !== 'app:'

let gapiPromise = null
function loadPicker() {
  if (window.google?.picker) return Promise.resolve(window.google)
  if (!gapiPromise) {
    gapiPromise = new Promise((resolve, reject) => {
      const done = () => window.gapi.load('picker', { callback: () => resolve(window.google), onerror: () => reject(new Error('Could not load the Google file picker.')) })
      if (window.gapi?.load) return done()
      const s = document.createElement('script')
      s.src = 'https://apis.google.com/js/api.js'
      s.async = true
      s.onload = done
      s.onerror = () => { gapiPromise = null; reject(new Error('Could not reach Google. Check your connection and try again.')) }
      document.head.appendChild(s)
    })
  }
  return gapiPromise
}

// Opens the picker (run from a click). Resolves to the picked files, or [] if they closed it:
// [{ id, name, url, icon }]
export async function pickDriveFiles() {
  const token = getToken() || await requestToken({ hint: rememberedAccount()?.email })
  const google = await loadPicker()
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setIncludeFolders(false).setSelectFolderEnabled(false)
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setOrigin(location.origin)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          resolve((data.docs || []).filter((d) => d.id && d.url).map((d) => ({ id: String(d.id), name: String(d.name || 'Untitled').slice(0, 120), url: String(d.url), icon: String(d.iconUrl || '') })))
        } else if (data.action === google.picker.Action.CANCEL) resolve([])
      })
      .build()
    picker.setVisible(true)
  })
}
