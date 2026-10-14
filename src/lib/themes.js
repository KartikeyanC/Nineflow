// Colour themes. `hue` is how far the logo's orange is rotated (it matches --brand-filter in index.css).
// The CSS for each lives in index.css under [data-theme='<id>'] (light) and
// .dark[data-theme='<id>'] (dark), so every theme works in both modes. `swatch` is
// [page, accent] for the picker in Settings. 'default' is the original cream and orange.
export const THEMES = [
  { id: 'default', label: 'NineFlow', swatch: ['#FAF7F0', '#FF6A13'], hue: 0 },
  { id: 'ocean', label: 'Ocean', swatch: ['#F3F7FC', '#2563EB'], hue: 190 },
  { id: 'forest', label: 'Forest', swatch: ['#F4F8F3', '#16805A'], hue: 130 },
  { id: 'berry', label: 'Berry', swatch: ['#FCF5F8', '#BE2469'], hue: 310 },
  { id: 'graphite', label: 'Graphite', swatch: ['#F4F4F5', '#6348DC'], hue: 230 },
]

export const themeId = (settings) => (THEMES.some((t) => t.id === settings?.palette) ? settings.palette : 'default')

// Put the mode (dark class) and the colour theme (data-theme) on an <html> element.
export function applyTheme(root, settings) {
  root.classList.toggle('dark', settings?.theme === 'dark')
  const id = themeId(settings)
  if (id === 'default') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', id)
  setFavicon(root.ownerDocument, THEMES.find((t) => t.id === id)?.hue || 0)
}

// The tab icon is a fixed PNG, so redraw it in the theme's colour.
let favicon = null // { img, hue } once loaded
export function setFavicon(doc, hue) {
  const link = doc?.querySelector?.('link[rel="icon"]')
  if (!link || typeof Image === 'undefined') return
  if (!link.dataset.orig) link.dataset.orig = link.getAttribute('href')
  if (!hue) { link.setAttribute('href', link.dataset.orig); return }
  const draw = (img) => {
    try {
      const c = doc.createElement('canvas')
      c.width = c.height = 48
      const ctx = c.getContext('2d')
      ctx.filter = `hue-rotate(${hue}deg)`
      ctx.drawImage(img, 0, 0, 48, 48)
      link.setAttribute('href', c.toDataURL('image/png'))
    } catch { /* keep the original icon */ }
  }
  if (favicon) return draw(favicon)
  const img = new Image()
  img.onload = () => { favicon = img; draw(img) }
  img.src = link.dataset.orig
}
