// Pictures and links inside sticky notes.
//
// Notes live in the settings, which are kept in this browser's storage (about 5 MB for
// everything) and saved to Drive on every change. So a picture is shrunk on this device
// before it is kept: at most 1024px on its long side, as a JPEG. A screenshot or a photo of
// a page usually comes out at 50-150 KB. A note holds up to MAX_IMAGES pictures and all the
// notes together up to IMAGE_BUDGET of them, so the planner always has room to save.

// How many notes there can be and how long each may be (the stored-data cleaner in lib/storage.js keeps the same).
export const MAX_NOTES = 60
export const MAX_NOTE_LENGTH = 2000
export const MAX_IMAGES = 3
export const IMAGE_BUDGET = 1_500_000 // characters of data URL across every note (~1.1 MB of pictures)
const MAX_SIDE = 1024
const QUALITY = 0.78

export const isImageSrc = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)

// The kept shape of a note's pictures, from whatever was stored or synced.
export function cleanImages(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((im) => im && typeof im.id === 'string' && isImageSrc(im.src))
    .slice(0, MAX_IMAGES)
    .map((im) => ({ id: im.id, src: im.src, w: Number(im.w) || 0, h: Number(im.h) || 0 }))
}

export const imagesSize = (notes) => notes.reduce((sum, n) => sum + (n.images || []).reduce((s, im) => s + im.src.length, 0), 0)

// A picture file (picked, pasted or dropped) → { src, w, h }, shrunk and as a JPEG.
// Transparent areas turn white, as they would on paper.
export async function shrinkImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('That file isn\'t a picture.')
  let bitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('This picture couldn\'t be opened. Try a PNG or JPEG.') }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return { src: canvas.toDataURL('image/jpeg', QUALITY), w, h }
}

// Web addresses written in a note, in the order they appear, each once. Only http(s).
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi
export function linksIn(text, max = 5) {
  const out = []
  for (const m of (text || '').matchAll(URL_RE)) {
    const raw = m[0].replace(/[.,;:!?)\]}'"]+$/, '')
    let url
    try { url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw) } catch { continue }
    if (!/^https?:$/.test(url.protocol) || out.some((l) => l.href === url.href)) continue
    const path = `${url.pathname === '/' ? '' : url.pathname}${url.search}`
    out.push({ href: url.href, host: url.hostname.replace(/^www\./, ''), path: path.length > 32 ? `${path.slice(0, 31)}…` : path })
    if (out.length >= max) break
  }
  return out
}
