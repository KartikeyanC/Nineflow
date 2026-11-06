// Speech to text, the way each place NineFlow runs can do it:
//   web      the browser's own speech recognition (Chrome, Edge; Safari on iPhone)
//   android  the phone's recogniser, through @capacitor-community/speech-recognition
//   windows  the desktop app: Electron has no working recogniser and keeps the microphone off,
//            so the person uses Windows voice typing (Win + H), which types into the focused box
//   null     nothing available (Firefox, for one)
import { isNativeApp } from './platform'

const WebSpeech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null

export function speechKind() {
  if (typeof window === 'undefined') return null
  // The phone app checks first: its bridge also sets window.nineflowDesktop (src/native/androidBridge.js).
  if (isNativeApp()) return 'android'
  if (window.nineflowDesktop) return 'windows'
  return WebSpeech ? 'web' : null
}

export const speechLang = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-IN'
const lang = speechLang

/**
 * Starts listening. Calls onText(full text so far, isFinal) while the person speaks and
 * onEnd(error?) once it stops. Returns { stop } (or throws with a message to show).
 */
export async function listen({ onText, onEnd }) {
  const kind = speechKind()
  if (kind === 'web') return listenWeb({ onText, onEnd })
  if (kind === 'android') return listenAndroid({ onText, onEnd })
  throw new Error(kind === 'windows' ? 'Press Windows + H to speak.' : 'This browser can\'t listen. Try Chrome or Edge.')
}

function listenWeb({ onText, onEnd }) {
  const rec = new WebSpeech()
  rec.lang = lang()
  rec.continuous = true // keep listening through pauses between tasks
  rec.interimResults = true
  let done = ''
  rec.onresult = (e) => {
    let live = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) done = `${done} ${t}`.trim()
      else live += t
    }
    onText(`${done} ${live}`.trim(), !live)
  }
  rec.onerror = (e) => onEnd(e.error === 'not-allowed' || e.error === 'service-not-allowed'
    ? 'Microphone access was blocked. Allow it in the browser\'s site settings and try again.'
    : e.error === 'no-speech' ? 'Nothing was heard. Try again, a little closer to the microphone.'
    : e.error === 'audio-capture' ? 'No microphone was found. Check one is plugged in and allowed.'
    : e.error === 'network' ? 'Voice input needs the internet (the browser sends the sound to its speech service).' : null)
  rec.onend = () => onEnd(null)
  rec.start()
  return { stop: () => rec.stop() }
}

async function listenAndroid({ onText, onEnd }) {
  const { SpeechRecognition } = await import('@capacitor-community/speech-recognition')
  const { available } = await SpeechRecognition.available().catch(() => ({ available: false }))
  if (!available) throw new Error('This phone has no speech recogniser. Install or update the Google app and try again.')
  const perm = await SpeechRecognition.requestPermissions().catch(() => ({ speechRecognition: 'denied' }))
  if (perm.speechRecognition !== 'granted') throw new Error('NineFlow needs the microphone to listen. Allow it in Android Settings → Apps → NineFlow → Permissions.')
  let ended = false
  const finish = (err) => { if (ended) return; ended = true; SpeechRecognition.removeAllListeners(); onEnd(err) }
  // Android hears one stretch of speech at a time; each stretch is added to what came before.
  let before = ''
  let latest = ''
  await SpeechRecognition.addListener('partialResults', ({ matches }) => {
    latest = (matches && matches[0]) || ''
    onText(`${before} ${latest}`.trim(), false)
  })
  await SpeechRecognition.addListener('listeningState', ({ status }) => {
    if (status === 'stopped') { before = `${before} ${latest}`.trim(); latest = ''; onText(before, true); finish(null) }
  })
  SpeechRecognition.start({ language: lang(), partialResults: true, popup: false, maxResults: 1 }).catch((e) => finish(e?.message || 'Listening stopped.'))
  return { stop: () => { SpeechRecognition.stop().catch(() => {}); } }
}
